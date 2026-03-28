import { logger } from "../lib/logger";
import { forkBootstrapTasks, forkRuntimeServices } from "../../extensions/lifecycle";

let runtimeServicesStarted = false;

export async function runExtensionBootstrapTasks() {
  for (const task of forkBootstrapTasks) {
    logger.info("extension.bootstrap_task.starting", { id: task.id });
    await task.run({ logger });
    logger.info("extension.bootstrap_task.completed", { id: task.id });
  }
}

export async function startExtensionRuntimeServices() {
  if (runtimeServicesStarted) {
    return;
  }

  runtimeServicesStarted = true;

  try {
    for (const service of forkRuntimeServices) {
      logger.info("extension.runtime_service.starting", { id: service.id });
      await service.start({ logger });
      logger.info("extension.runtime_service.started", { id: service.id });
    }
  } catch (error) {
    runtimeServicesStarted = false;
    throw error;
  }
}

export function resetExtensionLifecycleForTests() {
  runtimeServicesStarted = false;
}
