import {
  type SettingsSectionConfigMap,
  type SettingsSectionId,
  settingsSectionSchemas,
} from "@authend/shared";
import { env } from "../config/env";
import { db, sql } from "../db/client";
import { writeAuditLog } from "./audit-service";

const defaultSettings = {
  general: settingsSectionSchemas.general.parse({
    appUrl: env.APP_URL,
    adminUrl: env.ADMIN_URL ?? env.ADMIN_DEV_URL,
  }),
  authentication: settingsSectionSchemas.authentication.parse({}),
  sessionsSecurity: settingsSectionSchemas.sessionsSecurity.parse({}),
  email: settingsSectionSchemas.email.parse({}),
  domainsOrigins: settingsSectionSchemas.domainsOrigins.parse({}),
  api: settingsSectionSchemas.api.parse({}),
  storage: settingsSectionSchemas.storage.parse({}),
  backups: settingsSectionSchemas.backups.parse({}),
  crons: settingsSectionSchemas.crons.parse({}),
  aiAssistant: settingsSectionSchemas.aiAssistant.parse({}),
  adminAccess: settingsSectionSchemas.adminAccess.parse({}),
  environmentsSecrets: settingsSectionSchemas.environmentsSecrets.parse({}),
  observability: settingsSectionSchemas.observability.parse({}),
  dangerZone: settingsSectionSchemas.dangerZone.parse({}),
  webhooks: settingsSectionSchemas.webhooks.parse({}),
} satisfies SettingsSectionConfigMap;

export function defaultSettingsForSection<TSection extends SettingsSectionId>(section: TSection) {
  return defaultSettings[section];
}

function parseSettingsSection<TSection extends SettingsSectionId>(section: TSection, value: unknown) {
  const schema = settingsSectionSchemas[section];
  return schema.parse({
    ...defaultSettingsForSection(section),
    ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}),
  }) as SettingsSectionConfigMap[TSection];
}

function changedSettingKeys(previous: unknown, next: unknown) {
  const previousRecord =
    previous && typeof previous === "object" && !Array.isArray(previous) ? (previous as Record<string, unknown>) : {};
  const nextRecord = next && typeof next === "object" && !Array.isArray(next) ? (next as Record<string, unknown>) : {};
  const keys = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);
  return Array.from(keys)
    .filter((key) => JSON.stringify(previousRecord[key]) !== JSON.stringify(nextRecord[key]))
    .sort();
}

export async function readSettingsSection<TSection extends SettingsSectionId>(section: TSection) {
  const row = await db.query.systemSettings.findFirst({
    where: (table, operators) => operators.eq(table.key, section),
  });

  return {
    section,
    config: parseSettingsSection(section, row?.value),
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

export async function writeSettingsSection<TSection extends SettingsSectionId>(
  section: TSection,
  value: SettingsSectionConfigMap[TSection],
  actorUserId?: string | null,
) {
  const previous = await readSettingsSection(section);
  const parsed = parseSettingsSection(section, value);

  await sql`
    insert into _system_settings ("key", "value", "created_at", "updated_at")
    values (${section}, ${JSON.stringify(parsed)}::jsonb, now(), now())
    on conflict ("key") do update
    set "value" = excluded."value",
        "updated_at" = excluded."updated_at"
  `;

  await writeAuditLog({
    action: "settings.updated",
    actorUserId,
    target: section,
    payload: {
      section,
      changedKeys: changedSettingKeys(previous.config, parsed),
    },
  });

  const row = await readSettingsSection(section);
  return row;
}
