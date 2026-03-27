import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("AuthEnd"),
  APP_URL: z.string().url(),
  ADMIN_URL: z.string().url().optional(),
  ADMIN_DEV_URL: z.string().url().default("http://localhost:7001"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(24),
  SUPERADMIN_EMAIL: z.string().email(),
  SUPERADMIN_PASSWORD: z.string().min(8),
  SUPERADMIN_NAME: z.string().default("AuthEnd Admin"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 587)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("AuthEnd <no-reply@example.com>"),
  CORS_ORIGIN: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === "") return undefined;
      const origins = value.split(",").map((s) => s.trim()).filter(Boolean);
      return origins.length > 0 ? origins : undefined;
    }),
  PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 3000)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment:\n${parsed.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`).join("\n")}`);
}

export const env = parsed.data;
