import OpenAI from "openai";
import { and, asc, desc, eq } from "drizzle-orm";
import type {
  AiAction,
  AiActionBatch,
  AiActionPreview,
  AiContext,
  AiMessage,
  AiMessageCreate,
  AiRun,
  AiRunStepResult,
  AiThread,
  AiThreadDetail,
  PluginId,
  SchemaDraft,
} from "@authend/shared";
import {
  aiActionBatchSchema,
  aiActionPreviewSchema,
  aiAssistantSettingsSchema,
  aiContextSchema,
  aiMessageCreateSchema,
  aiMessageSchema,
  aiRunSchema,
  aiRunStepResultSchema,
  aiThreadDetailSchema,
  aiThreadSchema,
} from "@authend/shared";
import { db } from "../db/client";
import { aiMessages, aiRuns, aiThreads } from "../db/schema/system";
import { HttpError } from "../lib/http";
import { readSettingsSection } from "./settings-store";
import { listPluginCapabilityManifests, readPluginCapabilityManifest, enablePlugin, disablePlugin, savePluginConfig } from "./plugin-service";
import { listApiResources } from "./api-design-service";
import { applyDraft, getSchemaDraft, previewDraft } from "./schema-service";
import { createRecord, deleteRecord, getRecord, getTableDescriptor, listBrowsableTables, listRecords, updateRecord } from "./crud-service";
import { writeAuditLog } from "./audit-service";

type ThreadRow = typeof aiThreads.$inferSelect;
type MessageRow = typeof aiMessages.$inferSelect;
type RunRow = typeof aiRuns.$inferSelect;

type DraftMutation = Extract<
  AiAction["type"],
  "create_table" | "update_table" | "delete_table" | "create_relation" | "update_relation" | "delete_relation" | "set_table_api_config"
