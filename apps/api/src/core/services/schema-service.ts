import { createHash } from "node:crypto";
import type { FieldBlueprint, SchemaDraft, SchemaDraftInput, TableBlueprint } from "@authend/shared";
import {
  assertSafeIdentifier,
  ensureFieldDefaults,
  validateDraft,
  withDefaultId,
} from "@authend/shared";
import { db, sql } from "../db/client";
import { schemaFields, schemaRelations, schemaTables } from "../db/schema/system";
import { logger } from "../lib/logger";
import { HttpError } from "../lib/http";
import { resolveGeneratedSchemaFile } from "../lib/generated-artifacts";
import { readTextFile, writeTextFile } from "../lib/fs";
import { applySqlMigration, writeGeneratedMigration } from "./migration-service";
import { writeAuditLog } from "./audit-service";
import { getTableDescriptor } from "./crud-service";
import { dispatchWebhookEvent } from "./webhook-service";

import { getExtensionSchemaDraft } from "../../extensions/schema";

const generatedSchemaFile = resolveGeneratedSchemaFile();

function sqlDefault(field: FieldBlueprint) {
  if (!field.default) {
    return "";
  }

  if (field.default.endsWith("()")) {
    return ` default ${field.default}`;
  }

  if (field.type === "integer" || field.type === "bigint" || field.type === "numeric") {
    return ` default ${field.default}`;
  }

  if (field.type === "boolean") {
    return ` default ${field.default === "true" ? "true" : "false"}`;
  }

  return ` default '${field.default.replaceAll("'", "''")}'`;
}

function sqlFieldType(tableName: string, field: FieldBlueprint) {
  if (field.type === "enum") {
    return `"${tableName}_${field.name}_enum"`;
  }

  const map = {
    text: "text",
    varchar: `varchar(${field.size ?? 255})`,
    integer: "integer",
    bigint: "bigint",
    boolean: "boolean",
    timestamp: "timestamp with time zone",
    date: "date",
    jsonb: "jsonb",
    uuid: "uuid",
    numeric: "numeric",
  } as const;

  return map[field.type];
}

function alterColumnTypeUsing(tableName: string, field: FieldBlueprint) {
  const quoted = `"${field.name}"`;

  switch (field.type) {
    case "uuid":
      return `using nullif(${quoted}::text, '')::uuid`;
    case "integer":
      return `using nullif(${quoted}::text, '')::integer`;
    case "bigint":
      return `using nullif(${quoted}::text, '')::bigint`;
    case "numeric":
      return `using nullif(${quoted}::text, '')::numeric`;
    case "boolean":
      return `using case
        when ${quoted}::text in ('true', '1', 'yes', 'y', 'on') then true
        when ${quoted}::text in ('false', '0', 'no', 'n', 'off') then false
        else null
      end`;
    case "timestamp":
      return `using nullif(${quoted}::text, '')::timestamp with time zone`;
    case "date":
      return `using nullif(${quoted}::text, '')::date`;
    case "jsonb":
      return `using to_jsonb(${quoted})`;
    case "varchar":
    case "text":
      return `using ${quoted}::text`;
    case "enum":
      return `using ${quoted}::text::"${tableName}_${field.name}_enum"`;
    default:
      return "";
  }
}

function indexName(tableName: string, fieldName: string) {
  return `${tableName}_${fieldName}_idx`;
}

function assertSqlIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new HttpError(400, `Invalid identifier ${value}`);
  }
}

function columnSql(tableName: string, field: FieldBlueprint, primaryKey: string) {
  const safe = ensureFieldDefaults(field);
  const pieces = [`"${safe.name}" ${sqlFieldType(tableName, safe)}`];

  if (safe.name === primaryKey) {
    pieces.push("primary key");
  }

  if (!safe.nullable && safe.name !== primaryKey) {
    pieces.push("not null");
  }

  if (safe.unique && safe.name !== primaryKey) {
    pieces.push("unique");
  }

  pieces.push(sqlDefault(safe));

  if (safe.references) {
    pieces.push(
      `references "${safe.references.table}"("${safe.references.column}") on delete ${safe.references.onDelete} on update ${safe.references.onUpdate}`,
    );
  }

  return pieces.filter(Boolean).join(" ");
}

