import { resolve } from "node:path";
import type { FieldBlueprint, SchemaDraft, TableBlueprint } from "@authend/shared";
import {
  assertSafeIdentifier,
  ensureFieldDefaults,
  validateDraft,
  withDefaultId,
} from "@authend/shared";
import { db, sql } from "../db/client";
import { schemaFields, schemaRelations, schemaTables } from "../db/schema/system";
import { HttpError } from "../lib/http";
import { writeTextFile } from "../lib/fs";
import { applySqlMigration, writeGeneratedMigration } from "./migration-service";
import { writeAuditLog } from "./audit-service";

const generatedSchemaFile = resolve(import.meta.dir, "../../generated/schema/generated.ts");

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
    enum: `text("${safe.name}")`,
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

function renderSchemaModule(draft: SchemaDraft) {
  const imports = `import { boolean, bigint, date, integer, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";`;

  const tables = draft.tables.map((table) => {
    const withId = withDefaultId(table);
    return `export const ${withId.name} = pgTable("${withId.name}", {
${withId.fields
  .map((field) => `  ${field.name}: ${drizzleColumn(field)},`)
  .join("\n")}
});`;
  });

  return `${imports}

${tables.join("\n\n")}

export const generatedSchema = {
${draft.tables.map((table) => `  ${table.name},`).join("\n")}
};
`;
}

function migrationSqlKey(prefix: string) {
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

export async function getSchemaDraft(): Promise<SchemaDraft> {
  const tables = await db.select().from(schemaTables);
  const fields = await db.select().from(schemaFields);
  const relations = await db.select().from(schemaRelations);

  return {
    tables: tables.map((table) => ({
      ...(table.definition as TableBlueprint),
      fields: fields
        .filter((field) => field.tableId === table.id)
        .map((field) => field.definition as FieldBlueprint),
    })),
    relations: relations.map((relation) => relation.definition as SchemaDraft["relations"][number]),
  };
}

export async function previewDraft(rawDraft: SchemaDraft) {
  const draft = validateDraft(rawDraft);
  const current = await getSchemaDraft();
  const currentByName = new Map(current.tables.map((table) => [table.name, table]));
  const nextByName = new Map(draft.tables.map((table) => [table.name, withDefaultId(table)]));
  const statements: string[] = [];
  const warnings: string[] = [];

  for (const table of current.tables) {
    if (!nextByName.has(table.name)) {
      statements.push(`drop table if exists "${table.name}" cascade;`);
    }
  }

  for (const table of draft.tables.map(withDefaultId)) {
    if (!currentByName.has(table.name)) {
      statements.push(...buildCreateTableSql(table));
      continue;
    }

    const alteration = buildAlterSql(currentByName.get(table.name)!, table);
    statements.push(...alteration.statements);
    warnings.push(...alteration.warnings);
  }

  for (const relation of draft.relations) {
    assertSafeIdentifier(relation.sourceTable);
    assertSqlIdentifier(relation.sourceField);
    assertSqlIdentifier(relation.targetTable);
    assertSqlIdentifier(relation.targetField);
    const constraintName = `${relation.sourceTable}_${relation.sourceField}_${relation.targetTable}_fk`;
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

  return { sql: statements, warnings };
}

async function replaceMetadata(draft: SchemaDraft) {
  await sql.begin(async (transaction) => {
    await transaction`delete from schema_relations`;
    await transaction`delete from schema_fields`;
    await transaction`delete from schema_tables`;

    for (const table of draft.tables.map(withDefaultId)) {
      const tableId = crypto.randomUUID();
      await transaction`
        insert into schema_tables (id, table_name, display_name, primary_key, definition, created_at, updated_at)
        values (${tableId}, ${table.name}, ${table.displayName}, ${table.primaryKey}, ${JSON.stringify(table)}::jsonb, now(), now())
      `;

      for (const field of table.fields) {
        await transaction`
          insert into schema_fields (id, table_id, field_name, definition, created_at)
          values (${crypto.randomUUID()}, ${tableId}, ${field.name}, ${JSON.stringify(field)}::jsonb, now())
        `;
      }
    }

    for (const relation of draft.relations) {
      await transaction`
        insert into schema_relations (id, source_table, source_field, target_table, target_field, on_delete, on_update, definition, created_at)
        values (
          ${crypto.randomUUID()},
          ${relation.sourceTable},
          ${relation.sourceField},
          ${relation.targetTable},
          ${relation.targetField},
          ${relation.onDelete},
          ${relation.onUpdate},
          ${JSON.stringify(relation)}::jsonb,
          now()
        )
      `;
    }
  });
}

export async function applyDraft(rawDraft: SchemaDraft, actorUserId?: string | null) {
  const draft = validateDraft(rawDraft);
  const preview = await previewDraft(draft);
  const migrationKey = migrationSqlKey("schema_apply");
  const sqlText = preview.sql.join("\n\n");

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
    payload: { tableCount: draft.tables.length, relationCount: draft.relations.length },
  });

  return {
    migrationId: migrationKey,
    sql: preview.sql,
    warnings: preview.warnings,
  };
}
