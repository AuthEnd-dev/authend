create table if not exists "history" (
  "id" uuid primary key  default gen_random_uuid(),
  "platform" text not null,
  "created_at" timestamp with time zone  default NOW()
);

create index if not exists "history_platform_idx" on "history" ("platform");