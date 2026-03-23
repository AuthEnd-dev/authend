import { listApiResources } from "./api-design-service";
import { getTableDescriptor } from "./crud-service";

function staticPaths() {
  return {
    "/api/auth/*": {
      get: { summary: "Better Auth endpoints" },
      post: { summary: "Better Auth endpoints" },
    },
    "/api/setup/status": {
      get: { summary: "Get bootstrap and migration status" },
    },
    "/api/system/sdk-schema": {
      get: { summary: "Get the typed SDK generation schema manifest" },
    },
    "/api/admin/plugins": {
      get: { summary: "List plugin catalog" },
    },
    "/api/admin/ai/threads": {
      get: { summary: "List AI assistant threads" },
      post: { summary: "Create a new AI assistant thread" },
    },
    "/api/admin/ai/threads/{threadId}": {
      get: { summary: "Get an AI assistant thread with messages and runs" },
    },
    "/api/admin/ai/threads/{threadId}/messages": {
      post: { summary: "Send a message to the AI assistant and receive a preview-only action batch" },
    },
    "/api/admin/ai/runs/{runId}/approve": {
      post: { summary: "Approve and execute a pending AI assistant run" },
    },
    "/api/admin/ai/runs/{runId}/reject": {
      post: { summary: "Reject a pending AI assistant run" },
    },
    "/api/admin/schema": {
      get: { summary: "Read current schema draft" },
    },
    "/api/admin/schema/preview": {
      post: { summary: "Preview SQL for a schema draft" },
    },
    "/api/admin/schema/apply": {
      post: { summary: "Apply schema draft" },
    },
    "/api/admin/migrations": {
      get: { summary: "List migration history" },
    },
    "/api/admin/migrations/preview": {
      post: { summary: "Preview pending migrations" },
    },
    "/api/admin/migrations/apply": {
      post: { summary: "Apply pending migrations" },
    },
    "/api/admin/api-preview": {
      get: { summary: "List normalized API resource contracts" },
    },
    "/api/admin/api-preview/{table}": {
      get: { summary: "Get the API preview for a single table" },
      post: { summary: "Save the API preview configuration for a generated table" },
    },
  } as const;
}

function authSecurity(
  actors: Array<"public" | "session" | "superadmin" | "apiKey">,
) {
  const security: Array<Record<string, string[]>> = [];

  if (actors.includes("public")) {
    security.push({});
  }

  if (actors.includes("session") || actors.includes("superadmin")) {
    security.push({ betterAuthSession: [] });
  }

  if (actors.includes("apiKey")) {
    security.push({ apiKeyAuth: [] });
  }

  return security;
}

function authDescription(
  actors: Array<"public" | "session" | "superadmin" | "apiKey">,
  scope: "all" | "own",
  ownershipField?: string | null,
) {
  const labels = [
    actors.includes("public") ? "public callers" : null,
    actors.includes("session") ? "signed-in users" : null,
    actors.includes("apiKey") ? "API keys" : null,
    actors.includes("superadmin") ? "superadmins" : null,
  ].filter(Boolean);

  const base = labels.length > 0 ? `Allowed callers: ${labels.join(", ")}.` : "No callers are allowed.";
  if (scope === "own" && ownershipField) {
    return `${base} Owner scope is enforced through ${ownershipField}.`;
  }

  return base;
}

function fieldSchema(field: { type: string; nullable?: boolean; enumValues?: string[] | null }) {
  const schema: Record<string, unknown> = {};

  switch (field.type) {
    case "boolean":
      schema.type = "boolean";
      break;
    case "integer":
    case "bigint":
      schema.type = "integer";
      break;
    case "numeric":
      schema.type = "string";
      schema.pattern = "^-?\\d+(\\.\\d+)?$";
      break;
    case "jsonb":
      schema.type = ["object", "array", "string", "number", "boolean", "null"];
      break;
    case "uuid":
      schema.type = "string";
      schema.format = "uuid";
      break;
    case "date":
      schema.type = "string";
      schema.format = "date";
      break;
    case "timestamp":
      schema.type = "string";
      schema.format = "date-time";
      break;
    case "enum":
      schema.type = "string";
      schema.enum = field.enumValues ?? [];
      break;
    default:
      schema.type = "string";
      break;
  }

  if (field.nullable) {
    schema.nullable = true;
  }

  return schema;
}

async function resourceSchemas(resource: Awaited<ReturnType<typeof listApiResources>>[number]) {
  const descriptor = await getTableDescriptor(resource.table);
  const properties = Object.fromEntries(resource.fields.map((field) => [field.name, fieldSchema(field)]));
  const required = resource.fields.filter((field) => !field.nullable).map((field) => field.name);
  const writeProperties = Object.fromEntries(
    descriptor.fields
      .filter((field) => field.name !== resource.primaryKey)
      .map((field) => [field.name, fieldSchema(field)]),
  );
  const writeRequired = descriptor.fields
    .filter((field) => field.name !== resource.primaryKey && !field.nullable && !field.default)
    .map((field) => field.name);
  const componentBase = resource.config.sdkName ?? resource.table;

  return {
    [`${componentBase}Record`]: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
    [`${componentBase}Write`]: {
      type: "object",
      properties: writeProperties,
      required: writeRequired,
      additionalProperties: false,
    },
    [`${componentBase}ListResponse`]: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            $ref: `#/components/schemas/${componentBase}Record`,
          },
        },
        total: { type: "integer" },
        page: { type: "integer" },
        pageSize: { type: "integer" },
      },
      required: ["items", "total", "page", "pageSize"],
      additionalProperties: false,
    },
  };
}

