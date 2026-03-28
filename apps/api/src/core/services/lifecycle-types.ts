import type { logger } from "../lib/logger";

export type ForkLifecycleLogger = Pick<typeof logger, "info" | "warn" | "error">;

export type ForkBootstrapContext = {
  logger: ForkLifecycleLogger;
};

export type ForkRuntimeServiceContext = {
  logger: ForkLifecycleLogger;
};

export type ForkBootstrapTask = {
  id: string;
  run(ctx: ForkBootstrapContext): Promise<void>;
};

export type ForkRuntimeService = {
  id: string;
  start(ctx: ForkRuntimeServiceContext): void | Promise<void>;
};