>;

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function parseJsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function serialiseThread(row: ThreadRow, latestRunStatus?: AiThread["latestRunStatus"]): AiThread {
  return aiThreadSchema.parse({
    id: row.id,
    title: row.title,
    actorUserId: row.actorUserId,
    latestRunStatus: latestRunStatus ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function serialiseMessage(row: MessageRow): AiMessage {
  return aiMessageSchema.parse({
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    content: row.content,
    context: row.context ?? null,
    runId: row.runId ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

function serialiseRun(row: RunRow): AiRun {
  return aiRunSchema.parse({
    id: row.id,
    threadId: row.threadId,
    userMessageId: row.userMessageId,
    assistantMessageId: row.assistantMessageId ?? null,
    status: row.status,
    summary: row.summary,
    rationale: row.rationale,
    actionBatch: aiActionBatchSchema.parse(parseJsonRecord(row.actionBatch)),
    previews: Array.isArray(row.previews) ? row.previews.map((preview) => aiActionPreviewSchema.parse(preview)) : [],
    results: Array.isArray(row.results) ? row.results.map((result) => aiRunStepResultSchema.parse(result)) : [],
    error: row.error ?? null,
    actorUserId: row.actorUserId ?? null,
    approvedByUserId: row.approvedByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
    approvedAt: toIso(row.approvedAt),
    completedAt: toIso(row.completedAt),
  });
}

async function readAiSettings() {
  const { config } = await readSettingsSection("aiAssistant");
  return aiAssistantSettingsSchema.parse(config);
}

function resolveProviderApiKey(apiKeyEnvVar: string) {
  const value = process.env[apiKeyEnvVar];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function assertAiConfigured() {
  const settings = await readAiSettings();
  const apiKey = resolveProviderApiKey(settings.apiKeyEnvVar);
  if (!settings.enabled) {
    throw new HttpError(403, "AI assistant is disabled.");
  }
  if (!apiKey) {
    throw new HttpError(400, `AI assistant requires env var ${settings.apiKeyEnvVar}.`);
  }
  return {
    settings,
    apiKey,
  };
}

function createOpenAiClient(baseURL: string, apiKey: string) {
  return new OpenAI({
    baseURL,
    apiKey,
  });
}

function titleFromPrompt(prompt: string) {
  const clean = prompt.trim().replace(/\s+/g, " ");
  if (!clean) {
    return "New assistant thread";
  }
  return clean.length <= 60 ? clean : `${clean.slice(0, 57)}...`;
}

async function touchThread(threadId: string) {
  await db.update(aiThreads).set({ updatedAt: new Date() }).where(eq(aiThreads.id, threadId));
}

async function loadOwnedThread(threadId: string, actorUserId: string) {
  const row = await db.select().from(aiThreads).where(and(eq(aiThreads.id, threadId), eq(aiThreads.actorUserId, actorUserId))).limit(1);
  if (!row[0]) {
    throw new HttpError(404, "AI thread not found");
  }
  return row[0];
}

function relationMatches(left: SchemaDraft["relations"][number], right: SchemaDraft["relations"][number]) {
  return (
    left.sourceTable === right.sourceTable &&
    left.sourceField === right.sourceField &&
    left.targetTable === right.targetTable &&
    left.targetField === right.targetField &&
    (left.alias ?? null) === (right.alias ?? null)
  );
}

function applyDraftAction(current: SchemaDraft, action: AiAction): SchemaDraft {
  switch (action.type) {
    case "create_table": {
      if (current.tables.some((table) => table.name === action.table.name)) {
        throw new HttpError(400, `Table ${action.table.name} already exists`);
      }
      return {
        ...current,
        tables: [...current.tables, action.table],
      };
    }
    case "update_table": {
      const index = current.tables.findIndex((table) => table.name === action.tableName);
      if (index === -1) {
        throw new HttpError(404, `Unknown table ${action.tableName}`);
      }
      if (action.table.name !== action.tableName) {
        throw new HttpError(400, "Renaming tables through AI update is not supported in v1");
      }
      return {
        ...current,
        tables: current.tables.map((table, currentIndex) => (currentIndex === index ? action.table : table)),
      };
    }
    case "delete_table": {
      if (!current.tables.some((table) => table.name === action.tableName)) {
        throw new HttpError(404, `Unknown table ${action.tableName}`);
      }
      return {
        ...current,
        tables: current.tables.filter((table) => table.name !== action.tableName),
        relations: current.relations.filter(
          (relation) => relation.sourceTable !== action.tableName && relation.targetTable !== action.tableName,
        ),
      };
    }
    case "create_relation": {
      if (current.relations.some((relation) => relationMatches(relation, action.relation))) {
        throw new HttpError(400, "Relation already exists");
      }
      return {
        ...current,
        relations: [...current.relations, action.relation],
      };
    }
    case "update_relation": {
      const index = current.relations.findIndex((relation) => relationMatches(relation, action.current));
      if (index === -1) {
        throw new HttpError(404, "Relation to update was not found");
      }
      return {
        ...current,
        relations: current.relations.map((relation, currentIndex) => (currentIndex === index ? action.relation : relation)),
      };
    }
    case "delete_relation": {
      const nextRelations = current.relations.filter((relation) => !relationMatches(relation, action.relation));
      if (nextRelations.length === current.relations.length) {
        throw new HttpError(404, "Relation to delete was not found");
      }
      return {
        ...current,
        relations: nextRelations,
      };
    }
    case "set_table_api_config": {
      const index = current.tables.findIndex((table) => table.name === action.tableName);
      if (index === -1) {
        throw new HttpError(404, `Unknown generated table ${action.tableName}`);
      }
      return {
        ...current,
        tables: current.tables.map((table, currentIndex) =>
          currentIndex === index
            ? {
                ...table,
                api: action.config,
              }
            : table,
        ),
      };
    }
    default:
      return current;
  }
}

function isDraftMutationAction(action: AiAction): action is Extract<AiAction, { type: DraftMutation }> {
  return [
    "create_table",
    "update_table",
    "delete_table",
    "create_relation",
    "update_relation",
    "delete_relation",
    "set_table_api_config",
  ].includes(action.type);
}

function actionTitle(action: AiAction) {
  switch (action.type) {
    case "create_table":
      return `Create table ${action.table.name}`;
    case "update_table":
      return `Update table ${action.tableName}`;
    case "delete_table":
      return `Delete table ${action.tableName}`;
    case "create_relation":
      return `Create relation ${action.relation.sourceTable}.${action.relation.sourceField}`;
    case "update_relation":
      return `Update relation ${action.current.sourceTable}.${action.current.sourceField}`;
    case "delete_relation":
      return `Delete relation ${action.relation.sourceTable}.${action.relation.sourceField}`;
    case "set_table_api_config":
      return `Update API config for ${action.tableName}`;
    case "enable_plugin":
      return `Enable plugin ${action.pluginId}`;
    case "disable_plugin":
      return `Disable plugin ${action.pluginId}`;
    case "update_plugin_config":
      return `Update plugin config for ${action.pluginId}`;
    case "create_record":
      return `Create record in ${action.table}`;
    case "update_record":
      return `Update record ${action.id} in ${action.table}`;
    case "delete_record":
      return `Delete record ${action.id} from ${action.table}`;
    case "bulk_update_records":
      return `Bulk update records in ${action.table}`;
    case "bulk_delete_records":
      return `Bulk delete records in ${action.table}`;
  }
}

function actionDescription(action: AiAction) {
  switch (action.type) {
    case "create_table":
      return `Create table ${action.table.displayName} with ${action.table.fields.length} fields.`;
    case "update_table":
      return `Replace the current blueprint for ${action.tableName}.`;
    case "delete_table":
      return `Remove the generated table ${action.tableName}.`;
    case "create_relation":
      return `Add relation from ${action.relation.sourceTable}.${action.relation.sourceField} to ${action.relation.targetTable}.${action.relation.targetField}.`;
    case "update_relation":
      return `Change an existing relation on ${action.current.sourceTable}.${action.current.sourceField}.`;
    case "delete_relation":
      return `Remove relation from ${action.relation.sourceTable}.${action.relation.sourceField}.`;
    case "set_table_api_config":
      return `Update route, auth mode, and operations for ${action.tableName}.`;
    case "enable_plugin":
      return `Enable the ${action.pluginId} plugin.`;
    case "disable_plugin":
      return `Disable the ${action.pluginId} plugin.`;
    case "update_plugin_config":
      return `Apply plugin config/capability changes for ${action.pluginId}.`;
    case "create_record":
      return `Insert a new record into ${action.table}.`;
    case "update_record":
      return `Update record ${action.id} in ${action.table}.`;
    case "delete_record":
      return `Delete record ${action.id} from ${action.table}.`;
    case "bulk_update_records":
      return `Update multiple records in ${action.table} matching the supplied filter.`;
    case "bulk_delete_records":
      return `Delete multiple records in ${action.table} matching the supplied filter.`;
  }
}

async function previewRecordMatch(table: string, filterField: string | null | undefined, filterValue: string) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", "5");
  if (filterField) {
    params.set("filterField", filterField);
  }
  params.set("filterValue", filterValue);
  return listRecords(table, params);
}

async function previewActionBatch(batch: AiActionBatch): Promise<AiActionPreview[]> {
  let workingDraft = await getSchemaDraft();
  const previews: AiActionPreview[] = [];
  let pendingDraftIndexes: number[] = [];

  const flushDraftPreview = async () => {
    if (pendingDraftIndexes.length === 0) {
      return;
    }
    const preview = await previewDraft(workingDraft);
    for (const index of pendingDraftIndexes) {
      previews[index] = aiActionPreviewSchema.parse({
        ...previews[index],
        sqlPreview: preview.sql,
        warnings: [...(previews[index]?.warnings ?? []), ...preview.warnings],
      });
    }
    pendingDraftIndexes = [];
  };

  for (const action of batch.actions) {
    const previewIndex = previews.length;
    previews.push(
      aiActionPreviewSchema.parse({
        title: actionTitle(action),
        description: actionDescription(action),
        details: [],
      }),
    );

    if (isDraftMutationAction(action)) {
      workingDraft = applyDraftAction(workingDraft, action);
      pendingDraftIndexes.push(previewIndex);
      continue;
    }

    await flushDraftPreview();

    switch (action.type) {
      case "enable_plugin":
      case "disable_plugin": {
        const manifest = await readPluginCapabilityManifest(action.pluginId);
        previews[previewIndex] = aiActionPreviewSchema.parse({
          ...previews[previewIndex],
          details: [
            `Current status: ${manifest.installState.enabled ? "enabled" : "disabled"}`,
            `Provisioning status: ${manifest.installState.provisioningState.status}`,
          ],
          warnings: manifest.health.issues,
        });
        break;
      }
      case "update_plugin_config": {
        const manifest = await readPluginCapabilityManifest(action.pluginId);
        previews[previewIndex] = aiActionPreviewSchema.parse({
          ...previews[previewIndex],
          details: [
            `Config keys: ${Object.keys(action.update.config).join(", ") || "none"}`,
            `Capability toggles: ${Object.keys(action.update.capabilityState).join(", ") || "none"}`,
            `Extension bindings: ${Object.keys(action.update.extensionBindings).join(", ") || "none"}`,
            `Current status: ${manifest.installState.enabled ? "enabled" : "disabled"}`,
          ],
        });
        break;
      }
      case "create_record":
      case "update_record":
      case "delete_record": {
        const descriptor = await getTableDescriptor(action.table);
        if (descriptor.source !== "generated") {
          throw new HttpError(400, `Table ${action.table} is read-only and cannot be changed through AI data actions.`);
        }
        previews[previewIndex] = aiActionPreviewSchema.parse({
          ...previews[previewIndex],
          details: [
            `Primary key: ${descriptor.primaryKey}`,
            `Fields available: ${descriptor.fields.map((field) => field.name).join(", ")}`,
          ],
        });
        if (action.type !== "create_record") {
          const existing = await getRecord(action.table, action.id);
          previews[previewIndex] = aiActionPreviewSchema.parse({
            ...previews[previewIndex],
            sampleRecords: [existing],
          });
        }
        break;
      }
      case "bulk_update_records":
      case "bulk_delete_records": {
        const descriptor = await getTableDescriptor(action.table);
        if (descriptor.source !== "generated") {
          throw new HttpError(400, `Table ${action.table} is read-only and cannot be changed through AI data actions.`);
        }
        const matched = await previewRecordMatch(action.table, action.match.filterField, action.match.filterValue);
        previews[previewIndex] = aiActionPreviewSchema.parse({
          ...previews[previewIndex],
          affectedCount: matched.total,
          sampleRecords: matched.items.slice(0, 5),
          details: [
            `Filter: ${action.match.filterField ? `${action.match.filterField} ILIKE` : "global ILIKE"} ${JSON.stringify(action.match.filterValue)}`,
          ],
        });
        break;
      }
    }
  }

  await flushDraftPreview();
  return previews;
}

async function buildModelContext(inputContext: AiContext) {
  const [draft, apiResources, pluginManifests, browsableTables] = await Promise.all([
    getSchemaDraft(),
    listApiResources(),
    listPluginCapabilityManifests(),
    listBrowsableTables(),
  ]);

  const tableDescriptors = await Promise.all(
    browsableTables.map(async (table) => {
      try {
        return await getTableDescriptor(table);
      } catch {
        return null;
      }
    }),
  );

  return {
    currentContext: aiContextSchema.parse(inputContext),
    schema: {
      tables: draft.tables,
      relations: draft.relations,
    },
    apiResources: apiResources.map((resource) => ({
      table: resource.table,
      routeSegment: resource.routeSegment,
      authMode: resource.config.authMode,
      operations: resource.config.operations,
      fields: resource.fields.map((field) => field.name),
    })),
    plugins: pluginManifests.map((manifest) => ({
      id: manifest.id,
      enabled: manifest.installState.enabled,
      required: manifest.required,
      configSchema: manifest.configSchema.map((field) => field.key),
      capabilities: manifest.capabilities.map((capability) => ({
        key: capability.key,
        enabled: capability.enabled,
      })),
      models: manifest.models.map((model) => model.tableName),
    })),
    tables: tableDescriptors.filter(Boolean).map((descriptor) => ({
      table: descriptor!.table,
      source: descriptor!.source,
      primaryKey: descriptor!.primaryKey,
      fields: descriptor!.fields.map((field) => ({
        name: field.name,
        type: field.type,
        nullable: field.nullable ?? false,
        references: field.references
          ? {
              table: field.references.table,
              column: field.references.column,
            }
          : null,
      })),
    })),
    supportedActions: [
      "create_table",
      "update_table",
      "delete_table",
      "create_relation",
      "update_relation",
      "delete_relation",
      "set_table_api_config",
      "enable_plugin",
      "disable_plugin",
      "update_plugin_config",
      "create_record",
      "update_record",
      "delete_record",
      "bulk_update_records",
      "bulk_delete_records",
    ],
    blockedScopes: ["env", "secrets", "backups", "crons", "danger-zone", "raw-sql", "manual migrations"],
  };
}

async function generateActionBatch(prompt: string, context: AiContext): Promise<AiActionBatch> {
  const { settings, apiKey } = await assertAiConfigured();
  const modelContext = await buildModelContext(context);
  const client = createOpenAiClient(settings.baseUrl, apiKey);

  const developerPrompt = [
    "You are Authend's superadmin assistant.",
    "Return JSON only.",
    "Never propose actions outside the supported action list.",
    "Never use raw SQL, backups, cron changes, environment changes, or danger-zone operations.",
    "If the request is out of scope, return an empty actions array and explain why in summary/rationale.",
    "Prefer the smallest safe action batch that solves the user request.",
    "When proposing table or relation changes, use the existing schema conventions from context.",
    "Response JSON shape:",
    JSON.stringify(
      {
        summary: "short summary",
        rationale: "human explanation",
        warnings: ["optional warning"],
        actions: [],
      },
      null,
      2,
    ),
  ].join("\n");

  const completion = await client.chat.completions.create({
    model: settings.model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: developerPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            request: prompt,
            context: modelContext,
          },
          null,
          2,
        ),
      },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent
        .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
        .join("")
    : rawContent;
  if (!content) {
    throw new HttpError(502, "AI assistant did not return a response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpError(502, "AI assistant returned invalid JSON.");
  }

  return aiActionBatchSchema.parse(parsed);
}

async function persistRunStatus(
  runId: string,
  patch: Partial<{
    status: AiRun["status"];
    assistantMessageId: string | null;
    previews: AiActionPreview[];
    results: AiRunStepResult[];
    approvedByUserId: string | null;
    approvedAt: Date | null;
    completedAt: Date | null;
    error: string | null;
  }>,
) {
  const updatePayload: Partial<typeof aiRuns.$inferInsert> = {};
  if (patch.status) updatePayload.status = patch.status;
  if ("assistantMessageId" in patch) updatePayload.assistantMessageId = patch.assistantMessageId;
  if (patch.previews) updatePayload.previews = patch.previews;
  if (patch.results) updatePayload.results = patch.results;
  if ("approvedByUserId" in patch) updatePayload.approvedByUserId = patch.approvedByUserId;
  if ("approvedAt" in patch) updatePayload.approvedAt = patch.approvedAt;
  if ("completedAt" in patch) updatePayload.completedAt = patch.completedAt;
  if ("error" in patch) updatePayload.error = patch.error;
  await db.update(aiRuns).set(updatePayload).where(eq(aiRuns.id, runId));
}

async function readRunOwned(runId: string, actorUserId: string) {
  const rows = await db
    .select({
      run: aiRuns,
      thread: aiThreads,
    })
    .from(aiRuns)
    .innerJoin(aiThreads, eq(aiRuns.threadId, aiThreads.id))
    .where(and(eq(aiRuns.id, runId), eq(aiThreads.actorUserId, actorUserId)))
    .limit(1);
  if (!rows[0]) {
    throw new HttpError(404, "AI run not found");
  }
  return rows[0];
}

export async function listAiThreads(actorUserId: string): Promise<AiThread[]> {
  const threadRows = await db.select().from(aiThreads).where(eq(aiThreads.actorUserId, actorUserId)).orderBy(desc(aiThreads.updatedAt));
  const runRows = await db.select().from(aiRuns).orderBy(desc(aiRuns.createdAt));
  return threadRows.map((thread) =>
    serialiseThread(
      thread,
      runRows.find((run) => run.threadId === thread.id)?.status as AiThread["latestRunStatus"] | undefined,
    ),
  );
}

export async function createAiThread(actorUserId: string, title?: string): Promise<AiThread> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(aiThreads).values({
    id,
    title: title?.trim() || "New assistant thread",
    actorUserId,
    createdAt: now,
    updatedAt: now,
  });
  const row = await loadOwnedThread(id, actorUserId);
  return serialiseThread(row);
}

export async function getAiThreadDetail(threadId: string, actorUserId: string): Promise<AiThreadDetail> {
  const thread = await loadOwnedThread(threadId, actorUserId);
  const [messages, runs] = await Promise.all([
    db.select().from(aiMessages).where(eq(aiMessages.threadId, threadId)).orderBy(asc(aiMessages.createdAt)),
    db.select().from(aiRuns).where(eq(aiRuns.threadId, threadId)).orderBy(asc(aiRuns.createdAt)),
  ]);
  return aiThreadDetailSchema.parse({
    thread: serialiseThread(thread, runs[runs.length - 1]?.status as AiThread["latestRunStatus"] | undefined),
    messages: messages.map(serialiseMessage),
    runs: runs.map(serialiseRun),
  });
}

export async function createAiMessage(threadId: string, rawInput: AiMessageCreate, actorUserId: string): Promise<AiThreadDetail> {
  const thread = await loadOwnedThread(threadId, actorUserId);
  const input = aiMessageCreateSchema.parse(rawInput);
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const now = new Date();

  await db.insert(aiMessages).values({
    id: userMessageId,
    threadId,
    role: "user",
    content: input.content,
    context: input.context,
    runId: null,
    createdAt: now,
  });

  let actionBatch: AiActionBatch;
  let previews: AiActionPreview[];
  let assistantContent: string;
  let runStatus: AiRun["status"] = "pending";
  let runError: string | null = null;

  try {
    actionBatch = await generateActionBatch(input.content, input.context);
    previews = await previewActionBatch(actionBatch);
    assistantContent = actionBatch.rationale || actionBatch.summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI assistant request failed.";
    actionBatch = aiActionBatchSchema.parse({
      summary: "Assistant request failed",
      rationale: message,
      warnings: [message],
      actions: [],
    });
    previews = [];
    assistantContent = message;
    runStatus = "failed";
    runError = message;
  }

  await db.insert(aiMessages).values({
    id: assistantMessageId,
    threadId,
    role: "assistant",
    content: assistantContent,
    context: input.context,
    runId,
    createdAt: new Date(),
  });

  await db.insert(aiRuns).values({
    id: runId,
    threadId,
    userMessageId,
    assistantMessageId,
    status: runStatus,
    summary: actionBatch.summary,
    rationale: actionBatch.rationale,
    actionBatch,
    previews,
    results: [],
    error: runError,
    actorUserId,
    approvedByUserId: null,
    createdAt: new Date(),
    approvedAt: null,
    completedAt: runStatus === "failed" ? new Date() : null,
  });

  if (thread.title === "New assistant thread") {
    await db.update(aiThreads).set({ title: titleFromPrompt(input.content), updatedAt: new Date() }).where(eq(aiThreads.id, threadId));
  }

  await touchThread(threadId);
  return getAiThreadDetail(threadId, actorUserId);
}

async function listAllMatchingRecords(table: string, filterField: string | null | undefined, filterValue: string) {
  const pageSize = 100;
  const items: Record<string, unknown>[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (filterField) {
      params.set("filterField", filterField);
    }
    params.set("filterValue", filterValue);

    const result = await listRecords(table, params);
    items.push(...result.items);
    if (result.items.length < pageSize) {
      break;
    }
    page += 1;
  }

  return items;
}

async function assertGeneratedWritableTable(table: string) {
  const descriptor = await getTableDescriptor(table);
  if (descriptor.source !== "generated") {
    throw new HttpError(400, `Table ${table} is read-only and cannot be changed through AI data actions.`);
  }
  return descriptor;
}

export async function approveAiRun(runId: string, actorUserId: string): Promise<AiThreadDetail> {
  const { run, thread } = await readRunOwned(runId, actorUserId);
  if (run.status !== "pending") {
    throw new HttpError(400, `AI run is already ${run.status}`);
  }

  const parsedRun = serialiseRun(run);
  const results: AiRunStepResult[] = [];
  let workingDraft: SchemaDraft | null = null;
  let pendingDraftIndexes: number[] = [];

  const flushDraft = async () => {
    if (!workingDraft || pendingDraftIndexes.length === 0) {
      return;
    }
    await applyDraft(workingDraft, actorUserId);
    for (const actionIndex of pendingDraftIndexes) {
      results.push({
        actionIndex,
        actionType: parsedRun.actionBatch.actions[actionIndex].type,
        status: "completed",
        target: actionTitle(parsedRun.actionBatch.actions[actionIndex]),
        message: "Schema changes applied.",
      });
    }
    pendingDraftIndexes = [];
  };

  await persistRunStatus(runId, {
    status: "running",
    approvedByUserId: actorUserId,
    approvedAt: new Date(),
    error: null,
  });

  try {
    for (let index = 0; index < parsedRun.actionBatch.actions.length; index += 1) {
      const action = parsedRun.actionBatch.actions[index];

      if (isDraftMutationAction(action)) {
        if (!workingDraft) {
          workingDraft = await getSchemaDraft();
        }
        workingDraft = applyDraftAction(workingDraft, action);
        pendingDraftIndexes.push(index);
        continue;
      }

      await flushDraft();

      switch (action.type) {
        case "enable_plugin": {
          await enablePlugin(action.pluginId as PluginId, actorUserId);
          results.push({
            actionIndex: index,
            actionType: action.type,
            status: "completed",
            target: action.pluginId,
            message: `Enabled plugin ${action.pluginId}.`,
          });
          break;
        }
        case "disable_plugin": {
          await disablePlugin(action.pluginId as PluginId, actorUserId);
          results.push({
            actionIndex: index,
            actionType: action.type,
            status: "completed",
            target: action.pluginId,
            message: `Disabled plugin ${action.pluginId}.`,
          });
          break;
        }
        case "update_plugin_config": {
          await savePluginConfig(action.pluginId as PluginId, action.update, actorUserId);
          results.push({
            actionIndex: index,
            actionType: action.type,
            status: "completed",
            target: action.pluginId,
            message: `Updated plugin config for ${action.pluginId}.`,
          });
          break;
        }
        case "create_record": {
          const descriptor = await assertGeneratedWritableTable(action.table);
          const created = await createRecord(action.table, action.payload);
          const recordId = created[descriptor.primaryKey];
          results.push({
            actionIndex: index,
            actionType: action.type,
            status: "completed",
            target: `${action.table}:${String(recordId ?? "new")}`,
            message: `Created a record in ${action.table}.`,
          });
          break;
        }
        case "update_record": {
          await assertGeneratedWritableTable(action.table);
          await updateRecord(action.table, action.id, action.payload);
          results.push({
            actionIndex: index,
            actionType: action.type,
            status: "completed",
            target: `${action.table}:${action.id}`,
            message: `Updated record ${action.id}.`,
          });
          break;
        }
        case "delete_record": {
          await assertGeneratedWritableTable(action.table);
          await deleteRecord(action.table, action.id);
          results.push({
            actionIndex: index,
            actionType: action.type,
            status: "completed",
            target: `${action.table}:${action.id}`,
            message: `Deleted record ${action.id}.`,
          });
          break;
        }
        case "bulk_update_records": {
          const descriptor = await assertGeneratedWritableTable(action.table);
          const records = await listAllMatchingRecords(action.table, action.match.filterField, action.match.filterValue);
          for (const record of records) {
            await updateRecord(action.table, String(record[descriptor.primaryKey]), action.changes);
          }
          results.push({
            actionIndex: index,
            actionType: action.type,
            status: "completed",
            target: action.table,
            message: `Updated ${records.length} records in ${action.table}.`,
          });
          break;
        }
        case "bulk_delete_records": {
          const descriptor = await assertGeneratedWritableTable(action.table);
          const records = await listAllMatchingRecords(action.table, action.match.filterField, action.match.filterValue);
          for (const record of records) {
            await deleteRecord(action.table, String(record[descriptor.primaryKey]));
          }
          results.push({
            actionIndex: index,
            actionType: action.type,
            status: "completed",
            target: action.table,
            message: `Deleted ${records.length} records from ${action.table}.`,
          });
          break;
        }
      }
    }

    await flushDraft();

    await persistRunStatus(runId, {
      status: "completed",
      results,
      completedAt: new Date(),
      error: null,
    });

    await writeAuditLog({
      action: "ai.run.approved",
      actorUserId,
      target: runId,
      payload: {
        threadId: thread.id,
        actionCount: parsedRun.actionBatch.actions.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI run failed";
    const failedIndex = results.length;
    const currentAction = parsedRun.actionBatch.actions[failedIndex];
    if (currentAction) {
      results.push({
        actionIndex: failedIndex,
        actionType: currentAction.type,
        status: "failed",
        target: actionTitle(currentAction),
        message,
      });
    }
    await persistRunStatus(runId, {
      status: "failed",
      results,
      completedAt: new Date(),
      error: message,
    });
    throw error;
  }

  await touchThread(thread.id);
  return getAiThreadDetail(thread.id, actorUserId);
}

export async function rejectAiRun(runId: string, actorUserId: string): Promise<AiThreadDetail> {
  const { run, thread } = await readRunOwned(runId, actorUserId);
  if (run.status !== "pending") {
    throw new HttpError(400, `AI run is already ${run.status}`);
  }
  await persistRunStatus(runId, {
    status: "rejected",
    approvedByUserId: actorUserId,
    approvedAt: new Date(),
    completedAt: new Date(),
    error: "Rejected by user",
  });
  await writeAuditLog({
    action: "ai.run.rejected",
    actorUserId,
    target: runId,
    payload: {
      threadId: thread.id,
    },
  });
  await touchThread(thread.id);
  return getAiThreadDetail(thread.id, actorUserId);
}
