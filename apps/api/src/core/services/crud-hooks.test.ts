import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { SchemaDraft, TableBlueprint } from '@authend/shared';
import postgres from 'postgres';

type SchemaModule = typeof import('./schema-service');
type CrudModule = typeof import('./crud-service');
type DbModule = typeof import('../db/client');
type MigrationModule = typeof import('./migration-service');

const sourceDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/authend';

const testDatabaseName = `authend_crud_hooks_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-z0-9_]/g, '_');
const databaseUrl = new URL(sourceDatabaseUrl);
const adminDatabaseUrl = new URL(sourceDatabaseUrl);
adminDatabaseUrl.pathname = '/postgres';
databaseUrl.pathname = `/${testDatabaseName}`;

function adminOnlyApiConfig(): TableBlueprint['api'] {
  return {
    authMode: 'superadmin' as const,
    access: {
      ownershipField: null,
      list: { actors: ['superadmin'], scope: 'all' as const },
      get: { actors: ['superadmin'], scope: 'all' as const },
      create: { actors: ['superadmin'], scope: 'all' as const },
      update: { actors: ['superadmin'], scope: 'all' as const },
      delete: { actors: ['superadmin'], scope: 'all' as const },
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
      fields: ['title'],
    },
    sorting: {
      enabled: true,
      fields: ['id', 'title'],
      defaultField: 'id',
      defaultOrder: 'desc' as const,
    },
    includes: {
      enabled: false,
      fields: [],
    },
    hiddenFields: [],
    fieldVisibility: {},
  };
}

function createTableBlueprint(name: string, hooks: SchemaDraft['tables'][number]['hooks']): TableBlueprint {
  return {
    name,
    displayName: name.replaceAll('_', ' '),
    primaryKey: 'id',
    fields: [
      {
        name: 'id',
        type: 'uuid' as const,
        nullable: false,
        unique: true,
        indexed: true,
        default: 'gen_random_uuid()',
      },
      {
        name: 'title',
        type: 'text' as const,
        nullable: false,
        unique: false,
        indexed: false,
      },
    ],
    indexes: [],
    api: adminOnlyApiConfig(),
    hooks,
  };
}

function callRelease(fn: (() => void) | null, message: string) {
  if (fn === null) {
    throw new Error(message);
  }

  fn();
}

if (process.env.AUTHEND_CRUD_HOOKS_SUBPROCESS !== '1') {
  test('CRUD hooks integration (subprocess)', () => {
    const command = spawnSync('bun', ['test', import.meta.path], {
      cwd: resolve(import.meta.dir, '../../../../..'),
      env: {
        ...process.env,
        AUTHEND_CRUD_HOOKS_SUBPROCESS: '1',
      },
      encoding: 'utf8',
      timeout: 40_000,
    });
    const output = `${command.stdout}\n${command.stderr}`;
    expect(command.status, output).toBe(0);
  }, 45_000);
} else {
  describe('crud-service table hooks', () => {
    let adminSql: ReturnType<typeof postgres>;
    let schemaModule: SchemaModule;
    let crudModule: CrudModule;
    let dbModule: DbModule;
    let migrationModule: MigrationModule;
    const originalFetch = globalThis.fetch;

    beforeAll(async () => {
      adminSql = postgres(adminDatabaseUrl.toString(), {
        prepare: false,
        max: 1,
      });

      await adminSql.unsafe(`create database "${testDatabaseName}"`);

      process.env.NODE_ENV = 'test';
      process.env.APP_URL = 'http://localhost:7002';
      process.env.ADMIN_URL = 'http://localhost:7001';
      process.env.ADMIN_DEV_URL = 'http://localhost:7001';
      process.env.CORS_ORIGIN = 'http://localhost:7002';
      process.env.DATABASE_URL = databaseUrl.toString();
      process.env.AUTHEND_GENERATED_SCHEMA_FILE = resolve(
        import.meta.dir,
        `../tests/generated/${testDatabaseName}/schema/generated.ts`,
      );
      process.env.AUTHEND_GENERATED_MIGRATIONS_DIR = resolve(
        import.meta.dir,
        `../tests/generated/${testDatabaseName}/migrations`,
      );
      process.env.BETTER_AUTH_SECRET = 'crud-hooks-test-secret-value-123456';
      process.env.SUPERADMIN_EMAIL = 'admin@authend.test';
      process.env.SUPERADMIN_PASSWORD = 'ChangeMe123!';

      [schemaModule, crudModule, dbModule, migrationModule] = await Promise.all([
        import(`./schema-service?crudhooks=${testDatabaseName}`),
        import(`./crud-service?crudhooks=${testDatabaseName}`),
        import(`../db/client?crudhooks=${testDatabaseName}`),
        import(`./migration-service?crudhooks=${testDatabaseName}`),
      ]);

      await migrationModule.ensureCoreSchema();

      const draft: SchemaDraft = {
        tables: [
          createTableBlueprint('hook_events', [
            {
              id: 'before-create',
              eventType: 'beforeCreate',
              type: 'webhook',
              url: 'https://hooks.test/before-create',
              blocking: true,
              enabled: true,
              config: {},
            },
            {
              id: 'after-create',
              eventType: 'afterCreate',
              type: 'webhook',
              url: 'https://hooks.test/after-create',
              blocking: true,
              enabled: true,
              config: {},
            },
            {
              id: 'before-update',
              eventType: 'beforeUpdate',
              type: 'webhook',
              url: 'https://hooks.test/before-update',
              blocking: true,
              enabled: true,
              config: {},
            },
            {
              id: 'after-update',
              eventType: 'afterUpdate',
              type: 'webhook',
              url: 'https://hooks.test/after-update',
              blocking: true,
              enabled: true,
              config: {},
            },
            {
              id: 'before-delete',
              eventType: 'beforeDelete',
              type: 'webhook',
              url: 'https://hooks.test/before-delete',
              blocking: true,
              enabled: true,
              config: {},
            },
            {
              id: 'after-delete',
              eventType: 'afterDelete',
              type: 'webhook',
              url: 'https://hooks.test/after-delete',
              blocking: true,
              enabled: true,
              config: {},
            },
          ]),
          createTableBlueprint('hook_before_failure', [
            {
              id: 'before-create-failure',
              eventType: 'beforeCreate',
              type: 'webhook',
              url: 'https://hooks.test/fail-before-create',
              blocking: true,
              enabled: true,
              config: {},
            },
          ]),
          createTableBlueprint('hook_after_blocking', [
            {
              id: 'after-create-blocking',
              eventType: 'afterCreate',
              type: 'webhook',
              url: 'https://hooks.test/block-after-create',
              blocking: true,
              enabled: true,
              config: {},
            },
          ]),
          createTableBlueprint('hook_after_background', [
            {
              id: 'after-create-background',
              eventType: 'afterCreate',
              type: 'webhook',
              url: 'https://hooks.test/background-after-create',
              blocking: false,
              enabled: true,
              config: {},
            },
          ]),
        ],
        relations: [],
      };

      await schemaModule.applyDraft(draft);
    });

    afterAll(async () => {
      globalThis.fetch = originalFetch;
      await dbModule.sql.end({ timeout: 0 });
      await adminSql.unsafe(`drop database if exists "${testDatabaseName}" with (force)`);
      await adminSql.end({ timeout: 0 });
    });

    async function countRows(table: string) {
      const [row] = await dbModule.sql.unsafe<{ count: string }[]>(`select count(*)::text as count from "${table}"`);
      return Number(row?.count ?? 0);
    }

    test('fires before and after hooks for create, update, and delete', async () => {
      const calls: Array<{ url: string; payload: Record<string, unknown> }> = [];
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          payload: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        });
        return new Response('ok', { status: 200 });
      }) as typeof fetch;

      const access = {
        actorKind: 'superadmin' as const,
        bypassOwnership: true,
      };

      const created = await crudModule.createRecord('hook_events', { title: 'first' }, { access });
      await crudModule.updateRecord('hook_events', String(created.id), { title: 'second' }, { access });
      await crudModule.deleteRecord('hook_events', String(created.id), { access });

      expect(calls.map((entry) => entry.url)).toEqual([
        'https://hooks.test/before-create',
        'https://hooks.test/after-create',
        'https://hooks.test/before-update',
        'https://hooks.test/after-update',
        'https://hooks.test/before-delete',
        'https://hooks.test/after-delete',
      ]);

      expect(calls[0]?.payload.eventType).toBe('beforeCreate');
      expect(calls[0]?.payload.table).toBe('hook_events');
      expect(calls[0]?.payload.data).toEqual({ title: 'first' });

      expect(calls[1]?.payload.eventType).toBe('afterCreate');
      expect(calls[1]?.payload.data).toMatchObject({ id: String(created.id), title: 'first' });

      expect(calls[2]?.payload.eventType).toBe('beforeUpdate');
      expect(calls[2]?.payload.data).toEqual({ id: String(created.id), data: { title: 'second' } });

      expect(calls[3]?.payload.eventType).toBe('afterUpdate');
      expect(calls[3]?.payload.data).toMatchObject({ id: String(created.id), title: 'second' });

      expect(calls[4]?.payload.eventType).toBe('beforeDelete');
      expect(calls[4]?.payload.data).toEqual({ id: String(created.id) });

      expect(calls[5]?.payload.eventType).toBe('afterDelete');
      expect(calls[5]?.payload.data).toMatchObject({ id: String(created.id), title: 'second' });
    });

    test('blocking before hooks abort the mutation when they fail', async () => {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        if (String(input) === 'https://hooks.test/fail-before-create') {
          return new Response('blocked', { status: 500 });
        }
        return new Response('ok', { status: 200 });
      }) as typeof fetch;

      const before = await countRows('hook_before_failure');

      await expect(
        crudModule.createRecord(
          'hook_before_failure',
          { title: 'should-not-persist' },
          {
            access: {
              actorKind: 'superadmin',
              bypassOwnership: true,
            },
          },
        ),
      ).rejects.toThrow('Hook before-create-failure failed: blocked');

      expect(await countRows('hook_before_failure')).toBe(before);
    });

    test('blocking after hooks wait, while non-blocking after hooks stay in the background', async () => {
      let releaseBlocking: (() => void) | null = null;
      let releaseBackground: (() => void) | null = null;
      let backgroundStarted = false;

      globalThis.fetch = ((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === 'https://hooks.test/block-after-create') {
          return new Promise<Response>((resolve) => {
            releaseBlocking = () => resolve(new Response('ok', { status: 200 }));
          });
        }
        if (url === 'https://hooks.test/background-after-create') {
          backgroundStarted = true;
          return new Promise<Response>((resolve) => {
            releaseBackground = () => resolve(new Response('ok', { status: 200 }));
          });
        }
        return Promise.resolve(new Response('ok', { status: 200 }));
      }) as typeof fetch;

      let blockingResolved = false;
      const blockingPromise = crudModule
        .createRecord(
          'hook_after_blocking',
          { title: 'blocking' },
          {
            access: {
              actorKind: 'superadmin',
              bypassOwnership: true,
            },
          },
        )
        .then(() => {
          blockingResolved = true;
        });

      await Bun.sleep(25);
      expect(blockingResolved).toBe(false);
      callRelease(releaseBlocking, 'Expected blocking hook to pause the mutation');
      await blockingPromise;

      await crudModule.createRecord(
        'hook_after_background',
        { title: 'background' },
        {
          access: {
            actorKind: 'superadmin',
            bypassOwnership: true,
          },
        },
      );

      expect(backgroundStarted).toBe(true);
      callRelease(releaseBackground, 'Expected background hook to start');
    });
  });
}
