import { pluginConfigUpdateSchema, relationBlueprintSchema, schemaDraftSchema, tableApiConfigSchema, tableBlueprintSchema } from "@authend/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthendMcpContext } from "./service-context";
import {
  createRelationDraft,
  createTableDraft,
  deleteRelationDraft,
  deleteTableDraft,
  setTableApiConfigDraft,
  updateRelationDraft,
  updateTableDraft,
} from "./schema-mutations";
import { errorResult, okResult } from "./result";
import {
  applySchemaInputSchema,
  createRelationInputSchema,
  createTableInputSchema,
  deleteRelationInputSchema,
  deleteStorageObjectInputSchema,
  deleteTableInputSchema,
  getSchemaDraftInputSchema,
  getStorageObjectInputSchema,
  listRecordsInputSchema,
  listStorageObjectsInputSchema,
  pluginIdInputSchema,
  previewSchemaInputSchema,
  putStorageObjectInputSchema,
  recordIdInputSchema,
  recordInputSchema,
  resourceNameInputSchema,
  setTableApiConfigInputSchema,
  updatePluginConfigInputSchema,
  updateRecordInputSchema,
  updateRelationInputSchema,
  updateTableInputSchema,
} from "./tool-schemas";

function buildQuery(input: z.infer<z.ZodObject<typeof listRecordsInputSchema>>) {
  const query = new URLSearchParams();
  if (input.page) query.set("page", String(input.page));
  if (input.pageSize) query.set("pageSize", String(input.pageSize));
  if (input.sort) query.set("sort", input.sort);
  if (input.order) query.set("order", input.order);
  if (input.filterField) query.set("filterField", input.filterField);
  if (input.filterValue) query.set("filterValue", input.filterValue);
  if (input.include && input.include.length > 0) query.set("include", input.include.join(","));
  return query;
}

async function buildSchemaMutationResult(
  context: AuthendMcpContext,
  nextDraft: Awaited<ReturnType<AuthendMcpContext["getSchemaDraft"]>>,
  summary: string,
  apply = false,
) {
  const preview = await context.previewSchema(nextDraft);
  const payload: Record<string, unknown> = {
    draft: nextDraft,
    preview,
    applied: false,
  };

  if (apply) {
    payload.applyResult = await context.applySchema(nextDraft);
    payload.applied = true;
  }

  return okResult(summary, payload);
}

