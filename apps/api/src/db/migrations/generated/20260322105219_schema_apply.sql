create table if not exists "payment" (
  "id" uuid primary key  default gen_random_uuid(),
  "amount" numeric not null,
  "ref" text not null unique
);

create index if not exists "payment_amount_idx" on "payment" ("amount");