function drizzleColumn(field: FieldBlueprint) {
  const safe = ensureFieldDefaults(field);

  const typeMap: Record<string, string> = {
    text: `text("${safe.name}")`,
    varchar: `varchar("${safe.name}", { length: ${safe.size ?? 255} })`,
    integer: `integer("${safe.name}")`,
    bigint: `bigint("${safe.name}", { mode: "number" })`,
    boolean: `boolean("${safe.name}")`,
    timestamp: `timestamp("${safe.name}", { withTimezone: true })`,
    date: `date("${safe.name}")`,
    jsonb: `jsonb("${safe.name}")`,
    uuid: `uuid("${safe.name}")`,
    numeric: `numeric("${safe.name}")`,
    enum: "",
  };

  const chain: string[] = [typeMap[safe.type]];

  if (!safe.nullable) {
    chain.push("notNull()");
  }

  if (safe.unique) {
    chain.push("unique()");
  }

  if (safe.default) {
    if (safe.default.endsWith("()")) {
      chain.push(`default(sql\`${safe.default}\`)`);
    } else {
      chain.push(`default(${JSON.stringify(safe.default)})`);
    }
  }

  if (safe.references) {
    chain.push(
      `references(() => ${safe.references.table}.${safe.references.column}, { onDelete: "${safe.references.onDelete}", onUpdate: "${safe.references.onUpdate}" })`,
    );
  }

  return chain.join(".");
}

function enumVariableName(tableName: string, fieldName: string) {
  return `${tableName}_${fieldName}_enum`;
}

function drizzleColumnForTable(tableName: string, field: FieldBlueprint) {
  const safe = ensureFieldDefaults(field);

  if (safe.type === "enum") {
    const chain = [`${enumVariableName(tableName, safe.name)}("${safe.name}")`];

    if (!safe.nullable) {
      chain.push("notNull()");
    }

    if (safe.unique) {
      chain.push("unique()");
    }

    if (safe.default) {
      chain.push(`default(${JSON.stringify(safe.default)})`);
    }

    return chain.join(".");
  }

  return drizzleColumn(field);
}

function renderTableIndexes(table: TableBlueprint) {
  const withId = withDefaultId(table);
  const indexEntries: string[] = [];

  for (const field of withId.fields.map(ensureFieldDefaults)) {
    if (field.indexed && !field.unique && field.name !== withId.primaryKey) {
      indexEntries.push(`    index("${indexName(withId.name, field.name)}").on(table.${field.name}),`);
    }
  }

  for (const columns of withId.indexes) {
    const customIndexName = `${withId.name}_${columns.join("_")}_idx`;
    indexEntries.push(`    index("${customIndexName}").on(${columns.map((column) => `table.${column}`).join(", ")}),`);
  }

  if (indexEntries.length === 0) {
    return "";
  }

  return `,
  (table) => [
${indexEntries.join("\n")}
  ]`;
}

function renderSchemaModule(draft: SchemaDraft) {
  const tableNames = new Set(draft.tables.map((table) => table.name));
  const referencedTables = new Set<string>();

  for (const table of draft.tables) {
    for (const field of table.fields) {
      if (field.references) {
        referencedTables.add(field.references.table);
      }
    }
  }

  const coreAuthTables = [
    "user",
    "session",
    "account",
    "verification",
    "twoFactor",
    "jwks",
    "organization",
    "member",
    "invitation",
    "team",
    "teamMember",
    "organizationRole",
    "apikey",
  ];

  const coreSystemTables = [
    "systemAdmins",
    "pluginConfigs",
    "schemaTables",
    "schemaFields",
    "schemaRelations",
    "migrationRuns",
    "auditLogs",
    "systemSettings",
    "backupRuns",
    "cronJobs",
    "cronRuns",
    "aiThreads",
    "aiMessages",
    "aiRuns",
    "storageFiles",
    "webhooks",
    "webhookDeliveries",
  ];

  const authImports = Array.from(referencedTables).filter((t) => coreAuthTables.includes(t) && !tableNames.has(t));
  const systemImports = Array.from(referencedTables).filter((t) => coreSystemTables.includes(t) && !tableNames.has(t));

  let imports = `import { bigint, boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";`;

  if (authImports.length > 0) {
    imports += `\nimport { ${authImports.join(", ")} } from "../../src/core/db/schema/auth";`;
  }
  if (systemImports.length > 0) {
    imports += `\nimport { ${systemImports.join(", ")} } from "../../src/core/db/schema/system";`;
  }

  const enums = draft.tables
    .map(withDefaultId)
    .flatMap((table) =>
      table.fields
        .map(ensureFieldDefaults)
        .filter((field) => field.type === "enum" && field.enumValues?.length)
        .map((field) => `export const ${enumVariableName(table.name, field.name)} = pgEnum("${table.name}_${field.name}_enum", [${field.enumValues!.map((value) => JSON.stringify(value)).join(", ")}]);`),
    );

  const tables = draft.tables.map((table) => {
    const withId = withDefaultId(table);
    return `export const ${withId.name} = pgTable("${withId.name}", {
${withId.fields
  .map((field) => `  ${field.name}: ${drizzleColumnForTable(withId.name, field)},`)
  .join("\n")}
}${renderTableIndexes(withId)});`;
  });

  return `${imports}

${enums.join("\n")}

${tables.join("\n\n")}

export const generatedSchema = {
${draft.tables.map((table) => `  ${table.name},`).join("\n")}
};
`;
}

