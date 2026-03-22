import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env";
import * as schema from "./schema";

export const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 10,
});

export const db = drizzle(sql, { schema });
