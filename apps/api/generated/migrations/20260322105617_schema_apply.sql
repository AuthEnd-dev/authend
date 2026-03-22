create table if not exists "bing" (
  "id" uuid primary key  default gen_random_uuid(),
  "name" text
);

create index if not exists "bing_name_idx" on "bing" ("name");