import type { PluginSqlPlan } from "../types";

export function getJwtProvisionPlan(): PluginSqlPlan {
  return {
    key: "plugin_jwt_v1",
    title: "Enable jwt plugin",
    sql: `create table if not exists "jwks" (
  "id" text primary key,
  "public_key" text not null,
  "private_key" text not null,
  "created_at" timestamptz not null default now(),
  "expires_at" timestamptz
);`,
  };
}

export function getJwtRollbackPlan(): PluginSqlPlan {
  return {
    key: "plugin_jwt_v1",
    title: "Disable jwt plugin",
    sql: `drop table if exists "jwks" cascade;`,
  };
}
