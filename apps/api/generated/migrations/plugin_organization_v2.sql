
create table if not exists "organization" (
  "id" text primary key,
  "name" text not null,
  "slug" text not null unique,
  "logo" text,
  "metadata" text,
  "created_at" timestamptz not null default now()
);

create table if not exists "member" (
  "id" text primary key,
  "user_id" text not null references "user"("id") on delete cascade,
  "organization_id" text not null references "organization"("id") on delete cascade,
  "role" text not null,
  "created_at" timestamptz not null default now(),
  unique ("user_id", "organization_id")
);

create table if not exists "invitation" (
  "id" text primary key,
  "email" text not null,
  "inviter_id" text not null references "user"("id") on delete cascade,
  "organization_id" text not null references "organization"("id") on delete cascade,
  "role" text not null,
  "status" text not null,
  "expires_at" timestamptz not null,
  "created_at" timestamptz not null default now()
);

create unique index if not exists "organization_slug_idx" on "organization" ("slug");
create unique index if not exists "member_user_org_idx" on "member" ("user_id", "organization_id");