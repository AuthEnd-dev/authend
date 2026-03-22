import { Hono } from "hono";
import { buildOpenApiSpec } from "../services/openapi-service";

export const openApiRouter = new Hono().get("/openapi.json", async (c) => c.json(await buildOpenApiSpec()));
