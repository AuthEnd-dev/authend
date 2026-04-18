import { env } from "../../config/env";
import { sendEmail } from "../../lib/email";
import type { ExtensionHandlerDefinition } from "../types";

export const magicLinkExtensionHandlers: ExtensionHandlerDefinition[] = [
  {
    id: "authend.sendMagicLinkEmail",
    label: "Send magic link email",
    description: "Uses the configured email transport (SMTP or Resend) to send magic-link sign-in emails.",
    slotKeys: ["sendMagicLink"],
    build: () => ({
      id: "authend.sendMagicLinkEmail",
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({
          to: email,
          subject: `${env.APP_NAME} sign-in link`,
          text: `Use this link to sign in: ${url}`,
          html: `<p>Use this link to sign in:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    }),
  },
];