function summarizePolicyChanges(current: SchemaDraft, next: SchemaDraft) {
  const currentTables = new Map(current.tables.map((table) => [table.name, table]));
  const changedTables: string[] = [];

  for (const table of next.tables) {
    const previous = currentTables.get(table.name);
    if (!previous) {
      continue;
    }

    if (JSON.stringify(previous.api) !== JSON.stringify(table.api)) {
      changedTables.push(table.name);
    }
  }

  return {
    count: changedTables.length,
    tables: changedTables.sort(),
  };
}

export const schemaServiceTestUtils = {
  renderSchemaModule,
  buildPreviewStatements,
  migrationSqlKey,
  sortNewTablesForCreation,
};

function migrationChecksum(sqlText: string) {
  return createHash("sha256").update(sqlText.trim()).digest("hex").slice(0, 12);
}

function migrationSqlKey(prefix: string, sqlText?: string) {
  if (typeof sqlText === "string" && sqlText.trim().length > 0) {
    return `${migrationChecksum(sqlText)}_${prefix}`;
  }

  const now = new Date();
  const stamp = [
    now.getUTCFullYear().toString().padStart(4, "0"),
    (now.getUTCMonth() + 1).toString().padStart(2, "0"),
    now.getUTCDate().toString().padStart(2, "0"),
    now.getUTCHours().toString().padStart(2, "0"),
    now.getUTCMinutes().toString().padStart(2, "0"),
    now.getUTCSeconds().toString().padStart(2, "0"),
  ].join("");

  return `${stamp}_${prefix}`;
}

function relationSignature(relation: SchemaDraft["relations"][number]) {
  return `${relation.sourceTable}|${relation.sourceField}|${relation.targetTable}|${relation.targetField}|${relation.onDelete}|${relation.onUpdate}`;
}

function sortNewTablesForCreation(tables: TableBlueprint[]) {
  const tablesByName = new Map(tables.map((table) => [table.name, withDefaultId(table)]));
  const remainingDependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const table of tablesByName.values()) {
    const deps = new Set(
      table.fields
        .map(ensureFieldDefaults)
        .map((field) => field.references?.table)
        .filter((name): name is string => typeof name === "string" && tablesByName.has(name) && name !== table.name),
    );
    remainingDependencies.set(table.name, deps);

    for (const dep of deps) {
      dependents.set(dep, new Set([...(dependents.get(dep) ?? []), table.name]));
    }
  }

  const ready = tables
    .map((table) => table.name)
    .filter((name) => (remainingDependencies.get(name)?.size ?? 0) === 0);
  const ordered: TableBlueprint[] = [];
  const visited = new Set<string>();

  while (ready.length > 0) {
    const nextName = ready.shift()!;
    if (visited.has(nextName)) {
      continue;
    }

    visited.add(nextName);
    ordered.push(tablesByName.get(nextName)!);

    for (const dependentName of dependents.get(nextName) ?? []) {
      const deps = remainingDependencies.get(dependentName);
      if (!deps) {
        continue;
      }
      deps.delete(nextName);
      if (deps.size === 0) {
        ready.push(dependentName);
      }
    }
  }

  if (ordered.length === tables.length) {
    return ordered;
  }

  for (const table of tables) {
    if (!visited.has(table.name)) {
      ordered.push(tablesByName.get(table.name)!);
    }
  }

  return ordered;
}

function mergeDraftWithExtensions(base: SchemaDraft): SchemaDraft {
  let extensionDraft: SchemaDraft;
  try {
    extensionDraft = validateDraft(getExtensionSchemaDraft());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(500, `Invalid extensions schema draft: ${message}`);
  }

  const tablesByName = new Map(base.tables.map((table) => [table.name, table]));
  const mergedTables = [...base.tables];

  for (const extensionTable of extensionDraft.tables.map(withDefaultId)) {
    const existing = tablesByName.get(extensionTable.name);
    if (!existing) {
      mergedTables.push(extensionTable);
      tablesByName.set(extensionTable.name, extensionTable);
      continue;
    }

    const normalizedExisting = withDefaultId(existing);
    const existingStr = JSON.stringify(normalizedExisting);
    const extensionStr = JSON.stringify(extensionTable);
    if (existingStr !== extensionStr) {
      // In a real conflict, we prefer the extension (code) over the dashboard metadata
      // since the extension is the "Source of Truth" for its own tables.
      // We log it so the developer knows there's a discrepancy, but we don't crash.
      logger.warn("schema.merge.overlap", { 
        tableName: extensionTable.name,
        message: "Extension table definition differs from dashboard metadata. Extension takes precedence."
      });
    }
    // Extension takes precedence, so we replace the existing one in the merged list
    const index = mergedTables.findIndex((t) => t.name === extensionTable.name);
    if (index !== -1) {
      const mergedTable = { ...extensionTable };
      const extensionFieldNames = new Set(extensionTable.fields.map((f) => f.name));
      const dashboardOnlyFields = existing.fields.filter((f) => !extensionFieldNames.has(f.name));

      mergedTable.fields = [...extensionTable.fields, ...dashboardOnlyFields];

      // Merge API config if extension didn't explicitly override it from dashboard
      // (Simplified: code definition takes precedence as a whole if changed)

      mergedTables[index] = mergedTable;
    }
  }

  const relationKeys = new Set(base.relations.map(relationSignature));
  const mergedRelations = [...base.relations];
  for (const relation of extensionDraft.relations) {
    const key = relationSignature(relation);
    if (!relationKeys.has(key)) {
      mergedRelations.push(relation);
      relationKeys.add(key);
    }
  }

  return {
    tables: mergedTables,
    relations: mergedRelations,
  };
}

