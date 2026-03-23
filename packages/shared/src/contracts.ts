import { z } from "zod";

export const pluginIdSchema = z.enum([
  "username",
  "jwt",
  "organization",
  "twoFactor",
  "apiKey",
  "magicLink",
  "socialAuth",
  "admin",
]);

export type PluginId = z.infer<typeof pluginIdSchema>;

export const fieldTypeSchema = z.enum([
  "text",
  "varchar",
  "integer",
  "bigint",
  "boolean",
  "timestamp",
  "date",
  "jsonb",
  "uuid",
  "numeric",
  "enum",
]);

export type FieldType = z.infer<typeof fieldTypeSchema>;

export const relationActionSchema = z.enum([
  "no action",
  "restrict",
  "cascade",
  "set null",
]);

export const relationJoinTypeSchema = z.enum([
  "inner",
  "left",
  "right",
  "full",
]);

export type RelationJoinType = z.infer<typeof relationJoinTypeSchema>;

export const fieldBlueprintSchema = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/),
  type: fieldTypeSchema,
  nullable: z.boolean().default(false),
  default: z.string().nullish(),
  unique: z.boolean().default(false),
  indexed: z.boolean().default(false),
  size: z.number().int().positive().max(65535).nullish(),
  enumValues: z.array(z.string().min(1)).nullish(),
  references: z
    .object({
      table: z.string().min(1),
      column: z.string().min(1),
      onDelete: relationActionSchema.default("no action"),
      onUpdate: relationActionSchema.default("no action"),
    })
    .nullish(),
});

export type FieldBlueprint = z.infer<typeof fieldBlueprintSchema>;

export const relationBlueprintSchema = z.object({
  sourceTable: z.string().min(1),
  sourceField: z.string().min(1),
  targetTable: z.string().min(1),
  targetField: z.string().min(1),
  alias: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/).nullish(),
  sourceAlias: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/).nullish(),
  targetAlias: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/).nullish(),
  joinType: relationJoinTypeSchema.default("left"),
  onDelete: relationActionSchema.default("no action"),
  onUpdate: relationActionSchema.default("no action"),
  description: z.string().min(1).nullish(),
});

export type RelationBlueprint = z.infer<typeof relationBlueprintSchema>;

export const tableApiOperationsSchema = z.object({
  list: z.boolean().default(true),
  get: z.boolean().default(true),
  create: z.boolean().default(true),
  update: z.boolean().default(true),
  delete: z.boolean().default(true),
});

export type TableApiOperations = z.infer<typeof tableApiOperationsSchema>;

export const apiAuthModeSchema = z.enum([
  "superadmin",
  "session",
  "public",
]);

export type ApiAuthMode = z.infer<typeof apiAuthModeSchema>;

export const apiAccessActorSchema = z.enum([
  "public",
  "session",
  "superadmin",
  "apiKey",
]);

export type ApiAccessActor = z.infer<typeof apiAccessActorSchema>;

export const apiAccessScopeSchema = z.enum(["all", "own"]);

export type ApiAccessScope = z.infer<typeof apiAccessScopeSchema>;

function defaultOperationAccess() {
  return {
    actors: ["superadmin"] as ApiAccessActor[],
    scope: "all" as ApiAccessScope,
  };
}

export const apiOperationAccessSchema = z.object({
  actors: z.array(apiAccessActorSchema).default(() => defaultOperationAccess().actors),
  scope: apiAccessScopeSchema.default(defaultOperationAccess().scope),
});

export type ApiOperationAccess = z.infer<typeof apiOperationAccessSchema>;

export const tableApiAccessSchema = z.object({
  ownershipField: z.string().min(1).nullish(),
  list: apiOperationAccessSchema.default(() => defaultOperationAccess()),
  get: apiOperationAccessSchema.default(() => defaultOperationAccess()),
  create: apiOperationAccessSchema.default(() => defaultOperationAccess()),
  update: apiOperationAccessSchema.default(() => defaultOperationAccess()),
  delete: apiOperationAccessSchema.default(() => defaultOperationAccess()),
});

export type TableApiAccess = z.infer<typeof tableApiAccessSchema>;

export const apiPaginationSchema = z.object({
  enabled: z.boolean().default(true),
  defaultPageSize: z.number().int().positive().max(100).default(20),
  maxPageSize: z.number().int().positive().max(250).default(100),
});

export type ApiPaginationConfig = z.infer<typeof apiPaginationSchema>;

export const apiFieldAccessSchema = z.object({
  enabled: z.boolean().default(true),
  fields: z.array(z.string().min(1)).default([]),
});

export type ApiFieldAccess = z.infer<typeof apiFieldAccessSchema>;

