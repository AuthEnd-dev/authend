import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";

let transporterPromise: Promise<nodemailer.Transporter | null> | null = null;

async function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  transporterPromise ??= Promise.resolve(
    nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    }),
  );

  return transporterPromise;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const transporter = await getTransporter();

  if (!transporter) {
    logger.info("email.skipped", {
      to: input.to,
      subject: input.subject,
      preview: input.text,
    });
    return;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}