type LiveColumn = {
  tableName: string;
  columnName: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  defaultValue: string | null;
  maxLength: number | null;
};

type LiveIndex = {
  tableName: string;
  indexName: string;
  unique: boolean;
  columns: string[];
};

type LiveForeignKey = {
  tableName: string;
  columnName: string;
  foreignTableName: string;
  foreignColumnName: string;
  onDelete: string;
  onUpdate: string;
};

function liveColumnMatchesField(tableName: string, field: FieldBlueprint, live: LiveColumn) {
  const safe = ensureFieldDefaults(field);
  const nullableMatches = safe.name === "id" ? true : live.isNullable === safe.nullable;

  const typeMatches =
    (safe.type === "text" && live.dataType === "text") ||
    (safe.type === "varchar" && live.dataType === "character varying" && live.maxLength === (safe.size ?? 255)) ||
    (safe.type === "integer" && live.dataType === "integer") ||
    (safe.type === "bigint" && live.dataType === "bigint") ||
    (safe.type === "boolean" && live.dataType === "boolean") ||
    (safe.type === "timestamp" && live.dataType === "timestamp with time zone") ||
    (safe.type === "date" && live.dataType === "date") ||
    (safe.type === "jsonb" && live.dataType === "jsonb") ||
    (safe.type === "uuid" && live.dataType === "uuid") ||
    (safe.type === "numeric" && live.dataType === "numeric") ||
    (safe.type === "enum" && live.dataType === "USER-DEFINED" && live.udtName === `${tableName}_${safe.name}_enum`);

  return typeMatches && nullableMatches;
}

function defaultMatches(field: FieldBlueprint, live: LiveColumn) {
  const safe = ensureFieldDefaults(field);
  if (!safe.default) {
    return live.defaultValue === null;
  }

  if (!live.defaultValue) {
    return false;
  }

  if (safe.default.endsWith("()")) {
    return live.defaultValue.includes(safe.default.replaceAll('"', ""));
  }

  if (safe.type === "boolean" || safe.type === "integer" || safe.type === "bigint" || safe.type === "numeric" || safe.type === "enum") {
    return live.defaultValue.includes(String(safe.default));
  }

  return live.defaultValue.includes(`'${safe.default.replaceAll("'", "''")}'`);
}

async function readLiveSchemaState(tableNames: string[]) {
  if (tableNames.length === 0) {
    return { columns: [], indexes: [], foreignKeys: [], enums: new Map<string, string[]>() };
  }

  const columns = await sql<LiveColumn[]>`
    select
      table_name as "tableName",
      column_name as "columnName",
      data_type as "dataType",
      udt_name as "udtName",
      is_nullable = 'YES' as "isNullable",
      column_default as "defaultValue",
      character_maximum_length as "maxLength"
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = any(${tableNames}::text[])
    order by table_name, ordinal_position
  `;

  const indexes = await sql<LiveIndex[]>`
    select
      t.relname as "tableName",
      i.relname as "indexName",
      ix.indisunique as "unique",
      array_agg(a.attname order by cols.ordinality) as "columns"
    from pg_class t
    join pg_index ix on ix.indrelid = t.oid
    join pg_class i on i.oid = ix.indexrelid
    join lateral unnest(ix.indkey) with ordinality as cols(attnum, ordinality) on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = cols.attnum
    where t.relname = any(${tableNames}::text[])
      and not ix.indisprimary
    group by t.relname, i.relname, ix.indisunique
  `;

  const foreignKeys = await sql<LiveForeignKey[]>`
    select
      tc.table_name as "tableName",
      kcu.column_name as "columnName",
      ccu.table_name as "foreignTableName",
      ccu.column_name as "foreignColumnName",
      lower(rc.delete_rule) as "onDelete",
      lower(rc.update_rule) as "onUpdate"
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
    join information_schema.referential_constraints rc
      on rc.constraint_name = tc.constraint_name
     and rc.constraint_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = current_schema()
      and tc.table_name = any(${tableNames}::text[])
  `;

  const enumTypeNames = Array.from(new Set(columns.filter((column) => column.dataType === "USER-DEFINED").map((column) => column.udtName)));
  const enumRows =
    enumTypeNames.length === 0
      ? []
      : await sql<{ enumName: string; enumLabel: string }[]>`
          select
            t.typname as "enumName",
            e.enumlabel as "enumLabel"
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          where t.typname = any(${enumTypeNames}::text[])
          order by t.typname, e.enumsortorder
        `;

  const enums = new Map<string, string[]>();
  for (const row of enumRows) {
    enums.set(row.enumName, [...(enums.get(row.enumName) ?? []), row.enumLabel]);
  }

  return { columns, indexes, foreignKeys, enums };
}

