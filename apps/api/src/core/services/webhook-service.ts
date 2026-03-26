import { and, asc, desc, eq, lte, or, sql as drizzleSql } from 'drizzle-orm';
import type { Webhook, WebhookDelivery, WebhookEventType, WebhookInput } from '@authend/shared';
import { webhookInputSchema } from '@authend/shared';
import { db } from '../db/client';
import { webhookDeliveries, webhooks } from '../db/schema/system';
import { HttpError } from '../lib/http';
import { logger } from '../lib/logger';
import { writeAuditLog } from './audit-service';
import { readSettingsSection } from './settings-store';

// ─── Serialisers ───────────────────────────────────────────────────────────

function serialiseWebhook(row: typeof webhooks.$inferSelect): Webhook {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    secret: row.secret,
    events: row.events as string[] as WebhookEventType[],
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serialiseDelivery(row: typeof webhookDeliveries.$inferSelect): WebhookDelivery {
  return {
    id: row.id,
    webhookId: row.webhookId,
    eventType: row.eventType as WebhookEventType,
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: row.status as WebhookDelivery['status'],
    attemptCount: Number(row.attemptCount),
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    lastError: row.lastError ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    httpStatus: row.httpStatus,
    response: row.response,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Signing ───────────────────────────────────────────────────────────────

export async function signPayload(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256=${hex}`;
}

// ─── Retry backoff ─────────────────────────────────────────────────────────

function backoffSeconds(attemptCount: number): number {
  // 30s → 120s → 480s → 1800s → 7200s
  const caps = [30, 120, 480, 1800, 7200];
  return caps[attemptCount] ?? caps[caps.length - 1]!;
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function listWebhooks(): Promise<Webhook[]> {
  const rows = await db.select().from(webhooks).orderBy(asc(webhooks.createdAt));
  return rows.map(serialiseWebhook);
}

export async function getWebhook(id: string): Promise<Webhook> {
  const row = await db.query.webhooks.findFirst({
    where: (table, ops) => ops.eq(table.id, id),
  });
  if (!row) {
    throw new HttpError(404, `Unknown webhook ${id}`);
  }
  return serialiseWebhook(row);
}

export async function createWebhook(input: WebhookInput, actorUserId?: string | null): Promise<Webhook> {
  const parsed = webhookInputSchema.parse(input);
  const id = crypto.randomUUID();
  const secret = parsed.secret || Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');

  await db.insert(webhooks).values({
    id,
    url: parsed.url,
    description: parsed.description,
    secret,
    events: parsed.events,
    enabled: parsed.enabled,
  });

  await writeAuditLog({
    action: 'webhook.created',
    actorUserId,
    target: id,
    payload: { url: parsed.url, events: parsed.events },
  });

  return getWebhook(id);
}

export async function updateWebhook(id: string, input: Partial<WebhookInput>, actorUserId?: string | null): Promise<Webhook> {
  const existing = await db.query.webhooks.findFirst({
    where: (table, ops) => ops.eq(table.id, id),
  });
  if (!existing) {
    throw new HttpError(404, `Unknown webhook ${id}`);
  }

  const merged = webhookInputSchema.parse({
    url: existing.url,
    description: existing.description,
    secret: existing.secret,
    events: existing.events,
    enabled: existing.enabled,
    ...input,
  });

  await db
    .update(webhooks)
    .set({
      url: merged.url,
      description: merged.description,
      secret: merged.secret,
      events: merged.events,
      enabled: merged.enabled,
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, id));

  await writeAuditLog({
    action: 'webhook.updated',
    actorUserId,
    target: id,
    payload: { url: merged.url },
  });

  return getWebhook(id);
}

export async function deleteWebhook(id: string, actorUserId?: string | null): Promise<void> {
  const existing = await db.query.webhooks.findFirst({
    where: (table, ops) => ops.eq(table.id, id),
  });
  if (!existing) {
    throw new HttpError(404, `Unknown webhook ${id}`);
  }
  await db.delete(webhooks).where(eq(webhooks.id, id));
  await writeAuditLog({
    action: 'webhook.deleted',
    actorUserId,
    target: id,
    payload: { url: existing.url },
  });
}

// ─── Deliveries ────────────────────────────────────────────────────────────

export async function listDeliveries(webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
  return rows.map(serialiseDelivery);
}

export async function listRecentDeliveries(limit = 25): Promise<WebhookDelivery[]> {
  const rows = await db.select().from(webhookDeliveries).orderBy(desc(webhookDeliveries.createdAt)).limit(limit);
  return rows.map(serialiseDelivery);
}

export async function getDelivery(id: string): Promise<WebhookDelivery> {
  const row = await db.query.webhookDeliveries.findFirst({
    where: (table, ops) => ops.eq(table.id, id),
  });
  if (!row) {
    throw new HttpError(404, `Unknown delivery ${id}`);
  }
  return serialiseDelivery(row);
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

async function attemptDelivery(
  deliveryId: string,
  webhook: typeof webhooks.$inferSelect,
  body: string,
  signature: string,
  timeoutSeconds: number,
): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-authend-signature': signature,
        'x-authend-delivery': deliveryId,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    const responseText = await response.text();
    const truncatedResponse = responseText.slice(0, 1000);

    if (!response.ok) {
      await db
        .update(webhookDeliveries)
        .set({
          httpStatus: response.status,
          response: truncatedResponse,
          lastError: `HTTP ${response.status} ${response.statusText}`,
        })
        .where(eq(webhookDeliveries.id, deliveryId));
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    await db
      .update(webhookDeliveries)
      .set({
        status: 'succeeded',
        deliveredAt: new Date(),
        httpStatus: response.status,
        response: truncatedResponse,
        lastError: null,
        nextAttemptAt: null,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    return { status: response.status, text: truncatedResponse };
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      await db.update(webhookDeliveries).set({ lastError: 'Timeout' }).where(eq(webhookDeliveries.id, deliveryId));
    }
    throw error;
  }
}

export async function dispatchWebhookEvent(eventType: WebhookEventType, payload: Record<string, unknown>): Promise<void> {
  let enabledWebhooks: (typeof webhooks.$inferSelect)[];
  try {
    enabledWebhooks = await db.select().from(webhooks).where(eq(webhooks.enabled, true));
  } catch (error) {
    logger.error('webhook.dispatch.list_failed', {
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const matching = enabledWebhooks.filter((wh) => {
    const events = (wh.events as string[]) ?? [];
    return events.includes(eventType);
  });

  if (matching.length === 0) {
    return;
  }

  const { config } = await readSettingsSection('webhooks');
  const body = JSON.stringify({ event: eventType, payload, timestamp: new Date().toISOString() });

  for (const webhook of matching) {
    const deliveryId = crypto.randomUUID();

    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId: webhook.id,
      eventType,
      payload: { event: eventType, payload, timestamp: new Date().toISOString() },
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: new Date(),
    });

    queueMicrotask(() => {
      void (async () => {
        const signature = await signPayload(webhook.secret, body);
        try {
          await attemptDelivery(deliveryId, webhook, body, signature, config.timeoutSeconds);

          await db.update(webhookDeliveries).set({ attemptCount: 1 }).where(eq(webhookDeliveries.id, deliveryId));

          logger.info('webhook.delivery.succeeded', { deliveryId, webhookId: webhook.id, eventType });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const nextBackoff = new Date(Date.now() + backoffSeconds(0) * 1000);

          await db
            .update(webhookDeliveries)
            .set({
              status: 'failed',
              attemptCount: 1,
              nextAttemptAt: nextBackoff,
              lastError: message,
            })
            .where(eq(webhookDeliveries.id, deliveryId));

          logger.warn('webhook.delivery.failed', { deliveryId, webhookId: webhook.id, eventType, error: message });
        }
      })();
    });
  }
}

// ─── Retry engine ──────────────────────────────────────────────────────────

export async function retryDelivery(deliveryId: string): Promise<WebhookDelivery> {
  const row = await db.query.webhookDeliveries.findFirst({
    where: (table, ops) => ops.eq(table.id, deliveryId),
  });
  if (!row) {
    throw new HttpError(404, `Unknown delivery ${deliveryId}`);
  }

  const webhook = await db.query.webhooks.findFirst({
    where: (table, ops) => ops.eq(table.id, row.webhookId),
  });
  if (!webhook) {
    throw new HttpError(404, `Webhook for delivery ${deliveryId} not found`);
  }

  const { config } = await readSettingsSection('webhooks');
  const body = JSON.stringify(row.payload);
  const signature = await signPayload(webhook.secret, body);
  const currentCount = Number(row.attemptCount);

  await db
    .update(webhookDeliveries)
    .set({ status: 'pending', nextAttemptAt: new Date() })
    .where(eq(webhookDeliveries.id, deliveryId));

  try {
    await attemptDelivery(deliveryId, webhook, body, signature, config.timeoutSeconds);
    await db
      .update(webhookDeliveries)
      .set({ attemptCount: currentCount + 1 })
      .where(eq(webhookDeliveries.id, deliveryId));
    logger.info('webhook.delivery.retried.succeeded', { deliveryId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const newCount = currentCount + 1;
    const isDead = newCount >= config.maxAttempts;
    const nextBackoff = isDead ? null : new Date(Date.now() + backoffSeconds(newCount) * 1000);

    await db
      .update(webhookDeliveries)
      .set({
        status: isDead ? 'dead' : 'failed',
        attemptCount: newCount,
        nextAttemptAt: nextBackoff,
        lastError: message,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    logger.warn('webhook.delivery.retried.failed', { deliveryId, newCount, isDead });
  }

  return getDelivery(deliveryId);
}

export async function retryPendingDeliveries(): Promise<void> {
  const { config } = await readSettingsSection('webhooks');

  const pending = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        or(
          eq(webhookDeliveries.status, 'pending'),
          and(eq(webhookDeliveries.status, 'failed'), lte(webhookDeliveries.nextAttemptAt, new Date())),
        ),
        // Only retry rows that have been delivered at least once (attemptCount > 0)
        // OR scheduled-for-retry ones. Fresh "pending" rows with next_attempt_at <= now()
        // are candidates too.
        lte(webhookDeliveries.nextAttemptAt, new Date()),
      ),
    )
    .limit(50);

  for (const delivery of pending) {
    const webhook = await db.query.webhooks.findFirst({
      where: (table, ops) => ops.eq(table.id, delivery.webhookId),
    });
    if (!webhook) continue;

    const body = JSON.stringify(delivery.payload);
    const signature = await signPayload(webhook.secret, body);
    const currentCount = Number(delivery.attemptCount);

    try {
      await attemptDelivery(delivery.id, webhook, body, signature, config.timeoutSeconds);
      await db
        .update(webhookDeliveries)
        .set({ attemptCount: currentCount + 1 })
        .where(eq(webhookDeliveries.id, delivery.id));
      logger.info('webhook.retry.succeeded', { deliveryId: delivery.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const newCount = currentCount + 1;
      const isDead = newCount >= config.maxAttempts;
      const nextBackoff = isDead ? null : new Date(Date.now() + backoffSeconds(newCount) * 1000);

      await db
        .update(webhookDeliveries)
        .set({
          status: isDead ? 'dead' : 'failed',
          attemptCount: newCount,
          nextAttemptAt: nextBackoff,
          lastError: message,
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    }
  }
}

// ─── Scheduler ─────────────────────────────────────────────────────────────

let webhookSchedulerStarted = false;

async function scheduleNextWebhookTick() {
  if (!webhookSchedulerStarted) return;

  const timer = setTimeout(() => {
    void retryPendingDeliveries()
      .catch((error) => {
        logger.error('webhook.scheduler.tick_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        void scheduleNextWebhookTick();
      });
  }, 30_000);
  timer.unref?.();
}

export function startWebhookScheduler() {
  if (webhookSchedulerStarted) return;
  webhookSchedulerStarted = true;
  void scheduleNextWebhookTick();
  logger.info('webhook.scheduler.started');
}

// ─── Pruner ────────────────────────────────────────────────────────────────

export async function pruneOldDeliveries(): Promise<number> {
  const { config } = await readSettingsSection('webhooks');
  const cutoff = new Date(Date.now() - config.retainDeliveryDays * 24 * 60 * 60 * 1000);

  const [result] = (await db.execute(
    drizzleSql`with deleted as (
      delete from _webhook_deliveries
      where created_at < ${cutoff}
      returning 1
    ) select count(*)::text as count from deleted`,
  )) as unknown as [{ count: string }];

  return Number(result?.count ?? 0);
}
