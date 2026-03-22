create table if not exists "post" (
  "id" uuid primary key  default gen_random_uuid(),
  "title" text not null,
  "slug" text not null unique,
  "content" text not null
);

create index if not exists "post_title_idx" on "post" ("title");