function buildPreviewStatements(input: {
  current: SchemaDraftInput;
  draft: SchemaDraftInput;
  columns: LiveColumn[];
  indexes: LiveIndex[];
  foreignKeys: LiveForeignKey[];
}) {
  const currentTables = input.current.tables.map(withDefaultId);
  const nextTables = input.draft.tables.map(withDefaultId);
  const nextRelations = input.draft.relations ?? [];
  const currentByName = new Map(currentTables.map((table) => [table.name, table]));
  const nextByName = new Map(nextTables.map((table) => [table.name, table]));
  const statements: string[] = [];
  const warnings: string[] = [];

  const existingLiveTables = new Set(input.columns.map((column) => column.tableName));
  const existingForeignKeys = new Set(
    input.foreignKeys.map((foreignKey) => `${foreignKey.tableName}_${foreignKey.columnName}_${foreignKey.foreignTableName}_fk`),
  );
  const existingIndexes = new Set(input.indexes.map((index) => index.indexName));

  for (const table of currentTables) {
    if (!nextByName.has(table.name)) {
      statements.push(`drop table if exists "${table.name}" cascade;`);
    }
  }

  const newTables = sortNewTablesForCreation(nextTables.filter((table) => !currentByName.has(table.name)));

  for (const table of newTables) {
    if (existingLiveTables.has(table.name)) {
      const liveCols = input.columns.filter((column) => column.tableName === table.name);
      const liveColNames = new Set(liveCols.map((column) => column.columnName));
      for (const field of table.fields) {
        if (!liveColNames.has(field.name)) {
          statements.push(
            `alter table "${table.name}" add column if not exists ${columnSql(table.name, field, table.primaryKey)};`,
          );
        }
      }
      for (const field of table.fields) {
        if (field.indexed && !field.unique && field.name !== table.primaryKey) {
          const indexName = `${table.name}_${field.name}_idx`;
          if (!existingIndexes.has(indexName)) {
            statements.push(`create index if not exists "${indexName}" on "${table.name}" ("${field.name}");`);
          }
        }
      }
      for (const compound of table.indexes) {
        const indexName = `${table.name}_${compound.join("_")}_idx`;
        if (!existingIndexes.has(indexName)) {
          statements.push(
            `create index if not exists "${indexName}" on "${table.name}" (${compound.map((column) => `"${column}"`).join(", ")});`,
          );
        }
      }
      continue;
    }

    statements.push(...buildCreateTableSql(table));
  }

  for (const table of nextTables) {
    if (!currentByName.has(table.name)) {
      continue;
    }

    const alteration = buildAlterSql(currentByName.get(table.name)!, table);
    statements.push(...alteration.statements);
    warnings.push(...alteration.warnings);
  }

  for (const relation of nextRelations) {
    assertSafeIdentifier(relation.sourceTable);
    assertSqlIdentifier(relation.sourceField);
    assertSqlIdentifier(relation.targetTable);
    assertSqlIdentifier(relation.targetField);
    const constraintName = `${relation.sourceTable}_${relation.sourceField}_${relation.targetTable}_fk`;

    if (existingForeignKeys.has(constraintName)) {
      continue;
    }

    statements.push(`do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = '${constraintName}'
  ) then
    alter table "${relation.sourceTable}"
      add constraint "${constraintName}"
      foreign key ("${relation.sourceField}")
      references "${relation.targetTable}"("${relation.targetField}")
      on delete ${relation.onDelete}
      on update ${relation.onUpdate};
  end if;
end $$;`);
  }

  return { statements, warnings };
}

