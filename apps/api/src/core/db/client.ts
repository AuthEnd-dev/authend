import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env";
import * as authSchema from "./schema/auth";
import * as systemSchema from "./schema/system";

const schema = {
  ...authSchema,
  ...systemSchema,
};

export const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 10,
});

export const db = drizzle(sql, { schema });
