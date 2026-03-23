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

export const systemSettings = pgTable(
  "system_settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    systemSettingsKeyIndex: uniqueIndex("system_settings_key_idx").on(table.key),
  }),
);

export const backupRuns = pgTable("backup_runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  trigger: text("trigger").notNull(),
  destination: text("destination").notNull(),
  filePath: text("file_path"),
  sizeBytes: text("size_bytes"),
  details: jsonb("details").notNull().default({}),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const cronJobs = pgTable(
  "cron_jobs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    handler: text("handler").notNull(),
    schedule: text("schedule").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    timeoutSeconds: text("timeout_seconds").notNull().default("120"),
    concurrencyPolicy: text("concurrency_policy").notNull().default("skip"),
    config: jsonb("config").notNull().default({}),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cronJobsNameIndex: uniqueIndex("cron_jobs_name_idx").on(table.name),
  }),
);

export const cronRuns = pgTable("cron_runs", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => cronJobs.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  trigger: text("trigger").notNull(),
  output: jsonb("output").notNull().default({}),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: text("duration_ms"),
});

export const aiThreads = pgTable("ai_threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiMessages = pgTable("ai_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull().references(() => aiThreads.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  context: jsonb("context"),
  runId: text("run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiRuns = pgTable("ai_runs", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull().references(() => aiThreads.id, { onDelete: "cascade" }),
  userMessageId: text("user_message_id").notNull(),
  assistantMessageId: text("assistant_message_id"),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  rationale: text("rationale").notNull(),
  actionBatch: jsonb("action_batch").notNull().default({}),
  previews: jsonb("previews").notNull().default([]),
  results: jsonb("results").notNull().default([]),
  error: text("error"),
  actorUserId: text("actor_user_id"),
  approvedByUserId: text("approved_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