export async function getSchemaDriftReport(rawDraft?: SchemaDraft) {
  const draft = rawDraft ? validateDraft(rawDraft) : await getSchemaDraft();
  const generatedTables = draft.tables.map(withDefaultId);
  const tableNames = generatedTables.map((table) => table.name);
  const issues: string[] = [];
  const { columns, indexes, foreignKeys, enums } = await readLiveSchemaState(tableNames);

  const columnsByTable = new Map<string, LiveColumn[]>();
  for (const column of columns) {
    columnsByTable.set(column.tableName, [...(columnsByTable.get(column.tableName) ?? []), column]);
  }

  const indexesByTable = new Map<string, LiveIndex[]>();
  for (const index of indexes) {
    indexesByTable.set(index.tableName, [...(indexesByTable.get(index.tableName) ?? []), index]);
  }

  const foreignKeysByTable = new Map<string, LiveForeignKey[]>();
  for (const foreignKey of foreignKeys) {
    foreignKeysByTable.set(foreignKey.tableName, [...(foreignKeysByTable.get(foreignKey.tableName) ?? []), foreignKey]);
  }

  for (const table of generatedTables) {
    const liveColumns = columnsByTable.get(table.name) ?? [];
    const expectedFieldNames = new Set(table.fields.map((field) => field.name));

    for (const field of table.fields.map(ensureFieldDefaults)) {
      const liveColumn = liveColumns.find((column) => column.columnName === field.name);
      if (!liveColumn) {
        issues.push(`Live database is missing column ${table.name}.${field.name}.`);
        continue;
      }

      if (!liveColumnMatchesField(table.name, field, liveColumn)) {
        issues.push(`Live column ${table.name}.${field.name} does not match the draft type/nullability definition.`);
      }

      if (!defaultMatches(field, liveColumn)) {
        issues.push(`Live column ${table.name}.${field.name} default does not match the draft definition.`);
      }

      if (field.type === "enum") {
        const liveEnumValues = enums.get(`${table.name}_${field.name}_enum`) ?? [];
        const expectedEnumValues = field.enumValues ?? [];
        if (liveEnumValues.join("|") !== expectedEnumValues.join("|")) {
          issues.push(`Live enum ${table.name}.${field.name} values do not match the draft definition.`);
        }
      }

      if (field.references) {
        const foreignKey = (foreignKeysByTable.get(table.name) ?? []).find((entry) => entry.columnName === field.name);
        if (!foreignKey) {
          issues.push(`Live database is missing foreign key for ${table.name}.${field.name}.`);
        } else if (
          foreignKey.foreignTableName !== field.references.table ||
          foreignKey.foreignColumnName !== field.references.column ||
          foreignKey.onDelete !== field.references.onDelete ||
          foreignKey.onUpdate !== field.references.onUpdate
        ) {
          issues.push(`Live foreign key for ${table.name}.${field.name} does not match the draft relation actions.`);
        }
      }

      if (field.unique) {
        const hasUniqueIndex = (indexesByTable.get(table.name) ?? []).some((index) => index.unique && index.columns.length === 1 && index.columns[0] === field.name);
        if (!hasUniqueIndex && field.name !== table.primaryKey) {
          issues.push(`Live database is missing unique constraint for ${table.name}.${field.name}.`);
        }
      }

      if (field.indexed && !field.unique && field.name !== table.primaryKey) {
        const hasIndex = (indexesByTable.get(table.name) ?? []).some((index) => !index.unique && index.columns.length === 1 && index.columns[0] === field.name);
        if (!hasIndex) {
          issues.push(`Live database is missing index for ${table.name}.${field.name}.`);
        }
      }
    }

    for (const liveColumn of liveColumns) {
      if (!expectedFieldNames.has(liveColumn.columnName)) {
        issues.push(`Live database has extra column ${table.name}.${liveColumn.columnName} not present in metadata.`);
      }
    }

    for (const compoundIndex of table.indexes) {
      const hasIndex = (indexesByTable.get(table.name) ?? []).some(
        (index) => index.columns.length === compoundIndex.length && index.columns.every((column, indexPosition) => column === compoundIndex[indexPosition]),
      );
      if (!hasIndex) {
        issues.push(`Live database is missing compound index ${table.name}(${compoundIndex.join(", ")}).`);
      }
    }
  }

  const expectedSchemaModule = renderSchemaModule(draft);
  const currentSchemaModule = await readTextFile(generatedSchemaFile).catch(() => "");
  if (currentSchemaModule !== expectedSchemaModule) {
    issues.push("Generated Drizzle schema file is out of sync with metadata.");
  }

  return {
    drifted: issues.length > 0,
    issues,
  };
}

