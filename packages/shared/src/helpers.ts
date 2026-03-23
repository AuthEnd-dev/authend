import type { FieldBlueprint, FieldType, SchemaDraft, TableBlueprint } from "./contracts";

const builtinRelationTables = new Set([
  "user",
  "session",
  "account",
  "verification",
  "plugin_configs",
  "migration_runs",
  "audit_logs",
]);

const reservedIdentifiers = new Set([
  "user",
  "session",
  "account",
  "verification",
  "plugin_configs",
  "migration_runs",
  "audit_logs",
  "system_admins",
  "schema_tables",
  "schema_fields",
  "schema_relations",
  "select",
  "table",
]);

export function assertSafeIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid identifier: ${value}`);
  }

  if (reservedIdentifiers.has(value)) {
    throw new Error(`Reserved identifier: ${value}`);
  }
}

function assertLooseIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid identifier: ${value}`);
  }
}

export function ensureFieldDefaults(field: FieldBlueprint): FieldBlueprint {
  return {
    ...field,
    nullable: field.nullable ?? false,
    unique: field.unique ?? false,
    indexed: field.indexed ?? false,
  };
}

export function validateDraft(draft: SchemaDraft) {
  const tableNames = new Set<string>();
  const routeSegments = new Set<string>([
    "user",
    "session",
    "account",
    "verification",
    "plugin_configs",
    "migration_runs",
    "audit_logs",
  ]);
  const sdkNames = new Set<string>([
    "user",
    "session",
    "account",
    "verification",
    "plugin_configs",
    "migration_runs",
    "audit_logs",
  ]);
  const tableFields = new Map<string, Set<string>>();
  const relationIncludesBySource = new Map<string, Set<string>>();

  for (const table of draft.tables) {
    assertSafeIdentifier(table.name);
    if (tableNames.has(table.name)) {
      throw new Error(`Duplicate table name: ${table.name}`);
    }
    tableNames.add(table.name);

    const routeSegment = table.api?.routeSegment ?? table.name;
    assertSafeIdentifier(routeSegment);
    if (routeSegments.has(routeSegment)) {
      throw new Error(`Duplicate API route segment: ${routeSegment}`);
    }
    routeSegments.add(routeSegment);

    const sdkName = table.api?.sdkName ?? table.name;
    assertSafeIdentifier(sdkName);
    if (sdkNames.has(sdkName)) {
      throw new Error(`Duplicate SDK resource name: ${sdkName}`);
    }
    sdkNames.add(sdkName);

    const fieldNames = new Set<string>();
    for (const rawField of table.fields) {
      const field = ensureFieldDefaults(rawField);
      assertSafeIdentifier(field.name);

      if (fieldNames.has(field.name)) {
        throw new Error(`Duplicate field ${field.name} on ${table.name}`);
      }

      if (field.type === "enum" && (!field.enumValues || field.enumValues.length === 0)) {
        throw new Error(`Enum field ${table.name}.${field.name} must define enumValues`);
      }

      fieldNames.add(field.name);
    }

    if (!fieldNames.has(table.primaryKey)) {
      throw new Error(`Primary key ${table.primaryKey} missing on ${table.name}`);
    }
    tableFields.set(table.name, fieldNames);

    const sortingFields = table.api?.sorting?.fields ?? [];
    for (const field of sortingFields) {
      if (!fieldNames.has(field)) {
        throw new Error(`Sorting field ${table.name}.${field} does not exist`);
      }
    }

    const defaultSortField = table.api?.sorting?.defaultField;
    if (defaultSortField && !fieldNames.has(defaultSortField)) {
      throw new Error(`Default sort field ${table.name}.${defaultSortField} does not exist`);
    }

    const filterFields = table.api?.filtering?.fields ?? [];
    for (const field of filterFields) {
      if (!fieldNames.has(field)) {
        throw new Error(`Filter field ${table.name}.${field} does not exist`);
      }
    }

    const ownershipField = table.api?.access?.ownershipField;
    if (ownershipField && !fieldNames.has(ownershipField)) {
      throw new Error(`Ownership field ${table.name}.${ownershipField} does not exist`);
    }

    const hiddenFields = table.api?.hiddenFields ?? [];
    for (const field of hiddenFields) {
      if (!fieldNames.has(field)) {
        throw new Error(`Hidden field ${table.name}.${field} does not exist`);
      }
    }
  }

  const aliasesBySource = new Map<string, Set<string>>();
  for (const relation of draft.relations) {
    if (!tableNames.has(relation.sourceTable)) {
      throw new Error(`Relation source table is unknown: ${relation.sourceTable}`);
    }

    if (!tableNames.has(relation.targetTable) && !builtinRelationTables.has(relation.targetTable)) {
      throw new Error(`Relation target table is unknown: ${relation.targetTable}`);
    }

    const sourceFields = tableFields.get(relation.sourceTable);
    if (!sourceFields?.has(relation.sourceField)) {
      throw new Error(`Relation source field ${relation.sourceTable}.${relation.sourceField} does not exist`);
    }

    if (tableNames.has(relation.targetTable)) {
      const targetFields = tableFields.get(relation.targetTable);
      if (!targetFields?.has(relation.targetField)) {
        throw new Error(`Relation target field ${relation.targetTable}.${relation.targetField} does not exist`);
      }
    }

    if (relation.alias) {
      assertLooseIdentifier(relation.alias);
      const aliases = aliasesBySource.get(relation.sourceTable) ?? new Set<string>();
      if (aliases.has(relation.alias)) {
        throw new Error(`Duplicate relation alias ${relation.sourceTable}.${relation.alias}`);
      }
      aliases.add(relation.alias);
      aliasesBySource.set(relation.sourceTable, aliases);
    }

    const includeNames = relationIncludesBySource.get(relation.sourceTable) ?? new Set<string>();
    includeNames.add(relation.alias ?? relation.sourceField);
    relationIncludesBySource.set(relation.sourceTable, includeNames);

    if (relation.sourceAlias) {
      assertLooseIdentifier(relation.sourceAlias);
    }

    if (relation.targetAlias) {
      assertLooseIdentifier(relation.targetAlias);
    }
  }

  for (const table of draft.tables) {
    const includeNames = new Set<string>(
      table.fields.filter((field) => field.references).map((field) => field.name),
    );
    for (const name of relationIncludesBySource.get(table.name) ?? []) {
      includeNames.add(name);
    }

    const includeFields = table.api?.includes?.fields ?? [];
    for (const field of includeFields) {
      if (!includeNames.has(field)) {
        throw new Error(`Include field ${table.name}.${field} is not a relation include`);
      }
    }
  }

  return draft;
}

export function sqlTypeForField(field: FieldBlueprint): string {
  const fieldType: Record<FieldType, string> = {
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
    enum: `${field.name}_enum`,
  };

  return fieldType[field.type];
}

export function defaultIdField(): FieldBlueprint {
  return {
    name: "id",
    type: "uuid",
    nullable: false,
    unique: true,
    indexed: true,
    default: "gen_random_uuid()",
  };
}

export function withDefaultId(table: TableBlueprint): TableBlueprint {
  if (table.fields.some((field) => field.name === table.primaryKey)) {
    return table;
  }

  return {
    ...table,
    fields: [defaultIdField(), ...table.fields],
  };
}
