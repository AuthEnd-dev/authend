import { env } from "./config/env";
import { createApp } from "./app";
import { bootstrapSystem } from "./services/bootstrap-service";
import { logger } from "./lib/logger";

await bootstrapSystem();

const app = createApp();

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

logger.info("server.started", {
  port: env.PORT,
  appUrl: env.APP_URL,
});
