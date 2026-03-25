import type { Hono } from "hono";
import { adminRouter } from "./routes/admin";
import { adminAuthRouter } from "./routes/admin-auth";
import { authRouter } from "./routes/auth";
import { adminDataRouter, dataRouter } from "./routes/data";
import { healthRouter } from "./routes/health";
import { setupRouter } from "./routes/setup";
import { storageRouter } from "./routes/storage";
import { systemRouter } from "./routes/system";

export function registerCoreRoutes(app: Hono): void {
  app.route("/", healthRouter);
  app.route("/api/setup", setupRouter);
  app.route("/api/auth", authRouter);
  app.route("/api/admin/auth", adminAuthRouter);
  app.route("/api/admin", adminRouter);
  app.route("/api/admin/data", adminDataRouter);
  app.route("/api/system", systemRouter);
  app.route("/api/data", dataRouter);
  app.route("/api/storage", storageRouter);
}
