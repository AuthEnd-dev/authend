import type { ApiPreviewOperation, ApiResource } from '@authend/shared';
import { Hono } from 'hono';
import { requireSuperAdmin, resolveAdminRequestActor, resolveRequestActor, type RequestActor } from '../middleware/auth';
import { HttpError } from '../lib/http';
import { apiKeyPermissionName, buildApiResource, listApiResources } from '../services/api-design-service';
import { rateLimitDataRequest } from '../services/rate-limit-service';
import {
  createRecord,
  deleteRecord,
  getRecord,
  getClientTableDescriptor,
  listRecords,
  updateRecord,
} from '../services/crud-service';

function accessAllowsActor(resource: ApiResource, actor: RequestActor, operation: ApiPreviewOperation['key']) {
  const access = resource.config.access[operation];

  if (access.actors.includes('public')) {
    return true;
  }

  if (!access.actors.includes(actor.kind)) {
    return false;
  }

  if (actor.kind === 'apiKey') {
    return actor.permissions.has(apiKeyPermissionName(resource.routeSegment, operation));
  }

  return true;
}

function canAccessOperation(resource: ApiResource, actor: RequestActor, operation: ApiPreviewOperation['key']) {
  if (!resource.config.operations[operation]) {
    return false;
  }

  if (actor.kind === 'superadmin') {
    return true;
  }

  const access = resource.config.access[operation];
  if (!accessAllowsActor(resource, actor, operation)) {
    return false;
  }

  if (access.scope === 'own' && actor.subjectId === null) {
    return false;
  }

  return true;
}

export async function authoriseDataOperationWithActor(
  tableInput: string,
  actor: RequestActor,
  operation: ApiPreviewOperation['key'],
) {
  await getClientTableDescriptor(tableInput, { actorKind: actor.kind, subjectId: actor.subjectId });
  const resource = await buildApiResource(tableInput);

  if (!resource.config.operations[operation]) {
    throw new HttpError(405, `${operation.toUpperCase()} is disabled for ${resource.routeSegment}`);
  }

  if (actor.kind === 'superadmin') {
    return {
      resource,
      access: {
        actorKind: actor.kind,
        ownershipField: resource.config.access.ownershipField ?? null,
        subjectId: actor.subjectId,
        bypassOwnership: true,
      },
    };
  }

  const access = resource.config.access[operation];
  if (!accessAllowsActor(resource, actor, operation)) {
    if (actor.kind === 'public') {
      throw new HttpError(401, 'Authentication required');
    }
    throw new HttpError(403, `${actor.kind} cannot ${operation} ${resource.routeSegment}`);
  }

  if (access.scope === 'own' && actor.subjectId === null) {
    if (actor.kind === 'public') {
      throw new HttpError(401, 'Authentication required');
    }
    throw new HttpError(403, 'Owner-scoped access requires a subject id');
  }

  if (actor.kind === 'apiKey' && !access.actors.includes('public')) {
    const permission = apiKeyPermissionName(resource.routeSegment, operation);
    if (!actor.permissions.has(permission)) {
      throw new HttpError(403, `Missing API key permission ${permission}`);
    }
  }

  return {
    resource,
    access: {
      actorKind: actor.kind,
      ownershipField: access.scope === 'own' ? (resource.config.access.ownershipField ?? null) : null,
      subjectId: actor.subjectId,
      bypassOwnership: false,
      permissions: actor.kind === 'apiKey' ? actor.permissions : undefined,
    },
  };
}

function readClientIp(c: Parameters<typeof resolveRequestActor>[0]) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const [first] = forwarded.split(',');
    if (first?.trim()) {
      return first.trim();
    }
  }

  const realIp = c.req.header('x-real-ip') ?? c.req.header('cf-connecting-ip');
  if (realIp?.trim()) {
    return realIp.trim();
  }

  return 'unknown';
}

async function applyDataRateLimit(c: Parameters<typeof resolveRequestActor>[0], actor: RequestActor) {
  if (actor.kind !== 'public' && actor.kind !== 'apiKey') {
    return;
  }

  const identifier = actor.kind === 'apiKey' ? actor.keyId : readClientIp(c);
  const decision = await rateLimitDataRequest(actor, identifier);
  if (!decision) {
    return;
  }

  c.header('x-ratelimit-limit', String(decision.limit));
  c.header('x-ratelimit-remaining', String(decision.remaining));
  c.header('x-ratelimit-reset', String(Math.ceil(decision.resetAt / 1000)));

  if (decision.limited) {
    c.header('retry-after', String(decision.retryAfterSeconds));
    throw new HttpError(429, 'Rate limit exceeded', {
      retryAfterSeconds: decision.retryAfterSeconds,
    });
  }
}

