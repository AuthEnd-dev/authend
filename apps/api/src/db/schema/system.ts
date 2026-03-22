import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const systemAdmins = pgTable("system_admins", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pluginConfigs = pgTable(
  "plugin_configs",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    version: text("version").notNull().default("1.0.0"),
    config: jsonb("config").notNull().default({}),
    capabilityState: jsonb("capability_state").notNull().default({}),
    dependencyState: jsonb("dependency_state").notNull().default([]),
    health: jsonb("health").notNull().default({}),
    provisioningState: jsonb("provisioning_state").notNull().default({}),
    extensionBindings: jsonb("extension_bindings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pluginIdIndex: uniqueIndex("plugin_configs_plugin_id_idx").on(table.pluginId),
  }),
);

export const schemaTables = pgTable(
  "schema_tables",
  {
    id: text("id").primaryKey(),
    tableName: text("table_name").notNull(),
    displayName: text("display_name").notNull(),
    primaryKey: text("primary_key").notNull(),
    definition: jsonb("definition").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    schemaTableNameIndex: uniqueIndex("schema_tables_table_name_idx").on(table.tableName),
  }),
);

export const schemaFields = pgTable("schema_fields", {
  id: text("id").primaryKey(),
  tableId: text("table_id").notNull().references(() => schemaTables.id, { onDelete: "cascade" }),
  fieldName: text("field_name").notNull(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schemaRelations = pgTable("schema_relations", {
  id: text("id").primaryKey(),
  sourceTable: text("source_table").notNull(),
  sourceField: text("source_field").notNull(),
  targetTable: text("target_table").notNull(),
  targetField: text("target_field").notNull(),
  onDelete: text("on_delete").notNull(),
  onUpdate: text("on_update").notNull(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const migrationRuns = pgTable(
  "migration_runs",
  {
    id: text("id").primaryKey(),
    migrationKey: text("migration_key").notNull(),
    title: text("title").notNull(),
    sql: text("sql").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => ({
    migrationKeyIndex: uniqueIndex("migration_runs_key_idx").on(table.migrationKey),
  }),
);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  actorUserId: text("actor_user_id"),
  target: text("target").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
