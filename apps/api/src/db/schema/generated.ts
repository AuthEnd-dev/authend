import { boolean, bigint, date, integer, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const entry = pgTable("entry", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  amount: numeric("amount"),
});

export const history = pgTable("history", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  platform: text("platform").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`NOW()`),
});

export const post = pgTable("post", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
});

export const payment = pgTable("payment", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  amount: numeric("amount").notNull(),
  ref: text("ref").notNull().unique(),
});

export const generatedSchema = {
  entry,
  history,
  post,
  payment,
};