export function registerAuthendTools(server: McpServer, context: AuthendMcpContext) {
  server.registerTool(
    "authend_get_schema_draft",
    {
      title: "Get Schema Draft",
      description: "Read the current AuthEnd schema draft used for app scaffolding.",
      inputSchema: getSchemaDraftInputSchema,
    },
    async () => {
      try {
        const draft = await context.getSchemaDraft();
        return okResult("Fetched current schema draft.", { draft });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_preview_schema",
    {
      title: "Preview Schema",
      description: "Preview what AuthEnd would generate or migrate for a full schema draft without applying it.",
      inputSchema: previewSchemaInputSchema,
    },
    async ({ draft }) => {
      try {
        const preview = await context.previewSchema(schemaDraftSchema.parse(draft));
        return okResult("Previewed schema draft.", { draft, preview, applied: false });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_apply_schema",
    {
      title: "Apply Schema",
      description: "Apply a full AuthEnd schema draft. This is the explicit commit point for schema changes.",
      inputSchema: applySchemaInputSchema,
    },
    async ({ draft }) => {
      try {
        const parsedDraft = schemaDraftSchema.parse(draft);
        const applyResult = await context.applySchema(parsedDraft);
        return okResult("Applied schema draft.", { draft: parsedDraft, applyResult, applied: true });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_create_table",
    {
      title: "Create Table",
      description: "Append a new table to the current AuthEnd schema draft and return a preview.",
      inputSchema: createTableInputSchema,
    },
    async ({ table }) => {
      try {
        const currentDraft = await context.getSchemaDraft();
        const nextDraft = createTableDraft(currentDraft, tableBlueprintSchema.parse(table));
        return buildSchemaMutationResult(context, nextDraft, `Prepared schema draft with new table ${table.name}.`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_update_table",
    {
      title: "Update Table",
      description: "Replace an existing table definition in the AuthEnd schema draft and return a preview.",
      inputSchema: updateTableInputSchema,
    },
    async ({ tableName, table }) => {
      try {
        const currentDraft = await context.getSchemaDraft();
        const nextDraft = updateTableDraft(currentDraft, tableName, tableBlueprintSchema.parse(table));
        return buildSchemaMutationResult(context, nextDraft, `Prepared schema draft with updated table ${tableName}.`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_delete_table",
    {
      title: "Delete Table",
      description: "Delete a table from the AuthEnd schema draft. This is destructive and removes related draft relations.",
      inputSchema: deleteTableInputSchema,
    },
    async ({ tableName }) => {
      try {
        const currentDraft = await context.getSchemaDraft();
        const nextDraft = deleteTableDraft(currentDraft, tableName);
        return buildSchemaMutationResult(context, nextDraft, `Prepared schema draft without table ${tableName}.`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_create_relation",
    {
      title: "Create Relation",
      description: "Append a relation to the current AuthEnd schema draft and return a preview.",
      inputSchema: createRelationInputSchema,
    },
    async ({ relation }) => {
      try {
        const currentDraft = await context.getSchemaDraft();
        const nextDraft = createRelationDraft(currentDraft, relationBlueprintSchema.parse(relation));
        return buildSchemaMutationResult(context, nextDraft, "Prepared schema draft with a new relation.");
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_update_relation",
    {
      title: "Update Relation",
      description: "Replace an existing relation in the AuthEnd schema draft and return a preview.",
      inputSchema: updateRelationInputSchema,
    },
    async ({ current, relation }) => {
      try {
        const currentDraft = await context.getSchemaDraft();
        const nextDraft = updateRelationDraft(
          currentDraft,
          relationBlueprintSchema.parse(current),
          relationBlueprintSchema.parse(relation),
        );
        return buildSchemaMutationResult(context, nextDraft, "Prepared schema draft with an updated relation.");
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_delete_relation",
    {
      title: "Delete Relation",
      description: "Delete a relation from the AuthEnd schema draft. This is destructive.",
      inputSchema: deleteRelationInputSchema,
    },
    async ({ relation }) => {
      try {
        const currentDraft = await context.getSchemaDraft();
        const nextDraft = deleteRelationDraft(currentDraft, relationBlueprintSchema.parse(relation));
        return buildSchemaMutationResult(context, nextDraft, "Prepared schema draft without the selected relation.");
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_set_table_api_config",
    {
      title: "Set Table API Config",
      description: "Update API exposure, auth, operations, and query config for a table in the AuthEnd schema draft.",
      inputSchema: setTableApiConfigInputSchema,
    },
    async ({ tableName, config }) => {
      try {
        const currentDraft = await context.getSchemaDraft();
        const nextDraft = setTableApiConfigDraft(currentDraft, tableName, tableApiConfigSchema.parse(config));
        return buildSchemaMutationResult(context, nextDraft, `Prepared schema draft with API config for ${tableName}.`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_get_schema_drift",
    {
      title: "Get Schema Drift",
      description: "Inspect current database drift against the AuthEnd schema model.",
      inputSchema: {},
    },
    async () => {
      try {
        const drift = await context.getSchemaDrift();
        return okResult("Fetched schema drift report.", { drift });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_list_resources",
    {
      title: "List Resources",
      description: "List AuthEnd API resources available after schema creation.",
      inputSchema: {},
    },
    async () => {
      try {
        const resources = await context.listResources();
        return okResult("Listed AuthEnd resources.", { resources });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_get_resource_meta",
    {
      title: "Get Resource Metadata",
      description: "Read the descriptor and preview information for a specific AuthEnd resource.",
      inputSchema: resourceNameInputSchema,
    },
    async ({ table }) => {
      try {
        const [descriptor, preview, resource] = await Promise.all([
          context.getResourceMeta(table),
          context.getResourcePreview(table),
          context.buildApiResource(table),
        ]);
        return okResult(`Fetched resource metadata for ${table}.`, { resource, descriptor, preview });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_list_records",
    {
      title: "List Records",
      description: "List records from an AuthEnd resource with pagination, filtering, sorting, and includes.",
      inputSchema: listRecordsInputSchema,
    },
    async (input) => {
      try {
        const query = buildQuery(z.object(listRecordsInputSchema).parse(input));
        const records = await context.listRecords(input.table, query);
        return okResult(`Listed records from ${input.table}.`, { table: input.table, records });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_get_record",
    {
      title: "Get Record",
      description: "Read one record from an AuthEnd resource by exact identifier.",
      inputSchema: recordIdInputSchema,
    },
    async ({ table, id }) => {
      try {
        const record = await context.getRecord(table, id);
        return okResult(`Fetched record ${id} from ${table}.`, { table, id, record });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_create_record",
    {
      title: "Create Record",
      description: "Create one record in an AuthEnd resource after the schema exists.",
      inputSchema: recordInputSchema,
    },
    async ({ table, payload }) => {
      try {
        const record = await context.createRecord(table, payload);
        return okResult(`Created record in ${table}.`, { table, record });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_update_record",
    {
      title: "Update Record",
      description: "Update one record in an AuthEnd resource by exact identifier.",
      inputSchema: updateRecordInputSchema,
    },
    async ({ table, id, payload }) => {
      try {
        const record = await context.updateRecord(table, id, payload);
        return okResult(`Updated record ${id} in ${table}.`, { table, id, record });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_delete_record",
    {
      title: "Delete Record",
      description: "Delete one record in an AuthEnd resource by exact identifier. This is destructive.",
      inputSchema: recordIdInputSchema,
    },
    async ({ table, id }) => {
      try {
        await context.deleteRecord(table, id);
        return okResult(`Deleted record ${id} from ${table}.`, { table, id, deleted: true });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_list_plugins",
    {
      title: "List Plugins",
      description: "List AuthEnd plugin manifests and install state.",
      inputSchema: {},
    },
    async () => {
      try {
        const plugins = await context.listPlugins();
        return okResult("Listed AuthEnd plugins.", { plugins });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_get_plugin_manifest",
    {
      title: "Get Plugin Manifest",
      description: "Read one AuthEnd plugin manifest and install state by exact plugin id.",
      inputSchema: pluginIdInputSchema,
    },
    async ({ pluginId }) => {
      try {
        const plugin = await context.getPlugin(pluginId);
        return okResult(`Fetched plugin manifest for ${pluginId}.`, { plugin });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_enable_plugin",
    {
      title: "Enable Plugin",
      description: "Enable an AuthEnd plugin. This may provision schema or runtime capabilities.",
      inputSchema: pluginIdInputSchema,
    },
    async ({ pluginId }) => {
      try {
        const plugin = await context.enablePlugin(pluginId);
        return okResult(`Enabled plugin ${pluginId}.`, { plugin });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_disable_plugin",
    {
      title: "Disable Plugin",
      description: "Disable an AuthEnd plugin. This is destructive if the plugin provisions resources.",
      inputSchema: pluginIdInputSchema,
    },
    async ({ pluginId }) => {
      try {
        const plugin = await context.disablePlugin(pluginId);
        return okResult(`Disabled plugin ${pluginId}.`, { plugin });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_update_plugin_config",
    {
      title: "Update Plugin Config",
      description: "Update AuthEnd plugin config, capability state, and extension bindings.",
      inputSchema: updatePluginConfigInputSchema,
    },
    async ({ pluginId, update }) => {
      try {
        const plugin = await context.updatePluginConfig(pluginId, pluginConfigUpdateSchema.parse(update));
        return okResult(`Updated plugin config for ${pluginId}.`, { plugin });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_list_storage_objects",
    {
      title: "List Storage Objects",
      description: "List managed AuthEnd storage file records by prefix, attachment, or search filters.",
      inputSchema: listStorageObjectsInputSchema,
    },
    async (input) => {
      try {
        const files = await context.listStorageObjects(z.object(listStorageObjectsInputSchema).parse(input));
        return okResult("Listed storage objects.", { files });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_get_storage_object",
    {
      title: "Get Storage Object",
      description: "Read AuthEnd storage metadata by file record id or object key. Key reads include object contents.",
      inputSchema: getStorageObjectInputSchema,
    },
    async ({ id, key }) => {
      try {
        if (id) {
          const file = await context.getStorageObjectById(id);
          return okResult(`Fetched storage file record ${id}.`, { file });
        }
        if (key) {
          const file = await context.getStorageObjectByKey(key);
          return okResult(`Fetched storage object ${key}.`, { file });
        }
        throw new Error("Provide either id or key");
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_put_storage_object",
    {
      title: "Put Storage Object",
      description: "Create or overwrite one managed AuthEnd storage object by exact key.",
      inputSchema: putStorageObjectInputSchema,
    },
    async ({ key, body, mimeType, visibility }) => {
      try {
        const file = await context.putStorageObject({
          key,
          body: Buffer.from(body, "utf8"),
          mimeType,
          visibility,
        });
        return okResult(`Stored object ${key}.`, { file });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_delete_storage_object",
    {
      title: "Delete Storage Object",
      description: "Delete one managed AuthEnd storage object by exact key. This is destructive.",
      inputSchema: deleteStorageObjectInputSchema,
    },
    async ({ key }) => {
      try {
        const result = await context.deleteStorageObject(key);
        return okResult(`Deleted storage object ${key}.`, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "authend_get_sdk_schema",
    {
      title: "Get SDK Schema",
      description: "Read the AuthEnd SDK schema manifest that clients use for typed generation.",
      inputSchema: {},
    },
    async () => {
      try {
        const schema = await context.getSdkSchema();
        return okResult("Fetched SDK schema manifest.", { schema });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
