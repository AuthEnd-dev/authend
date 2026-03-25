import { db, sql } from "../db/client";
import { env } from "../config/env";
import { systemAdmins } from "../db/schema/system";
import { logger } from "../lib/logger";
import { getAuth } from "./auth-service";
import { ensureCoreSchema, applyPendingMigrations, previewPendingMigrations } from "./migration-service";
import { ensureEnabledPluginsProvisioned, seedPluginConfigs } from "./plugin-service";
import { writeAuditLog } from "./audit-service";

export async function seedSuperAdmin() {
  const existing = await db.query.systemAdmins.findFirst({
    where: (table, operators) => operators.eq(table.email, env.SUPERADMIN_EMAIL),
  });

  if (existing) {
    return existing;
  }

  const [existingUser] = await sql<{ id: string; email: string; name: string }[]>`
    select id, email, name
    from "user"
    where email = ${env.SUPERADMIN_EMAIL}
    limit 1
  `;

  if (existingUser) {
    await sql`
      update "user"
      set role = 'admin', updated_at = now()
      where id = ${existingUser.id}
    `;

    await db.insert(systemAdmins).values({
      userId: existingUser.id,
      email: existingUser.email,
      name: existingUser.name,
    });

    return existingUser;
  }

  const auth = await getAuth();
  const result = await auth.api.signUpEmail({
    body: {
      email: env.SUPERADMIN_EMAIL,
      password: env.SUPERADMIN_PASSWORD,
      name: env.SUPERADMIN_NAME,
    },
  });

  await sql`
    update "user"
    set role = 'admin', updated_at = now()
    where id = ${result.user.id}
  `;

  await db.insert(systemAdmins).values({
    userId: result.user.id,
    email: env.SUPERADMIN_EMAIL,
    name: env.SUPERADMIN_NAME,
  });

  await writeAuditLog({
    action: "system.superadmin.seeded",
    target: result.user.id,
  });

  return result.user;
}

export async function bootstrapSystem() {
  await ensureCoreSchema();
  await seedPluginConfigs();
  await ensureEnabledPluginsProvisioned();
  await applyPendingMigrations();
  await seedSuperAdmin();
  logger.info("system.bootstrapped");
}

export async function getSetupStatus() {
  await ensureCoreSchema();
  const [health] = await sql<{ ok: number }[]>`select 1 as ok`;
  const pending = await previewPendingMigrations();
  const admins = await db.select().from(systemAdmins);
  const enabledPlugins = await db.query.pluginConfigs.findMany({
    where: (table, operators) => operators.eq(table.enabled, true),
  });

  return {
    healthy: Boolean(health?.ok),
    migrationsPending: pending.length,
    superAdminExists: admins.length > 0,
    enabledPlugins: enabledPlugins.map((row) => row.pluginId as never),
  };
}
