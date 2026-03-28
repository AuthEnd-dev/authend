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
  const host = config.smtpHost || env.SMTP_HOST;
  const user = config.smtpUsername || env.SMTP_USER;
  const pass = config.smtpPassword || env.SMTP_PASS;
  const port = config.smtpPort || env.SMTP_PORT;
  const secure = config.smtpSecure || port === 465;

  return {
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

export async function verifyEmailTransport() {
  const config = await resolveEmailConfig();
  if (!config.host || !config.user || !config.pass) {
    return {
      ok: false,
      detail: "SMTP host and credentials must be configured before AuthEnd can probe email delivery.",
    };
  }

  const cacheKey = JSON.stringify({
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

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const config = await resolveEmailConfig();
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