export async function buildOpenApiSpec() {
  const resources = await listApiResources();
  const paths: Record<string, Record<string, unknown>> = {
    ...staticPaths(),
  };
  const schemas: Record<string, unknown> = {};

  for (const resource of resources) {
    Object.assign(schemas, await resourceSchemas(resource));

    const collectionPath = resource.routeBase;
    const detailPath = `${resource.routeBase}/{id}`;
    const listOperation = resource.operations.find((operation) => operation.key === "list");
    const createOperation = resource.operations.find((operation) => operation.key === "create");
    const getOperation = resource.operations.find((operation) => operation.key === "get");
    const updateOperation = resource.operations.find((operation) => operation.key === "update");
    const deleteOperation = resource.operations.find((operation) => operation.key === "delete");
    const componentBase = resource.config.sdkName ?? resource.table;

    paths[collectionPath] = {};
    paths[detailPath] = {};

    if (listOperation?.enabled) {
      const listAccess = resource.config.access.list;
      paths[collectionPath].get = {
        summary: listOperation.summary,
        operationId: listOperation.operationId,
        tags: [resource.config.tag],
        security: authSecurity(listAccess.actors),
        description: authDescription(listAccess.actors, listAccess.scope, resource.config.access.ownershipField),
        parameters: listOperation.queryParams.map((param) => ({
          name: param.name,
          in: "query",
          required: param.required,
          description: param.description,
          schema: { type: "string" },
        })),
        responses: {
          200: {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${componentBase}ListResponse`,
                },
              },
            },
          },
        },
        "x-authend-resource": {
          table: resource.table,
          routeSegment: resource.routeSegment,
          sdkName: resource.config.sdkName,
          authMode: resource.security.authMode,
          access: listAccess,
          query: resource.query,
        },
      };
    }

    if (createOperation?.enabled) {
      const createAccess = resource.config.access.create;
      paths[collectionPath].post = {
        summary: createOperation.summary,
        operationId: createOperation.operationId,
        tags: [resource.config.tag],
        security: authSecurity(createAccess.actors),
        description: authDescription(createAccess.actors, createAccess.scope, resource.config.access.ownershipField),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${componentBase}Write`,
              },
            },
          },
        },
        responses: {
          200: {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${componentBase}Record`,
                },
              },
            },
          },
        },
        "x-authend-resource": {
          table: resource.table,
          routeSegment: resource.routeSegment,
          sdkName: resource.config.sdkName,
          authMode: resource.security.authMode,
          access: createAccess,
        },
      };
    }

    if (getOperation?.enabled) {
      const getAccess = resource.config.access.get;
      paths[detailPath].get = {
        summary: getOperation.summary,
        operationId: getOperation.operationId,
        tags: [resource.config.tag],
        security: authSecurity(getAccess.actors),
        description: authDescription(getAccess.actors, getAccess.scope, resource.config.access.ownershipField),
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          200: {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${componentBase}Record`,
                },
              },
            },
          },
        },
        "x-authend-resource": {
          table: resource.table,
          routeSegment: resource.routeSegment,
          sdkName: resource.config.sdkName,
          authMode: resource.security.authMode,
          access: getAccess,
        },
      };
    }

    if (updateOperation?.enabled) {
      const updateAccess = resource.config.access.update;
      paths[detailPath].patch = {
        summary: updateOperation.summary,
        operationId: updateOperation.operationId,
        tags: [resource.config.tag],
        security: authSecurity(updateAccess.actors),
        description: authDescription(updateAccess.actors, updateAccess.scope, resource.config.access.ownershipField),
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${componentBase}Write`,
              },
            },
          },
        },
        responses: {
          200: {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${componentBase}Record`,
                },
              },
            },
          },
        },
        "x-authend-resource": {
          table: resource.table,
          routeSegment: resource.routeSegment,
          sdkName: resource.config.sdkName,
          authMode: resource.security.authMode,
          access: updateAccess,
        },
      };
    }

    if (deleteOperation?.enabled) {
      const deleteAccess = resource.config.access.delete;
      paths[detailPath].delete = {
        summary: deleteOperation.summary,
        operationId: deleteOperation.operationId,
        tags: [resource.config.tag],
        security: authSecurity(deleteAccess.actors),
        description: authDescription(deleteAccess.actors, deleteAccess.scope, resource.config.access.ownershipField),
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          204: {
            description: "Record deleted",
          },
        },
        "x-authend-resource": {
          table: resource.table,
          routeSegment: resource.routeSegment,
          sdkName: resource.config.sdkName,
          authMode: resource.security.authMode,
          access: deleteAccess,
        },
      };
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Authend API",
      version: "0.1.0",
    },
    paths,
    components: {
      securitySchemes: {
        betterAuthSession: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description: "Better Auth session cookie.",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Better Auth API key header.",
        },
      },
      schemas,
    },
  };
}
