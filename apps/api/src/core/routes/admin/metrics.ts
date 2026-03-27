import { Hono } from "hono";
import type { SessionContext } from "../../middleware/auth";
import { getRuntimeMetrics } from "../../services/metrics-service";

export const adminMetricsRouter = new Hono<{ Variables: { auth: SessionContext } }>().get(
  "/metrics",
  (c) => c.json(getRuntimeMetrics()),
);
