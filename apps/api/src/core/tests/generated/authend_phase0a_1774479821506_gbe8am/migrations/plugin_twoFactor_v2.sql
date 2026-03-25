create table if not exists "two_factor" (
  "id" text primary key,
  "user_id" text not null references "user"("id") on delete cascade,
  "secret" text,
  "backup_codes" text,
  unique ("user_id")
);

create unique index if not exists "two_factor_user_idx" on "two_factor" ("user_id");