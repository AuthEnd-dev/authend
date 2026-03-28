import type { SchemaDraftInput } from '@authend/shared';
import {
  belongsTo,
  defineExtensionSchema,
  idField,
  ref,
  sessionOwnedApi,
  table,
  textField,
  timestampField,
} from '../core/services/schema-helpers';

/**
 * Fork-owned schema definitions that should always be present in the metadata draft.
 * Add custom tables/relations here to keep upstream `core/` files merge-friendly.
 *
 * Relation aliases may use `snake_case` or `camelCase`, but must start with a lowercase letter.
 * Avoid spaces, dashes, and dots.
 */
export function getExtensionSchemaDraft(): SchemaDraftInput {
  return defineExtensionSchema({
    tables: [
      // Example starter table. Rename/remove this and add your own extension tables.
      table({
        name: 'project',
        displayName: 'Project',
        fields: [
          idField(),
          textField('name', { indexed: true }),
          textField('owner_user_id', {
            indexed: true,
            references: ref('user', 'id', { onDelete: 'cascade' }),
          }),
          timestampField('created_at', { defaultNow: true }),
        ],
        indexes: [['owner_user_id', 'created_at']],
        api: {
          ...sessionOwnedApi('owner_user_id'),
          filtering: { enabled: true, fields: ['name', 'owner_user_id'] },
          sorting: { enabled: true, fields: ['created_at', 'name'], defaultField: 'created_at', defaultOrder: 'desc' },
          includes: { enabled: true, fields: ['owner'] },
        },
        hooks: [],
      }),
    ],
    relations: [
      belongsTo({
        sourceTable: 'project',
        sourceField: 'owner_user_id',
        targetTable: 'user',
        alias: 'owner',
        sourceAlias: 'projects',
        targetAlias: 'owner',
        onDelete: 'cascade',
        description: 'Project owner relation.',
      }),
    ],
  });
}

/*
Example: add another fork-owned table and relation.

Uncomment and adapt this for your fork:

export function getExtensionSchemaDraft(): SchemaDraftInput {
  return defineExtensionSchema({
    tables: [
      table({
        name: "project",
        displayName: "Project",
        fields: [
          idField(),
          textField("name", { indexed: true }),
          textField("owner_user_id", {
            indexed: true,
            references: ref("user", "id", { onDelete: "cascade" }),
          }),
          timestampField("created_at", { defaultNow: true }),
        ],
        indexes: [["owner_user_id", "created_at"]],
        api: {
          ...sessionOwnedApi("owner_user_id"),
          filtering: { enabled: true, fields: ["name", "owner_user_id"] },
          sorting: { enabled: true, fields: ["created_at", "name"], defaultField: "created_at", defaultOrder: "desc" },
          includes: { enabled: true, fields: ["owner"] },
        },
        hooks: [],
      }),
      table({
        name: "note",
        displayName: "Note",
        fields: [
          idField(),
          textField("project_id", {
            indexed: true,
            references: ref("project", "id", { onDelete: "cascade" }),
          }),
          textField("body"),
          timestampField("created_at", { defaultNow: true }),
        ],
        indexes: [["project_id", "created_at"]],
        api: {
          authMode: "session",
          access: {
            ownershipField: null,
            list: { actors: ["session", "superadmin"], scope: "all" },
            get: { actors: ["session", "superadmin"], scope: "all" },
            create: { actors: ["session", "superadmin"], scope: "all" },
            update: { actors: ["session", "superadmin"], scope: "all" },
            delete: { actors: ["session", "superadmin"], scope: "all" },
          },
          operations: { list: true, get: true, create: true, update: true, delete: true },
          pagination: { enabled: true, defaultPageSize: 20, maxPageSize: 100 },
          filtering: { enabled: true, fields: ["project_id", "body"] },
          sorting: { enabled: true, fields: ["created_at"], defaultField: "created_at", defaultOrder: "desc" },
          includes: { enabled: true, fields: ["project"] },
          hiddenFields: [],
          fieldVisibility: {},
        },
        hooks: [],
      }),
    ],
    relations: [
      belongsTo({
        sourceTable: "project",
        sourceField: "owner_user_id",
        targetTable: "user",
        alias: "owner",
        sourceAlias: "projects",
        targetAlias: "owner",
        onDelete: "cascade",
        description: "Project owner relation.",
      }),
      belongsTo({
        sourceTable: "note",
        sourceField: "project_id",
        targetTable: "project",
        alias: "project",
        sourceAlias: "notes",
        targetAlias: "projectNotes",
        onDelete: "cascade",
        description: "Note belongs to project.",
      }),
    ],
  });
}

Notes:

- Keep fork-owned schema here instead of editing core schema files.
- Relation aliases may use `snake_case` or `camelCase`, but must start with a lowercase letter.
*/
