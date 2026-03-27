import { logger } from "../lib/logger";
import { sendEmail } from "../lib/email";

export type AutomationRecipeId = "send_email" | "slack_notification";

export type AutomationPayload = {
  eventType: string;
  table: string;
  data: any;
};

export async function executeAutomationRecipe(recipeId: string, payload: AutomationPayload, config: Record<string, any> = {}) {
  logger.info("automation.recipe.executing", { recipeId, eventType: payload.eventType });

  try {
    switch (recipeId as AutomationRecipeId) {
      case "send_email":
        await handleSendEmail(payload, config);
        break;
      case "slack_notification":
        await handleSlackNotification(payload, config);
        break;
      default:
        logger.warn("automation.recipe.not_found", { recipeId });
    }
  } catch (error) {
    logger.error("automation.recipe.failed", {
      recipeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function handleSendEmail(payload: AutomationPayload, config: Record<string, any>) {
  const to = config.to || "admin@example.com";
  const subject = config.subject || `AuthEnd Notification: ${payload.eventType} on ${payload.table}`;
  const body = config.body || JSON.stringify(payload.data, null, 2);

  await sendEmail({
    to,
    subject,
    text: body,
    html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
  });
}

async function handleSlackNotification(payload: AutomationPayload, config: Record<string, any>) {
  const webhookUrl = config.webhookUrl;
  if (!webhookUrl) {
    throw new Error("Slack notification recipe requires a webhookUrl in config");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `*AuthEnd Alert:* ${payload.eventType} on table \`${payload.table}\`\n\`\`\`${JSON.stringify(payload.data, null, 2)}\`\`\``,
    }),
  });

  if (!response.ok) {
    throw new HttpError(response.status, `Slack notification failed: ${await response.text()}`);
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
