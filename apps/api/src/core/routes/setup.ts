import { Hono } from "hono";
import { getSetupStatus } from "../services/bootstrap-service";

export const setupRouter = new Hono().get("/status", async (c) => c.json(await getSetupStatus()));
