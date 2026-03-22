create table if not exists "entry" (
  "id" uuid primary key  default gen_random_uuid(),
  "name" text not null
);

create index if not exists "entry_name_idx" on "entry" ("name");