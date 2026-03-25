import { Hono } from "hono";

export const healthRouter = new Hono()
  .get("/health", (c) => c.json({ ok: true, timestamp: new Date().toISOString() }))
  .get("/ready", (c) => c.json({ ready: true }));
