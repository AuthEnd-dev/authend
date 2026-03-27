import type {
  ApiAccessActor,
  ApiFieldAccess,
  ApiPaginationConfig,
  ApiSortingConfig,
  FieldBlueprint,
  TableApiConfig,
  TableDescriptor,
  TableHook,
  TableHookEventType,
} from '@authend/shared';
import { getSchemaDraft } from './schema-service';
import { HttpError } from '../lib/http';
import { logger } from '../lib/logger';
import { sql } from '../db/client';
import { listPluginCapabilityManifests } from './plugin-service';
import { dispatchWebhookEvent } from './webhook-service';
import { executeAutomationRecipe } from './automation-service';
import crypto from 'crypto';

export type DataMutationPayload =
  | { kind: 'created'; table: string; id: string }
  | { kind: 'updated'; table: string; id: string }
  | { kind: 'deleted'; table: string; id: string; rawRecord: Record<string, unknown> };

type DataRecord = Record<string, unknown>;

let dataMutationSubscriber: ((payload: DataMutationPayload) => void) | null = null;

export function setDataMutationSubscriber(fn: typeof dataMutationSubscriber) {
  dataMutationSubscriber = fn;
}

function emitDataMutationIfConfigured(payload: DataMutationPayload) {
  queueMicrotask(() => {
    try {
      dataMutationSubscriber?.(payload);
    } catch (error) {
      logger.error('data.mutation.subscriber.failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Dispatch outbound webhook event
  queueMicrotask(() => {
    const eventType =
      payload.kind === 'created'
        ? ('data.record.created' as const)
        : payload.kind === 'updated'
          ? ('data.record.updated' as const)
          : ('data.record.deleted' as const);

    void dispatchWebhookEvent(eventType, {
      table: payload.table,
      id: payload.id,
    }).catch((error) => {
      logger.error('webhook.dispatch.failed', {
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

async function executeTableHooks(hooks: TableHook[], eventType: TableHookEventType, table: string, data: any) {
  const activeHooks = hooks.filter((h) => h.enabled && h.eventType === eventType);
  if (activeHooks.length === 0) return;

  for (const hook of activeHooks) {
    try {
      if (hook.type === 'webhook') {
        const response = await fetch(hook.url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType, table, data }),
        });

        if (!response.ok && hook.blocking) {
          const text = await response.text();
          throw new HttpError(response.status, `Hook ${hook.id} failed: ${text}`);
        }
      } else if (hook.type === 'recipe') {
        await executeAutomationRecipe(hook.recipeId!, { eventType, table, data }, hook.config);
      }
    } catch (error) {
      logger.error('table.hook.failed', {
        hookId: hook.id,
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
      if (hook.blocking) throw error;
    }
  }
}

async function executeAfterMutationHooks(
  hooks: TableHook[],
  eventType: Extract<TableHookEventType, 'afterCreate' | 'afterUpdate' | 'afterDelete'>,
  table: string,
  data: any,
) {
  const blockingHooks = hooks.filter((hook) => hook.enabled && hook.blocking && hook.eventType === eventType);
  const nonBlockingHooks = hooks.filter((hook) => hook.enabled && !hook.blocking && hook.eventType === eventType);

  if (blockingHooks.length > 0) {
    await executeTableHooks(blockingHooks, eventType, table, data);
  }

  if (nonBlockingHooks.length > 0) {
    void executeTableHooks(nonBlockingHooks, eventType, table, data).catch(() => {});
  }
}

type BuiltinTableExposurePolicy = {
  visibleInDataApi: boolean;
  redactedFields: string[];
};

const builtinTables: Record<string, TableDescriptor> = {
  user: {
    table: 'user',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'name', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'email', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'username', type: 'text', nullable: true, unique: true, indexed: true },
      { name: 'email_verified', type: 'boolean', nullable: false, unique: false, indexed: false },
      { name: 'role', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'banned', type: 'boolean', nullable: false, unique: false, indexed: false },
      { name: 'two_factor_enabled', type: 'boolean', nullable: false, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  session: {
    table: 'session',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'user_id', type: 'text', nullable: false, unique: false, indexed: true },
      { name: 'expires_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'ip_address', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'user_agent', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'active_organization_id', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'active_team_id', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'impersonated_by', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  account: {
    table: 'account',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'user_id', type: 'text', nullable: false, unique: false, indexed: true },
      { name: 'account_id', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'provider_id', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'access_token_expires_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
      { name: 'refresh_token_expires_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
      { name: 'scope', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  verification: {
    table: 'verification',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'identifier', type: 'text', nullable: false, unique: false, indexed: true },
      { name: 'expires_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _plugin_configs: {
    table: '_plugin_configs',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'plugin_id', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'enabled', type: 'boolean', nullable: false, unique: false, indexed: false },
      { name: 'version', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'config', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'capability_state', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'dependency_state', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'health', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'provisioning_state', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'extension_bindings', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _migration_runs: {
    table: '_migration_runs',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'migration_key', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'title', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'status', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'applied_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _audit_logs: {
    table: '_audit_logs',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'action', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'actor_user_id', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'target', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'payload', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _system_settings: {
    table: '_system_settings',
    primaryKey: 'key',
    fields: [
      { name: 'key', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'value', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _backup_runs: {
    table: '_backup_runs',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'status', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'trigger', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'destination', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'file_path', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'size_bytes', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'details', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'error', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'started_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'completed_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _cron_jobs: {
    table: '_cron_jobs',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'name', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'description', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'handler', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'schedule', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'enabled', type: 'boolean', nullable: false, unique: false, indexed: false },
      { name: 'timeout_seconds', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'concurrency_policy', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'config', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'last_run_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
      { name: 'next_run_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _cron_runs: {
    table: '_cron_runs',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'job_id', type: 'text', nullable: false, unique: false, indexed: true },
      { name: 'status', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'trigger', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'output', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'error', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'started_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'completed_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
      { name: 'duration_ms', type: 'text', nullable: true, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _ai_threads: {
    table: '_ai_threads',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'title', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'actor_user_id', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _ai_messages: {
    table: '_ai_messages',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'thread_id', type: 'text', nullable: false, unique: false, indexed: true },
      { name: 'role', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'content', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'context', type: 'jsonb', nullable: true, unique: false, indexed: false },
      { name: 'run_id', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _ai_runs: {
    table: '_ai_runs',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'thread_id', type: 'text', nullable: false, unique: false, indexed: true },
      { name: 'user_message_id', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'assistant_message_id', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'status', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'summary', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'rationale', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'action_batch', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'previews', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'results', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'error', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'actor_user_id', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'approved_by_user_id', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'approved_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
      { name: 'completed_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _storage_files: {
    table: '_storage_files',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'object_key', type: 'text', nullable: false, unique: true, indexed: true },
      { name: 'visibility', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'driver', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'size_bytes', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'mime_type', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'public_url', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'attachment_table', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'attachment_record_id', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'attachment_field', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _webhooks: {
    table: '_webhooks',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'url', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'description', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'secret', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'events', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'enabled', type: 'boolean', nullable: false, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
      { name: 'updated_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
  _webhook_deliveries: {
    table: '_webhook_deliveries',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'text', nullable: false, unique: true, indexed: false },
      { name: 'webhook_id', type: 'text', nullable: false, unique: false, indexed: true },
      { name: 'event_type', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'payload', type: 'jsonb', nullable: false, unique: false, indexed: false },
      { name: 'status', type: 'text', nullable: false, unique: false, indexed: false },
      { name: 'attempt_count', type: 'integer', nullable: false, unique: false, indexed: false },
      { name: 'next_attempt_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
      { name: 'http_status', type: 'integer', nullable: true, unique: false, indexed: false },
      { name: 'response', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'last_error', type: 'text', nullable: true, unique: false, indexed: false },
      { name: 'delivered_at', type: 'timestamp', nullable: true, unique: false, indexed: false },
      { name: 'created_at', type: 'timestamp', nullable: false, unique: false, indexed: false },
    ],
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  },
};

const defaultBuiltinTableExposurePolicy: BuiltinTableExposurePolicy = {
  visibleInDataApi: false,
  redactedFields: [],
};

const builtinTableExposurePolicies: Partial<Record<keyof typeof builtinTables, BuiltinTableExposurePolicy>> = {
  user: {
    visibleInDataApi: true,
    redactedFields: [],
  },
  session: {
    visibleInDataApi: true,
    redactedFields: ['ip_address', 'user_agent', 'impersonated_by'],
  },
  _storage_files: {
    visibleInDataApi: true,
    redactedFields: [],
  },
  _webhooks: {
    visibleInDataApi: true,
    redactedFields: ['secret'],
  },
  _webhook_deliveries: {
    visibleInDataApi: true,
    redactedFields: [],
  },
};

function builtinTableExposurePolicy(table: string): BuiltinTableExposurePolicy {
  if (!(table in builtinTables)) {
    return defaultBuiltinTableExposurePolicy;
  }

  return builtinTableExposurePolicies[table as keyof typeof builtinTables] ?? defaultBuiltinTableExposurePolicy;
}

function assertDataApiReadable(resource: { descriptor: TableDescriptor }, access?: RecordAccessContext) {
  if (access?.actorKind === 'superadmin') {
    return;
  }

  if (resource.descriptor.source === 'builtin' && !builtinTableExposurePolicy(resource.descriptor.table).visibleInDataApi) {
    throw new HttpError(403, `Table ${resource.descriptor.table} is not exposed through the data API`);
  }
}

function selectColumnsSql(descriptor: TableDescriptor) {
  return descriptor.fields.map((field) => quoteIdentifier(field.name)).join(', ');
}

function fieldRuleAllowsActor(ruleActors: ApiAccessActor[] | undefined, actorKind: ApiAccessActor) {
  if (actorKind === 'superadmin') {
    return true;
  }

  if (!ruleActors) {
    return true;
  }

  return ruleActors.includes('public') || ruleActors.includes(actorKind);
}

function hiddenFieldSetForActor(
  descriptor: TableDescriptor,
  config?: TableApiConfig | null,
  actorKind: ApiAccessActor = 'public',
) {
  const hiddenFields = new Set([
    ...(config?.hiddenFields ?? []),
    ...(descriptor.source === 'builtin' ? builtinTableExposurePolicy(descriptor.table).redactedFields : []),
  ]);

  for (const field of descriptor.fields) {
    if (!fieldRuleAllowsActor(config?.fieldVisibility?.[field.name]?.read, actorKind)) {
      hiddenFields.add(field.name);
    }
  }

  return hiddenFields;
}

function assertWritableDescriptor(descriptor: TableDescriptor, access?: RecordAccessContext) {
  if (access?.actorKind === 'superadmin') {
    return;
  }

  if (descriptor.source !== 'generated') {
    throw new HttpError(403, `Table ${descriptor.table} is read-only`);
  }
}

async function listExistingDatabaseTables() {
  const rows = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = current_schema()
      and table_type = 'BASE TABLE'
  `;

  return new Set(rows.map((row) => row.table_name));
}

type LiveColumnInfo = {
  columnName: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
};

type LivePrimaryKeyInfo = {
  primaryKey: string | null;
};

type LiveIndexColumnInfo = {
  columnName: string;
  unique: boolean;
};

type LiveEnumValueInfo = {
  enumLabel: string;
};

async function introspectTableDescriptor(tableName: string): Promise<TableDescriptor> {
  const columns = await sql<LiveColumnInfo[]>`
    select
      column_name as "columnName",
      data_type as "dataType",
      udt_name as "udtName",
      is_nullable = 'YES' as "isNullable"
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = ${tableName}
    order by ordinal_position
  `;

  if (columns.length === 0) {
    throw new HttpError(404, `Unknown table ${tableName}`);
  }

  const [{ primaryKey } = { primaryKey: null }] = await sql<LivePrimaryKeyInfo[]>`
    select a.attname as "primaryKey"
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
    where n.nspname = current_schema()
      and t.relname = ${tableName}
      and i.indisprimary
    limit 1
  `;

  const indexColumns = await sql<LiveIndexColumnInfo[]>`
    select
      a.attname as "columnName",
      ix.indisunique as "unique"
    from pg_class t
    join pg_namespace n on n.oid = t.relnamespace
    join pg_index ix on ix.indrelid = t.oid
    join lateral unnest(ix.indkey) with ordinality as cols(attnum, ordinality) on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = cols.attnum
    where n.nspname = current_schema()
      and t.relname = ${tableName}
  `;

  const indexedSet = new Set(indexColumns.map((entry) => entry.columnName));
  const uniqueSet = new Set(indexColumns.filter((entry) => entry.unique).map((entry) => entry.columnName));

  const primaryKeyField =
    primaryKey && columns.some((col) => col.columnName === primaryKey) ? primaryKey : (columns[0]?.columnName ?? 'id');

  const fields: FieldBlueprint[] = [];
  for (const column of columns) {
    let type: FieldBlueprint['type'] = 'text';
    let enumValues: string[] | undefined;

    switch (column.dataType) {
      case 'text':
        type = 'text';
        break;
      case 'character varying':
        type = 'varchar';
        break;
      case 'integer':
        type = 'integer';
        break;
      case 'bigint':
        type = 'bigint';
        break;
      case 'boolean':
        type = 'boolean';
        break;
      case 'timestamp with time zone':
      case 'timestamp without time zone':
        type = 'timestamp';
        break;
      case 'date':
        type = 'date';
        break;
      case 'jsonb':
      case 'json':
        type = 'jsonb';
        break;
      case 'uuid':
        type = 'uuid';
        break;
      case 'numeric':
        type = 'numeric';
        break;
      case 'USER-DEFINED': {
        // Treat user-defined types as enums when possible.
        const values = await sql<LiveEnumValueInfo[]>`
          select e.enumlabel as "enumLabel"
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          where t.typname = ${column.udtName}
          order by e.enumsortorder
        `;
        if (values.length > 0) {
          type = 'enum';
          enumValues = values.map((row) => row.enumLabel);
        } else {
          type = 'text';
        }
        break;
      }
      default:
        type = 'text';
        break;
    }

    fields.push({
      name: column.columnName,
      type,
      nullable: column.columnName === primaryKeyField ? false : column.isNullable,
      unique: uniqueSet.has(column.columnName),
      indexed: indexedSet.has(column.columnName),
      enumValues,
    });
  }

  return {
    table: tableName,
    primaryKey: primaryKeyField,
    fields,
    source: 'builtin',
    mutableSchema: false,
    ownerPluginId: null,
    hooks: [],
  };
}

async function resolveTableResource(tableInput: string) {
  if (builtinTables[tableInput]) {
    const existingTables = await listExistingDatabaseTables();
    if (!existingTables.has(builtinTables[tableInput].table)) {
      throw new HttpError(404, `Unknown table ${tableInput}`);
    }

    return {
      descriptor: builtinTables[tableInput],
      config: null,
    };
  }

  const pluginManifests = await listPluginCapabilityManifests();
  const pluginModel = pluginManifests
    .filter((manifest) => manifest.installState.enabled)
    .flatMap((manifest) => manifest.models.map((model) => ({ manifest, model })))
    .find(({ model }) => model.provisioned && (model.tableName === tableInput || model.key === tableInput));

  if (pluginModel) {
    if (pluginModel.model.fields.length === 0) {
      throw new HttpError(404, `Unknown table ${tableInput}`);
    }

    return {
      descriptor: {
        table: pluginModel.model.tableName,
        primaryKey: pluginModel.model.primaryKey,
        fields: pluginModel.model.fields,
        source: 'plugin' as const,
        mutableSchema: false,
        ownerPluginId: pluginModel.manifest.id,
        hooks: [],
      },
      config: null,
    };
  }

  const draft = await getSchemaDraft();
  const current = draft.tables.find(
    (entry) => entry.name === tableInput || (entry.api?.routeSegment ?? entry.name) === tableInput,
  );
  if (!current) {
    const existingTables = await listExistingDatabaseTables();
    if (existingTables.has(tableInput)) {
      return {
        descriptor: await introspectTableDescriptor(tableInput),
        config: null,
      };
    }
    throw new HttpError(404, `Unknown table ${tableInput}`);
  }

  return {
    descriptor: {
      table: current.name,
      primaryKey: current.primaryKey,
      fields: current.fields,
      source: 'generated' as const,
      mutableSchema: true,
      ownerPluginId: null,
      hooks: current.hooks || [],
    },
    config: current.api ?? null,
  };
}

function quoteIdentifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new HttpError(400, `Unsafe identifier ${value}`);
  }
  return `"${value}"`;
}

function quoteQualifiedIdentifier(table: string, column: string) {
  return `${quoteIdentifier(table)}.${quoteIdentifier(column)}`;
}

function descriptorPagination(config?: TableApiConfig | null): ApiPaginationConfig {
  return (
    config?.pagination ?? {
      enabled: true,
      defaultPageSize: 20,
      maxPageSize: 100,
    }
  );
}

export async function getTableDescriptor(table: string): Promise<TableDescriptor> {
  const resource = await resolveTableResource(table);
  return {
    ...resource.descriptor,
    pagination: descriptorPagination(resource.config),
  };
}

export async function getClientTableDescriptor(table: string, access?: RecordAccessContext): Promise<TableDescriptor> {
  const resource = await resolveTableResource(table);
  assertDataApiReadable(resource, access);
  return {
    ...resource.descriptor,
    fields: resource.descriptor.fields.filter(
      (field) => !hiddenFieldSetForActor(resource.descriptor, resource.config, access?.actorKind ?? 'public').has(field.name),
    ),
    pagination: descriptorPagination(resource.config),
  };
}

function unsafeParams(values: readonly unknown[]) {
  return values as never[];
}

function sanitiseRecord(record: Record<string, unknown>, hiddenFields: Set<string>) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !hiddenFields.has(key)));
}

async function sanitiseRecordForTable(
  table: string,
  record: Record<string, unknown>,
  access?: RecordAccessContext,
  cache = new Map<string, Set<string>>(),
) {
  let hiddenFields = cache.get(table);
  if (!hiddenFields) {
    const resource = await resolveTableResource(table);
    hiddenFields = hiddenFieldSetForActor(resource.descriptor, resource.config, access?.actorKind ?? 'public');
    cache.set(table, hiddenFields);
  }
  return sanitiseRecord(record, hiddenFields);
}

function serialiseValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return value;
}

function placeholderForField(field: FieldBlueprint, index: number) {
  if (field.type === 'jsonb') {
    return `cast($${index} as jsonb)`;
  }

  if (field.type === 'uuid') {
    return `cast($${index} as uuid)`;
  }

  if (field.type === 'numeric') {
    return `cast($${index} as numeric)`;
  }

  if (field.type === 'integer') {
    return `cast($${index} as integer)`;
  }

  if (field.type === 'bigint') {
    return `cast($${index} as bigint)`;
  }

  if (field.type === 'boolean') {
    return `cast($${index} as boolean)`;
  }

  return `$${index}`;
}

type IncludeRelation = {
  includeKey: string;
  resultKey: string;
  sourceField: string;
  targetTable: string;
  targetField: string;
  joinType: 'inner' | 'left' | 'right' | 'full';
};

export type RecordAccessContext = {
  actorKind?: ApiAccessActor;
  ownershipField?: string | null;
  subjectId?: string | null;
  bypassOwnership?: boolean;
  permissions?: ReadonlySet<string>;
};

export type ListRecordsOptions = {
  pagination?: ApiPaginationConfig;
  filtering?: ApiFieldAccess;
  sorting?: ApiSortingConfig;
  includes?: ApiFieldAccess;
  access?: RecordAccessContext;
};

export type MutationRecordOptions = {
  access?: RecordAccessContext;
};

function fieldIsWritable(
  fieldName: string,
  descriptor: TableDescriptor,
  config: TableApiConfig | null | undefined,
  operation: 'create' | 'update',
  actorKind: ApiAccessActor = 'public',
) {
  if (actorKind === 'superadmin') {
    return true;
  }

  if (!descriptor.fields.some((field) => field.name === fieldName)) {
    return false;
  }

  return fieldRuleAllowsActor(config?.fieldVisibility?.[fieldName]?.[operation], actorKind);
}

function applyOwnershipFilter(
  descriptor: TableDescriptor,
  whereClauses: string[],
  values: unknown[],
  access?: RecordAccessContext,
) {
  if (!access || access.bypassOwnership || !access.ownershipField) {
    return;
  }

  if (!descriptor.fields.some((field) => field.name === access.ownershipField)) {
    throw new HttpError(400, `Unknown ownership field ${access.ownershipField}`);
  }

  if (!access.subjectId) {
    throw new HttpError(403, 'Owner-scoped access requires an authenticated subject');
  }

  values.push(access.subjectId);
  whereClauses.push(`${quoteIdentifier(access.ownershipField)} = $${values.length}`);
}

function isOperationEnabled(
  resource: { descriptor: TableDescriptor; config: TableApiConfig | null },
  operation: 'list' | 'get' | 'create' | 'update' | 'delete',
) {
  if (!resource.config) {
    return operation === 'list' || operation === 'get';
  }
  return resource.config.operations[operation];
}

function routeSegmentForResource(resource: { descriptor: TableDescriptor; config: TableApiConfig | null }) {
  return resource.config?.routeSegment ?? resource.descriptor.table;
}

function canAccessResourceOperation(
  resource: { descriptor: TableDescriptor; config: TableApiConfig | null },
  operation: 'list' | 'get' | 'create' | 'update' | 'delete',
  access?: RecordAccessContext,
) {
  if (resource.descriptor.source === 'builtin' && !builtinTableExposurePolicy(resource.descriptor.table).visibleInDataApi) {
    return {
      allowed: false,
      reason: 'blocked',
      access: null,
    } as const;
  }

  const actorKind = access?.actorKind ?? 'public';
  if (actorKind === 'superadmin') {
    return {
      allowed: true,
      reason: 'allowed',
      access: {
        actorKind,
        ownershipField: resource.config?.access.ownershipField ?? null,
        subjectId: access?.subjectId ?? null,
        bypassOwnership: true,
        permissions: access?.permissions,
      },
    } as const;
  }

  if (!isOperationEnabled(resource, operation)) {
    return {
      allowed: false,
      reason: 'disabled',
      access: null,
    } as const;
  }

  const operationAccess = resource.config?.access[operation];
  if (!operationAccess) {
    return {
      allowed: false,
      reason: 'forbidden',
      access: null,
    } as const;
  }

  if (!operationAccess.actors.includes('public') && !operationAccess.actors.includes(actorKind)) {
    return {
      allowed: false,
      reason: 'forbidden',
      access: null,
    } as const;
  }

  if (actorKind === 'apiKey' && !operationAccess.actors.includes('public')) {
    const permission = `resource:${routeSegmentForResource(resource)}:${operation}`;
    if (!access?.permissions?.has(permission)) {
      return {
        allowed: false,
        reason: 'forbidden',
        access: null,
      } as const;
    }
  }

  if (operationAccess.scope === 'own' && !access?.subjectId) {
    return {
      allowed: false,
      reason: 'forbidden',
      access: null,
    } as const;
  }

  return {
    allowed: true,
    reason: 'allowed',
    access: {
      actorKind,
      ownershipField: operationAccess.scope === 'own' ? (resource.config?.access.ownershipField ?? null) : null,
      subjectId: access?.subjectId ?? null,
      bypassOwnership: false,
      permissions: access?.permissions,
    },
  } as const;
}

async function resolveIncludeRelations(descriptor: TableDescriptor, includes: string[]) {
  if (includes.length === 0) {
    return [];
  }

  const draft = await getSchemaDraft();
  const explicitRelations = draft.relations
    .filter((relation) => relation.sourceTable === descriptor.table)
    .map((relation) => ({
      includeKey: relation.alias ?? relation.sourceField,
      resultKey: relation.alias ?? `${relation.sourceField}Relation`,
      sourceField: relation.sourceField,
      targetTable: relation.targetTable,
      targetField: relation.targetField,
      joinType: relation.joinType ?? 'left',
    })) satisfies IncludeRelation[];

  const inferredRelations = descriptor.fields
    .filter((field) => field.references)
    .map((field) => ({
      includeKey: field.name,
      resultKey: `${field.name}Relation`,
      sourceField: field.name,
      targetTable: field.references!.table,
      targetField: field.references!.column,
      joinType: 'left' as const,
    })) satisfies IncludeRelation[];

  return [...explicitRelations, ...inferredRelations].filter((relation, index, collection) => {
    if (!includes.includes(relation.includeKey)) {
      return false;
    }
    return collection.findIndex((entry) => entry.includeKey === relation.includeKey) === index;
  });
}

function buildInnerRelationClauses(descriptor: TableDescriptor, relations: IncludeRelation[]) {
  return relations
    .filter((relation) => relation.joinType === 'inner')
    .map(
      (relation) =>
        `exists (
          select 1
          from ${quoteIdentifier(relation.targetTable)}
          where ${quoteQualifiedIdentifier(relation.targetTable, relation.targetField)} = ${quoteQualifiedIdentifier(descriptor.table, relation.sourceField)}
        )`,
    );
}

export async function listRecords(table: string, query: URLSearchParams, options: ListRecordsOptions = {}) {
  const resource = await resolveTableResource(table);
  assertDataApiReadable(resource, options.access);
  const { descriptor } = resource;
  const actorKind = options.access?.actorKind ?? 'public';
  const readableFieldNames = descriptor.fields
    .filter((field) => !hiddenFieldSetForActor(descriptor, resource.config, actorKind).has(field.name))
    .map((field) => field.name);
  const pagination = options.pagination ?? {
    enabled: true,
    defaultPageSize: 20,
    maxPageSize: 100,
  };
  const sorting = options.sorting ?? {
    enabled: true,
    fields: readableFieldNames,
    defaultField: readableFieldNames.includes(descriptor.primaryKey)
      ? descriptor.primaryKey
      : (readableFieldNames[0] ?? descriptor.primaryKey),
    defaultOrder: 'desc',
  };
  const filtering = options.filtering ?? {
    enabled: true,
    fields: readableFieldNames,
  };
  const includesConfig = options.includes ?? {
    enabled: true,
    fields: [],
  };
  const effectiveSorting = {
    ...sorting,
    fields: sorting.fields.filter((field) => readableFieldNames.includes(field)),
    defaultField: readableFieldNames.includes(sorting.defaultField ?? '')
      ? sorting.defaultField
      : (readableFieldNames[0] ?? descriptor.primaryKey),
  };
  const effectiveFiltering = {
    ...filtering,
    fields: filtering.fields.filter((field) => readableFieldNames.includes(field)),
  };
  const page = pagination.enabled ? Math.max(1, Number(query.get('page') ?? '1')) : 1;
  const requestedPageSize = pagination.enabled
    ? Number(query.get('pageSize') ?? String(pagination.defaultPageSize))
    : pagination.defaultPageSize;
  const pageSize = Math.min(pagination.maxPageSize, Math.max(1, requestedPageSize));
  const requestedSort = query.get('sort');
  const sort = effectiveSorting.enabled
    ? (requestedSort ?? effectiveSorting.defaultField ?? descriptor.primaryKey)
    : (effectiveSorting.defaultField ?? descriptor.primaryKey);
  const order = effectiveSorting.enabled
    ? (query.get('order') ?? effectiveSorting.defaultOrder).toLowerCase() === 'asc'
      ? 'asc'
      : 'desc'
    : effectiveSorting.defaultOrder;
  const filterField = query.get('filterField');
  const filterValue = query.get('filterValue');
  const includes = (query.get('include') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!effectiveSorting.enabled && (query.get('sort') || query.get('order'))) {
    throw new HttpError(400, `Sorting is disabled for ${descriptor.table}`);
  }

  if (requestedSort && !effectiveSorting.fields.includes(sort)) {
    throw new HttpError(400, `Unknown sort field ${sort}`);
  }

  const whereClauses: string[] = [];
  const values: unknown[] = [];

  if (filterValue) {
    if (!effectiveFiltering.enabled) {
      throw new HttpError(400, `Filtering is disabled for ${descriptor.table}`);
    }

    values.push(filterValue);

    if (filterField) {
      if (!effectiveFiltering.fields.includes(filterField)) {
        throw new HttpError(400, `Unknown filter field ${filterField}`);
      }
      whereClauses.push(`${quoteIdentifier(filterField)}::text ilike '%' || $${values.length} || '%'`);
    } else {
      const searchableFields = effectiveFiltering.fields.map(
        (field) => `${quoteIdentifier(field)}::text ilike '%' || $${values.length} || '%'`,
      );
      if (searchableFields.length > 0) {
        whereClauses.push(`(${searchableFields.join(' or ')})`);
      }
    }
  }

  if (!includesConfig.enabled && includes.length > 0) {
    throw new HttpError(400, `Relation includes are disabled for ${descriptor.table}`);
  }

  const disallowedInclude = includes.find((include) => !includesConfig.fields.includes(include));
  if (disallowedInclude) {
    throw new HttpError(400, `Unknown include field ${disallowedInclude}`);
  }

  const relations = includes.length > 0 ? await resolveIncludeRelations(descriptor, includes) : [];
  whereClauses.push(...buildInnerRelationClauses(descriptor, relations));

  applyOwnershipFilter(descriptor, whereClauses, values, options.access);

  const where = whereClauses.length ? `where ${whereClauses.join(' and ')}` : '';
  const limitOffsetSql = `limit ${pageSize} offset ${(page - 1) * pageSize}`;
  const tableSql = quoteIdentifier(descriptor.table);
  const selectSql = selectColumnsSql(descriptor);
  const items = await sql.unsafe(
    `select ${selectSql} from ${tableSql} ${where} order by ${quoteIdentifier(sort)} ${order} ${limitOffsetSql}`,
    unsafeParams(values),
  );
  const [{ count }] = await sql.unsafe<{ count: string }[]>(
    `select count(*)::text as count from ${tableSql} ${where}`,
    unsafeParams(values),
  );

  if (includes.length > 0) {
    const filteredItems: Record<string, unknown>[] = [];
    const hiddenFieldCache = new Map<string, Set<string>>();
    const hiddenFields = hiddenFieldSetForActor(descriptor, resource.config, actorKind);
    hiddenFieldCache.set(descriptor.table, hiddenFields);

    for (const item of items as Record<string, unknown>[]) {
      const sanitisedItem = sanitiseRecord(item, hiddenFields);
      let shouldKeep = true;

      for (const relation of relations) {
        const foreignId = item[relation.sourceField];
        if (foreignId == null) {
          if (relation.joinType === 'inner') {
            shouldKeep = false;
            break;
          }
          continue;
        }

        const relatedResource = await resolveTableResource(relation.targetTable);
        const relatedReadAccess = canAccessResourceOperation(relatedResource, 'get', options.access);
        if (!relatedReadAccess.allowed) {
          if (relation.joinType === 'inner') {
            shouldKeep = false;
            break;
          }

          sanitisedItem[relation.resultKey] = null;
          continue;
        }

        const relatedDescriptor = relatedResource.descriptor;
        const relatedWhereClauses = [`${quoteIdentifier(relation.targetField)} = $1`];
        const relatedValues: unknown[] = [foreignId];
        applyOwnershipFilter(relatedDescriptor, relatedWhereClauses, relatedValues, relatedReadAccess.access);
        const [related] = await sql.unsafe<Record<string, unknown>[]>(
          `select ${selectColumnsSql(relatedDescriptor)} from ${quoteIdentifier(relation.targetTable)}
           where ${relatedWhereClauses.join(' and ')}
           limit 1`,
          unsafeParams(relatedValues),
        );

        if (!related && relation.joinType === 'inner') {
          shouldKeep = false;
          break;
        }

        sanitisedItem[relation.resultKey] = related
          ? await sanitiseRecordForTable(relation.targetTable, related, relatedReadAccess.access, hiddenFieldCache)
          : null;
      }

      if (shouldKeep) {
        filteredItems.push(sanitisedItem);
      }
    }

    return {
      items: filteredItems,
      total: Number(count),
      page,
      pageSize,
    };
  }

  const hiddenFieldCache = new Map<string, Set<string>>();
  return {
    items: await Promise.all(
      (items as Record<string, unknown>[]).map((item) =>
        sanitiseRecordForTable(descriptor.table, item, options.access, hiddenFieldCache),
      ),
    ),
    total: Number(count),
    page,
    pageSize,
  };
}

export async function getRecord(table: string, id: string, options: MutationRecordOptions = {}) {
  const resource = await resolveTableResource(table);
  assertDataApiReadable(resource);
  const { descriptor } = resource;
  const selectSql = selectColumnsSql(descriptor);
  const whereClauses = [`${quoteIdentifier(descriptor.primaryKey)} = $1`];
  const values: unknown[] = [id];
  applyOwnershipFilter(descriptor, whereClauses, values, options.access);
  const [record] = await sql.unsafe<Record<string, unknown>[]>(
    `select ${selectSql} from ${quoteIdentifier(descriptor.table)}
     where ${whereClauses.join(' and ')}
     limit 1`,
    unsafeParams(values),
  );
  if (!record) {
    throw new HttpError(404, 'Record not found');
  }
  return sanitiseRecordForTable(descriptor.table, record, options.access);
}

export async function createRecord(table: string, payload: Record<string, unknown>, options: MutationRecordOptions = {}) {
  const resource = await resolveTableResource(table);
  assertDataApiReadable(resource);
  assertWritableDescriptor(resource.descriptor, options.access);

  // Execute before hooks
  await executeTableHooks(resource.descriptor.hooks, 'beforeCreate', table, payload);

  const { descriptor } = resource;
  const nextPayload = { ...payload };

  // Generate ID if missing and it's a text/uuid primary key
  if (descriptor.primaryKey && !nextPayload[descriptor.primaryKey]) {
    const primaryField = descriptor.fields.find((field: any) => field.name === descriptor.primaryKey);
    if (primaryField && (primaryField.type === 'text' || primaryField.type === 'uuid')) {
      nextPayload[descriptor.primaryKey] = crypto.randomUUID();
    }
  }

  if (options.access?.ownershipField && !options.access.bypassOwnership) {
    if (!options.access.subjectId) {
      throw new HttpError(403, 'Owner-scoped access requires an authenticated subject');
    }
    nextPayload[options.access.ownershipField] = options.access.subjectId;
  }

  const actorKind = options.access?.actorKind ?? 'public';
  const columns = Object.keys(nextPayload).filter((column) => descriptor.fields.some((field) => field.name === column));
  const blockedColumns = columns.filter((column) => !fieldIsWritable(column, descriptor, resource.config, 'create', actorKind));

  if (blockedColumns.length > 0) {
    throw new HttpError(403, `Cannot set protected field${blockedColumns.length === 1 ? '' : 's'} ${blockedColumns.join(', ')}`);
  }

  if (columns.length === 0) {
    throw new HttpError(400, 'No writable fields provided');
  }

  const values = columns.map((column) => serialiseValue(nextPayload[column]));
  const placeholders = columns
    .map((column, index) => {
      const field = descriptor.fields.find((f) => f.name === column)!;
      return placeholderForField(field, index + 1);
    })
    .join(', ');

  const [record] = await sql.unsafe<DataRecord[]>(
    `insert into ${quoteIdentifier(descriptor.table)} (${columns.map(quoteIdentifier).join(', ')})
     values (${placeholders})
     returning ${selectColumnsSql(descriptor)}`,
    unsafeParams(values),
  );

  if (!record) {
    throw new HttpError(500, 'Failed to create record');
  }

  emitDataMutationIfConfigured({
    kind: 'created',
    table,
    id: String(record[descriptor.primaryKey]),
  });

  await executeAfterMutationHooks(resource.descriptor.hooks, 'afterCreate', table, record);

  return sanitiseRecordForTable(descriptor.table, record, options.access);
}

export async function updateRecord(
  table: string,
  id: string,
  payload: Record<string, unknown>,
  options: MutationRecordOptions = {},
) {
  const resource = await resolveTableResource(table);
  assertDataApiReadable(resource);
  assertWritableDescriptor(resource.descriptor, options.access);

  // Execute before hooks
  await executeTableHooks(resource.descriptor.hooks, 'beforeUpdate', table, { id, data: payload });

  const { descriptor } = resource;
  const nextPayload = { ...payload };
  if (options.access?.ownershipField && !options.access.bypassOwnership) {
    delete nextPayload[options.access.ownershipField];
  }

  const actorKind = options.access?.actorKind ?? 'public';
  const columns = Object.keys(nextPayload).filter(
    (column) => column !== descriptor.primaryKey && descriptor.fields.some((field) => field.name === column),
  );
  const blockedColumns = columns.filter((column) => !fieldIsWritable(column, descriptor, resource.config, 'update', actorKind));

  if (blockedColumns.length > 0) {
    throw new HttpError(
      403,
      `Cannot update protected field${blockedColumns.length === 1 ? '' : 's'} ${blockedColumns.join(', ')}`,
    );
  }

  if (columns.length === 0) {
    const existing = await getRecord(table, id, options);
    return existing;
  }

  const values = columns.map((column) => serialiseValue(nextPayload[column]));
  const assignments = columns
    .map((column, index) => {
      const field = descriptor.fields.find((entry) => entry.name === column)!;
      return `${quoteIdentifier(column)} = ${placeholderForField(field, index + 1)}`;
    })
    .join(', ');

  values.push(id);
  const whereClauses = [`${quoteIdentifier(descriptor.primaryKey)} = $${values.length}`];
  applyOwnershipFilter(descriptor, whereClauses, values, options.access);

  const [record] = await sql.unsafe<DataRecord[]>(
    `update ${quoteIdentifier(descriptor.table)}
     set ${assignments}
     where ${whereClauses.join(' and ')}
     returning ${selectColumnsSql(descriptor)}`,
    unsafeParams(values),
  );

  if (!record) {
    throw new HttpError(404, 'Record not found');
  }

  emitDataMutationIfConfigured({
    kind: 'updated',
    table,
    id: String(record[descriptor.primaryKey]),
  });

  await executeAfterMutationHooks(resource.descriptor.hooks, 'afterUpdate', table, record);

  return sanitiseRecordForTable(descriptor.table, record, options.access);
}

export async function deleteRecord(table: string, id: string, options: MutationRecordOptions = {}) {
  const resource = await resolveTableResource(table);
  assertDataApiReadable(resource);
  assertWritableDescriptor(resource.descriptor, options.access);

  // Execute before hooks
  await executeTableHooks(resource.descriptor.hooks, 'beforeDelete', table, { id });

  const { descriptor } = resource;
  const values: unknown[] = [id];
  const whereClauses = [`${quoteIdentifier(descriptor.primaryKey)} = $1`];
  applyOwnershipFilter(descriptor, whereClauses, values, options.access);

  const [record] = await sql.unsafe<DataRecord[]>(
    `delete from ${quoteIdentifier(descriptor.table)}
     where ${whereClauses.join(' and ')}
     returning ${selectColumnsSql(descriptor)}`,
    unsafeParams(values),
  );

  if (!record) {
    throw new HttpError(404, 'Record not found');
  }

  emitDataMutationIfConfigured({
    kind: 'deleted',
    table,
    id: String(record[descriptor.primaryKey]),
    rawRecord: record,
  });

  await executeAfterMutationHooks(resource.descriptor.hooks, 'afterDelete', table, record);

  return { success: true };
}

/**
 * Shape a deleted row for a subscriber using the same field visibility rules as HTTP reads.
 * Returns null when the actor would not have been able to read that row.
 */
export async function projectDeletedRecordForFanout(
  table: string,
  rawRecord: Record<string, unknown>,
  access: RecordAccessContext,
): Promise<Record<string, unknown> | null> {
  const resource = await resolveTableResource(table);
  try {
    assertDataApiReadable(resource, access);
  } catch {
    return null;
  }
  if (!access.bypassOwnership && access.ownershipField && access.subjectId) {
    if (rawRecord[access.ownershipField] !== access.subjectId) {
      return null;
    }
  }
  return sanitiseRecordForTable(table, rawRecord, access);
}

export async function listBrowsableTables(actor?: ApiAccessActor) {
  const draft = await getSchemaDraft();
  const existingTables = await listExistingDatabaseTables();
  const builtin =
    actor === 'superadmin'
      ? Array.from(existingTables)
      : Object.keys(builtinTables).filter(
          (key) => existingTables.has(builtinTables[key].table) && builtinTableExposurePolicy(key).visibleInDataApi,
        );
  const pluginTables = (await listPluginCapabilityManifests())
    .filter((manifest) => manifest.installState.enabled)
    .flatMap((manifest) => manifest.models)
    .filter((model) => model.provisioned)
    .map((model) => model.tableName);
  return Array.from(new Set([...builtin, ...pluginTables, ...draft.tables.map((table) => table.name)]));
}