function buildDataRouter(options: { adminOnly: boolean; rateLimited: boolean }) {
  const router = new Hono();

  if (options.adminOnly) {
    router.use('*', requireSuperAdmin);
  }

  return router
    .get('/', async (c) => {
      const actor = options.adminOnly ? await resolveAdminRequestActor(c) : await resolveRequestActor(c);
      if (options.rateLimited) {
        await applyDataRateLimit(c, actor);
      }
      const resources = await listApiResources(actor.kind);
      return c.json({
        tables: resources.filter((resource) => canAccessOperation(resource, actor, 'list')).map((resource) => resource.table),
      });
    })
    .get('/meta/:table', async (c) => {
      const actor = options.adminOnly ? await resolveAdminRequestActor(c) : await resolveRequestActor(c);
      if (options.rateLimited) {
        await applyDataRateLimit(c, actor);
      }
      const table = c.req.param('table');
      const resource = await buildApiResource(table);
      const visible = (['list', 'get', 'create', 'update', 'delete'] as const).some((operation) =>
        canAccessOperation(resource, actor, operation),
      );
      if (!visible) {
        if (actor.kind === 'public') {
          throw new HttpError(401, 'Authentication required');
        }
        throw new HttpError(403, `Cannot access metadata for ${resource.routeSegment}`);
      }
      return c.json(
        await getClientTableDescriptor(table, {
          actorKind: actor.kind,
          subjectId: actor.subjectId,
          permissions: actor.kind === 'apiKey' ? actor.permissions : undefined,
        }),
      );
    })
    .get('/:table', async (c) => {
      const table = c.req.param('table');
      const actor = options.adminOnly ? await resolveAdminRequestActor(c) : await resolveRequestActor(c);
      if (options.rateLimited) {
        await applyDataRateLimit(c, actor);
      }
      const { resource, access } = await authoriseDataOperationWithActor(table, actor, 'list');
      return c.json(
        await listRecords(table, new URL(c.req.url).searchParams, {
          pagination: resource.query.pagination,
          filtering: resource.query.filtering,
          sorting: resource.query.sorting,
          includes: resource.query.includes,
          access,
        }),
      );
    })
    .post('/:table', async (c) => {
      const table = c.req.param('table');
      const actor = options.adminOnly ? await resolveAdminRequestActor(c) : await resolveRequestActor(c);
      if (options.rateLimited) {
        await applyDataRateLimit(c, actor);
      }
      const { access } = await authoriseDataOperationWithActor(table, actor, 'create');
      return c.json(await createRecord(table, await c.req.json(), { access }));
    })
    .get('/:table/:id', async (c) => {
      const actor = options.adminOnly ? await resolveAdminRequestActor(c) : await resolveRequestActor(c);
      if (options.rateLimited) {
        await applyDataRateLimit(c, actor);
      }
      const { access } = await authoriseDataOperationWithActor(c.req.param('table'), actor, 'get');
      return c.json(await getRecord(c.req.param('table'), c.req.param('id'), { access }));
    })
    .patch('/:table/:id', async (c) => {
      const actor = options.adminOnly ? await resolveAdminRequestActor(c) : await resolveRequestActor(c);
      if (options.rateLimited) {
        await applyDataRateLimit(c, actor);
      }
      const { access } = await authoriseDataOperationWithActor(c.req.param('table'), actor, 'update');
      return c.json(await updateRecord(c.req.param('table'), c.req.param('id'), await c.req.json(), { access }));
    })
    .delete('/:table/:id', async (c) => {
      const actor = options.adminOnly ? await resolveAdminRequestActor(c) : await resolveRequestActor(c);
      if (options.rateLimited) {
        await applyDataRateLimit(c, actor);
      }
      const { access } = await authoriseDataOperationWithActor(c.req.param('table'), actor, 'delete');
      await deleteRecord(c.req.param('table'), c.req.param('id'), { access });
      return c.body(null, 204);
    });
}

export const dataRouter = buildDataRouter({
  adminOnly: false,
  rateLimited: true,
});

export const adminDataRouter = buildDataRouter({
  adminOnly: true,
  rateLimited: false,
});
