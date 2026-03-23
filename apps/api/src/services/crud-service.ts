import type { ApiFieldAccess, ApiPaginationConfig, ApiSortingConfig, FieldBlueprint, TableApiConfig, TableDescriptor } from "@authend/shared";
import { getSchemaDraft } from "./schema-service";
import { HttpError } from "../lib/http";
import { sql } from "../db/client";
import { listPluginCapabilityManifests } from "./plugin-service";

const builtinTables: Record<string, TableDescriptor> = {
  user: {
    table: "user",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: true },
      { name: "name", type: "text", nullable: false, unique: false, indexed: false },
      { name: "email", type: "text", nullable: false, unique: true, indexed: true },
      { name: "username", type: "text", nullable: true, unique: true, indexed: true },
      { name: "email_verified", type: "boolean", nullable: false, unique: false, indexed: false },
      { name: "role", type: "text", nullable: false, unique: false, indexed: false },
      { name: "banned", type: "boolean", nullable: false, unique: false, indexed: false },
      { name: "two_factor_enabled", type: "boolean", nullable: false, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "updated_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  session: {
    table: "session",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: true },
      { name: "user_id", type: "text", nullable: false, unique: false, indexed: true },
      { name: "expires_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "ip_address", type: "text", nullable: true, unique: false, indexed: false },
      { name: "user_agent", type: "text", nullable: true, unique: false, indexed: false },
      { name: "active_organization_id", type: "text", nullable: true, unique: false, indexed: false },
      { name: "active_team_id", type: "text", nullable: true, unique: false, indexed: false },
      { name: "impersonated_by", type: "text", nullable: true, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "updated_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  account: {
    table: "account",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: true },
      { name: "user_id", type: "text", nullable: false, unique: false, indexed: true },
      { name: "account_id", type: "text", nullable: false, unique: false, indexed: false },
      { name: "provider_id", type: "text", nullable: false, unique: false, indexed: false },
      { name: "access_token_expires_at", type: "timestamp", nullable: true, unique: false, indexed: false },
      { name: "refresh_token_expires_at", type: "timestamp", nullable: true, unique: false, indexed: false },
      { name: "scope", type: "text", nullable: true, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "updated_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  verification: {
    table: "verification",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: true },
      { name: "identifier", type: "text", nullable: false, unique: false, indexed: true },
      { name: "expires_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "updated_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  plugin_configs: {
    table: "plugin_configs",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: false },
      { name: "plugin_id", type: "text", nullable: false, unique: true, indexed: true },
      { name: "enabled", type: "boolean", nullable: false, unique: false, indexed: false },
      { name: "version", type: "text", nullable: false, unique: false, indexed: false },
      { name: "config", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "capability_state", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "dependency_state", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "health", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "provisioning_state", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "extension_bindings", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "updated_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  migration_runs: {
    table: "migration_runs",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: false },
      { name: "migration_key", type: "text", nullable: false, unique: true, indexed: true },
      { name: "title", type: "text", nullable: false, unique: false, indexed: false },
      { name: "status", type: "text", nullable: false, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "applied_at", type: "timestamp", nullable: true, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  audit_logs: {
    table: "audit_logs",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: false },
      { name: "action", type: "text", nullable: false, unique: false, indexed: false },
      { name: "actor_user_id", type: "text", nullable: true, unique: false, indexed: false },
      { name: "target", type: "text", nullable: false, unique: false, indexed: false },
      { name: "payload", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  system_settings: {
    table: "system_settings",
    primaryKey: "key",
    fields: [
      { name: "key", type: "text", nullable: false, unique: true, indexed: true },
      { name: "value", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "updated_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  backup_runs: {
    table: "backup_runs",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: false },
      { name: "status", type: "text", nullable: false, unique: false, indexed: false },
      { name: "trigger", type: "text", nullable: false, unique: false, indexed: false },
      { name: "destination", type: "text", nullable: false, unique: false, indexed: false },
      { name: "file_path", type: "text", nullable: true, unique: false, indexed: false },
      { name: "size_bytes", type: "text", nullable: true, unique: false, indexed: false },
      { name: "details", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "error", type: "text", nullable: true, unique: false, indexed: false },
      { name: "started_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "completed_at", type: "timestamp", nullable: true, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  cron_jobs: {
    table: "cron_jobs",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: false },
      { name: "name", type: "text", nullable: false, unique: true, indexed: true },
      { name: "description", type: "text", nullable: true, unique: false, indexed: false },
      { name: "handler", type: "text", nullable: false, unique: false, indexed: false },
      { name: "schedule", type: "text", nullable: false, unique: false, indexed: false },
      { name: "enabled", type: "boolean", nullable: false, unique: false, indexed: false },
      { name: "timeout_seconds", type: "text", nullable: false, unique: false, indexed: false },
      { name: "concurrency_policy", type: "text", nullable: false, unique: false, indexed: false },
      { name: "config", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "last_run_at", type: "timestamp", nullable: true, unique: false, indexed: false },
      { name: "next_run_at", type: "timestamp", nullable: true, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "updated_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  cron_runs: {
    table: "cron_runs",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: false },
      { name: "job_id", type: "text", nullable: false, unique: false, indexed: true },
      { name: "status", type: "text", nullable: false, unique: false, indexed: false },
      { name: "trigger", type: "text", nullable: false, unique: false, indexed: false },
      { name: "output", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "error", type: "text", nullable: true, unique: false, indexed: false },
      { name: "started_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "completed_at", type: "timestamp", nullable: true, unique: false, indexed: false },
      { name: "duration_ms", type: "text", nullable: true, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  ai_threads: {
    table: "ai_threads",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: false },
      { name: "title", type: "text", nullable: false, unique: false, indexed: false },
      { name: "actor_user_id", type: "text", nullable: false, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "updated_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  ai_messages: {
    table: "ai_messages",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: false },
      { name: "thread_id", type: "text", nullable: false, unique: false, indexed: true },
      { name: "role", type: "text", nullable: false, unique: false, indexed: false },
      { name: "content", type: "text", nullable: false, unique: false, indexed: false },
      { name: "context", type: "jsonb", nullable: true, unique: false, indexed: false },
      { name: "run_id", type: "text", nullable: true, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
  ai_runs: {
    table: "ai_runs",
    primaryKey: "id",
    fields: [
      { name: "id", type: "text", nullable: false, unique: true, indexed: false },
      { name: "thread_id", type: "text", nullable: false, unique: false, indexed: true },
      { name: "user_message_id", type: "text", nullable: false, unique: false, indexed: false },
      { name: "assistant_message_id", type: "text", nullable: true, unique: false, indexed: false },
      { name: "status", type: "text", nullable: false, unique: false, indexed: false },
      { name: "summary", type: "text", nullable: false, unique: false, indexed: false },
      { name: "rationale", type: "text", nullable: false, unique: false, indexed: false },
      { name: "action_batch", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "previews", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "results", type: "jsonb", nullable: false, unique: false, indexed: false },
      { name: "error", type: "text", nullable: true, unique: false, indexed: false },
      { name: "actor_user_id", type: "text", nullable: true, unique: false, indexed: false },
      { name: "approved_by_user_id", type: "text", nullable: true, unique: false, indexed: false },
      { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      { name: "approved_at", type: "timestamp", nullable: true, unique: false, indexed: false },
      { name: "completed_at", type: "timestamp", nullable: true, unique: false, indexed: false },
    ],
    source: "builtin",
    mutableSchema: false,
    ownerPluginId: null,
  },
};

function selectColumnsSql(descriptor: TableDescriptor) {
  return descriptor.fields.map((field) => quoteIdentifier(field.name)).join(", ");
}

function readableFields(descriptor: TableDescriptor, config?: TableApiConfig | null) {
  const hiddenFields = new Set(config?.hiddenFields ?? []);
  return descriptor.fields.filter((field) => !hiddenFields.has(field.name));
}

function assertWritableDescriptor(descriptor: TableDescriptor) {
  if (descriptor.source !== "generated") {
    throw new HttpError(403, `Table ${descriptor.table} is read-only`);
  }
}

async function listExistingDatabaseTables() {
  const rows = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = current_schema()
      and table_type = 'BASE TABLE'
  `;

  return new Set(rows.map((row) => row.table_name));
}

async function resolveTableResource(tableInput: string) {
  if (builtinTables[tableInput]) {
    const existingTables = await listExistingDatabaseTables();
    if (!existingTables.has(builtinTables[tableInput].table)) {
      throw new HttpError(404, `Unknown table ${tableInput}`);
    }

    return {
      descriptor: builtinTables[tableInput],
      config: null,
    };
  }

  const pluginManifests = await listPluginCapabilityManifests();
  const pluginModel = pluginManifests
    .filter((manifest) => manifest.installState.enabled)
    .flatMap((manifest) => manifest.models.map((model) => ({ manifest, model })))
    .find(({ model }) => model.provisioned && (model.tableName === tableInput || model.key === tableInput));

  if (pluginModel) {
    if (pluginModel.model.fields.length === 0) {
      throw new HttpError(404, `Unknown table ${tableInput}`);
    }

    return {
      descriptor: {
        table: pluginModel.model.tableName,
        primaryKey: pluginModel.model.primaryKey,
        fields: pluginModel.model.fields,
        source: "plugin" as const,
        mutableSchema: false,
        ownerPluginId: pluginModel.manifest.id,
      },
      config: null,
    };
  }

  const draft = await getSchemaDraft();
  const current = draft.tables.find(
    (entry) => entry.name === tableInput || (entry.api?.routeSegment ?? entry.name) === tableInput,
  );
  if (!current) {
    throw new HttpError(404, `Unknown table ${tableInput}`);
  }

  return {
    descriptor: {
      table: current.name,
      primaryKey: current.primaryKey,
      fields: current.fields,
      source: "generated" as const,
      mutableSchema: true,
      ownerPluginId: null,
    },
    config: current.api ?? null,
  };
}

function quoteIdentifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new HttpError(400, `Unsafe identifier ${value}`);
  }
  return `"${value}"`;
}

function quoteQualifiedIdentifier(table: string, column: string) {
  return `${quoteIdentifier(table)}.${quoteIdentifier(column)}`;
}

export async function getTableDescriptor(table: string): Promise<TableDescriptor> {
  const resource = await resolveTableResource(table);
  return resource.descriptor;
}

export async function getClientTableDescriptor(table: string): Promise<TableDescriptor> {
  const resource = await resolveTableResource(table);
  return {
    ...resource.descriptor,
    fields: readableFields(resource.descriptor, resource.config),
  };
}

function unsafeParams(values: readonly unknown[]) {
  return values as never[];
}

async function hiddenFieldsForTable(table: string) {
  const draft = await getSchemaDraft();
  const current = draft.tables.find((entry) => entry.name === table || (entry.api?.routeSegment ?? entry.name) === table);
  return new Set(current?.api?.hiddenFields ?? []);
}

function sanitiseRecord(record: Record<string, unknown>, hiddenFields: Set<string>) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !hiddenFields.has(key)));
}

async function sanitiseRecordForTable(
  table: string,
  record: Record<string, unknown>,
  cache = new Map<string, Set<string>>(),
) {
  let hiddenFields = cache.get(table);
  if (!hiddenFields) {
    hiddenFields = await hiddenFieldsForTable(table);
    cache.set(table, hiddenFields);
  }
  return sanitiseRecord(record, hiddenFields);
}

function serialiseValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

function placeholderForField(field: FieldBlueprint, index: number) {
  if (field.type === "jsonb") {
    return `cast($${index} as jsonb)`;
  }

  if (field.type === "uuid") {
    return `cast($${index} as uuid)`;
  }

  if (field.type === "numeric") {
    return `cast($${index} as numeric)`;
  }

  if (field.type === "integer") {
    return `cast($${index} as integer)`;
  }

  if (field.type === "bigint") {
    return `cast($${index} as bigint)`;
  }

  if (field.type === "boolean") {
    return `cast($${index} as boolean)`;
  }

  return `$${index}`;
}

type IncludeRelation = {
  includeKey: string,
  resultKey: string,
  sourceField: string,
  targetTable: string,
  targetField: string,
  joinType: "inner" | "left" | "right" | "full",
};

export type RecordAccessContext = {
  ownershipField?: string | null;
  subjectId?: string | null;
  bypassOwnership?: boolean;
};

export type ListRecordsOptions = {
  pagination?: ApiPaginationConfig;
  filtering?: ApiFieldAccess;
  sorting?: ApiSortingConfig;
  includes?: ApiFieldAccess;
  access?: RecordAccessContext;
};

export type MutationRecordOptions = {
  access?: RecordAccessContext;
};

function applyOwnershipFilter(
  descriptor: TableDescriptor,
  whereClauses: string[],
  values: unknown[],
  access?: RecordAccessContext,
) {
  if (!access || access.bypassOwnership || !access.ownershipField) {
    return;
  }

  if (!descriptor.fields.some((field) => field.name === access.ownershipField)) {
    throw new HttpError(400, `Unknown ownership field ${access.ownershipField}`);
  }

  if (!access.subjectId) {
    throw new HttpError(403, "Owner-scoped access requires an authenticated subject");
  }

  values.push(access.subjectId);
  whereClauses.push(`${quoteIdentifier(access.ownershipField)} = $${values.length}`);
}

async function resolveIncludeRelations(descriptor: TableDescriptor, includes: string[]) {
  if (includes.length === 0) {
    return [];
  }

  const draft = await getSchemaDraft();
  const explicitRelations = draft.relations
    .filter((relation) => relation.sourceTable === descriptor.table)
    .map((relation) => ({
      includeKey: relation.alias ?? relation.sourceField,
      resultKey: relation.alias ?? `${relation.sourceField}Relation`,
      sourceField: relation.sourceField,
      targetTable: relation.targetTable,
      targetField: relation.targetField,
      joinType: relation.joinType ?? "left",
    })) satisfies IncludeRelation[];

  const inferredRelations = descriptor.fields
    .filter((field) => field.references)
    .map((field) => ({
      includeKey: field.name,
      resultKey: `${field.name}Relation`,
      sourceField: field.name,
      targetTable: field.references!.table,
      targetField: field.references!.column,
      joinType: "left" as const,
    })) satisfies IncludeRelation[];

  return [...explicitRelations, ...inferredRelations].filter((relation, index, collection) => {
    if (!includes.includes(relation.includeKey)) {
      return false;
    }
    return collection.findIndex((entry) => entry.includeKey === relation.includeKey) === index;
  });
}

function buildInnerRelationClauses(descriptor: TableDescriptor, relations: IncludeRelation[]) {
  return relations
    .filter((relation) => relation.joinType === "inner")
    .map(
      (relation) =>
        `exists (
          select 1
          from ${quoteIdentifier(relation.targetTable)}
          where ${quoteQualifiedIdentifier(relation.targetTable, relation.targetField)} = ${quoteQualifiedIdentifier(descriptor.table, relation.sourceField)}
        )`,
    );
}

export async function listRecords(table: string, query: URLSearchParams, options: ListRecordsOptions = {}) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  const pagination = options.pagination ?? {
    enabled: true,
    defaultPageSize: 20,
    maxPageSize: 100,
  };
  const sorting = options.sorting ?? {
    enabled: true,
    fields: descriptor.fields.map((field) => field.name),
    defaultField: descriptor.primaryKey,
    defaultOrder: "desc",
  };
  const filtering = options.filtering ?? {
    enabled: true,
    fields: descriptor.fields.map((field) => field.name),
  };
  const includesConfig = options.includes ?? {
    enabled: true,
    fields: [],
  };
  const page = pagination.enabled ? Math.max(1, Number(query.get("page") ?? "1")) : 1;
  const requestedPageSize = pagination.enabled ? Number(query.get("pageSize") ?? String(pagination.defaultPageSize)) : pagination.defaultPageSize;
  const pageSize = Math.min(pagination.maxPageSize, Math.max(1, requestedPageSize));
  const requestedSort = query.get("sort");
  const sort = sorting.enabled ? requestedSort ?? sorting.defaultField ?? descriptor.primaryKey : sorting.defaultField ?? descriptor.primaryKey;
  const order = sorting.enabled
    ? (query.get("order") ?? sorting.defaultOrder).toLowerCase() === "asc" ? "asc" : "desc"
    : sorting.defaultOrder;
  const filterField = query.get("filterField");
  const filterValue = query.get("filterValue");
  const includes = (query.get("include") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!sorting.enabled && (query.get("sort") || query.get("order"))) {
    throw new HttpError(400, `Sorting is disabled for ${descriptor.table}`);
  }

  if (requestedSort && !sorting.fields.includes(sort)) {
    throw new HttpError(400, `Unknown sort field ${sort}`);
  }

  const whereClauses: string[] = [];
  const values: unknown[] = [];

  if (filterValue) {
    if (!filtering.enabled) {
      throw new HttpError(400, `Filtering is disabled for ${descriptor.table}`);
    }

    values.push(filterValue);

    if (filterField) {
      if (!filtering.fields.includes(filterField)) {
        throw new HttpError(400, `Unknown filter field ${filterField}`);
      }
      whereClauses.push(`${quoteIdentifier(filterField)}::text ilike '%' || $${values.length} || '%'`);
    } else {
      const searchableFields = filtering.fields.map((field) => `${quoteIdentifier(field)}::text ilike '%' || $${values.length} || '%'`);
      if (searchableFields.length > 0) {
        whereClauses.push(`(${searchableFields.join(" or ")})`);
      }
    }
  }

  if (!includesConfig.enabled && includes.length > 0) {
    throw new HttpError(400, `Relation includes are disabled for ${descriptor.table}`);
  }

  const disallowedInclude = includes.find((include) => !includesConfig.fields.includes(include));
  if (disallowedInclude) {
    throw new HttpError(400, `Unknown include field ${disallowedInclude}`);
  }

  const relations = includes.length > 0 ? await resolveIncludeRelations(descriptor, includes) : [];
  whereClauses.push(...buildInnerRelationClauses(descriptor, relations));

  applyOwnershipFilter(descriptor, whereClauses, values, options.access);

  const where = whereClauses.length ? `where ${whereClauses.join(" and ")}` : "";
  const limitOffsetSql = `limit ${pageSize} offset ${(page - 1) * pageSize}`;
  const tableSql = quoteIdentifier(descriptor.table);
  const selectSql = selectColumnsSql(descriptor);
  const items = await sql.unsafe(
    `select ${selectSql} from ${tableSql} ${where} order by ${quoteIdentifier(sort)} ${order} ${limitOffsetSql}`,
    unsafeParams(values),
  );
  const [{ count }] = await sql.unsafe<{ count: string }[]>(
    `select count(*)::text as count from ${tableSql} ${where}`,
    unsafeParams(values),
  );

  if (includes.length > 0) {
    const filteredItems: Record<string, unknown>[] = [];
    const hiddenFieldCache = new Map<string, Set<string>>();
    const hiddenFields = await hiddenFieldsForTable(descriptor.table);
    hiddenFieldCache.set(descriptor.table, hiddenFields);

    for (const item of items as Record<string, unknown>[]) {
      const sanitisedItem = sanitiseRecord(item, hiddenFields);
      let shouldKeep = true;

      for (const relation of relations) {
        const foreignId = item[relation.sourceField];
        if (foreignId == null) {
          if (relation.joinType === "inner") {
            shouldKeep = false;
            break;
          }
          continue;
        }

        const relatedDescriptor = await getTableDescriptor(relation.targetTable);
        const [related] = await sql.unsafe<Record<string, unknown>[]>(
          `select ${selectColumnsSql(relatedDescriptor)} from ${quoteIdentifier(relation.targetTable)}
           where ${quoteIdentifier(relation.targetField)} = $1
           limit 1`,
          unsafeParams([foreignId]),
        );

        if (!related && relation.joinType === "inner") {
          shouldKeep = false;
          break;
        }

        sanitisedItem[relation.resultKey] = related ? await sanitiseRecordForTable(relation.targetTable, related, hiddenFieldCache) : null;
      }

      if (shouldKeep) {
        filteredItems.push(sanitisedItem);
      }
    }

    return {
      items: filteredItems,
      total: Number(count),
      page,
      pageSize,
    };
  }

  const hiddenFieldCache = new Map<string, Set<string>>();
  return {
    items: await Promise.all((items as Record<string, unknown>[]).map((item) => sanitiseRecordForTable(descriptor.table, item, hiddenFieldCache))),
    total: Number(count),
    page,
    pageSize,
  };
}

export async function getRecord(table: string, id: string, options: MutationRecordOptions = {}) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  const selectSql = selectColumnsSql(descriptor);
  const whereClauses = [`${quoteIdentifier(descriptor.primaryKey)} = $1`];
  const values: unknown[] = [id];
  applyOwnershipFilter(descriptor, whereClauses, values, options.access);
  const [record] = await sql.unsafe<Record<string, unknown>[]>(
    `select ${selectSql} from ${quoteIdentifier(descriptor.table)}
     where ${whereClauses.join(" and ")}
     limit 1`,
    unsafeParams(values),
  );
  if (!record) {
    throw new HttpError(404, "Record not found");
  }
  return sanitiseRecordForTable(descriptor.table, record);
}

export async function createRecord(table: string, payload: Record<string, unknown>, options: MutationRecordOptions = {}) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  assertWritableDescriptor(descriptor);
  const nextPayload = { ...payload };
  if (options.access?.ownershipField && !options.access.bypassOwnership) {
    if (!options.access.subjectId) {
      throw new HttpError(403, "Owner-scoped access requires an authenticated subject");
    }
    nextPayload[options.access.ownershipField] = options.access.subjectId;
  }
  const allowedFields = descriptor.fields;
  const columns = Object.keys(nextPayload).filter((column) => allowedFields.some((field) => field.name === column));
  if (columns.length === 0) {
    throw new HttpError(400, "No writable fields provided");
  }
  const values = columns.map((column) => serialiseValue(nextPayload[column]));
  const placeholders = columns
    .map((column, index) => placeholderForField(allowedFields.find((field) => field.name === column)!, index + 1))
    .join(", ");
  const [record] = await sql.unsafe<Record<string, unknown>[]>(
    `insert into ${quoteIdentifier(descriptor.table)} (${columns.map(quoteIdentifier).join(", ")})
     values (${placeholders})
     returning *`,
    unsafeParams(values),
  );
  return sanitiseRecordForTable(descriptor.table, record);
}

export async function updateRecord(table: string, id: string, payload: Record<string, unknown>, options: MutationRecordOptions = {}) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  assertWritableDescriptor(descriptor);
  const nextPayload = { ...payload };
  if (options.access?.ownershipField && !options.access.bypassOwnership) {
    delete nextPayload[options.access.ownershipField];
  }
  const columns = Object.keys(nextPayload).filter(
    (column) => column !== descriptor.primaryKey && descriptor.fields.some((field) => field.name === column),
  );
  if (columns.length === 0) {
    throw new HttpError(400, "No writable fields provided");
  }
  const values = columns.map((column) => serialiseValue(nextPayload[column]));
  const assignments = columns
    .map((column, index) => {
      const field = descriptor.fields.find((entry) => entry.name === column)!;
      return `${quoteIdentifier(column)} = ${placeholderForField(field, index + 1)}`;
    })
    .join(", ");
  values.push(id);
  const whereClauses = [`${quoteIdentifier(descriptor.primaryKey)} = $${values.length}`];
  applyOwnershipFilter(descriptor, whereClauses, values, options.access);
  const [record] = await sql.unsafe<Record<string, unknown>[]>(
    `update ${quoteIdentifier(descriptor.table)}
     set ${assignments}
     where ${whereClauses.join(" and ")}
     returning *`,
    unsafeParams(values),
  );
  if (!record) {
    throw new HttpError(404, "Record not found");
  }
  return sanitiseRecordForTable(descriptor.table, record);
}

export async function deleteRecord(table: string, id: string, options: MutationRecordOptions = {}) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  assertWritableDescriptor(descriptor);
  const whereClauses = [`${quoteIdentifier(descriptor.primaryKey)} = $1`];
  const values: unknown[] = [id];
  applyOwnershipFilter(descriptor, whereClauses, values, options.access);
  const [record] = await sql.unsafe<Record<string, unknown>[]>(
    `delete from ${quoteIdentifier(descriptor.table)}
     where ${whereClauses.join(" and ")}
     returning *`,
    unsafeParams(values),
  );
  if (!record) {
    throw new HttpError(404, "Record not found");
  }
  return record;
}

export async function listBrowsableTables() {
  const draft = await getSchemaDraft();
  const existingTables = await listExistingDatabaseTables();
  const builtin = Object.keys(builtinTables).filter((key) => existingTables.has(builtinTables[key].table));
  const pluginTables = (await listPluginCapabilityManifests())
    .filter((manifest) => manifest.installState.enabled)
    .flatMap((manifest) => manifest.models)
    .filter((model) => model.provisioned)
    .map((model) => model.tableName);
  return Array.from(new Set([...builtin, ...pluginTables, ...draft.tables.map((table) => table.name)]));
}
