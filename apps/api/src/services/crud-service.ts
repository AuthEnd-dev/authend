import type { FieldBlueprint, TableDescriptor } from "@authend/shared";
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
};

function selectColumnsSql(descriptor: TableDescriptor) {
  return descriptor.fields.map((field) => quoteIdentifier(field.name)).join(", ");
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
  };
}

function quoteIdentifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new HttpError(400, `Unsafe identifier ${value}`);
  }
  return `"${value}"`;
}

export async function getTableDescriptor(table: string): Promise<TableDescriptor> {
  const resource = await resolveTableResource(table);
  return resource.descriptor;
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

export async function listRecords(table: string, query: URLSearchParams) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  const page = Math.max(1, Number(query.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? "20")));
  const sort = query.get("sort") ?? descriptor.primaryKey;
  const order = (query.get("order") ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const filterField = query.get("filterField");
  const filterValue = query.get("filterValue");
  const includes = (query.get("include") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!descriptor.fields.some((field) => field.name === sort)) {
    throw new HttpError(400, `Unknown sort field ${sort}`);
  }

  const whereClauses: string[] = [];
  const values: unknown[] = [];

  if (filterValue) {
    values.push(filterValue);

    if (filterField) {
      if (!descriptor.fields.some((field) => field.name === filterField)) {
        throw new HttpError(400, `Unknown filter field ${filterField}`);
      }
      whereClauses.push(`${quoteIdentifier(filterField)}::text ilike '%' || $${values.length} || '%'`);
    } else {
      const searchableFields = descriptor.fields.map((field) => `${quoteIdentifier(field.name)}::text ilike '%' || $${values.length} || '%'`);
      if (searchableFields.length > 0) {
        whereClauses.push(`(${searchableFields.join(" or ")})`);
      }
    }
  }

  const where = whereClauses.length ? `where ${whereClauses.join(" and ")}` : "";
  const limitOffsetSql = `limit ${pageSize} offset ${(page - 1) * pageSize}`;
  const tableSql = quoteIdentifier(descriptor.table);
  const selectSql = selectColumnsSql(descriptor);
  const items = await sql.unsafe(
    `select ${selectSql} from ${tableSql} ${where} order by ${quoteIdentifier(sort)} ${order} ${limitOffsetSql}`,
    values,
  );
  const [{ count }] = await sql.unsafe<{ count: string }[]>(
    `select count(*)::text as count from ${tableSql} ${where}`,
    values,
  );

  if (includes.length > 0) {
    const relations = await resolveIncludeRelations(descriptor, includes);
    const filteredItems: Record<string, unknown>[] = [];

    for (const item of items as Record<string, unknown>[]) {
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
          [foreignId],
        );

        if (!related && relation.joinType === "inner") {
          shouldKeep = false;
          break;
        }

        item[relation.resultKey] = related ?? null;
      }

      if (shouldKeep) {
        filteredItems.push(item);
      }
    }

    return {
      items: filteredItems,
      total: filteredItems.length,
      page,
      pageSize,
    };
  }

  return {
    items: items as Record<string, unknown>[],
    total: Number(count),
    page,
    pageSize,
  };
}

export async function getRecord(table: string, id: string) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  const selectSql = selectColumnsSql(descriptor);
  const [record] = await sql.unsafe<Record<string, unknown>[]>(
    `select ${selectSql} from ${quoteIdentifier(descriptor.table)}
     where ${quoteIdentifier(descriptor.primaryKey)} = $1
     limit 1`,
    [id],
  );
  if (!record) {
    throw new HttpError(404, "Record not found");
  }
  return record;
}

export async function createRecord(table: string, payload: Record<string, unknown>) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  assertWritableDescriptor(descriptor);
  const allowedFields = descriptor.fields;
  const columns = Object.keys(payload).filter((column) => allowedFields.some((field) => field.name === column));
  if (columns.length === 0) {
    throw new HttpError(400, "No writable fields provided");
  }
  const values = columns.map((column) => serialiseValue(payload[column]));
  const placeholders = columns
    .map((column, index) => placeholderForField(allowedFields.find((field) => field.name === column)!, index + 1))
    .join(", ");
  const [record] = await sql.unsafe<Record<string, unknown>[]>(
    `insert into ${quoteIdentifier(descriptor.table)} (${columns.map(quoteIdentifier).join(", ")})
     values (${placeholders})
     returning *`,
    values,
  );
  return record;
}

export async function updateRecord(table: string, id: string, payload: Record<string, unknown>) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  assertWritableDescriptor(descriptor);
  const columns = Object.keys(payload).filter(
    (column) => column !== descriptor.primaryKey && descriptor.fields.some((field) => field.name === column),
  );
  if (columns.length === 0) {
    throw new HttpError(400, "No writable fields provided");
  }
  const values = columns.map((column) => serialiseValue(payload[column]));
  const assignments = columns
    .map((column, index) => {
      const field = descriptor.fields.find((entry) => entry.name === column)!;
      return `${quoteIdentifier(column)} = ${placeholderForField(field, index + 1)}`;
    })
    .join(", ");
  values.push(id);
  const [record] = await sql.unsafe<Record<string, unknown>[]>(
    `update ${quoteIdentifier(descriptor.table)}
     set ${assignments}
     where ${quoteIdentifier(descriptor.primaryKey)} = $${values.length}
     returning *`,
    values,
  );
  if (!record) {
    throw new HttpError(404, "Record not found");
  }
  return record;
}

export async function deleteRecord(table: string, id: string) {
  const resource = await resolveTableResource(table);
  const { descriptor } = resource;
  assertWritableDescriptor(descriptor);
  const [record] = await sql.unsafe<Record<string, unknown>[]>(
    `delete from ${quoteIdentifier(descriptor.table)}
     where ${quoteIdentifier(descriptor.primaryKey)} = $1
     returning *`,
    [id],
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
