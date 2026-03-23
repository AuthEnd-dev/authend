create extension if not exists pgcrypto;

create table if not exists "user" (
  "id" text primary key,
  "name" text not null,
  "email" text not null unique,
  "email_verified" boolean not null default false,
  "image" text,
  "username" text unique,
  "display_username" text,
  "role" text not null default 'user',
  "banned" boolean not null default false,
  "ban_reason" text,
  "ban_expires" timestamptz,
  "two_factor_enabled" boolean not null default false,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "session" (
  "id" text primary key,
  "user_id" text not null references "user"("id") on delete cascade,
  "token" text not null unique,
  "expires_at" timestamptz not null,
  "ip_address" text,
  "user_agent" text,
  "active_organization_id" text,
  "active_team_id" text,
  "impersonated_by" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "account" (
  "id" text primary key,
  "user_id" text not null references "user"("id") on delete cascade,
  "account_id" text not null,
  "provider_id" text not null,
  "access_token" text,
  "refresh_token" text,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope" text,
  "id_token" text,
  "password" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create unique index if not exists "account_provider_account_idx" on "account" ("provider_id", "account_id");

create table if not exists "verification" (
  "id" text primary key,
  "identifier" text not null,
  "value" text not null,
  "expires_at" timestamptz not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create index if not exists "verification_identifier_idx" on "verification" ("identifier");

create table if not exists "system_admins" (
  "user_id" text primary key,
  "email" text not null,
  "name" text not null,
  "created_at" timestamptz not null default now()
);

create table if not exists "plugin_configs" (
  "id" text primary key,
  "plugin_id" text not null unique,
  "enabled" boolean not null default false,
  "version" text not null default '1.0.0',
  "config" jsonb not null default '{}'::jsonb,
  "capability_state" jsonb not null default '{}'::jsonb,
  "dependency_state" jsonb not null default '[]'::jsonb,
  "health" jsonb not null default '{}'::jsonb,
  "provisioning_state" jsonb not null default '{}'::jsonb,
  "extension_bindings" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "schema_tables" (
  "id" text primary key,
  "table_name" text not null unique,
  "display_name" text not null,
  "primary_key" text not null,
  "definition" jsonb not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "schema_fields" (
  "id" text primary key,
  "table_id" text not null references "schema_tables"("id") on delete cascade,
  "field_name" text not null,
  "definition" jsonb not null,
  "created_at" timestamptz not null default now()
);

create table if not exists "schema_relations" (
  "id" text primary key,
  "source_table" text not null,
  "source_field" text not null,
  "target_table" text not null,
  "target_field" text not null,
  "on_delete" text not null,
  "on_update" text not null,
  "definition" jsonb not null,
  "created_at" timestamptz not null default now()
);

create table if not exists "migration_runs" (
  "id" text primary key,
  "migration_key" text not null unique,
  "title" text not null,
  "sql" text not null,
  "status" text not null,
  "created_at" timestamptz not null default now(),
  "applied_at" timestamptz
);

create table if not exists "audit_logs" (
  "id" text primary key,
  "action" text not null,
  "actor_user_id" text,
  "target" text not null,
  "payload" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now()
);

create table if not exists "system_settings" (
  "key" text primary key,
  "value" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "backup_runs" (
  "id" text primary key,
  "status" text not null,
  "trigger" text not null,
  "destination" text not null,
  "file_path" text,
  "size_bytes" text,
  "details" jsonb not null default '{}'::jsonb,
  "error" text,
  "started_at" timestamptz not null default now(),
  "completed_at" timestamptz
);

create table if not exists "cron_jobs" (
  "id" text primary key,
  "name" text not null unique,
  "description" text,
  "handler" text not null,
  "schedule" text not null,
  "enabled" boolean not null default true,
  "timeout_seconds" text not null default '120',
  "concurrency_policy" text not null default 'skip',
  "config" jsonb not null default '{}'::jsonb,
  "last_run_at" timestamptz,
  "next_run_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "cron_runs" (
  "id" text primary key,
  "job_id" text not null references "cron_jobs"("id") on delete cascade,
  "status" text not null,
  "trigger" text not null,
  "output" jsonb not null default '{}'::jsonb,
  "error" text,
  "started_at" timestamptz not null default now(),
  "completed_at" timestamptz,
  "duration_ms" text
);

create table if not exists "ai_threads" (
  "id" text primary key,
  "title" text not null,
  "actor_user_id" text not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "ai_messages" (
  "id" text primary key,
  "thread_id" text not null references "ai_threads"("id") on delete cascade,
  "role" text not null,
  "content" text not null,
  "context" jsonb,
  "run_id" text,
  "created_at" timestamptz not null default now()
);

create table if not exists "ai_runs" (
  "id" text primary key,
  "thread_id" text not null references "ai_threads"("id") on delete cascade,
  "user_message_id" text not null,
  "assistant_message_id" text,
  "status" text not null,
  "summary" text not null,
  "rationale" text not null,
  "action_batch" jsonb not null default '{}'::jsonb,
  "previews" jsonb not null default '[]'::jsonb,
  "results" jsonb not null default '[]'::jsonb,
  "error" text,
  "actor_user_id" text,
  "approved_by_user_id" text,
  "created_at" timestamptz not null default now(),
  "approved_at" timestamptz,
  "completed_at" timestamptz
);