export const apiSortingSchema = z.object({
  enabled: z.boolean().default(true),
  fields: z.array(z.string().min(1)).default([]),
  defaultField: z.string().min(1).nullish(),
  defaultOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ApiSortingConfig = z.infer<typeof apiSortingSchema>;

function defaultTableApiAccess() {
  return {
    ownershipField: null,
    list: defaultOperationAccess(),
    get: defaultOperationAccess(),
    create: defaultOperationAccess(),
    update: defaultOperationAccess(),
    delete: defaultOperationAccess(),
  };
}

function defaultTableApiConfig() {
  return {
    authMode: "superadmin" as ApiAuthMode,
    access: defaultTableApiAccess(),
    operations: {
      list: true,
      get: true,
      create: true,
      update: true,
      delete: true,
    },
    pagination: {
      enabled: true,
      defaultPageSize: 20,
      maxPageSize: 100,
    },
    filtering: {
      enabled: true,
      fields: [] as string[],
    },
    sorting: {
      enabled: true,
      fields: [] as string[],
      defaultOrder: "desc" as const,
    },
    includes: {
      enabled: true,
      fields: [] as string[],
    },
    hiddenFields: [] as string[],
  };
}

export const tableApiConfigSchema = z.object({
  routeSegment: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/).nullish(),
  tag: z.string().min(1).nullish(),
  sdkName: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/).nullish(),
  description: z.string().min(1).nullish(),
  authMode: apiAuthModeSchema.default("superadmin"),
  access: tableApiAccessSchema.default(() => defaultTableApiAccess()),
  operations: tableApiOperationsSchema.default(() => defaultTableApiConfig().operations),
  pagination: apiPaginationSchema.default(() => defaultTableApiConfig().pagination),
  filtering: apiFieldAccessSchema.default(() => defaultTableApiConfig().filtering),
  sorting: apiSortingSchema.default(() => defaultTableApiConfig().sorting),
  includes: apiFieldAccessSchema.default(() => defaultTableApiConfig().includes),
  hiddenFields: z.array(z.string().min(1)).default([]),
});

export type TableApiConfig = z.infer<typeof tableApiConfigSchema>;

export const tableBlueprintSchema = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/),
  displayName: z.string().min(1),
  primaryKey: z.string().min(1).default("id"),
  fields: z.array(fieldBlueprintSchema).min(1),
  indexes: z.array(z.array(z.string().min(1)).min(1)).default([]),
  api: tableApiConfigSchema.default(() => defaultTableApiConfig()),
});

export type TableBlueprint = z.infer<typeof tableBlueprintSchema>;

export const schemaDraftSchema = z.object({
  tables: z.array(tableBlueprintSchema),
  relations: z.array(relationBlueprintSchema).default([]),
});

export type SchemaDraft = z.infer<typeof schemaDraftSchema>;

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const pluginConfigSchema = z.record(z.string(), jsonValueSchema);

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

export const pluginCategorySchema = z.enum(["authentication", "api", "administration"]);

export type PluginCategory = z.infer<typeof pluginCategorySchema>;

export const pluginConfigFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["string", "number", "boolean", "password", "url"]),
  required: z.boolean().default(false),
  placeholder: z.string().nullish(),
  helpText: z.string().nullish(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).nullish(),
});

export type PluginConfigField = z.infer<typeof pluginConfigFieldSchema>;

export const pluginCapabilitySchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  description: z.string(),
  enabledByDefault: z.boolean().default(false),
  enabled: z.boolean().default(false),
  requires: z.array(z.string()).default([]),
  addsModels: z.array(z.string()).default([]),
  addsClientFeatures: z.array(z.string()).default([]),
  addsServerFeatures: z.array(z.string()).default([]),
  addsAdminPanels: z.array(z.string()).default([]),
  missingRequirements: z.array(z.string()).default([]),
});

export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;

export const pluginExtensionHandlerSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  description: z.string(),
});

export type PluginExtensionHandler = z.infer<typeof pluginExtensionHandlerSchema>;

export const pluginExtensionSlotSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  description: z.string(),
  kind: z.enum(["boolean", "policy", "hook", "notification", "access-control"]),
  required: z.boolean().default(false),
  enabled: z.boolean().default(false),
  selectedHandlerId: z.string().nullish(),
  defaultHandlerId: z.string().nullish(),
  handlerIds: z.array(z.string()).default([]),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  exampleLanguage: z.enum(["ts", "tsx", "js", "json", "bash", "http"]).default("ts"),
  exampleTitle: z.string().nullish(),
  exampleDescription: z.string().nullish(),
  exampleCode: z.string().nullish(),
  availableHandlers: z.array(pluginExtensionHandlerSchema).default([]),
});

export type PluginExtensionSlot = z.infer<typeof pluginExtensionSlotSchema>;

export const pluginModelSchema = z.object({
  key: z.string().min(1),
  tableName: z.string().min(1),
  label: z.string(),
  capabilityKeys: z.array(z.string()).default([]),
  primaryKey: z.string().min(1).default("id"),
  fields: z.array(fieldBlueprintSchema).default([]),
  provisioned: z.boolean().default(false),
  description: z.string().nullish(),
});

