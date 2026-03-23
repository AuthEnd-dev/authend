import type { ApiPreviewOperation, ApiResource } from "@authend/shared";
import { Hono } from "hono";
import { resolveRequestActor, type RequestActor } from "../middleware/auth";
import { HttpError } from "../lib/http";
import { apiKeyPermissionName, buildApiResource, listApiResources } from "../services/api-design-service";
import {
  createRecord,
  deleteRecord,
  getRecord,
  getClientTableDescriptor,
  listRecords,
  updateRecord,
} from "../services/crud-service";

function canAccessOperation(resource: ApiResource, actor: RequestActor, operation: ApiPreviewOperation["key"]) {
  if (!resource.config.operations[operation]) {
    return false;
  }

  if (actor.kind === "superadmin") {
    return true;
  }

  const access = resource.config.access[operation];
  if (!access.actors.includes(actor.kind)) {
    return false;
  }

  if (access.scope === "own" && actor.subjectId === null) {
    return false;
  }

  if (actor.kind === "apiKey") {
    return actor.permissions.has(apiKeyPermissionName(resource.routeSegment, operation));
  }

  return true;
}

async function authoriseDataOperation(tableInput: string, actor: RequestActor, operation: ApiPreviewOperation["key"]) {
  const resource = await buildApiResource(tableInput);

  if (!resource.config.operations[operation]) {
    throw new HttpError(405, `${operation.toUpperCase()} is disabled for ${resource.routeSegment}`);
  }

  if (actor.kind === "superadmin") {
    return {
      resource,
      access: {
        ownershipField: resource.config.access.ownershipField ?? null,
        subjectId: actor.subjectId,
        bypassOwnership: true,
      },
    };
  }

  const access = resource.config.access[operation];
  if (!access.actors.includes(actor.kind)) {
    if (actor.kind === "public") {
      throw new HttpError(401, "Authentication required");
    }
    throw new HttpError(403, `${actor.kind} cannot ${operation} ${resource.routeSegment}`);
  }

  if (access.scope === "own" && actor.subjectId === null) {
    if (actor.kind === "public") {
      throw new HttpError(401, "Authentication required");
    }
    throw new HttpError(403, "Owner-scoped access requires a subject id");
  }

  if (actor.kind === "apiKey") {
    const permission = apiKeyPermissionName(resource.routeSegment, operation);
    if (!actor.permissions.has(permission)) {
      throw new HttpError(403, `Missing API key permission ${permission}`);
    }
  }

  return {
    resource,
    access: {
      ownershipField: access.scope === "own" ? resource.config.access.ownershipField ?? null : null,
      subjectId: actor.subjectId,
      bypassOwnership: false,
    },
  };
}

export const dataRouter = new Hono()
  .get("/", async (c) => {
    const actor = await resolveRequestActor(c);
    const resources = await listApiResources();
    return c.json({
      tables: resources.filter((resource) => canAccessOperation(resource, actor, "list")).map((resource) => resource.table),
    });
  })
  .get("/meta/:table", async (c) => {
    const actor = await resolveRequestActor(c);
    const table = c.req.param("table");
    const resource = await buildApiResource(table);
    const visible = (["list", "get", "create", "update", "delete"] as const).some((operation) => canAccessOperation(resource, actor, operation));
    if (!visible) {
      if (actor.kind === "public") {
        throw new HttpError(401, "Authentication required");
      }
      throw new HttpError(403, `Cannot access metadata for ${resource.routeSegment}`);
    }
    return c.json(await getClientTableDescriptor(table));
  })
  .get("/:table", async (c) => {
    const table = c.req.param("table");
    const actor = await resolveRequestActor(c);
    const { resource, access } = await authoriseDataOperation(table, actor, "list");
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
  .post("/:table", async (c) => {
    const table = c.req.param("table");
    const actor = await resolveRequestActor(c);
    const { access } = await authoriseDataOperation(table, actor, "create");
    return c.json(await createRecord(table, await c.req.json(), { access }));
  })
  .get("/:table/:id", async (c) => {
    const actor = await resolveRequestActor(c);
    const { access } = await authoriseDataOperation(c.req.param("table"), actor, "get");
    return c.json(await getRecord(c.req.param("table"), c.req.param("id"), { access }));
  })
  .patch("/:table/:id", async (c) => {
    const actor = await resolveRequestActor(c);
    const { access } = await authoriseDataOperation(c.req.param("table"), actor, "update");
    return c.json(await updateRecord(c.req.param("table"), c.req.param("id"), await c.req.json(), { access }));
  })
  .delete("/:table/:id", async (c) => {
    const actor = await resolveRequestActor(c);
    const { access } = await authoriseDataOperation(c.req.param("table"), actor, "delete");
    await deleteRecord(c.req.param("table"), c.req.param("id"), { access });
    return c.body(null, 204);
  });
