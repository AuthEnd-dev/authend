import { Hono } from "hono";
import type { SessionContext } from "../../middleware/auth";
import { getRealtimeDiagnostics } from "../../services/realtime-service";

export const adminRealtimeRouter = new Hono<{ Variables: { auth: SessionContext } }>().get(
  "/realtime/stats",
  (c) => c.json(getRealtimeDiagnostics()),
);
