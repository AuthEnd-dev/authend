import { bootstrapSystem } from "../services/bootstrap-service";
import { logger } from "../lib/logger";

await bootstrapSystem();
logger.info("bootstrap.completed");