export type PluginModel = z.infer<typeof pluginModelSchema>;

export const pluginAdminPanelSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  description: z.string(),
  capabilityKeys: z.array(z.string()).default([]),
  enabled: z.boolean().default(false),
});

export type PluginAdminPanel = z.infer<typeof pluginAdminPanelSchema>;

export const pluginExampleSchema = z.object({
  key: z.string().min(1),
  title: z.string(),
  description: z.string(),
  language: z.enum(["ts", "tsx", "js", "json", "bash", "http"]).default("ts"),
  code: z.string(),
  capabilityKeys: z.array(z.string()).default([]),
  audience: z.enum(["client", "server", "api", "admin"]).default("client"),
});

export type PluginExample = z.infer<typeof pluginExampleSchema>;

export const pluginHealthStatusSchema = z.enum(["healthy", "degraded", "error", "unknown"]);

export type PluginHealthStatus = z.infer<typeof pluginHealthStatusSchema>;

export const pluginHealthSchema = z.object({
  status: pluginHealthStatusSchema.default("unknown"),
  issues: z.array(z.string()).default([]),
});

export type PluginHealth = z.infer<typeof pluginHealthSchema>;

export const pluginProvisioningStateSchema = z.object({
  status: z.enum(["not-required", "pending", "provisioned", "rolled_back", "failed"]).default("not-required"),
  appliedMigrationKeys: z.array(z.string()).default([]),
  rollbackMigrationKeys: z.array(z.string()).default([]),
  details: z.array(z.string()).default([]),
});

export type PluginProvisioningState = z.infer<typeof pluginProvisioningStateSchema>;

export const pluginDependencyStateSchema = z.object({
  pluginId: pluginIdSchema,
  satisfied: z.boolean().default(true),
  reason: z.string().nullish(),
});

export type PluginDependencyState = z.infer<typeof pluginDependencyStateSchema>;

export const pluginCapabilityStateSchema = z.record(z.string(), z.boolean());

export type PluginCapabilityState = z.infer<typeof pluginCapabilityStateSchema>;

export const pluginExtensionBindingsSchema = z.record(z.string(), z.string());

export type PluginExtensionBindings = z.infer<typeof pluginExtensionBindingsSchema>;

export const pluginInstallStateSchema = z.object({
  pluginId: pluginIdSchema,
  enabled: z.boolean().default(false),
  version: z.string().default("1.0.0"),
  config: pluginConfigSchema.default({}),
  capabilityState: pluginCapabilityStateSchema.default({}),
  dependencyState: z.array(pluginDependencyStateSchema).default([]),
  health: pluginHealthSchema.default({ status: "unknown", issues: [] }),
  provisioningState: pluginProvisioningStateSchema.default({
    status: "not-required",
    appliedMigrationKeys: [],
    rollbackMigrationKeys: [],
    details: [],
  }),
  extensionBindings: pluginExtensionBindingsSchema.default({}),
});

export type PluginInstallState = z.infer<typeof pluginInstallStateSchema>;

export const pluginConfigUpdateSchema = z.object({
  config: pluginConfigSchema.default({}),
  capabilityState: pluginCapabilityStateSchema.default({}),
  extensionBindings: pluginExtensionBindingsSchema.default({}),
});

export type PluginConfigUpdate = z.infer<typeof pluginConfigUpdateSchema>;

export const pluginManifestSchema = z.object({
  id: pluginIdSchema,
  version: z.string(),
  label: z.string(),
  description: z.string(),
  category: pluginCategorySchema,
  documentationUrl: z.string().url(),
  defaultEnabled: z.boolean().default(false),
  required: z.boolean().default(false),
  dependencies: z.array(pluginIdSchema).default([]),
  requiredEnv: z.array(z.string()).default([]),
  missingEnvKeys: z.array(z.string()).default([]),
  configSchema: z.array(pluginConfigFieldSchema).default([]),
  capabilities: z.array(pluginCapabilitySchema).default([]),
  extensionSlots: z.array(pluginExtensionSlotSchema).default([]),
  models: z.array(pluginModelSchema).default([]),
  adminPanels: z.array(pluginAdminPanelSchema).default([]),
  examples: z.array(pluginExampleSchema).default([]),
  clientNamespaces: z.array(z.string()).default([]),
  serverOperations: z.array(z.string()).default([]),
  installState: pluginInstallStateSchema,
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export const pluginCatalogItemSchema = z.object({
  id: pluginIdSchema,
  label: z.string(),
  description: z.string(),
  category: pluginCategorySchema,
  documentationUrl: z.string().url(),
  defaultEnabled: z.boolean().default(false),
  required: z.boolean().default(false),
  status: z.enum(["enabled", "disabled", "requires-env"]),
  /** Env var names from `requiredEnv` that are unset (server only). */
  missingEnvKeys: z.array(z.string()).default([]),
  config: pluginConfigSchema.default({}),
  configSchema: z.array(pluginConfigFieldSchema).default([]),
  requiredEnv: z.array(z.string()),
  migrationStrategy: z.enum(["none", "sql", "manual"]),
  version: z.string().default("1.0.0"),
  dependencies: z.array(pluginIdSchema).default([]),
  capabilities: z.array(pluginCapabilitySchema).default([]),
  extensionSlots: z.array(pluginExtensionSlotSchema).default([]),
  models: z.array(pluginModelSchema).default([]),
  adminPanels: z.array(pluginAdminPanelSchema).default([]),
  examples: z.array(pluginExampleSchema).default([]),
  clientNamespaces: z.array(z.string()).default([]),
  serverOperations: z.array(z.string()).default([]),
  installState: pluginInstallStateSchema.nullish(),
  health: pluginHealthSchema.default({ status: "unknown", issues: [] }),
  provisioningState: pluginProvisioningStateSchema.default({
    status: "not-required",
    appliedMigrationKeys: [],
    rollbackMigrationKeys: [],
    details: [],
  }),
});

export type PluginCatalogItem = z.infer<typeof pluginCatalogItemSchema>;

export const auditLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  actorUserId: z.string().nullish(),
  target: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
});

