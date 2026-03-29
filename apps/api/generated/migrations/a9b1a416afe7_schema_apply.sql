create table if not exists "project" (
  "id" text primary key,
  "name" text not null,
  "owner_user_id" text not null references "user"("id") on delete cascade on update no action,
  "created_at" timestamp with time zone not null  default now()
);

create index if not exists "project_name_idx" on "project" ("name");

create index if not exists "project_owner_user_id_idx" on "project" ("owner_user_id");

create index if not exists "project_owner_user_id_created_at_idx" on "project" ("owner_user_id", "created_at");

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_owner_user_id_user_fk'
  ) then
    alter table "project"
      add constraint "project_owner_user_id_user_fk"
      foreign key ("owner_user_id")
      references "user"("id")
      on delete cascade
      on update no action;
  end if;
end $$;