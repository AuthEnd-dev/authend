create table if not exists "notes" (
  "id" uuid primary key  default gen_random_uuid(),
  "title" text not null,
  "body" text
);

create table if not exists "authors" (
  "id" uuid primary key  default gen_random_uuid(),
  "display_name" text not null,
  "email" text not null
);

create index if not exists "authors_email_idx" on "authors" ("email");

create table if not exists "articles" (
  "id" uuid primary key  default gen_random_uuid(),
  "title" text not null,
  "body" text,
  "internal_notes" text,
  "member_excerpt" text,
  "author_id" uuid not null references "authors"("id") on delete restrict on update cascade
);

create index if not exists "articles_author_id_idx" on "articles" ("author_id");

create table if not exists "profiles" (
  "id" uuid primary key  default gen_random_uuid(),
  "owner_id" text not null,
  "display_name" text not null,
  "moderation_state" text,
  "internal_notes" text
);

create index if not exists "profiles_owner_id_idx" on "profiles" ("owner_id");

create table if not exists "server_tasks" (
  "id" uuid primary key  default gen_random_uuid(),
  "title" text not null,
  "status" text not null
);

create table if not exists "profile_cards" (
  "id" uuid primary key  default gen_random_uuid(),
  "headline" text not null,
  "profile_id" uuid not null references "profiles"("id") on delete restrict on update cascade
);

create index if not exists "profile_cards_profile_id_idx" on "profile_cards" ("profile_id");