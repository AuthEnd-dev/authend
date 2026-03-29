import { describe, expect, test } from 'bun:test';
import type { SchemaDraftInput } from '@authend/shared';

describe('schema-service', () => {
  test('renders generated schema indexes with array callback syntax', async () => {
    process.env.APP_URL ??= 'http://localhost:7002';
    process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/authend';
    process.env.BETTER_AUTH_SECRET ??= 'test-secret-value-with-24-chars';
    process.env.SUPERADMIN_EMAIL ??= 'admin@example.com';
    process.env.SUPERADMIN_PASSWORD ??= 'password123';

    const { schemaServiceTestUtils } = await import('./schema-service');

    const draft: SchemaDraftInput = {
      tables: [
        {
          name: 'release_notes',
          displayName: 'Release Notes',
          primaryKey: 'id',
          fields: [
            {
              name: 'id',
              type: 'uuid',
              nullable: false,
              unique: true,
              indexed: true,
              default: 'gen_random_uuid()',
            },
            {
              name: 'title',
              type: 'text',
              nullable: false,
              unique: false,
              indexed: true,
            },
            {
              name: 'status',
              type: 'text',
              nullable: false,
              unique: false,
              indexed: false,
            },
          ],
          indexes: [['title', 'status']],
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
            operations: {
              list: true,
              get: true,
              create: true,
              update: true,
              delete: true,
            },
            pagination: {
              enabled: true,
              defaultPageSize: 20,
              maxPageSize: 100,
            },
            filtering: {
              enabled: true,
              fields: [],
            },
            sorting: {
              enabled: true,
              fields: [],
              defaultOrder: 'desc',
            },
            includes: {
              enabled: true,
              fields: [],
            },
            hiddenFields: [],
            fieldVisibility: {},
          },
        },
      ],
      relations: [],
    };

    const rendered = schemaServiceTestUtils.renderSchemaModule(draft);
    expect(rendered).toContain('(table) => [');
    expect(rendered).toContain('index("release_notes_title_idx").on(table.title)');
    expect(rendered).toContain('index("release_notes_title_status_idx").on(table.title, table.status)');
    expect(rendered).not.toContain('(table) => ({');
  });

  test('plans create-table statements before alter-table statements that depend on them', async () => {
    process.env.APP_URL ??= 'http://localhost:7002';
    process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/authend';
    process.env.BETTER_AUTH_SECRET ??= 'test-secret-value-with-24-chars';
    process.env.SUPERADMIN_EMAIL ??= 'admin@example.com';
    process.env.SUPERADMIN_PASSWORD ??= 'password123';

    const { schemaServiceTestUtils } = await import('./schema-service');

    const current: SchemaDraftInput = {
      tables: [
        {
          name: 'approval_requests',
          displayName: 'Approval Requests',
          primaryKey: 'id',
          fields: [
            { name: 'id', type: 'text', nullable: false, unique: true, indexed: true },
            { name: 'title', type: 'text', nullable: false, unique: false, indexed: false },
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

    const draft: SchemaDraftInput = {
      tables: [
        {
          name: 'approval_requests',
          displayName: 'Approval Requests',
          primaryKey: 'id',
          fields: [
            { name: 'id', type: 'text', nullable: false, unique: true, indexed: true },
            {
              name: 'integrator_id',
              type: 'text',
              nullable: false,
              unique: false,
              indexed: true,
              references: {
                table: 'integrators',
                column: 'id',
                onDelete: 'cascade',
                onUpdate: 'cascade',
              },
            },
            { name: 'title', type: 'text', nullable: false, unique: false, indexed: false },
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
        {
          name: 'integrators',
          displayName: 'Integrators',
          primaryKey: 'id',
          fields: [
            { name: 'id', type: 'text', nullable: false, unique: true, indexed: true },
            { name: 'name', type: 'text', nullable: false, unique: false, indexed: false },
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

    const planned = schemaServiceTestUtils.buildPreviewStatements({
      current,
      draft,
      columns: [
        {
          tableName: 'approval_requests',
          columnName: 'id',
          dataType: 'text',
          udtName: 'text',
          isNullable: false,
          defaultValue: null,
          maxLength: null,
        },
        {
          tableName: 'approval_requests',
          columnName: 'title',
          dataType: 'text',
          udtName: 'text',
          isNullable: false,
          defaultValue: null,
          maxLength: null,
        },
      ],
      indexes: [],
      foreignKeys: [],
    });

    const createIntegratorIndex = planned.statements.findIndex((statement) =>
      statement.includes('create table if not exists "integrators"'),
    );
    const alterApprovalIndex = planned.statements.findIndex((statement) =>
      statement.includes('alter table "approval_requests" add column if not exists "integrator_id"'),
    );

    expect(createIntegratorIndex).toBeGreaterThanOrEqual(0);
    expect(alterApprovalIndex).toBeGreaterThanOrEqual(0);
    expect(createIntegratorIndex).toBeLessThan(alterApprovalIndex);
  });

  test('schema apply migration keys are stable for identical SQL content', async () => {
    process.env.APP_URL ??= 'http://localhost:7002';
    process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/authend';
    process.env.BETTER_AUTH_SECRET ??= 'test-secret-value-with-24-chars';
    process.env.SUPERADMIN_EMAIL ??= 'admin@example.com';
    process.env.SUPERADMIN_PASSWORD ??= 'password123';

    const { schemaServiceTestUtils } = await import('./schema-service');
    const sqlText = 'create table if not exists "notes" ("id" text primary key);';

    const first = schemaServiceTestUtils.migrationSqlKey('schema_apply', sqlText);
    const second = schemaServiceTestUtils.migrationSqlKey('schema_apply', `${sqlText}\n`);
    const different = schemaServiceTestUtils.migrationSqlKey('schema_apply', 'create table if not exists "tasks" ("id" text primary key);');

    expect(first).toBe(second);
    expect(first).toEndWith('_schema_apply');
    expect(different).not.toBe(first);
  });
});