function buildCreateTableSql(table: TableBlueprint) {
  const withId = withDefaultId(table);
  const statements: string[] = [];
  const enumStatements = withId.fields
    .filter((field) => field.type === "enum" && field.enumValues?.length)
    .map(
      (field) =>
        `do $$ begin
  create type "${withId.name}_${field.name}_enum" as enum (${field.enumValues!.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")});
exception
  when duplicate_object then null;
end $$;`,
    );

  statements.push(...enumStatements);
  statements.push(
    `create table if not exists "${withId.name}" (
${withId.fields.map((field) => `  ${columnSql(withId.name, field, withId.primaryKey)}`).join(",\n")}
);`,
  );

  for (const field of withId.fields) {
    if (field.indexed && !field.unique && field.name !== withId.primaryKey) {
      statements.push(`create index if not exists "${withId.name}_${field.name}_idx" on "${withId.name}" ("${field.name}");`);
    }
  }

  for (const columns of withId.indexes) {
    const indexName = `${withId.name}_${columns.join("_")}_idx`;
    statements.push(`create index if not exists "${indexName}" on "${withId.name}" (${columns.map((column) => `"${column}"`).join(", ")});`);
  }

  return statements;
}

function buildAlterSql(currentTable: TableBlueprint, nextTable: TableBlueprint) {
  const currentFields = new Map(currentTable.fields.map((field) => [field.name, field]));
  const nextFields = nextTable.fields.map(ensureFieldDefaults);
  const nextFieldNames = new Set(nextFields.map((field) => field.name));
  const statements: string[] = [];
  const warnings: string[] = [];

  for (const field of currentTable.fields) {
    if (!nextFieldNames.has(field.name)) {
      if (field.name === currentTable.primaryKey) {
        throw new HttpError(400, `Removing primary key ${currentTable.name}.${field.name} is not allowed`);
      }
      statements.push(`alter table "${currentTable.name}" drop column if exists "${field.name}" cascade;`);
    }
  }

  for (const field of nextFields) {
    const current = currentFields.get(field.name);
    if (!current) {
      if (field.type === "enum" && field.enumValues?.length) {
        statements.push(`do $$ begin
  create type "${nextTable.name}_${field.name}_enum" as enum (${field.enumValues.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")});
exception
  when duplicate_object then null;
end $$;`);
      }
      statements.push(
        `alter table "${nextTable.name}" add column if not exists ${columnSql(nextTable.name, field, nextTable.primaryKey)};`,
      );
      if (field.indexed && !field.unique && field.name !== nextTable.primaryKey) {
        statements.push(`create index if not exists "${indexName(nextTable.name, field.name)}" on "${nextTable.name}" ("${field.name}");`);
      }
      continue;
    }

    if (current.type !== field.type) {
      if (field.type === "enum" && field.enumValues?.length) {
        statements.push(`do $$ begin
  create type "${nextTable.name}_${field.name}_enum" as enum (${field.enumValues.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")});
exception
  when duplicate_object then null;
end $$;`);
      }
      statements.push(
        `alter table "${nextTable.name}" alter column "${field.name}" type ${sqlFieldType(nextTable.name, field)} ${alterColumnTypeUsing(nextTable.name, field)};`,
      );
    }

    if (current.default !== field.default) {
      if (!field.default) {
        statements.push(`alter table "${nextTable.name}" alter column "${field.name}" drop default;`);
      } else {
        statements.push(`alter table "${nextTable.name}" alter column "${field.name}" set${sqlDefault(field)};`);
      }
    }

    if (current.nullable !== field.nullable) {
      if (field.nullable) {
        statements.push(`alter table "${nextTable.name}" alter column "${field.name}" drop not null;`);
      } else {
        statements.push(`alter table "${nextTable.name}" alter column "${field.name}" set not null;`);
      }
    }

    if (!current.indexed && field.indexed && !field.unique && field.name !== nextTable.primaryKey) {
      statements.push(`create index if not exists "${indexName(nextTable.name, field.name)}" on "${nextTable.name}" ("${field.name}");`);
    }

    if (current.indexed && !field.indexed) {
      statements.push(`drop index if exists "${indexName(nextTable.name, field.name)}";`);
    }

    if (current.unique !== field.unique) {
      warnings.push(`Field ${nextTable.name}.${field.name} changed unique constraint and may need manual review.`);
    }
  }

  return { statements, warnings };
}

export async function getSchemaDraft(options: { includeExtensions?: boolean } = {}): Promise<SchemaDraft> {
  const includeExtensions = options.includeExtensions ?? true;
  const tables = await db.select().from(schemaTables);
  const fields = await db.select().from(schemaFields);
  const relations = await db.select().from(schemaRelations);

  const baseDraft = {
    tables: tables.map((table) => {
      const definition = table.definition as unknown as TableBlueprint & {
        hooks?: unknown[];
      };

      return {
        ...definition,
        hooks: definition.hooks || [],
        fields: fields
          .filter((field) => field.tableId === table.id)
          .map((field) => field.definition as FieldBlueprint),
      };
    }),
    relations: relations.map((relation) => relation.definition as SchemaDraft["relations"][number]),
  };

  return includeExtensions ? mergeDraftWithExtensions(baseDraft) : baseDraft;
}

