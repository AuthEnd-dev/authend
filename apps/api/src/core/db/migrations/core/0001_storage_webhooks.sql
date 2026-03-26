-- Provision missing system tables for Storage and Webhooks

create table if not exists "_storage_files" (
  "id" text primary key,
  "object_key" text not null unique,
  "visibility" text not null default 'private',
  "driver" text not null,
  "size_bytes" text not null,
  "mime_type" text,
  "public_url" text,
  "attachment_table" text,
  "attachment_record_id" text,
  "attachment_field" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "_webhooks" (
  "id" text primary key,
  "url" text not null,
  "description" text not null default '',
  "secret" text not null,
  "events" jsonb not null default '[]'::jsonb,
  "enabled" boolean not null default true,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "_webhook_deliveries" (
  "id" text primary key not null,
  "webhook_id" text not null references "_webhooks"("id") on delete cascade,
  "event_type" text not null,
  "payload" jsonb default '{}'::jsonb not null,
  "status" text default 'pending' not null,
  "attempt_count" integer default 0 not null,
  "next_attempt_at" timestamptz,
  "http_status" integer,
  "response" text,
  "last_error" text,
  "delivered_at" timestamptz,
  "created_at" timestamptz default now() not null
);

create index if not exists "_webhook_deliveries_status_idx" on "_webhook_deliveries" ("status", "next_attempt_at");
create index if not exists "_webhook_deliveries_webhook_id_idx" on "_webhook_deliveries" ("webhook_id");