export type AuditLog = z.infer<typeof auditLogSchema>;

export const migrationRecordSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  status: z.enum(["pending", "applied", "rolled_back", "failed"]),
  sql: z.string(),
  appliedAt: z.string().nullish(),
});

export type MigrationRecord = z.infer<typeof migrationRecordSchema>;

export const listResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });

export const setupStatusSchema = z.object({
  healthy: z.boolean(),
  migrationsPending: z.number().int().nonnegative(),
  superAdminExists: z.boolean(),
  enabledPlugins: z.array(pluginIdSchema),
});

export type SetupStatus = z.infer<typeof setupStatusSchema>;

export const dataRecordSchema = z.record(z.string(), z.unknown());

export type DataRecord = z.infer<typeof dataRecordSchema>;

export const tableDescriptorSchema = z.object({
  table: z.string(),
  primaryKey: z.string(),
  fields: z.array(fieldBlueprintSchema),
  source: z.enum(["builtin", "generated", "plugin"]),
  mutableSchema: z.boolean(),
  ownerPluginId: pluginIdSchema.nullish(),
  pagination: apiPaginationSchema.optional(),
});

export type TableDescriptor = z.infer<typeof tableDescriptorSchema>;

export const apiPreviewOperationSchema = z.object({
  key: z.enum(["list", "get", "create", "update", "delete"]),
  method: z.enum(["GET", "POST", "PATCH", "DELETE"]),
  path: z.string(),
  summary: z.string(),
  enabled: z.boolean(),
  operationId: z.string(),
  queryParams: z.array(
    z.object({
      name: z.string(),
      required: z.boolean().default(false),
      description: z.string(),
    }),
  ).default([]),
  requestExample: z.record(z.string(), z.unknown()).nullish(),
  responseExample: z.unknown().nullish(),
});

export type ApiPreviewOperation = z.infer<typeof apiPreviewOperationSchema>;

export const apiQueryCapabilitiesSchema = z.object({
  pagination: apiPaginationSchema,
  filtering: apiFieldAccessSchema,
  sorting: apiSortingSchema,
  includes: apiFieldAccessSchema,
});

export type ApiQueryCapabilities = z.infer<typeof apiQueryCapabilitiesSchema>;

export const apiSecuritySchema = z.object({
  authMode: apiAuthModeSchema,
  description: z.string(),
});

export type ApiSecurity = z.infer<typeof apiSecuritySchema>;

export const apiResourceSchema = z.object({
  table: z.string(),
  displayName: z.string(),
  primaryKey: z.string(),
  routeSegment: z.string(),
  routeBase: z.string(),
  config: tableApiConfigSchema,
  editable: z.boolean(),
  fields: z.array(fieldBlueprintSchema),
  security: apiSecuritySchema,
  query: apiQueryCapabilitiesSchema,
  operations: z.array(apiPreviewOperationSchema),
});

export type ApiResource = z.infer<typeof apiResourceSchema>;

export const apiPreviewSchema = z.object({
  resource: apiResourceSchema,
  snippets: z.object({
    sdk: z.string(),
    fetch: z.string(),
  }),
});

export type ApiPreview = z.infer<typeof apiPreviewSchema>;

export const sdkSchemaResourceSchema = z.object({
  key: z.string().min(1),
  table: z.string().min(1),
  displayName: z.string(),
  routeSegment: z.string().min(1),
  primaryKey: z.string().min(1),
  authMode: apiAuthModeSchema,
  operations: tableApiOperationsSchema,
  fields: z.array(fieldBlueprintSchema).default([]),
  createFields: z.array(fieldBlueprintSchema).default([]),
  updateFields: z.array(fieldBlueprintSchema).default([]),
  filterFields: z.array(z.string().min(1)).default([]),
  sortFields: z.array(z.string().min(1)).default([]),
  includeFields: z.array(z.string().min(1)).default([]),
});

