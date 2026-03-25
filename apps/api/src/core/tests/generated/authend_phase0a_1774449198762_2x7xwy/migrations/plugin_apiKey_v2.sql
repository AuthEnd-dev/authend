do $$
begin
  if to_regclass('public.api_key') is not null and to_regclass('public.apikey') is null then
    alter table "api_key" rename to "apikey";
  end if;
end $$;

create table if not exists "apikey" (
  "id" text primary key,
  "config_id" text not null default 'default',
  "name" text,
  "start" text,
  "reference_id" text not null,
  "prefix" text,
  "key" text not null,
  "refill_interval" integer,
  "refill_amount" integer,
  "last_refill_at" timestamptz,
  "enabled" boolean not null default true,
  "rate_limit_enabled" boolean not null default true,
  "rate_limit_time_window" integer,
  "rate_limit_max" integer,
  "request_count" integer not null default 0,
  "remaining" integer,
  "last_request" timestamptz,
  "expires_at" timestamptz,
  "permissions" text,
  "metadata" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

alter table "apikey" add column if not exists "config_id" text default 'default';
alter table "apikey" add column if not exists "reference_id" text;
alter table "apikey" add column if not exists "remaining" integer;
alter table "apikey" alter column "config_id" set default 'default';
alter table "apikey" alter column "enabled" set default true;
alter table "apikey" alter column "rate_limit_enabled" set default true;
alter table "apikey" alter column "request_count" set default 0;

create index if not exists "apikey_config_id_idx" on "apikey" ("config_id");
create index if not exists "apikey_reference_id_idx" on "apikey" ("reference_id");
create index if not exists "apikey_key_idx" on "apikey" ("key");