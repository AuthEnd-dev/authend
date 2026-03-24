import type { z } from "zod";
import { schemaDraftSchema } from "./contracts";
import type {
  ApiAccessActor,
  ApiAccessScope,
  ApiPolicyActorPreview,
  FieldBlueprint,
  FieldType,
  SchemaDraft,
  TableApiConfig,
  TableApiAccess,
  TableApiPolicyPreset,
  TableBlueprint,
} from "./contracts";

/** Tables exposed as builtin data resources; relation targets may point here without being in the draft. */
const builtinRelationTables = new Set([
  "user",
  "session",
  "account",
  "verification",
  "plugin_configs",
  "migration_runs",
  "audit_logs",
  "system_settings",
  "backup_runs",
  "cron_jobs",
  "cron_runs",
  "ai_threads",
  "ai_messages",
  "ai_runs",
  "storage_files",
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

const operationKeys = ["list", "get", "create", "update", "delete"] as const;
const actorOrder: ApiAccessActor[] = ["public", "session", "apiKey", "superadmin"];
const sensitiveFieldPattern = /(email|token|secret|password|verification|private|internal|api_?key|key$)/i;
export const appFacingActors: ApiAccessActor[] = ["public", "session", "apiKey"];

export type TableApiPolicyWarning = {
  id: "publicWrite" | "publicSensitiveFilter" | "wideOpenIncludes";
  title: string;
  description: string;
};

export const tableApiPolicyPresets: Array<{
  id: TableApiPolicyPreset;
  label: string;
  description: string;
  ownershipRequired: boolean;
}> = [
  {
    id: "adminOnly",
    label: "Admin only",
    description: "Keep the table off app-facing traffic and reserve it for superadmin sessions.",
    ownershipRequired: false,
  },
  {
    id: "publicReadOnly",
    label: "Public read-only content",
    description: "Anyone can list and fetch records, but writes stay disabled.",
    ownershipRequired: false,
  },
  {
    id: "sessionPrivate",
    label: "Signed-in user private records",
    description: "Each signed-in user can manage only their own records.",
    ownershipRequired: true,
  },
  {
    id: "sessionReadAllWriteOwn",
    label: "User can read all but write own",
    description: "Signed-in users can browse records broadly while writes stay owner-scoped.",
    ownershipRequired: true,
  },
  {
    id: "apiKeyServer",
    label: "API-key server-to-server access",
    description: "Server callers use scoped API key permissions for every operation.",
    ownershipRequired: false,
  },
];

function sortedActors(actors: ApiAccessActor[]) {
  return Array.from(new Set(actors)).sort((left, right) => actorOrder.indexOf(left) - actorOrder.indexOf(right));
}

export function actorHasTableOperationAccess(access: TableApiAccess, actor: ApiAccessActor, operation: (typeof operationKeys)[number]) {
  return access[operation].actors.includes(actor);
}

export function fieldReadableByActor(
  field: string,
  actor: ApiAccessActor,
  config: Pick<TableApiConfig, "hiddenFields" | "fieldVisibility">,
) {
  if (config.hiddenFields.includes(field)) {
    return false;
  }

  const visibility = config.fieldVisibility[field];
  return !visibility || visibility.read.includes(actor);
}

export function fieldWritableByActor(
  field: string,
  actor: ApiAccessActor,
  operation: "create" | "update",
  config: Pick<TableApiConfig, "fieldVisibility">,
) {
  const visibility = config.fieldVisibility[field];
  return !visibility || visibility[operation].includes(actor);
}

export function buildActorPolicyPreview(
  actor: ApiAccessActor,
  fields: Pick<FieldBlueprint, "name">[],
  config: Pick<TableApiConfig, "access" | "operations" | "hiddenFields" | "fieldVisibility" | "filtering" | "sorting" | "includes">,
): ApiPolicyActorPreview {
  const canCreate = config.operations.create && actorHasTableOperationAccess(config.access, actor, "create");
  const canUpdate = config.operations.update && actorHasTableOperationAccess(config.access, actor, "update");
  const readableFields = fields
    .map((field) => field.name)
    .filter((field) => fieldReadableByActor(field, actor, config));
  const createFields = fields
    .map((field) => field.name)
    .filter((field) => field !== "id")
    .filter(() => canCreate)
    .filter((field) => fieldWritableByActor(field, actor, "create", config));
  const updateFields = fields
    .map((field) => field.name)
    .filter((field) => field !== "id")
    .filter(() => canUpdate)
    .filter((field) => fieldWritableByActor(field, actor, "update", config));

  return {
    actor,
    readableFields,
    createFields,
    updateFields,
    filterFields: config.filtering.enabled ? config.filtering.fields.filter((field) => readableFields.includes(field)) : [],
    sortFields: config.sorting.enabled ? config.sorting.fields.filter((field) => readableFields.includes(field)) : [],
    includeFields: config.includes.enabled ? config.includes.fields : [],
    operations: operationKeys.map((operation) => ({
      key: operation,
      enabled: config.operations[operation],
      allowed: config.operations[operation] && actorHasTableOperationAccess(config.access, actor, operation),
      scope: config.access[operation].scope,
    })),
  };
}

export function buildTablePolicyPreview(
  fields: Pick<FieldBlueprint, "name">[],
  config: Pick<TableApiConfig, "access" | "operations" | "hiddenFields" | "fieldVisibility" | "filtering" | "sorting" | "includes">,
) {
  return {
    actors: appFacingActors.map((actor) => buildActorPolicyPreview(actor, fields, config)),
  };
}

function operationAccess(actors: ApiAccessActor[], scope: ApiAccessScope) {
  return {
    actors: sortedActors(actors),
    scope,
  };
}

export function suggestOwnershipField(fieldNames: string[]) {
  return ["owner_id", "user_id", "author_id", "created_by", "created_by_id"].find((field) => fieldNames.includes(field)) ?? null;
}

export function buildTableApiAccessPreset(preset: TableApiPolicyPreset, ownershipField: string | null = null): TableApiAccess {
  switch (preset) {
    case "publicReadOnly":
      return {
        ownershipField: null,
        list: operationAccess(["public"], "all"),
        get: operationAccess(["public"], "all"),
        create: operationAccess([], "all"),
        update: operationAccess([], "all"),
        delete: operationAccess([], "all"),
      };
    case "sessionPrivate":
      return {
        ownershipField,
        list: operationAccess(["session"], "own"),
        get: operationAccess(["session"], "own"),
        create: operationAccess(["session"], "own"),
        update: operationAccess(["session"], "own"),
        delete: operationAccess(["session"], "own"),
      };
    case "sessionReadAllWriteOwn":
      return {
        ownershipField,
        list: operationAccess(["session"], "all"),
        get: operationAccess(["session"], "all"),
        create: operationAccess(["session"], "own"),
        update: operationAccess(["session"], "own"),
        delete: operationAccess(["session"], "own"),
      };
    case "apiKeyServer":
      return {
        ownershipField: null,
        list: operationAccess(["apiKey"], "all"),
        get: operationAccess(["apiKey"], "all"),
        create: operationAccess(["apiKey"], "all"),
        update: operationAccess(["apiKey"], "all"),
        delete: operationAccess(["apiKey"], "all"),
      };
    case "adminOnly":
    default:
      return {
        ownershipField: null,
        list: operationAccess([], "all"),
        get: operationAccess([], "all"),
        create: operationAccess([], "all"),
        update: operationAccess([], "all"),
        delete: operationAccess([], "all"),
      };
  }
}

function sameActors(left: ApiAccessActor[], right: ApiAccessActor[]) {
  const leftSorted = sortedActors(left.filter((actor) => actor !== "superadmin"));
  const rightSorted = sortedActors(right.filter((actor) => actor !== "superadmin"));
  return leftSorted.length === rightSorted.length && leftSorted.every((actor, index) => actor === rightSorted[index]);
}

function sameOperationAccess(
  access: TableApiAccess,
  expected: TableApiAccess,
  operation: (typeof operationKeys)[number],
) {
  return access[operation].scope === expected[operation].scope && sameActors(access[operation].actors, expected[operation].actors);
}

export function detectTableApiAccessPreset(access: TableApiAccess): TableApiPolicyPreset | "custom" {
  const ownershipField = access.ownershipField ?? null;
  return (
    tableApiPolicyPresets.find((preset) => {
      if (preset.ownershipRequired && !ownershipField) {
        return false;
      }

      const expected = buildTableApiAccessPreset(preset.id, ownershipField);
      return operationKeys.every((operation) => sameOperationAccess(access, expected, operation));
    })?.id ?? "custom"
  );
}

export function analyseTableApiPolicyWarnings(
  access: TableApiAccess,
  options: {
    filteringEnabled: boolean;
    filteringFields: string[];
    includesEnabled: boolean;
    includeFields: string[];
    hiddenFields?: string[];
  },
) {
  const warnings: TableApiPolicyWarning[] = [];
  const hiddenFields = new Set(options.hiddenFields ?? []);
  const publicReadEnabled = access.list.actors.includes("public") || access.get.actors.includes("public");
  const publicWriteOperations = operationKeys.filter(
    (operation) =>
      ["create", "update", "delete"].includes(operation) &&
      access[operation].actors.includes("public"),
  );

  if (publicWriteOperations.length > 0) {
    warnings.push({
      id: "publicWrite",
      title: "Public writes are enabled",
      description: `Unauthenticated callers can ${joinLabels(publicWriteOperations.map((operation) => operationLabel(operation).toLowerCase()))}. This is rarely safe outside tightly controlled ingest endpoints.`,
    });
  }

  if (publicReadEnabled && options.filteringEnabled) {
    const sensitiveFilters = options.filteringFields.filter((field) => sensitiveFieldPattern.test(field) && !hiddenFields.has(field));
    if (sensitiveFilters.length > 0) {
      warnings.push({
        id: "publicSensitiveFilter",
        title: "Public filtering targets sensitive fields",
        description: `Anonymous callers can probe ${joinLabels(sensitiveFilters)} through filtering. Restrict those fields or hide them from the public route.`,
      });
    }
  }

  if (publicReadEnabled && options.includesEnabled && options.includeFields.length > 0) {
    warnings.push({
      id: "wideOpenIncludes",
      title: "Public relation includes are enabled",
      description: `Anonymous callers can request ${joinLabels(options.includeFields)}. Included records now respect target-table access rules, but broad includes still expand response surface area.`,
    });
  }

  return warnings;
}

function operationLabel(operation: (typeof operationKeys)[number]) {
  switch (operation) {
    case "list":
      return "List";
    case "get":
      return "Get";
    case "create":
      return "Create";
    case "update":
      return "Update";
    default:
      return "Delete";
  }
}

function joinLabels(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

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

export function validateDraft(rawDraft: z.input<typeof schemaDraftSchema>): SchemaDraft {
  const draft = schemaDraftSchema.parse(rawDraft);
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

    if (hiddenFields.includes(table.primaryKey)) {
      throw new Error(`Primary key ${table.name}.${table.primaryKey} cannot be hidden`);
    }

    if (ownershipField && hiddenFields.includes(ownershipField)) {
      throw new Error(`Ownership field ${table.name}.${ownershipField} cannot be hidden`);
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