export type SdkSchemaResource = z.infer<typeof sdkSchemaResourceSchema>;

export const sdkSchemaManifestSchema = z.object({
  generatedAt: z.string(),
  resources: z.array(sdkSchemaResourceSchema).default([]),
});

export type SdkSchemaManifest = z.infer<typeof sdkSchemaManifestSchema>;

export const aiActionTypeSchema = z.enum([
  "create_table",
  "update_table",
  "delete_table",
  "create_relation",
  "update_relation",
  "delete_relation",
  "set_table_api_config",
  "enable_plugin",
  "disable_plugin",
  "update_plugin_config",
  "create_record",
  "update_record",
  "delete_record",
  "bulk_update_records",
  "bulk_delete_records",
]);

export type AiActionType = z.infer<typeof aiActionTypeSchema>;

const aiBulkFilterSchema = z.object({
  filterField: z.string().min(1).nullish(),
  filterValue: z.string().min(1),
});

export type AiBulkFilter = z.infer<typeof aiBulkFilterSchema>;

export const aiActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_table"),
    table: tableBlueprintSchema,
  }),
  z.object({
    type: z.literal("update_table"),
    tableName: z.string().min(1),
    table: tableBlueprintSchema,
  }),
  z.object({
    type: z.literal("delete_table"),
    tableName: z.string().min(1),
  }),
  z.object({
    type: z.literal("create_relation"),
    relation: relationBlueprintSchema,
  }),
  z.object({
    type: z.literal("update_relation"),
    current: relationBlueprintSchema,
    relation: relationBlueprintSchema,
  }),
  z.object({
    type: z.literal("delete_relation"),
    relation: relationBlueprintSchema,
  }),
  z.object({
    type: z.literal("set_table_api_config"),
    tableName: z.string().min(1),
    config: tableApiConfigSchema,
  }),
  z.object({
    type: z.literal("enable_plugin"),
    pluginId: pluginIdSchema,
  }),
  z.object({
    type: z.literal("disable_plugin"),
    pluginId: pluginIdSchema,
  }),
  z.object({
    type: z.literal("update_plugin_config"),
    pluginId: pluginIdSchema,
    update: pluginConfigUpdateSchema,
  }),
  z.object({
    type: z.literal("create_record"),
    table: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    type: z.literal("update_record"),
    table: z.string().min(1),
    id: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    type: z.literal("delete_record"),
    table: z.string().min(1),
    id: z.string().min(1),
  }),
  z.object({
    type: z.literal("bulk_update_records"),
    table: z.string().min(1),
    match: aiBulkFilterSchema,
    changes: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    type: z.literal("bulk_delete_records"),
    table: z.string().min(1),
    match: aiBulkFilterSchema,
  }),
]);

export type AiAction = z.infer<typeof aiActionSchema>;

export const aiActionPreviewSchema = z.object({
  title: z.string(),
  description: z.string(),
  details: z.array(z.string()).default([]),
  sqlPreview: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  affectedCount: z.number().int().nonnegative().nullish(),
  sampleRecords: z.array(dataRecordSchema).default([]),
});

export type AiActionPreview = z.infer<typeof aiActionPreviewSchema>;

export const aiActionBatchSchema = z.object({
  summary: z.string(),
  rationale: z.string(),
  actions: z.array(aiActionSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type AiActionBatch = z.infer<typeof aiActionBatchSchema>;

export const aiRunStatusSchema = z.enum(["pending", "approved", "running", "completed", "failed", "rejected"]);

export type AiRunStatus = z.infer<typeof aiRunStatusSchema>;

export const aiContextSchema = z.object({
  route: z.string(),
  pageTitle: z.string().nullish(),
  selectedTable: z.string().nullish(),
  selectedPluginId: pluginIdSchema.nullish(),
  selectedResource: z.string().nullish(),
});

export type AiContext = z.infer<typeof aiContextSchema>;

export const aiMessageRoleSchema = z.enum(["user", "assistant"]);

export type AiMessageRole = z.infer<typeof aiMessageRoleSchema>;

export const aiMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  role: aiMessageRoleSchema,
  content: z.string(),
  context: aiContextSchema.nullish(),
  runId: z.string().nullish(),
  createdAt: z.string(),
});

export type AiMessage = z.infer<typeof aiMessageSchema>;

export const aiRunStepResultSchema = z.object({
  actionIndex: z.number().int().nonnegative(),
  actionType: aiActionTypeSchema,
  status: z.enum(["completed", "failed", "skipped"]),
  target: z.string().nullish(),
  message: z.string(),
});

export type AiRunStepResult = z.infer<typeof aiRunStepResultSchema>;

export const aiRunSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  userMessageId: z.string(),
  assistantMessageId: z.string().nullish(),
  status: aiRunStatusSchema,
  summary: z.string(),
  rationale: z.string(),
  actionBatch: aiActionBatchSchema,
  previews: z.array(aiActionPreviewSchema).default([]),
  results: z.array(aiRunStepResultSchema).default([]),
  error: z.string().nullish(),
  actorUserId: z.string().nullish(),
  approvedByUserId: z.string().nullish(),
  createdAt: z.string(),
  approvedAt: z.string().nullish(),
  completedAt: z.string().nullish(),
});

