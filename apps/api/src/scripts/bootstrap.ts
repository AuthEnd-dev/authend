import { logger } from "../lib/logger";

function bootstrapFailureMeta(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const invalidEnvironment = message.includes("Invalid environment:");

  return {
    error: message,
    hint: invalidEnvironment
      ? "Populate the required environment variables, then rerun `bun run bootstrap`."
      : "Inspect the migration/database error above, correct it, and rerun `bun run bootstrap`.",
  };
}

try {
  const { bootstrapSystem } = await import("../services/bootstrap-service");
  await bootstrapSystem();
  logger.info("bootstrap.completed");
} catch (error) {
  const meta = bootstrapFailureMeta(error);
  logger.error("bootstrap.failed", meta);
  console.error(meta.error);
  console.error(meta.hint);
  process.exitCode = 1;
} finally {
  try {
    const { sql } = await import("../db/client");
    await sql.end({ timeout: 0 });
  } catch {
    // Ignore shutdown errors when bootstrap fails before the DB client is initialized.
  }
}
