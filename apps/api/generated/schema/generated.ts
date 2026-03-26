import { bigint, boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../../src/core/db/schema/auth";



export const project = pgTable("project", {
  id: text("id").notNull().unique(),
  name: text("name").notNull(),
  owner_user_id: text("owner_user_id").notNull().references(() => user.id, { onDelete: "cascade", onUpdate: "no action" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
},
  (table) => [
    index("project_name_idx").on(table.name),
    index("project_owner_user_id_idx").on(table.owner_user_id),
    index("project_owner_user_id_created_at_idx").on(table.owner_user_id, table.created_at),
  ]);

export const generatedSchema = {
  project,
};