export type AiRun = z.infer<typeof aiRunSchema>;

export const aiThreadSchema = z.object({
  id: z.string(),
  title: z.string(),
  actorUserId: z.string(),
  latestRunStatus: aiRunStatusSchema.nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AiThread = z.infer<typeof aiThreadSchema>;

export const aiThreadDetailSchema = z.object({
  thread: aiThreadSchema,
  messages: z.array(aiMessageSchema).default([]),
  runs: z.array(aiRunSchema).default([]),
});

export type AiThreadDetail = z.infer<typeof aiThreadDetailSchema>;

export const aiAssistantSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(["openai-compatible"]).default("openai-compatible"),
  baseUrl: z.string().url().default("https://api.openai.com/v1"),
  model: z.string().default("gpt-5-mini"),
  apiKeyEnvVar: z.string().min(1).default("OPENAI_API_KEY"),
});

export type AiAssistantSettings = z.infer<typeof aiAssistantSettingsSchema>;

export const aiMessageCreateSchema = z.object({
  content: z.string().min(1),
  context: aiContextSchema,
});

export type AiMessageCreate = z.infer<typeof aiMessageCreateSchema>;

export const settingsSectionIdSchema = z.enum([
  "general",
  "authentication",
  "sessionsSecurity",
  "email",
  "domainsOrigins",
  "api",
  "storage",
  "backups",
  "crons",
  "aiAssistant",
  "adminAccess",
  "environmentsSecrets",
  "observability",
  "dangerZone",
]);

export type SettingsSectionId = z.infer<typeof settingsSectionIdSchema>;

export const generalSettingsSchema = z.object({
  projectLabel: z.string().default("Authend Project"),
  appName: z.string().default("Authend"),
  appUrl: z.string().url().default("http://localhost:7002"),
  adminUrl: z.string().url().default("http://localhost:7001"),
  timezone: z.string().default("Africa/Lagos"),
  locale: z.string().default("en-US"),
});

export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

export const authenticationSettingsSchema = z.object({
  allowSignUp: z.boolean().default(true),
  requireEmailVerification: z.boolean().default(false),
  minPasswordLength: z.number().int().min(8).max(128).default(8),
  maxPasswordLength: z.number().int().min(8).max(256).default(128),
});

export type AuthenticationSettings = z.infer<typeof authenticationSettingsSchema>;

export const sessionsSecuritySettingsSchema = z.object({
  sessionTtlSeconds: z.number().int().positive().max(31536000).default(604800),
  rememberMeTtlSeconds: z.number().int().positive().max(31536000).default(2592000),
  allowMultipleSessions: z.boolean().default(true),
  maxSessionsPerUser: z.number().int().positive().max(100).default(10),
  enforceTwoFactorForAdmins: z.boolean().default(false),
  magicLinkTtlSeconds: z.number().int().positive().max(86400).default(300),
  apiKeyDefaultTtlDays: z.number().int().positive().max(3650).default(90),
  lockoutThreshold: z.number().int().positive().max(20).default(5),
  lockoutWindowMinutes: z.number().int().positive().max(1440).default(15),
});

export type SessionsSecuritySettings = z.infer<typeof sessionsSecuritySettingsSchema>;

export const emailSettingsSchema = z.object({
  smtpHost: z.string().default(""),
  smtpPort: z.number().int().positive().max(65535).default(587),
  smtpUsername: z.string().default(""),
  smtpPassword: z.string().default(""),
  smtpSecure: z.boolean().default(false),
  senderName: z.string().default("Authend"),
  senderEmail: z.string().email().default("no-reply@example.com"),
  replyToEmail: z.string().email().nullish(),
  passwordResetSubject: z.string().default("Reset your password"),
  verificationSubject: z.string().default("Verify your email"),
  testRecipient: z.string().email().nullish(),
});

export type EmailSettings = z.infer<typeof emailSettingsSchema>;

export const domainsOriginsSettingsSchema = z.object({
  trustedOrigins: z.array(z.string().url()).default([]),
  corsOrigins: z.array(z.string().url()).default([]),
  redirectOrigins: z.array(z.string().url()).default([]),
  cookieDomain: z.string().nullish(),
  secureCookies: z.boolean().default(false),
});

export type DomainsOriginsSettings = z.infer<typeof domainsOriginsSettingsSchema>;

