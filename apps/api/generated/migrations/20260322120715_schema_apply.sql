alter table "post" add column if not exists "user_id" text;

create index if not exists "post_user_id_idx" on "post" ("user_id");

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'post_user_id_user_fk'
  ) then
    alter table "post"
      add constraint "post_user_id_user_fk"
      foreign key ("user_id")
      references "user"("id")
      on delete no action
      on update no action;
  end if;
end $$;