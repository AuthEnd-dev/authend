import type { PluginInstallState } from "@authend/shared";
import type { PluginSqlPlan } from "../types";

function organizationProvisionSql(state: PluginInstallState) {
  const statements: string[] = [
    `create table if not exists "organization" (
  "id" text primary key,
  "name" text not null,
  "slug" text not null unique,
  "logo" text,
  "metadata" text,
  "created_at" timestamptz not null default now()
);`,
    `create table if not exists "member" (
  "id" text primary key,
  "user_id" text not null references "user"("id") on delete cascade,
  "organization_id" text not null references "organization"("id") on delete cascade,
  "role" text not null,
  "created_at" timestamptz not null default now(),
  unique ("user_id", "organization_id")
);`,
    `create table if not exists "invitation" (
  "id" text primary key,
  "email" text not null,
  "inviter_id" text not null references "user"("id") on delete cascade,
  "organization_id" text not null references "organization"("id") on delete cascade,
  "role" text not null,
  "status" text not null,
  "expires_at" timestamptz not null,
  "created_at" timestamptz not null default now()
);`,
    `create unique index if not exists "organization_slug_idx" on "organization" ("slug");`,
    `create unique index if not exists "member_user_org_idx" on "member" ("user_id", "organization_id");`,
  ];

  if (state.capabilityState.teams) {
    statements.push(
      `create table if not exists "team" (
  "id" text primary key,
  "organization_id" text not null references "organization"("id") on delete cascade,
  "name" text not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz,
  unique ("organization_id", "name")
);`,
      `create table if not exists "team_member" (
  "id" text primary key,
  "team_id" text not null references "team"("id") on delete cascade,
  "user_id" text not null references "user"("id") on delete cascade,
  "created_at" timestamptz not null default now(),
  unique ("team_id", "user_id")
);`,
      `alter table "invitation" add column if not exists "team_id" text references "team"("id") on delete set null;`,
    );
  }

  if (state.capabilityState.dynamicAccessControl) {
    statements.push(
      `create table if not exists "organization_role" (
  "id" text primary key,
  "organization_id" text not null references "organization"("id") on delete cascade,
  "role" text not null,
  "permission" text not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz,
  unique ("organization_id", "role")
);`,
    );
  }

  return statements.join("\n\n");
}

function organizationRollbackSql(state: PluginInstallState) {
  const statements: string[] = [
    `update "session"
set "active_organization_id" = null,
    "active_team_id" = null,
    "updated_at" = now()
where "active_organization_id" is not null
   or "active_team_id" is not null;`,
    `do $$
begin
  if to_regclass(current_schema() || '.apikey') is not null and to_regclass(current_schema() || '.organization') is not null then
    delete from "apikey"
    where "reference_id" in (select "id" from "organization");
  end if;
end $$;`,
  ];

  if (state.capabilityState.dynamicAccessControl) {
    statements.push(`drop table if exists "organization_role" cascade;`);
  }
  if (state.capabilityState.teams) {
    statements.push(`drop table if exists "team_member" cascade;`);
    statements.push(`drop table if exists "team" cascade;`);
  }
  statements.push(`drop table if exists "invitation" cascade;`);
  statements.push(`drop table if exists "member" cascade;`);
  statements.push(`drop table if exists "organization" cascade;`);

  return statements.join("\n\n");
}

export function getOrganizationProvisionPlan(state: PluginInstallState): PluginSqlPlan {
  const suffix = [
    state.capabilityState.teams ? "teams" : "noteams",
    state.capabilityState.dynamicAccessControl ? "dac" : "nodac",
  ].join("_");

  return {
    key: `plugin_organization_v2_${suffix}`,
    title: "Enable organization plugin",
    sql: organizationProvisionSql(state),
  };
}

export function getOrganizationRollbackPlan(state: PluginInstallState): PluginSqlPlan {
  const suffix = [
    state.capabilityState.teams ? "teams" : "noteams",
    state.capabilityState.dynamicAccessControl ? "dac" : "nodac",
  ].join("_");

  return {
    key: `plugin_organization_v2_${suffix}`,
    title: "Disable organization plugin",
    sql: organizationRollbackSql(state),
  };
}
