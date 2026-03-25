import { Hono } from "hono";
import { getAuth } from "../services/auth-service";

export const authRouter = new Hono().all("*", async (c) => {
  const auth = await getAuth();
  return auth.handler(c.req.raw);
});