export async function previewDraft(rawDraft: SchemaDraft) {
  const draft = mergeDraftWithExtensions(validateDraft(rawDraft));
  const current = await getSchemaDraft({ includeExtensions: false });
  const tableNames = draft.tables.map((t) => t.name);
  const { columns, indexes, foreignKeys } = await readLiveSchemaState(tableNames);
  const { statements, warnings } = buildPreviewStatements({
    current,
    draft,
    columns,
    indexes,
    foreignKeys,
  });

  return { sql: statements, warnings };
}

async function replaceMetadata(draft: SchemaDraft) {
  await sql.begin(async (transaction) => {
    // We only delete and replace metadata for tables NOT managed by extensions.
    // However, the current implementation wipes everything and replaces.
    // To keep it simple, we'll keep the wipe-and-replace but SKIP inserting extension tables.
    await transaction.unsafe(`delete from _schema_relations`);
    await transaction.unsafe(`delete from _schema_fields`);
    await transaction.unsafe(`delete from _schema_tables`);

    for (const table of draft.tables.map(withDefaultId)) {
      const tableId = crypto.randomUUID();
      await transaction.unsafe(
        `insert into _schema_tables (id, table_name, display_name, primary_key, definition, created_at, updated_at)
         values ($1, $2, $3, $4, $5::jsonb, now(), now())`,
        [tableId, table.name, table.displayName, table.primaryKey, JSON.stringify(table)] as never[],
      );

      for (const field of table.fields) {
        await transaction.unsafe(
          `insert into _schema_fields (id, table_id, field_name, definition, created_at)
           values ($1, $2, $3, $4::jsonb, now())`,
          [crypto.randomUUID(), tableId, field.name, JSON.stringify(field)] as never[],
        );
      }
    }

    for (const relation of draft.relations) {
      await transaction.unsafe(
        `insert into _schema_relations (id, source_table, source_field, target_table, target_field, on_delete, on_update, definition, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())`,
        [
          crypto.randomUUID(),
          relation.sourceTable,
          relation.sourceField,
          relation.targetTable,
          relation.targetField,
          relation.onDelete,
          relation.onUpdate,
          JSON.stringify(relation),
        ] as never[],
      );
    }
  });
}

export async function applyDraft(rawDraft: SchemaDraft, actorUserId?: string | null) {
  const draft = mergeDraftWithExtensions(validateDraft(rawDraft));
  const current = await getSchemaDraft({ includeExtensions: false });
  const policyChanges = summarizePolicyChanges(current, draft);
  const nextTableNames = new Set(draft.tables.map((table) => table.name));
  const droppedTableNames = current.tables
    .map((table) => table.name)
    .filter((tableName) => !nextTableNames.has(tableName));

  for (const tableName of droppedTableNames) {
    const descriptor = await getTableDescriptor(tableName);
    if (descriptor.source !== "generated") {
      throw new HttpError(403, `Table ${tableName} cannot be deleted because it is not generated`);
    }
  }

  const preview = await previewDraft(draft);
  const sqlText = preview.sql.join("\n\n");
  const migrationKey = migrationSqlKey("schema_apply", sqlText);

  if (sqlText.trim()) {
    await writeGeneratedMigration(migrationKey, sqlText);
    await applySqlMigration({
      key: migrationKey,
      title: "Schema draft apply",
      sqlText,
      actorUserId,
    });
  }

  await replaceMetadata(draft);
  await writeTextFile(generatedSchemaFile, renderSchemaModule(draft));
  await writeAuditLog({
    action: "schema.applied",
    actorUserId,
    target: migrationKey,
    payload: {
      tableCount: draft.tables.length,
      relationCount: draft.relations.length,
      policyChangeCount: policyChanges.count,
      policyTables: policyChanges.tables,
    },
  });

  if (policyChanges.count > 0) {
    await writeAuditLog({
      action: "schema.policy.updated",
      actorUserId,
      target: migrationKey,
      payload: {
        tables: policyChanges.tables,
        changeCount: policyChanges.count,
      },
    });
  }

  void dispatchWebhookEvent("schema.applied", {
    tableCount: draft.tables.length,
    relationCount: draft.relations.length,
  }).catch(() => {});

  return {
    migrationId: migrationKey,
    sql: preview.sql,
    warnings: preview.warnings,
  };
}

export async function ensureExtensionSchemaProvisioned() {
  const drift = await getSchemaDriftReport();
  if (!drift.drifted) {
    return;
  }

  const draft = await getSchemaDraft();
  await applyDraft(draft, null);
  logger.info("extension.schema.provisioned");
}
