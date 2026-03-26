import type {
  FieldBlueprint,
  RelationBlueprint,
  RelationJoinType,
  SchemaDraft,
  TableBlueprint,
  TableApiConfig,
} from "@authend/shared";

type FieldBase = Omit<FieldBlueprint, "name" | "type">;

/**
 * Creates a conventional text primary-key field.
 *
 * @param name Column name. Defaults to `id`.
 * @returns A `FieldBlueprint` configured as a non-null, unique, indexed text field.
 */
export function idField(name = "id"): FieldBlueprint {
  return {
    name,
    type: "text",
    nullable: false,
    unique: true,
    indexed: true,
  };
}

/**
 * Creates a `text` field with sensible defaults.
 *
 * @param name Column name.
 * @param input Optional field overrides (nullable/default/unique/indexed/references).
 * @returns A `FieldBlueprint` with type `text`.
 */
export function textField(name: string, input: Partial<FieldBase> = {}): FieldBlueprint {
  return {
    name,
    type: "text",
    nullable: input.nullable ?? false,
    default: input.default,
    unique: input.unique ?? false,
    indexed: input.indexed ?? false,
    references: input.references,
  };
}

/**
 * Creates a `timestamp` field.
 *
 * @param name Column name.
 * @param input Optional field overrides plus `defaultNow`.
 * If `defaultNow` is true, default is set to `now()`.
 * @returns A `FieldBlueprint` with type `timestamp`.
 */
export function timestampField(
  name: string,
  input: Partial<FieldBase> & { defaultNow?: boolean } = {},
): FieldBlueprint {
  return {
    name,
    type: "timestamp",
    nullable: input.nullable ?? false,
    default: input.defaultNow ? "now()" : input.default,
    unique: input.unique ?? false,
    indexed: input.indexed ?? false,
    references: input.references,
  };
}

/**
 * Creates a foreign-key reference descriptor for a field.
 *
 * @param table Referenced table name.
 * @param column Referenced column name.
 * @param input Optional `onDelete`/`onUpdate` actions.
 * @returns A relation reference object suitable for `FieldBlueprint.references`.
 */
export function ref(
  table: string,
  column: string,
  input: {
    onDelete?: "no action" | "restrict" | "cascade" | "set null";
    onUpdate?: "no action" | "restrict" | "cascade" | "set null";
  } = {},
) {
  return {
    table,
    column,
    onDelete: input.onDelete ?? "no action",
    onUpdate: input.onUpdate ?? "no action",
  } as const;
}

/**
 * Returns a standard API policy for session-owned resources.
 *
 * @param ownerField Field used to scope `own` access for session actors.
 * @returns A `TableApiConfig` with session/superadmin own-scope CRUD defaults.
 */
export function sessionOwnedApi(ownerField: string): TableApiConfig {
  return {
    authMode: "session",
    access: {
      ownershipField: ownerField,
      list: { actors: ["session", "superadmin"], scope: "own" },
      get: { actors: ["session", "superadmin"], scope: "own" },
      create: { actors: ["session", "superadmin"], scope: "own" },
      update: { actors: ["session", "superadmin"], scope: "own" },
      delete: { actors: ["session", "superadmin"], scope: "own" },
    },
    operations: { list: true, get: true, create: true, update: true, delete: true },
    pagination: { enabled: true, defaultPageSize: 20, maxPageSize: 100 },
    filtering: { enabled: true, fields: [] },
    sorting: { enabled: true, fields: [], defaultOrder: "desc" },
    includes: { enabled: true, fields: [] },
    hiddenFields: [],
    fieldVisibility: {},
  };
}

/**
 * Creates a table definition with defaults for optional shape.
 *
 * - `primaryKey` defaults to `id`
 * - `indexes` defaults to `[]`
 * - `api` defaults to `sessionOwnedApi("id")`
 *
 * @param input Table blueprint input.
 * @returns A fully shaped `TableBlueprint`.
 */
export function table(
  input: Omit<TableBlueprint, "primaryKey" | "indexes" | "api"> &
    Partial<Pick<TableBlueprint, "primaryKey" | "indexes" | "api">>,
): TableBlueprint {
  return {
    ...input,
    primaryKey: input.primaryKey ?? "id",
    indexes: input.indexes ?? [],
    api: input.api ?? sessionOwnedApi("id"),
  };
}

/**
 * Creates a relation from a source table field to a target table field.
 *
 * @param input Relation properties.
 * @returns A `RelationBlueprint` defaulting to `targetField: "id"` and `joinType: "left"`.
 */
export function belongsTo(input: {
  sourceTable: string;
  sourceField: string;
  targetTable: string;
  targetField?: string;
  alias?: string;
  sourceAlias?: string;
  targetAlias?: string;
  joinType?: RelationJoinType;
  onDelete?: "no action" | "restrict" | "cascade" | "set null";
  onUpdate?: "no action" | "restrict" | "cascade" | "set null";
  description?: string;
}): RelationBlueprint {
  return {
    sourceTable: input.sourceTable,
    sourceField: input.sourceField,
    targetTable: input.targetTable,
    targetField: input.targetField ?? "id",
    alias: input.alias,
    sourceAlias: input.sourceAlias,
    targetAlias: input.targetAlias,
    joinType: input.joinType ?? "left",
    onDelete: input.onDelete ?? "no action",
    onUpdate: input.onUpdate ?? "no action",
    description: input.description,
  };
}

/**
 * Helper wrapper that provides a strongly typed, readable entrypoint
 * for extension-owned schema definitions.
 *
 * @param input Extension schema draft.
 * @returns The same validated-at-call-site draft object.
 */
export function defineExtensionSchema(input: SchemaDraft): SchemaDraft {
  return input;
}
