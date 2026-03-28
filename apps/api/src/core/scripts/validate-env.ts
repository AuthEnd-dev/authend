import { logger } from "../lib/logger";

function validationFailureMeta(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const invalidEnvironment = message.includes("Invalid environment:");

  return {
    error: message,
    hint: invalidEnvironment
      ? "Populate the required environment variables, then rerun `bun run validate-env`."
      : "Review the environment validation warning or URL parsing failure above, correct it, and rerun `bun run validate-env`.",
  };
}

function collectWarnings(env: {
  NODE_ENV: string;
  APP_URL: string;
  ADMIN_URL?: string;
  CORS_ORIGIN?: string[];
  DATABASE_URL: string;
}) {
  const warnings: string[] = [];

  if (env.NODE_ENV === "production") {
    if (!env.APP_URL.startsWith("https://")) {
      warnings.push("APP_URL should use HTTPS in production.");
    }
    if (env.ADMIN_URL && !env.ADMIN_URL.startsWith("https://")) {
      warnings.push("ADMIN_URL should use HTTPS in production.");
    }
    if (!env.CORS_ORIGIN || env.CORS_ORIGIN.length === 0) {
      warnings.push("CORS_ORIGIN is empty. Set explicit origins before production deploys.");
    }

    try {
      const hostname = new URL(env.DATABASE_URL).hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        warnings.push("DATABASE_URL still points at localhost. Verify that this is intentional for production.");
      }
    } catch {
      warnings.push("DATABASE_URL could not be parsed as a URL for additional validation.");
    }
  }

  return warnings;
}

try {
  const { env } = await import("../config/env");
  const warnings = collectWarnings(env);

  logger.info("environment.validated", {
    nodeEnv: env.NODE_ENV,
    appUrl: env.APP_URL,
    adminUrl: env.ADMIN_URL ?? null,
    warnings,
  });

  if (warnings.length > 0) {
    logger.warn("environment.validation.warnings", {
      warnings,
    });
    console.warn(`Environment is valid, but ${warnings.length} deployment warning(s) need review.`);
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  } else {
    console.log("Environment validation passed with no deployment warnings.");
  }
} catch (error) {
  const meta = validationFailureMeta(error);
  logger.error("environment.validation.failed", meta);
  console.error(meta.error);
  console.error(meta.hint);
  process.exitCode = 1;
}
