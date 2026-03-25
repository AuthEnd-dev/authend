do $$ begin
  create type "release_notes_status_enum" as enum ('draft', 'published');
exception
  when duplicate_object then null;
end $$;

create table if not exists "release_notes" (
  "id" uuid primary key  default gen_random_uuid(),
  "title" text not null,
  "status" "release_notes_status_enum" not null  default 'draft',
  "author_id" uuid not null references "authors"("id") on delete cascade on update cascade
);

create index if not exists "release_notes_title_idx" on "release_notes" ("title");

create index if not exists "release_notes_author_id_idx" on "release_notes" ("author_id");

create index if not exists "release_notes_title_status_idx" on "release_notes" ("title", "status");