export const apiSettingsSchema = z.object({
  defaultPageSize: z.number().int().positive().max(100).default(20),
  maxPageSize: z.number().int().positive().max(250).default(100),
  defaultRateLimitPerMinute: z.number().int().positive().max(100000).default(120),
  maxRateLimitPerMinute: z.number().int().positive().max(100000).default(1000),
  enableOpenApi: z.boolean().default(true),
  defaultAuthMode: apiAuthModeSchema.default("superadmin"),
  allowClientApiPreview: z.boolean().default(false),
});

export type ApiSettings = z.infer<typeof apiSettingsSchema>;

export const storageDriverSchema = z.enum(["local", "s3"]);

export type StorageDriver = z.infer<typeof storageDriverSchema>;

export const storageSettingsSchema = z.object({
  driver: storageDriverSchema.default("local"),
  rootPath: z.string().default("./var/storage"),
  bucket: z.string().default(""),
  region: z.string().default(""),
  endpoint: z.string().default(""),
  accessKeyId: z.string().default(""),
  secretAccessKey: z.string().default(""),
  forcePathStyle: z.boolean().default(true),
  publicBaseUrl: z.string().url().nullish(),
  maxUploadBytes: z.number().int().positive().max(1073741824).default(10485760),
  allowedMimeTypes: z.array(z.string().min(1)).default(["image/png", "image/jpeg", "application/pdf"]),
  signedUrlTtlSeconds: z.number().int().positive().max(604800).default(900),
  retentionDays: z.number().int().positive().max(3650).nullish(),
  defaultVisibility: z.enum(["public", "private"]).default("private"),
});

export type StorageSettings = z.infer<typeof storageSettingsSchema>;

export const backupFormatSchema = z.enum(["plain", "custom"]);

export type BackupFormat = z.infer<typeof backupFormatSchema>;

export const backupSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  directoryPath: z.string().default("./var/backups"),
  retentionDays: z.number().int().positive().max(3650).default(14),
  pgDumpPath: z.string().default("pg_dump"),
  pgRestorePath: z.string().default("pg_restore"),
  format: backupFormatSchema.default("plain"),
  verifyOnCreate: z.boolean().default(true),
});

export type BackupSettings = z.infer<typeof backupSettingsSchema>;

export const cronHandlerSchema = z.enum([
  "backup.run",
  "audit.prune",
  "sessions.pruneExpired",
  "storage.cleanup",
]);

export type CronHandler = z.infer<typeof cronHandlerSchema>;

export const cronConcurrencyPolicySchema = z.enum(["skip", "parallel"]);

export type CronConcurrencyPolicy = z.infer<typeof cronConcurrencyPolicySchema>;

export const cronsSettingsSchema = z.object({
  schedulerEnabled: z.boolean().default(true),
  tickSeconds: z.number().int().positive().max(300).default(30),
  defaultTimeoutSeconds: z.number().int().positive().max(3600).default(120),
  maxConcurrentRuns: z.number().int().positive().max(32).default(4),
});

export type CronsSettings = z.infer<typeof cronsSettingsSchema>;

export const adminAccessSettingsSchema = z.object({
  defaultRole: z.string().default("user"),
  adminRoles: z.array(z.string().min(1)).default(["admin"]),
  allowImpersonatingAdmins: z.boolean().default(false),
  requireBanReason: z.boolean().default(true),
  protectAdminPlugin: z.boolean().default(true),
});

export type AdminAccessSettings = z.infer<typeof adminAccessSettingsSchema>;

export const environmentsSecretsSettingsSchema = z.object({
  additionalRequiredEnvKeys: z.array(z.string().min(1)).default([]),
  sensitivePrefixes: z.array(z.string().min(1)).default(["BETTER_AUTH_", "SMTP_", "DATABASE_", "SUPERADMIN_"]),
  showMissingSecretsOnDashboard: z.boolean().default(true),
});

export type EnvironmentsSecretsSettings = z.infer<typeof environmentsSecretsSettingsSchema>;

export const observabilitySettingsSchema = z.object({
  auditRetentionDays: z.number().int().positive().max(3650).default(90),
  logLevel: z.enum(["info", "warn", "error"]).default("info"),
  healthcheckVerbose: z.boolean().default(true),
  enableRequestLogging: z.boolean().default(true),
  enableMetrics: z.boolean().default(false),
});

export type ObservabilitySettings = z.infer<typeof observabilitySettingsSchema>;

export const dangerZoneSettingsSchema = z.object({
  maintenanceMode: z.boolean().default(false),
  disablePublicSignup: z.boolean().default(false),
  allowDestructiveSchemaChanges: z.boolean().default(false),
  enableDemoReset: z.boolean().default(false),
});

export type DangerZoneSettings = z.infer<typeof dangerZoneSettingsSchema>;

