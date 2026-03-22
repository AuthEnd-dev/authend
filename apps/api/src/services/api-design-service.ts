import type {
  ApiPreview,
  ApiPreviewOperation,
  ApiResource,
  DataRecord,
  FieldBlueprint,
  SchemaDraft,
  TableApiConfig,
  TableBlueprint,
} from "@authend/shared";
import { apiPreviewSchema, apiResourceSchema, tableApiConfigSchema } from "@authend/shared";
import { applyDraft, getSchemaDraft } from "./schema-service";
import { HttpError } from "../lib/http";
import { getTableDescriptor, listBrowsableTables } from "./crud-service";

const builtinOperations = {
  list: true,
  get: true,
  create: false,
  update: false,
  delete: false,
} as const;

const generatedOperations = {
  list: true,
  get: true,
  create: true,
  update: true,
  delete: true,
} as const;

function startCase(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function authDescription(authMode: TableApiConfig["authMode"]) {
  switch (authMode) {
    case "public":
      return "No authenticated session is required.";
    case "session":
      return "A signed-in Better Auth session is required.";
    default:
      return "A superadmin Better Auth session is required.";
  }
}

function fieldNames(table: TableBlueprint) {
  return table.fields.map((field) => field.name);
}

function relationFieldNames(table: TableBlueprint) {
  return table.fields.filter((field) => field.references).map((field) => field.name);
}

function relationIncludeNames(table: TableBlueprint, draft: SchemaDraft | null | undefined) {
  const explicit = (draft?.relations ?? [])
    .filter((relation) => relation.sourceTable === table.name)
    .map((relation) => relation.alias ?? relation.sourceField);
  return [...relationFieldNames(table), ...explicit].filter((value, index, collection) => collection.indexOf(value) === index);
}

function allowedFields(selected: string[], available: string[]) {
  const valid = selected.filter((field) => available.includes(field));
  return valid.length > 0 ? valid : available;
}

export function normaliseTableApiConfig(
  rawConfig: TableApiConfig | null | undefined,
  table: TableBlueprint,
  draft?: SchemaDraft | null,
  editable = true,
): TableApiConfig {
  const parsed = tableApiConfigSchema.parse(rawConfig ?? {});
  const allFields = fieldNames(table);
  const relationFields = relationIncludeNames(table, draft);
  const operations = editable
    ? { ...generatedOperations, ...parsed.operations }
    : {
        ...builtinOperations,
        list: parsed.operations.list,
        get: parsed.operations.get,
        create: false,
        update: false,
        delete: false,
      };

  const sortingFields = parsed.sorting.enabled ? allowedFields(parsed.sorting.fields, allFields) : [];
  const filteringFields = parsed.filtering.enabled ? allowedFields(parsed.filtering.fields, allFields) : [];
  const includeFields = parsed.includes.enabled ? allowedFields(parsed.includes.fields, relationFields) : [];
  const defaultSortField =
    parsed.sorting.defaultField && sortingFields.includes(parsed.sorting.defaultField)
      ? parsed.sorting.defaultField
      : table.primaryKey;

  return {
    ...parsed,
    routeSegment: parsed.routeSegment ?? table.name,
    tag: parsed.tag ?? startCase(table.name),
    sdkName: parsed.sdkName ?? table.name,
    description: parsed.description ?? `${startCase(table.name)} API`,
    authMode: parsed.authMode ?? "superadmin",
    operations,
    pagination: {
      enabled: parsed.pagination.enabled,
      defaultPageSize: Math.min(parsed.pagination.defaultPageSize, parsed.pagination.maxPageSize),
      maxPageSize: parsed.pagination.maxPageSize,
    },
    filtering: {
      enabled: parsed.filtering.enabled,
      fields: filteringFields,
    },
    sorting: {
      enabled: parsed.sorting.enabled,
      fields: sortingFields,
      defaultField: defaultSortField,
      defaultOrder: parsed.sorting.defaultOrder,
    },
    includes: {
      enabled: parsed.includes.enabled,
      fields: includeFields,
    },
  };
}

function exampleValueForField(field: FieldBlueprint) {
  switch (field.type) {
    case "boolean":
      return true;
    case "integer":
    case "bigint":
      return 1;
    case "numeric":
      return "12.50";
    case "jsonb":
      return { sample: true };
    case "uuid":
      return "550e8400-e29b-41d4-a716-446655440000";
    case "date":
      return "2026-03-22";
    case "timestamp":
      return "2026-03-22T10:30:00.000Z";
    case "enum":
      return field.enumValues?.[0] ?? "value";
    default:
      return `${field.name}_value`;
  }
}

function exampleRecord(table: TableBlueprint): DataRecord {
  return Object.fromEntries(table.fields.map((field) => [field.name, exampleValueForField(field)]));
}

function requestExample(table: TableBlueprint) {
  return Object.fromEntries(
    table.fields
      .filter((field) => field.name !== table.primaryKey)
      .map((field) => [field.name, exampleValueForField(field)]),
  );
}

function operationId(sdkName: string, key: ApiPreviewOperation["key"]) {
  return `${sdkName}_${key}`;
}

function buildOperations(table: TableBlueprint, config: TableApiConfig): ApiPreviewOperation[] {
  const routeBase = `/api/data/${config.routeSegment}`;
  const recordExample = exampleRecord(table);
  const createExample = requestExample(table);
  const primaryKeyExample = String(recordExample[table.primaryKey] ?? "record_id");
  const listQueryParams: ApiPreviewOperation["queryParams"] = [];

  if (config.pagination.enabled) {
    listQueryParams.push(
      { name: "page", required: false, description: "Page number" },
      {
        name: "pageSize",
        required: false,
        description: `Records per page. Default ${config.pagination.defaultPageSize}, max ${config.pagination.maxPageSize}.`,
      },
    );
  }

  if (config.sorting.enabled) {
    listQueryParams.push(
      {
        name: "sort",
        required: false,
        description: `Field to sort by. Allowed: ${config.sorting.fields.join(", ")}`,
      },
      {
        name: "order",
        required: false,
        description: `Sort order. Default ${config.sorting.defaultOrder}.`,
      },
    );
  }

  if (config.filtering.enabled) {
    listQueryParams.push(
      {
        name: "filterField",
        required: false,
        description: `Field used for text filtering. Allowed: ${config.filtering.fields.join(", ")}`,
      },
      { name: "filterValue", required: false, description: "Filter text" },
    );
  }

  if (config.includes.enabled && config.includes.fields.length > 0) {
    listQueryParams.push({
      name: "include",
      required: false,
      description: `Comma-separated relation fields to include. Allowed: ${config.includes.fields.join(", ")}`,
    });
  }

  return [
    {
      key: "list",
      method: "GET",
      path: routeBase,
      summary: `List ${table.displayName}`,
      enabled: config.operations.list,
      operationId: operationId(config.sdkName ?? table.name, "list"),
      queryParams: listQueryParams,
      responseExample: {
        items: [recordExample],
        total: 1,
        page: 1,
        pageSize: config.pagination.defaultPageSize,
      },
    },
    {
      key: "get",
      method: "GET",
      path: `${routeBase}/{id}`,
      summary: `Get ${table.displayName} by ${table.primaryKey}`,
      enabled: config.operations.get,
      operationId: operationId(config.sdkName ?? table.name, "get"),
      queryParams: [],
      responseExample: recordExample,
    },
    {
      key: "create",
      method: "POST",
      path: routeBase,
      summary: `Create ${table.displayName}`,
      enabled: config.operations.create,
      operationId: operationId(config.sdkName ?? table.name, "create"),
      queryParams: [],
      requestExample: createExample,
      responseExample: recordExample,
    },
    {
      key: "update",
      method: "PATCH",
      path: `${routeBase}/{id}`,
      summary: `Update ${table.displayName}`,
      enabled: config.operations.update,
      operationId: operationId(config.sdkName ?? table.name, "update"),
      queryParams: [],
      requestExample: createExample,
      responseExample: recordExample,
    },
    {
      key: "delete",
      method: "DELETE",
      path: `${routeBase}/{id}`,
      summary: `Delete ${table.displayName}`,
      enabled: config.operations.delete,
      operationId: operationId(config.sdkName ?? table.name, "delete"),
      queryParams: [],
      responseExample: { success: true, id: primaryKeyExample },
    },
  ];
}

function buildSdkSnippet(table: TableBlueprint, config: TableApiConfig) {
  const routeSegment = config.routeSegment ?? table.name;
  const requestBody = JSON.stringify(requestExample(table), null, 2);
  return `import { createAuthendClient } from "@authend/sdk";

const client = createAuthendClient({ baseURL: "http://localhost:7002" });
const ${config.sdkName} = client.data.resource("${routeSegment}");

const records = await ${config.sdkName}.list({
  page: 1,
  pageSize: ${config.pagination.defaultPageSize},
});
const record = await ${config.sdkName}.get("record_id");
await ${config.sdkName}.create(${requestBody});
await ${config.sdkName}.update("record_id", ${requestBody});
await ${config.sdkName}.remove("record_id");`;
}

function buildFetchSnippet(table: TableBlueprint, config: TableApiConfig) {
  const routeSegment = config.routeSegment ?? table.name;
  const requestBody = JSON.stringify(requestExample(table), null, 2);
  return `const baseURL = "http://localhost:7002";

const listResponse = await fetch(
  \`${"${baseURL}"}/api/data/${routeSegment}?page=1&pageSize=${config.pagination.defaultPageSize}\`,
  {
    credentials: "include",
  },
);

const createResponse = await fetch(\`${"${baseURL}"}/api/data/${routeSegment}\`, {
  method: "POST",
  credentials: "include",
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify(${requestBody}),
});`;
}

async function tableFromDescriptor(input: string): Promise<{ table: TableBlueprint; editable: boolean; draft?: SchemaDraft | null }> {
  const descriptor = await getTableDescriptor(input);
  const editable = descriptor.source === "generated" && descriptor.mutableSchema;

  if (editable) {
    const draft = await getSchemaDraft();
    const generatedTable = draft.tables.find(
      (table) => table.name === descriptor.table || (table.api?.routeSegment ?? table.name) === input,
    );

    if (!generatedTable) {
      throw new HttpError(404, `Unknown generated table ${input}`);
    }

    return {
      table: generatedTable,
      editable: true,
      draft,
    };
  }

  return {
    table: {
      name: descriptor.table,
      displayName: startCase(descriptor.table),
      primaryKey: descriptor.primaryKey,
      fields: descriptor.fields,
      indexes: [],
      api: {
        authMode: "superadmin",
        operations: builtinOperations,
        pagination: {
          enabled: true,
          defaultPageSize: 20,
          maxPageSize: 100,
        },
        filtering: {
          enabled: true,
          fields: [],
        },
        sorting: {
          enabled: true,
          fields: [],
          defaultOrder: "desc",
        },
        includes: {
          enabled: true,
          fields: [],
        },
      },
    },
    editable: false,
    draft: null,
  };
}

export async function resolvePreviewTable(input: string) {
  return tableFromDescriptor(input);
}

function buildResource(resolved: { table: TableBlueprint; editable: boolean; draft?: SchemaDraft | null }): ApiResource {
  const config = normaliseTableApiConfig(resolved.table.api, resolved.table, resolved.draft, resolved.editable);
  return apiResourceSchema.parse({
    table: resolved.table.name,
    displayName: resolved.table.displayName,
    primaryKey: resolved.table.primaryKey,
    routeSegment: config.routeSegment ?? resolved.table.name,
    routeBase: `/api/data/${config.routeSegment ?? resolved.table.name}`,
    config,
    editable: resolved.editable,
    fields: resolved.table.fields,
    security: {
      authMode: config.authMode,
      description: authDescription(config.authMode),
    },
    query: {
      pagination: config.pagination,
      filtering: config.filtering,
      sorting: config.sorting,
      includes: config.includes,
    },
    operations: buildOperations(resolved.table, config),
  });
}

export async function buildApiResource(tableInput: string): Promise<ApiResource> {
  return buildResource(await resolvePreviewTable(tableInput));
}

export async function listApiResources() {
  const tables = await listBrowsableTables();
  const resources = await Promise.all(tables.map((table) => buildApiResource(table)));
  return resources.sort((left, right) => left.routeSegment.localeCompare(right.routeSegment));
}

export async function buildApiPreview(tableInput: string): Promise<ApiPreview> {
  const resource = await buildApiResource(tableInput);
  return apiPreviewSchema.parse({
    resource,
    snippets: {
      sdk: buildSdkSnippet(
        {
          name: resource.table,
          displayName: resource.displayName,
          primaryKey: resource.primaryKey,
          fields: resource.fields,
          indexes: [],
          api: resource.config,
        },
        resource.config,
      ),
      fetch: buildFetchSnippet(
        {
          name: resource.table,
          displayName: resource.displayName,
          primaryKey: resource.primaryKey,
          fields: resource.fields,
          indexes: [],
          api: resource.config,
        },
        resource.config,
      ),
    },
  });
}

export async function saveTableApiConfig(tableName: string, config: TableApiConfig, actorUserId?: string | null) {
  const draft = await getSchemaDraft();
  const tableIndex = draft.tables.findIndex((table) => table.name === tableName);
  if (tableIndex === -1) {
    throw new HttpError(404, `Unknown generated table ${tableName}`);
  }

  const nextDraft: SchemaDraft = {
    ...draft,
    tables: draft.tables.map((table, index) =>
      index === tableIndex
        ? {
            ...table,
            api: normaliseTableApiConfig(config, table, draft, true),
          }
        : table,
    ),
  };

  await applyDraft(nextDraft, actorUserId ?? null);
  return buildApiPreview(tableName);
}
