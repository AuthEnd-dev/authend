import { bigint, boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const release_notes_status_enum = pgEnum("release_notes_status_enum", ["draft", "published"]);

export const notes = pgTable("notes", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  body: text("body"),
});

export const authors = pgTable("authors", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  display_name: text("display_name").notNull(),
  email: text("email").notNull(),
},
  (table) => [
    index("authors_email_idx").on(table.email),
  ]);

export const articles = pgTable("articles", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  body: text("body"),
  internal_notes: text("internal_notes"),
  member_excerpt: text("member_excerpt"),
  author_id: uuid("author_id").notNull().references(() => authors.id, { onDelete: "restrict", onUpdate: "cascade" }),
},
  (table) => [
    index("articles_author_id_idx").on(table.author_id),
  ]);

export const profiles = pgTable("profiles", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  owner_id: text("owner_id").notNull(),
  display_name: text("display_name").notNull(),
  moderation_state: text("moderation_state"),
  internal_notes: text("internal_notes"),
},
  (table) => [
    index("profiles_owner_id_idx").on(table.owner_id),
  ]);

export const server_tasks = pgTable("server_tasks", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  status: text("status").notNull(),
});

export const profile_cards = pgTable("profile_cards", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  headline: text("headline").notNull(),
  profile_id: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "restrict", onUpdate: "cascade" }),
},
  (table) => [
    index("profile_cards_profile_id_idx").on(table.profile_id),
  ]);

export const release_notes = pgTable("release_notes", {
  id: uuid("id").notNull().unique().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  status: release_notes_status_enum("status").notNull().default("draft"),
  author_id: uuid("author_id").notNull().references(() => authors.id, { onDelete: "cascade", onUpdate: "cascade" }),
},
  (table) => [
    index("release_notes_title_idx").on(table.title),
    index("release_notes_author_id_idx").on(table.author_id),
    index("release_notes_title_status_idx").on(table.title, table.status),
  ]);

export const generatedSchema = {
  notes,
  authors,
  articles,
  profiles,
  server_tasks,
  profile_cards,
  release_notes,
};