export const settingsSectionSchemas = {
  general: generalSettingsSchema,
  authentication: authenticationSettingsSchema,
  sessionsSecurity: sessionsSecuritySettingsSchema,
  email: emailSettingsSchema,
  domainsOrigins: domainsOriginsSettingsSchema,
  api: apiSettingsSchema,
  storage: storageSettingsSchema,
  backups: backupSettingsSchema,
  crons: cronsSettingsSchema,
  aiAssistant: aiAssistantSettingsSchema,
  adminAccess: adminAccessSettingsSchema,
  environmentsSecrets: environmentsSecretsSettingsSchema,
  observability: observabilitySettingsSchema,
  dangerZone: dangerZoneSettingsSchema,
} as const;

export type SettingsSectionConfigMap = {
  general: GeneralSettings;
  authentication: AuthenticationSettings;
  sessionsSecurity: SessionsSecuritySettings;
  email: EmailSettings;
  domainsOrigins: DomainsOriginsSettings;
  api: ApiSettings;
  storage: StorageSettings;
  backups: BackupSettings;
  crons: CronsSettings;
  aiAssistant: AiAssistantSettings;
  adminAccess: AdminAccessSettings;
  environmentsSecrets: EnvironmentsSecretsSettings;
  observability: ObservabilitySettings;
  dangerZone: DangerZoneSettings;
};

export const settingsSectionStateSchema = z.object({
  section: settingsSectionIdSchema,
  config: pluginConfigSchema.default({}),
  diagnostics: z.record(z.string(), jsonValueSchema).default({}),
  updatedAt: z.string().nullish(),
});

export type SettingsSectionState = z.infer<typeof settingsSectionStateSchema>;

export const backupRunStatusSchema = z.enum(["running", "succeeded", "failed"]);

export type BackupRunStatus = z.infer<typeof backupRunStatusSchema>;

export const backupRunSchema = z.object({
  id: z.string(),
  status: backupRunStatusSchema,
  trigger: z.enum(["manual", "cron"]),
  destination: z.string(),
  filePath: z.string().nullish(),
  sizeBytes: z.number().int().nonnegative().nullish(),
  details: z.record(z.string(), jsonValueSchema).default({}),
  error: z.string().nullish(),
  startedAt: z.string(),
  completedAt: z.string().nullish(),
});

export type BackupRun = z.infer<typeof backupRunSchema>;

export const storageSettingsResponseSchema = z.object({
  section: z.literal("storage"),
  config: storageSettingsSchema,
  diagnostics: z.record(z.string(), jsonValueSchema).default({}),
  updatedAt: z.string().nullish(),
});

export type StorageSettingsResponse = z.infer<typeof storageSettingsResponseSchema>;

export const environmentVariableSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});

export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;

export const environmentEditorStateSchema = z.object({
  filePath: z.string(),
  raw: z.string(),
  variables: z.array(environmentVariableSchema).default([]),
  requiredKeys: z.array(z.string()).default([]),
  missingKeys: z.array(z.string()).default([]),
  restartRequired: z.boolean().default(true),
});

export type EnvironmentEditorState = z.infer<typeof environmentEditorStateSchema>;

export const backupSettingsResponseSchema = z.object({
  section: z.literal("backups"),
  config: backupSettingsSchema,
  diagnostics: z.record(z.string(), jsonValueSchema).default({}),
  updatedAt: z.string().nullish(),
  runs: z.array(backupRunSchema).default([]),
});

export type BackupSettingsResponse = z.infer<typeof backupSettingsResponseSchema>;

export const cronJobSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  handler: cronHandlerSchema,
  schedule: z.string().min(1),
  enabled: z.boolean().default(true),
  timeoutSeconds: z.number().int().positive().max(3600).default(120),
  concurrencyPolicy: cronConcurrencyPolicySchema.default("skip"),
  config: pluginConfigSchema.default({}),
  lastRunAt: z.string().nullish(),
  nextRunAt: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CronJob = z.infer<typeof cronJobSchema>;

export const cronRunSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobName: z.string(),
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  trigger: z.enum(["manual", "scheduled", "startup"]),
  startedAt: z.string(),
  completedAt: z.string().nullish(),
  durationMs: z.number().int().nonnegative().nullish(),
  output: z.record(z.string(), jsonValueSchema).default({}),
  error: z.string().nullish(),
});

export type CronRun = z.infer<typeof cronRunSchema>;

export const cronJobInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  handler: cronHandlerSchema,
  schedule: z.string().min(1),
  enabled: z.boolean().default(true),
  timeoutSeconds: z.number().int().positive().max(3600).default(120),
  concurrencyPolicy: cronConcurrencyPolicySchema.default("skip"),
  config: pluginConfigSchema.default({}),
});

export type CronJobInput = z.infer<typeof cronJobInputSchema>;

export const cronSettingsResponseSchema = z.object({
  section: z.literal("crons"),
  config: cronsSettingsSchema,
  diagnostics: z.record(z.string(), jsonValueSchema).default({}),
  updatedAt: z.string().nullish(),
  jobs: z.array(cronJobSchema).default([]),
  runs: z.array(cronRunSchema).default([]),
});

export type CronSettingsResponse = z.infer<typeof cronSettingsResponseSchema>;
