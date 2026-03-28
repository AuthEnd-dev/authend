import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import postgres from "postgres";

const sourceDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/authend";

const rootDir = resolve(import.meta.dir, "../../../.."); // monorepo root (matches previous `src/` depth)
const adminDatabaseUrl = new URL(sourceDatabaseUrl);
adminDatabaseUrl.pathname = "/postgres";

function createBootstrapEnv(databaseUrl: string, overrides: Record<string, string | undefined> = {}) {
  return {
    ...process.env,
    TEST_DATABASE_URL: "",
    NODE_ENV: "test",
    APP_URL: "http://localhost:7002",
    ADMIN_URL: "http://localhost:7001",
    ADMIN_DEV_URL: "http://localhost:7001",
    CORS_ORIGIN: "http://localhost:7002",
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: "phase0a-super-secret-value-123456",
    SUPERADMIN_EMAIL: "admin@authend.test",
    SUPERADMIN_PASSWORD: "ChangeMe123!",
    SUPERADMIN_NAME: "AuthEnd Admin",
    ...overrides,
  };
}

describe("bootstrap script", () => {
  let adminSql: ReturnType<typeof postgres>;

  beforeAll(() => {
    adminSql = postgres(adminDatabaseUrl.toString(), {
      prepare: false,
      max: 1,
    });
  });

  afterAll(async () => {
    await adminSql.end({ timeout: 0 });
  });

  test("bun run bootstrap provisions a fresh database with documented env vars", async () => {
    const databaseName = `authend_bootstrap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-z0-9_]/g, "_");
    const databaseUrl = new URL(sourceDatabaseUrl);
    databaseUrl.pathname = `/${databaseName}`;

    await adminSql.unsafe(`create database "${databaseName}"`);

    try {
      const command = spawnSync("bun", ["run", "bootstrap"], {
        cwd: rootDir,
        env: createBootstrapEnv(databaseUrl.toString()),
        encoding: "utf8",
      });

      expect(command.status).toBe(0);
      expect(command.stdout).toContain("bootstrap.completed");

      const sql = postgres(databaseUrl.toString(), {
        prepare: false,
        max: 1,
      });

      try {
        const [adminCount] = await sql<{ count: number }[]>`select count(*)::int as count from _system_admins`;
        const [userCount] = await sql<{ count: number }[]>`select count(*)::int as count from "user"`;
        const [pluginConfigCount] = await sql<{ count: number }[]>`select count(*)::int as count from _plugin_configs`;

        expect(adminCount?.count).toBe(1);
        expect(userCount?.count).toBeGreaterThan(0);
        expect(pluginConfigCount?.count).toBeGreaterThan(0);
      } finally {
        await sql.end({ timeout: 0 });
      }
    } finally {
      await adminSql.unsafe(`drop database if exists "${databaseName}" with (force)`);
    }
  });

  test("bun run bootstrap reports actionable env validation failures", () => {
    const command = spawnSync("bun", ["run", "bootstrap"], {
      cwd: rootDir,
      env: createBootstrapEnv(sourceDatabaseUrl, {
        SUPERADMIN_EMAIL: "",
      }),
      encoding: "utf8",
    });

    const output = `${command.stdout}\n${command.stderr}`;
    expect(command.status).toBe(1);
    expect(output).toContain("Invalid environment:");
    expect(output).toContain("SUPERADMIN_EMAIL");
    expect(output).toContain("Populate the required environment variables");
  });

  test("bun run bootstrap fails fast when BETTER_AUTH_SECRET is missing", () => {
    const command = spawnSync("bun", ["run", "bootstrap"], {
      cwd: rootDir,
      env: createBootstrapEnv(sourceDatabaseUrl, {
        BETTER_AUTH_SECRET: "",
      }),
      encoding: "utf8",
    });

    const output = `${command.stdout}\n${command.stderr}`;
    expect(command.status).toBe(1);
    expect(output).toContain("BETTER_AUTH_SECRET");
    expect(output).toContain("Populate the required environment variables");
  });
});
