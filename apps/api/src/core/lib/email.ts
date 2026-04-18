import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";
import { readSettingsSection } from "../services/settings-store";

let transporterPromise: Promise<ReturnType<typeof nodemailer.createTransport> | null> | null = null;
let transporterKey: string | null = null;
let transportProbeCache:
  | {
      key: string;
      expiresAt: number;
      result: {
        ok: boolean;
        detail: string;
      };
    }
  | null = null;

async function resolveEmailConfig() {
  const { config } = await readSettingsSection("email");
  const provider = config.emailProvider === "resend" ? "resend" : "smtp";
  const resendApiKey = (config.resendApiKey || env.RESEND_API_KEY || "").trim();
  const host = config.smtpHost || env.SMTP_HOST;
  const user = config.smtpUsername || env.SMTP_USER;
  const pass = config.smtpPassword || env.SMTP_PASS;
  const port = config.smtpPort || env.SMTP_PORT;
  const secure = config.smtpSecure || port === 465;

  return {
    provider,
    resendApiKey,
    host,
    user,
    pass,
    port,
    secure,
    from: `${config.senderName} <${config.senderEmail}>`,
    replyTo: config.replyToEmail ?? undefined,
  };
}

async function getTransporter() {
  const config = await resolveEmailConfig();
  if (!config.host || !config.user || !config.pass) {
    transporterKey = null;
    transporterPromise = null;
    return null;
  }

  const nextKey = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    pass: config.pass,
  });

  if (!transporterPromise || transporterKey !== nextKey) {
    transporterKey = nextKey;
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      }),
    );
  }

  return transporterPromise;
}

async function verifyResendApiKey(apiKey: string) {
  const response = await fetch("https://api.resend.com/domains", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.ok) {
    return {
      ok: true as const,
      detail: "Resend accepted the API key (domains listing succeeded).",
    };
  }

  const body = await response.text();
  return {
    ok: false as const,
    detail: body ? `Resend API returned ${response.status}: ${body}` : `Resend API returned ${response.status}.`,
  };
}

export async function verifyEmailTransport() {
  const config = await resolveEmailConfig();

  if (config.provider === "resend") {
    if (!config.resendApiKey) {
      return {
        ok: false,
        detail: "Resend API key must be configured in Email settings or the RESEND_API_KEY environment variable.",
      };
    }

    const cacheKey = JSON.stringify({ provider: "resend", key: config.resendApiKey });
    if (transportProbeCache && transportProbeCache.key === cacheKey && transportProbeCache.expiresAt > Date.now()) {
      return transportProbeCache.result;
    }

    try {
      const result = await verifyResendApiKey(config.resendApiKey);
      transportProbeCache = {
        key: cacheKey,
        expiresAt: Date.now() + 30_000,
        result,
      };
      return result;
    } catch (error) {
      const result = {
        ok: false,
        detail: error instanceof Error ? error.message : "Resend verification failed.",
      };
      transportProbeCache = {
        key: cacheKey,
        expiresAt: Date.now() + 30_000,
        result,
      };
      return result;
    }
  }

  if (!config.host || !config.user || !config.pass) {
    return {
      ok: false,
      detail: "SMTP host and credentials must be configured before AuthEnd can probe email delivery.",
    };
  }

  const cacheKey = JSON.stringify({
    provider: "smtp",
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
  });

  if (transportProbeCache && transportProbeCache.key === cacheKey && transportProbeCache.expiresAt > Date.now()) {
    return transportProbeCache.result;
  }

  const transporter = await getTransporter();
  if (!transporter || typeof transporter !== "object" || !("verify" in transporter)) {
    const result = {
      ok: false,
      detail: "SMTP transport is not available for verification.",
    };
    transportProbeCache = {
      key: cacheKey,
      expiresAt: Date.now() + 30_000,
      result,
    };
    return result;
  }

  try {
    await (transporter as { verify: () => Promise<unknown> }).verify();
    const result = {
      ok: true,
      detail: "SMTP accepted the connection and authentication check.",
    };
    transportProbeCache = {
      key: cacheKey,
      expiresAt: Date.now() + 30_000,
      result,
    };
    return result;
  } catch (error) {
    const result = {
      ok: false,
      detail: error instanceof Error ? error.message : "SMTP verification failed.",
    };
    transportProbeCache = {
      key: cacheKey,
      expiresAt: Date.now() + 30_000,
      result,
    };
    return result;
  }
}

async function sendViaResend(input: {
  apiKey: string;
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const payload: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  if (input.replyTo) {
    payload.reply_to = input.replyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    logger.error("email.resend.failed", {
      status: response.status,
      to: input.to,
      subject: input.subject,
      detail: detail.slice(0, 500),
    });
    throw new Error(detail || `Resend send failed with status ${response.status}`);
  }
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const config = await resolveEmailConfig();

  if (config.provider === "resend") {
    if (!config.resendApiKey) {
      logger.info("email.skipped", {
        to: input.to,
        subject: input.subject,
        preview: input.text,
        reason: "resend_api_key_missing",
      });
      return;
    }
    await sendViaResend({
      apiKey: config.resendApiKey,
      from: config.from,
      replyTo: config.replyTo,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return;
  }

  const transporter = await getTransporter();

  if (!transporter || typeof transporter !== "object" || !("sendMail" in transporter)) {
    logger.info("email.skipped", {
      to: input.to,
      subject: input.subject,
      preview: input.text,
    });
    return;
  }

  await (transporter as { sendMail: (options: Record<string, unknown>) => Promise<unknown> }).sendMail({
    from: config.from,
    replyTo: config.replyTo,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}
