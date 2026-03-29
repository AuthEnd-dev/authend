import { defineConfig } from "drizzle-kit";

const schemaPaths = process.env.AUTHEND_DRIZZLE_SCHEMA_PATHS?.split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

export default defineConfig({
  schema: schemaPaths && schemaPaths.length > 0
    ? schemaPaths
    : ["./src/core/db/schema/auth.ts", "./src/core/db/schema/system.ts", "./generated/schema/generated.ts"],
  out: process.env.AUTHEND_DRIZZLE_MIGRATIONS_DIR ?? "./generated/migrations",
  dialect: "postgresql",
  migrations: {
    prefix: "none",
  },
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
