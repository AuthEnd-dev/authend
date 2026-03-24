import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";
import { readSettingsSection } from "../services/settings-store";

let transporterPromise: Promise<ReturnType<typeof nodemailer.createTransport> | null> | null = null;
let transporterKey: string | null = null;

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
