import type { PluginSqlPlan } from "../types";

export function getTwoFactorProvisionPlan(): PluginSqlPlan {
  return {
    key: "plugin_twoFactor_v2",
    title: "Enable twoFactor plugin",
    sql: `create table if not exists "two_factor" (
  "id" text primary key,
  "user_id" text not null references "user"("id") on delete cascade,
  "secret" text,
  "backup_codes" text,
  unique ("user_id")
);

create unique index if not exists "two_factor_user_idx" on "two_factor" ("user_id");`,
  };
}

export function getTwoFactorRollbackPlan(): PluginSqlPlan {
  return {
    key: "plugin_twoFactor_v2",
    title: "Disable twoFactor plugin",
    sql: `update "user"
set "two_factor_enabled" = false,
    "updated_at" = now()
where "two_factor_enabled" = true;

delete from "verification"
where "identifier" like '2fa-%'
   or "identifier" like '2fa-otp-%'
   or "identifier" like 'trust-device-%';

drop table if exists "two_factor" cascade;`,
  };
}
