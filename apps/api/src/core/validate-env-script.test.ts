import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const sourceDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/authend";

const bunExecutable = process.execPath;
const apiDir = resolve(import.meta.dir, "../..");

function createValidateEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ...process.env,
    NODE_ENV: "production",
    APP_URL: "https://api.authend.test",
    ADMIN_URL: "https://admin.authend.test",
    ADMIN_DEV_URL: "http://localhost:7001",
    CORS_ORIGIN: "https://app.authend.test",
    DATABASE_URL: sourceDatabaseUrl,
    BETTER_AUTH_SECRET: "phase0a-super-secret-value-123456",
    SUPERADMIN_EMAIL: "admin@authend.test",
    SUPERADMIN_PASSWORD: "ChangeMe123!",
    SUPERADMIN_NAME: "AuthEnd Admin",
    ...overrides,
  };
}

describe("validate env script", () => {
  test("bun run validate-env succeeds for a valid deployment env", () => {
    const command = spawnSync(bunExecutable, ["run", "validate-env"], {
      cwd: apiDir,
      env: createValidateEnv(),
      encoding: "utf8",
    });

    const output = `${command.stdout}\n${command.stderr}`;
    expect(command.status).toBe(0);
    expect(output).toContain("environment.validated");
  });

  test("bun run validate-env reports missing required env keys", () => {
    const command = spawnSync(bunExecutable, ["run", "validate-env"], {
      cwd: apiDir,
      env: createValidateEnv({
        APP_URL: "",
      }),
      encoding: "utf8",
    });

    const output = `${command.stdout}\n${command.stderr}`;
    expect(command.status).toBe(1);
    expect(output).toContain("APP_URL");
    expect(output).toContain("Populate the required environment variables");
  });
});
