create table if not exists "jwks" (
  "id" text primary key,
  "public_key" text not null,
  "private_key" text not null,
  "created_at" timestamptz not null default now(),
  "expires_at" timestamptz
);