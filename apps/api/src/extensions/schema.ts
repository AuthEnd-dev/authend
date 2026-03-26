import type { SchemaDraft } from '@authend/shared';
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
 */
export function getExtensionSchemaDraft(): SchemaDraft {
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
