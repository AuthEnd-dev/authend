import { describe, expect, test } from 'bun:test';
import { summarizeSchemaDraftReview } from './schema-draft-review';

describe('summarizeSchemaDraftReview', () => {
  test('flags dropped fields as destructive', () => {
    const current = {
      tables: [
        {
          name: 'posts',
          displayName: 'Posts',
          primaryKey: 'id',
          fields: [
            { name: 'id', type: 'uuid', nullable: false, unique: true, indexed: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false, unique: false, indexed: false },
            { name: 'body', type: 'text', nullable: true, unique: false, indexed: false },
          ],
          indexes: [],
          api: {
            authMode: 'superadmin',
            access: {
              ownershipField: null,
              list: { actors: ['superadmin'], scope: 'all' },
              get: { actors: ['superadmin'], scope: 'all' },
              create: { actors: ['superadmin'], scope: 'all' },
              update: { actors: ['superadmin'], scope: 'all' },
              delete: { actors: ['superadmin'], scope: 'all' },
            },
            operations: { list: true, get: true, create: true, update: true, delete: true },
            pagination: { enabled: true, defaultPageSize: 20, maxPageSize: 100 },
            filtering: { enabled: true, fields: [] },
            sorting: { enabled: true, fields: [], defaultOrder: 'desc' },
            includes: { enabled: true, fields: [] },
            hiddenFields: [],
            fieldVisibility: {},
          },
          hooks: [],
        },
      ],
      relations: [],
    };

    const next = {
      ...current,
      tables: [
        {
          ...current.tables[0],
          fields: current.tables[0].fields.filter((field) => field.name !== 'body'),
        },
      ],
    };

    const result = summarizeSchemaDraftReview(current, next);
    expect(result.level).toBe('destructive');
    expect(result.changes.some((change) => change.title.includes('Drop field posts.body'))).toBe(true);
  });

  test('flags API and relation additions as non-destructive changes', () => {
    const current = {
      tables: [],
      relations: [],
    };

    const next = {
      tables: [
        {
          name: 'profiles',
          displayName: 'Profiles',
          primaryKey: 'id',
          fields: [
            { name: 'id', type: 'uuid', nullable: false, unique: true, indexed: true, default: 'gen_random_uuid()' },
            { name: 'user_id', type: 'uuid', nullable: false, unique: false, indexed: true },
          ],
          indexes: [['user_id']],
          api: {
            authMode: 'session',
            access: {
              ownershipField: 'user_id',
              list: { actors: ['session'], scope: 'own' },
              get: { actors: ['session'], scope: 'own' },
              create: { actors: ['session'], scope: 'own' },
              update: { actors: ['session'], scope: 'own' },
              delete: { actors: ['session'], scope: 'own' },
            },
            operations: { list: true, get: true, create: true, update: true, delete: true },
            pagination: { enabled: true, defaultPageSize: 20, maxPageSize: 100 },
            filtering: { enabled: true, fields: [] },
            sorting: { enabled: true, fields: [], defaultOrder: 'desc' },
            includes: { enabled: true, fields: [] },
            hiddenFields: [],
            fieldVisibility: {},
          },
          hooks: [],
        },
      ],
      relations: [
        {
          sourceTable: 'profiles',
          sourceField: 'user_id',
          targetTable: 'user',
          targetField: 'id',
          joinType: 'left',
          onDelete: 'cascade',
          onUpdate: 'cascade',
          alias: 'owner',
        },
      ],
    };

    const result = summarizeSchemaDraftReview(current, next);
    expect(result.level).toBe('safe');
    expect(result.changes.some((change) => change.title.includes('Create table profiles'))).toBe(true);
    expect(result.changes.some((change) => change.title.includes('Add relation profiles.user_id'))).toBe(true);
  });
});
