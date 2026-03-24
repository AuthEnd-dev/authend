import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";

type AppModule = typeof import("./app");
type BootstrapModule = typeof import("./services/bootstrap-service");
type SchemaModule = typeof import("./services/schema-service");
type CrudModule = typeof import("./services/crud-service");
type PluginModule = typeof import("./services/plugin-service");
type DbModule = typeof import("./db/client");
type MigrationModule = typeof import("./services/migration-service");
type SettingsStoreModule = typeof import("./services/settings-store");
type RateLimitModule = typeof import("./services/rate-limit-service");

const sourceDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/authend";

const appUrl = "http://localhost:7002";
const adminUrl = "http://localhost:7001";
const testDatabaseName = `authend_phase0a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-z0-9_]/g, "_");
const databaseUrl = new URL(sourceDatabaseUrl);
const adminDatabaseUrl = new URL(sourceDatabaseUrl);
adminDatabaseUrl.pathname = "/postgres";
databaseUrl.pathname = `/${testDatabaseName}`;

class CookieJar {
  #cookies = new Map<string, string>();

  addFrom(response: Response) {
    const headers = response.headers as Headers & {
      getSetCookie?: () => string[];
      toJSON?: () => Record<string, string>;
    };

    const setCookies =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")!]
          : [];

    for (const header of setCookies) {
      const [pair] = header.split(";", 1);
      const separator = pair.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      const key = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      this.#cookies.set(key, value);
    }
  }

  toHeader() {
    return Array.from(this.#cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }
}

function jsonHeaders(cookieJar?: CookieJar) {
  return {
    "content-type": "application/json",
    origin: appUrl,
    ...(cookieJar && cookieJar.toHeader() ? { cookie: cookieJar.toHeader() } : {}),
  };
}

describe("Phase 0A integration hardening", () => {
  let adminSql: ReturnType<typeof postgres>;
  let appModule: AppModule;
  let bootstrapModule: BootstrapModule;
  let schemaModule: SchemaModule;
  let crudModule: CrudModule;
  let pluginModule: PluginModule;
  let dbModule: DbModule;
  let migrationModule: MigrationModule;
  let settingsStoreModule: SettingsStoreModule;
  let rateLimitModule: RateLimitModule;
  let app: ReturnType<AppModule["createApp"]>;
  let cookieJar: CookieJar;

  beforeAll(async () => {
    adminSql = postgres(adminDatabaseUrl.toString(), {
      prepare: false,
      max: 1,
    });

    await adminSql.unsafe(`create database "${testDatabaseName}"`);

    process.env.NODE_ENV = "test";
    process.env.APP_URL = appUrl;
    process.env.ADMIN_URL = adminUrl;
    process.env.ADMIN_DEV_URL = adminUrl;
    process.env.CORS_ORIGIN = appUrl;
    process.env.DATABASE_URL = databaseUrl.toString();
    process.env.BETTER_AUTH_SECRET = "phase0a-super-secret-value-123456";
    process.env.SUPERADMIN_EMAIL = "admin@authend.test";
    process.env.SUPERADMIN_PASSWORD = "ChangeMe123!";
    process.env.SUPERADMIN_NAME = "Authend Admin";

    [appModule, bootstrapModule, schemaModule, crudModule, pluginModule, dbModule, migrationModule, settingsStoreModule, rateLimitModule] = await Promise.all([
      import("./app"),
      import("./services/bootstrap-service"),
      import("./services/schema-service"),
      import("./services/crud-service"),
      import("./services/plugin-service"),
      import("./db/client"),
      import("./services/migration-service"),
      import("./services/settings-store"),
      import("./services/rate-limit-service"),
    ]);

    await migrationModule.ensureCoreSchema();
    await pluginModule.seedPluginConfigs();
    await pluginModule.ensureEnabledPluginsProvisioned();
    await pluginModule.enablePlugin("apiKey");
    await bootstrapModule.seedSuperAdmin();

    await schemaModule.applyDraft({
      tables: [
        {
          name: "notes",
          displayName: "Notes",
          primaryKey: "id",
          fields: [
            {
              name: "id",
              type: "uuid",
              nullable: false,
              unique: true,
              indexed: true,
              default: "gen_random_uuid()",
            },
            {
              name: "title",
              type: "text",
              nullable: false,
              unique: false,
              indexed: false,
            },
            {
              name: "body",
              type: "text",
              nullable: true,
              unique: false,
              indexed: false,
            },
          ],
          indexes: [],
          api: {
            authMode: "superadmin",
            access: {
              ownershipField: null,
              list: { actors: ["superadmin"], scope: "all" },
              get: { actors: ["superadmin"], scope: "all" },
              create: { actors: ["superadmin"], scope: "all" },
              update: { actors: ["superadmin"], scope: "all" },
              delete: { actors: ["superadmin"], scope: "all" },
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
              fields: ["title", "body"],
            },
            sorting: {
              enabled: true,
              fields: ["id", "title"],
              defaultField: "id",
              defaultOrder: "desc",
            },
            includes: {
              enabled: false,
              fields: [],
            },
            hiddenFields: [],
            fieldVisibility: {},
          },
        },
        {
          name: "authors",
          displayName: "Authors",
          primaryKey: "id",
          fields: [
            {
              name: "id",
              type: "uuid",
              nullable: false,
              unique: true,
              indexed: true,
              default: "gen_random_uuid()",
            },
            {
              name: "display_name",
              type: "text",
              nullable: false,
              unique: false,
              indexed: false,
            },
            {
              name: "email",
              type: "text",
              nullable: false,
              unique: false,
              indexed: true,
            },
          ],
          indexes: [],
          api: {
            authMode: "public",
            access: {
              ownershipField: null,
              list: { actors: ["public"], scope: "all" },
              get: { actors: ["public"], scope: "all" },
              create: { actors: [], scope: "all" },
              update: { actors: [], scope: "all" },
              delete: { actors: [], scope: "all" },
            },
            operations: {
              list: true,
              get: true,
              create: false,
              update: false,
              delete: false,
            },
            pagination: {
              enabled: true,
              defaultPageSize: 20,
              maxPageSize: 100,
            },
            filtering: {
              enabled: true,
              fields: ["display_name"],
            },
            sorting: {
              enabled: true,
              fields: ["id", "display_name"],
              defaultField: "id",
              defaultOrder: "desc",
            },
            includes: {
              enabled: false,
              fields: [],
            },
            hiddenFields: ["email"],
            fieldVisibility: {},
          },
        },
        {
          name: "articles",
          displayName: "Articles",
          primaryKey: "id",
          fields: [
            {
              name: "id",
              type: "uuid",
              nullable: false,
              unique: true,
              indexed: true,
              default: "gen_random_uuid()",
            },
            {
              name: "title",
              type: "text",
              nullable: false,
              unique: false,
              indexed: false,
            },
            {
              name: "body",
              type: "text",
              nullable: true,
              unique: false,
              indexed: false,
            },
            {
              name: "internal_notes",
              type: "text",
              nullable: true,
              unique: false,
              indexed: false,
            },
            {
              name: "member_excerpt",
              type: "text",
              nullable: true,
              unique: false,
              indexed: false,
            },
            {
              name: "author_id",
              type: "uuid",
              nullable: false,
              unique: false,
              indexed: true,
              references: {
                table: "authors",
                column: "id",
                onDelete: "restrict",
                onUpdate: "cascade",
              },
            },
          ],
          indexes: [],
          api: {
            authMode: "public",
            access: {
              ownershipField: null,
              list: { actors: ["public"], scope: "all" },
              get: { actors: ["public"], scope: "all" },
              create: { actors: [], scope: "all" },
              update: { actors: [], scope: "all" },
              delete: { actors: [], scope: "all" },
            },
            operations: {
              list: true,
              get: true,
              create: false,
              update: false,
              delete: false,
            },
            pagination: {
              enabled: true,
              defaultPageSize: 20,
              maxPageSize: 100,
            },
            filtering: {
              enabled: true,
              fields: ["title", "body"],
            },
            sorting: {
              enabled: true,
              fields: ["id", "title"],
              defaultField: "id",
              defaultOrder: "desc",
            },
            includes: {
              enabled: true,
              fields: ["author_id"],
            },
            hiddenFields: ["internal_notes"],
            fieldVisibility: {
              member_excerpt: {
                read: ["session", "apiKey"],
                create: [],
                update: [],
              },
            },
          },
        },
        {
          name: "profiles",
          displayName: "Profiles",
          primaryKey: "id",
          fields: [
            {
              name: "id",
              type: "uuid",
              nullable: false,
              unique: true,
              indexed: true,
              default: "gen_random_uuid()",
            },
            {
              name: "owner_id",
              type: "text",
              nullable: false,
              unique: false,
              indexed: true,
            },
            {
              name: "display_name",
              type: "text",
              nullable: false,
              unique: false,
              indexed: false,
            },
            {
              name: "moderation_state",
              type: "text",
              nullable: true,
              unique: false,
              indexed: false,
            },
            {
              name: "internal_notes",
              type: "text",
              nullable: true,
              unique: false,
              indexed: false,
            },
          ],
          indexes: [],
          api: {
            authMode: "session",
            access: {
              ownershipField: "owner_id",
              list: { actors: ["session"], scope: "own" },
              get: { actors: ["session"], scope: "own" },
              create: { actors: ["session"], scope: "own" },
              update: { actors: ["session"], scope: "own" },
              delete: { actors: ["session"], scope: "own" },
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
              fields: ["display_name"],
            },
            sorting: {
              enabled: true,
              fields: ["id", "display_name"],
              defaultField: "id",
              defaultOrder: "desc",
            },
            includes: {
              enabled: false,
              fields: [],
            },
            hiddenFields: ["internal_notes"],
            fieldVisibility: {
              moderation_state: {
                read: ["session", "apiKey"],
                create: ["apiKey"],
                update: ["apiKey"],
              },
            },
          },
        },
        {
          name: "server_tasks",
          displayName: "Server Tasks",
          primaryKey: "id",
          fields: [
            {
              name: "id",
              type: "uuid",
              nullable: false,
              unique: true,
              indexed: true,
              default: "gen_random_uuid()",
            },
            {
              name: "title",
              type: "text",
              nullable: false,
              unique: false,
              indexed: false,
            },
            {
              name: "status",
              type: "text",
              nullable: false,
              unique: false,
              indexed: false,
            },
          ],
          indexes: [],
          api: {
            authMode: "session",
            access: {
              ownershipField: null,
              list: { actors: ["apiKey"], scope: "all" },
              get: { actors: ["apiKey"], scope: "all" },
              create: { actors: ["apiKey"], scope: "all" },
              update: { actors: ["apiKey"], scope: "all" },
              delete: { actors: ["apiKey"], scope: "all" },
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
              fields: ["title", "status"],
            },
            sorting: {
              enabled: true,
              fields: ["id", "title"],
              defaultField: "id",
              defaultOrder: "desc",
            },
            includes: {
              enabled: false,
              fields: [],
            },
            hiddenFields: [],
            fieldVisibility: {},
          },
        },
        {
          name: "profile_cards",
          displayName: "Profile Cards",
          primaryKey: "id",
          fields: [
            {
              name: "id",
              type: "uuid",
              nullable: false,
              unique: true,
              indexed: true,
              default: "gen_random_uuid()",
            },
            {
              name: "headline",
              type: "text",
              nullable: false,
              unique: false,
              indexed: false,
            },
            {
              name: "profile_id",
              type: "uuid",
              nullable: false,
              unique: false,
              indexed: true,
              references: {
                table: "profiles",
                column: "id",
                onDelete: "restrict",
                onUpdate: "cascade",
              },
            },
          ],
          indexes: [],
          api: {
            authMode: "public",
            access: {
              ownershipField: null,
              list: { actors: ["public"], scope: "all" },
              get: { actors: ["public"], scope: "all" },
              create: { actors: [], scope: "all" },
              update: { actors: [], scope: "all" },
              delete: { actors: [], scope: "all" },
            },
            operations: {
              list: true,
              get: true,
              create: false,
              update: false,
              delete: false,
            },
            pagination: {
              enabled: true,
              defaultPageSize: 20,
              maxPageSize: 100,
            },
            filtering: {
              enabled: true,
              fields: ["headline"],
            },
            sorting: {
              enabled: true,
              fields: ["id", "headline"],
              defaultField: "id",
              defaultOrder: "desc",
            },
            includes: {
              enabled: true,
              fields: ["profile_id"],
            },
            hiddenFields: [],
            fieldVisibility: {},
          },
        },
      ],
      relations: [],
    });

    const author = await crudModule.createRecord("authors", {
      display_name: "Phase One Author",
      email: "author@authend.test",
    });

    await crudModule.createRecord("articles", {
      title: "Ship app-facing policies",
      body: "Make the public data plane safe and easy.",
      internal_notes: "draft-internal",
      member_excerpt: "Members get the rollout details.",
      author_id: author.id,
    }, {
      access: {
        actorKind: "superadmin",
        bypassOwnership: true,
      },
    });

    app = appModule.createApp();
    cookieJar = new CookieJar();
  });

  afterAll(async () => {
    await dbModule.sql.end({ timeout: 0 });
    await adminSql.unsafe(`drop database if exists "${testDatabaseName}" with (force)`);
    await adminSql.end({ timeout: 0 });
  });

  async function appRequest(path: string, init: RequestInit = {}) {
    const response = await app.request(`${appUrl}${path}`, init);
    cookieJar.addFrom(response);
    return response;
  }

  async function createUserSession(email: string, name: string) {
    const userCookieJar = new CookieJar();
    const signUpResponse = await app.request(`${appUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: jsonHeaders(userCookieJar),
      body: JSON.stringify({
        email,
        password: "ChangeMe123!",
        name,
      }),
    });
    userCookieJar.addFrom(signUpResponse);
    expect(signUpResponse.status).toBe(200);

    const sessionResponse = await app.request(`${appUrl}/api/auth/get-session`, {
      method: "GET",
      headers: {
        origin: appUrl,
        cookie: userCookieJar.toHeader(),
      },
    });
    expect(sessionResponse.status).toBe(200);
    const sessionBody = await sessionResponse.json();

    return {
      jar: userCookieJar,
      userId: sessionBody.user.id as string,
    };
  }

  async function withApiRateLimitSettings(
    settings: { defaultRateLimitPerMinute: number; maxRateLimitPerMinute: number },
    run: () => Promise<void>,
  ) {
    const previous = (await settingsStoreModule.readSettingsSection("api")).config;
    rateLimitModule.clearRateLimitBuckets();
    await settingsStoreModule.writeSettingsSection("api", {
      ...previous,
      ...settings,
    });

    try {
      await run();
    } finally {
      rateLimitModule.clearRateLimitBuckets();
      await settingsStoreModule.writeSettingsSection("api", previous);
    }
  }

  test("bootstrap creates a healthy setup status", async () => {
    const response = await appRequest("/api/setup/status");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.healthy).toBe(true);
    expect(body.superAdminExists).toBe(true);
    expect(body.enabledPlugins).toContain("admin");
  });

  test("unauthenticated admin requests are rejected", async () => {
    const response = await app.request(`${appUrl}/api/admin/plugins`);
    expect(response.status).toBe(401);
  });

  test("superadmin can sign in over HTTP and reach admin routes", async () => {
    const signInResponse = await appRequest("/api/auth/sign-in/email", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        email: process.env.SUPERADMIN_EMAIL,
        password: process.env.SUPERADMIN_PASSWORD,
      }),
    });

    expect(signInResponse.status).toBe(200);

    const adminResponse = await appRequest("/api/admin/plugins", {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });

    expect(adminResponse.status).toBe(200);
  });

  test("generated tables still support CRUD over the data API", async () => {
    const createResponse = await appRequest("/api/data/notes", {
      method: "POST",
      headers: jsonHeaders(cookieJar),
      body: JSON.stringify({
        title: "First note",
        body: "Hello from the integration suite",
      }),
    });
    expect(createResponse.status).toBe(200);
    const created = await createResponse.json();
    expect(created.title).toBe("First note");

    const listResponse = await appRequest("/api/data/notes", {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.items).toHaveLength(1);

    const getResponse = await appRequest(`/api/data/notes/${created.id}`, {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    expect(getResponse.status).toBe(200);
    const fetched = await getResponse.json();
    expect(fetched.body).toBe("Hello from the integration suite");

    const updateResponse = await appRequest(`/api/data/notes/${created.id}`, {
      method: "PATCH",
      headers: jsonHeaders(cookieJar),
      body: JSON.stringify({
        body: "Updated body",
      }),
    });
    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.body).toBe("Updated body");

    const deleteResponse = await appRequest(`/api/data/notes/${created.id}`, {
      method: "DELETE",
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    expect(deleteResponse.status).toBe(204);
  });

  test("client and admin data routes are split cleanly", async () => {
    const publicClientResponse = await app.request(`${appUrl}/api/data/articles`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(publicClientResponse.status).toBe(200);

    const adminWithoutSession = await app.request(`${appUrl}/api/admin/data`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(adminWithoutSession.status).toBe(401);

    const regularUser = await createUserSession("route.split.user@authend.test", "Route Split User");
    const adminAsUser = await app.request(`${appUrl}/api/admin/data`, {
      headers: {
        origin: appUrl,
        cookie: regularUser.jar.toHeader(),
      },
    });
    expect(adminAsUser.status).toBe(403);

    const adminAsSuperadmin = await appRequest("/api/admin/data", {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    expect(adminAsSuperadmin.status).toBe(200);
    const adminBody = await adminAsSuperadmin.json();
    expect(adminBody.tables).toContain("notes");
  });

  test("blocked built-in tables are hidden from listings and denied directly", async () => {
    const listResponse = await appRequest("/api/data", {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    const body = await listResponse.json();

    expect(body.tables).toContain("notes");
    expect(body.tables).toContain("user");
    expect(body.tables).toContain("session");
    expect(body.tables).not.toContain("plugin_configs");
    expect(body.tables).not.toContain("verification");

    const blockedMeta = await appRequest("/api/data/meta/plugin_configs", {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    expect(blockedMeta.status).toBe(403);

    const blockedRead = await appRequest("/api/data/plugin_configs", {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    expect(blockedRead.status).toBe(403);

    const blockedCreate = await appRequest("/api/data/plugin_configs", {
      method: "POST",
      headers: jsonHeaders(cookieJar),
      body: JSON.stringify({
        plugin_id: "username",
      }),
    });
    expect(blockedCreate.status).toBe(403);
  });

  test("allowlisted built-in session metadata is redacted", async () => {
    const metaResponse = await appRequest("/api/data/meta/session", {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    expect(metaResponse.status).toBe(200);
    const metaBody = await metaResponse.json();
    expect(metaBody.fields.map((field: { name: string }) => field.name)).not.toContain("ip_address");
    expect(metaBody.fields.map((field: { name: string }) => field.name)).not.toContain("user_agent");
    expect(metaBody.fields.map((field: { name: string }) => field.name)).not.toContain("impersonated_by");

    const listResponse = await appRequest("/api/data/session", {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    expect(listResponse.status).toBe(200);
    const body = await listResponse.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].ip_address).toBeUndefined();
    expect(body.items[0].user_agent).toBeUndefined();
    expect(body.items[0].impersonated_by).toBeUndefined();
  });

  test("username plugin config invalidates auth and changes runtime validation", async () => {
    await pluginModule.enablePlugin("username");

    const current = await pluginModule.readPluginCapabilityManifest("username");
    await pluginModule.savePluginConfig("username", {
      config: {
        ...current.installState.config,
        minUsernameLength: 6,
      },
      capabilityState: current.installState.capabilityState,
      extensionBindings: current.installState.extensionBindings,
    });

    const shortUsernameResponse = await app.request(`${appUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: "Short Username",
        email: "short-username@authend.test",
        password: "ChangeMe123!",
        username: "abc",
      }),
    });
    expect(shortUsernameResponse.status).toBe(400);
    const shortBody = await shortUsernameResponse.json();
    expect(String(shortBody.code ?? shortBody.error ?? "")).toContain("USERNAME_TOO_SHORT");

    const validUsernameResponse = await app.request(`${appUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: "Valid Username",
        email: "valid-username@authend.test",
        password: "ChangeMe123!",
        username: "abcdef",
      }),
    });
    expect(validUsernameResponse.status).toBe(200);
  });

  test("createRecord still blocks writes to visible built-in tables", async () => {
    await expect(
      crudModule.createRecord("user", {
        email: "should-not-work@authend.test",
      }),
    ).rejects.toThrow("read-only");
  });

  test("public callers can read public resources and receive redacted includes", async () => {
    const publicMetaResponse = await app.request(`${appUrl}/api/data/meta/articles`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(publicMetaResponse.status).toBe(200);
    const publicMetaBody = await publicMetaResponse.json();
    expect(publicMetaBody.fields.map((field: { name: string }) => field.name)).not.toContain("member_excerpt");

    const tablesResponse = await app.request(`${appUrl}/api/data`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(tablesResponse.status).toBe(200);
    const tablesBody = await tablesResponse.json();
    expect(tablesBody.tables).toContain("authors");
    expect(tablesBody.tables).toContain("articles");
    expect(tablesBody.tables).not.toContain("profiles");
    expect(tablesBody.tables).not.toContain("server_tasks");

    const listResponse = await app.request(`${appUrl}/api/data/articles?include=author_id`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0].title).toBe("Ship app-facing policies");
    expect(listBody.items[0].internal_notes).toBeUndefined();
    expect(listBody.items[0].member_excerpt).toBeUndefined();
    expect(listBody.items[0].author_idRelation.display_name).toBe("Phase One Author");
    expect(listBody.items[0].author_idRelation.email).toBeUndefined();

    const createResponse = await app.request(`${appUrl}/api/data/articles`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: "blocked",
      }),
    });
    expect(createResponse.status).toBe(405);

    const privateResponse = await app.request(`${appUrl}/api/data/profiles`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(privateResponse.status).toBe(401);
  });

  test("API preview policy simulator matches runtime authorization for public and session callers", async () => {
    const signInResponse = await appRequest("/api/auth/sign-in/email", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        email: process.env.SUPERADMIN_EMAIL,
        password: process.env.SUPERADMIN_PASSWORD,
      }),
    });
    expect(signInResponse.status).toBe(200);

    const previewResponse = await appRequest("/api/admin/api-preview/articles", {
      headers: {
        origin: appUrl,
        cookie: cookieJar.toHeader(),
      },
    });
    expect(previewResponse.status).toBe(200);
    const previewBody = await previewResponse.json();

    const publicPolicy = previewBody.resource.policy.actors.find((entry: { actor: string }) => entry.actor === "public");
    const sessionPolicy = previewBody.resource.policy.actors.find((entry: { actor: string }) => entry.actor === "session");

    expect(publicPolicy.readableFields).toEqual(["id", "title", "body", "author_id"]);
    expect(publicPolicy.createFields).toEqual([]);
    expect(publicPolicy.operations.find((entry: { key: string }) => entry.key === "create").allowed).toBe(false);

    const publicMetaResponse = await app.request(`${appUrl}/api/data/meta/articles`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(publicMetaResponse.status).toBe(200);
    const publicMetaBody = await publicMetaResponse.json();
    expect(publicMetaBody.fields.map((field: { name: string }) => field.name)).toEqual(publicPolicy.readableFields);

    const regularUser = await createUserSession("preview.policy.user@authend.test", "Preview Policy User");
    const sessionMetaResponse = await app.request(`${appUrl}/api/data/meta/articles`, {
      headers: {
        origin: appUrl,
        cookie: regularUser.jar.toHeader(),
      },
    });
    expect(sessionMetaResponse.status).toBe(200);
    const sessionMetaBody = await sessionMetaResponse.json();
    expect(sessionMetaBody.fields.map((field: { name: string }) => field.name)).toEqual(sessionPolicy.readableFields);
    expect(sessionPolicy.readableFields).toContain("member_excerpt");
    expect(sessionPolicy.createFields).toEqual([]);
  });

  test("hidden fields cannot be filtered or sorted through the public data API", async () => {
    const hiddenFilterResponse = await app.request(`${appUrl}/api/data/articles?filterField=internal_notes&filterValue=draft`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(hiddenFilterResponse.status).toBe(400);

    const hiddenSortResponse = await app.request(`${appUrl}/api/data/articles?sort=internal_notes&order=asc`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(hiddenSortResponse.status).toBe(400);
  });

  test("public data traffic is rate limited by client ip", async () => {
    await withApiRateLimitSettings(
      {
        defaultRateLimitPerMinute: 2,
        maxRateLimitPerMinute: 5,
      },
      async () => {
        const firstResponse = await app.request(`${appUrl}/api/data/articles`, {
          headers: {
            origin: appUrl,
            "x-forwarded-for": "203.0.113.10",
          },
        });
        expect(firstResponse.status).toBe(200);
        expect(firstResponse.headers.get("x-ratelimit-limit")).toBe("2");
        expect(firstResponse.headers.get("x-ratelimit-remaining")).toBe("1");

        const secondResponse = await app.request(`${appUrl}/api/data/articles`, {
          headers: {
            origin: appUrl,
            "x-forwarded-for": "203.0.113.10",
          },
        });
        expect(secondResponse.status).toBe(200);
        expect(secondResponse.headers.get("x-ratelimit-remaining")).toBe("0");

        const limitedResponse = await app.request(`${appUrl}/api/data/articles`, {
          headers: {
            origin: appUrl,
            "x-forwarded-for": "203.0.113.10",
          },
        });
        expect(limitedResponse.status).toBe(429);
        expect(limitedResponse.headers.get("retry-after")).toBeTruthy();
        const limitedBody = await limitedResponse.json();
        expect(limitedBody.error).toBe("Rate limit exceeded");

        const differentIpResponse = await app.request(`${appUrl}/api/data/articles`, {
          headers: {
            origin: appUrl,
            "x-forwarded-for": "203.0.113.11",
          },
        });
        expect(differentIpResponse.status).toBe(200);
      },
    );
  });

  test("signed-in users inherit public access and owner scope is enforced", async () => {
    const userOne = await createUserSession("user.one@authend.test", "User One");
    const userTwo = await createUserSession("user.two@authend.test", "User Two");

    const sessionMetaResponse = await app.request(`${appUrl}/api/data/meta/articles`, {
      headers: {
        origin: appUrl,
        cookie: userOne.jar.toHeader(),
      },
    });
    expect(sessionMetaResponse.status).toBe(200);
    const sessionMetaBody = await sessionMetaResponse.json();
    expect(sessionMetaBody.fields.map((field: { name: string }) => field.name)).toContain("member_excerpt");

    const tablesResponse = await app.request(`${appUrl}/api/data`, {
      headers: {
        origin: appUrl,
        cookie: userOne.jar.toHeader(),
      },
    });
    expect(tablesResponse.status).toBe(200);
    const tablesBody = await tablesResponse.json();
    expect(tablesBody.tables).toContain("articles");
    expect(tablesBody.tables).toContain("authors");
    expect(tablesBody.tables).toContain("profiles");
    expect(tablesBody.tables).not.toContain("server_tasks");

    const publicAsSession = await app.request(`${appUrl}/api/data/articles?include=author_id`, {
      headers: {
        origin: appUrl,
        cookie: userOne.jar.toHeader(),
      },
    });
    expect(publicAsSession.status).toBe(200);
    const publicAsSessionBody = await publicAsSession.json();
    expect(publicAsSessionBody.items[0].member_excerpt).toBe("Members get the rollout details.");

    const blockedProfileCreateResponse = await app.request(`${appUrl}/api/data/profiles`, {
      method: "POST",
      headers: jsonHeaders(userOne.jar),
      body: JSON.stringify({
        owner_id: "malicious-override",
        display_name: "User One Profile",
        moderation_state: "approved",
        internal_notes: "do not expose",
      }),
    });
    expect(blockedProfileCreateResponse.status).toBe(403);

    const createProfileResponse = await app.request(`${appUrl}/api/data/profiles`, {
      method: "POST",
      headers: jsonHeaders(userOne.jar),
      body: JSON.stringify({
        owner_id: "malicious-override",
        display_name: "User One Profile",
        internal_notes: "do not expose",
      }),
    });
    expect(createProfileResponse.status).toBe(200);
    const createdProfile = await createProfileResponse.json();
    expect(createdProfile.owner_id).toBe(userOne.userId);
    expect(createdProfile.internal_notes).toBeUndefined();
    expect(createdProfile.moderation_state).toBeNull();

    const ownListResponse = await app.request(`${appUrl}/api/data/profiles`, {
      headers: {
        origin: appUrl,
        cookie: userOne.jar.toHeader(),
      },
    });
    expect(ownListResponse.status).toBe(200);
    const ownListBody = await ownListResponse.json();
    expect(ownListBody.items).toHaveLength(1);
    expect(ownListBody.items[0].owner_id).toBe(userOne.userId);

    const otherListResponse = await app.request(`${appUrl}/api/data/profiles`, {
      headers: {
        origin: appUrl,
        cookie: userTwo.jar.toHeader(),
      },
    });
    expect(otherListResponse.status).toBe(200);
    const otherListBody = await otherListResponse.json();
    expect(otherListBody.items).toHaveLength(0);

    const otherGetResponse = await app.request(`${appUrl}/api/data/profiles/${createdProfile.id}`, {
      headers: {
        origin: appUrl,
        cookie: userTwo.jar.toHeader(),
      },
    });
    expect(otherGetResponse.status).toBe(404);

    const otherUpdateResponse = await app.request(`${appUrl}/api/data/profiles/${createdProfile.id}`, {
      method: "PATCH",
      headers: jsonHeaders(userTwo.jar),
      body: JSON.stringify({
        display_name: "Hijacked",
      }),
    });
    expect(otherUpdateResponse.status).toBe(404);

    const protectedFieldUpdateResponse = await app.request(`${appUrl}/api/data/profiles/${createdProfile.id}`, {
      method: "PATCH",
      headers: jsonHeaders(userOne.jar),
      body: JSON.stringify({
        moderation_state: "approved",
      }),
    });
    expect(protectedFieldUpdateResponse.status).toBe(403);
  });

  test("relation includes respect target-table access rules", async () => {
    const owner = await createUserSession("profile.owner@authend.test", "Profile Owner");
    const otherUser = await createUserSession("profile.other@authend.test", "Other Viewer");

    const profile = await crudModule.createRecord("profiles", {
      owner_id: owner.userId,
      display_name: "Owner Profile",
      internal_notes: "never include this",
    });

    await crudModule.createRecord("profile_cards", {
      headline: "Visible public card",
      profile_id: profile.id,
    });

    const publicResponse = await app.request(`${appUrl}/api/data/profile_cards?include=profile_id`, {
      headers: {
        origin: appUrl,
      },
    });
    expect(publicResponse.status).toBe(200);
    const publicBody = await publicResponse.json();
    expect(publicBody.items).toHaveLength(1);
    expect(publicBody.items[0].profile_idRelation).toBeNull();

    const ownerResponse = await app.request(`${appUrl}/api/data/profile_cards?include=profile_id`, {
      headers: {
        origin: appUrl,
        cookie: owner.jar.toHeader(),
      },
    });
    expect(ownerResponse.status).toBe(200);
    const ownerBody = await ownerResponse.json();
    expect(ownerBody.items).toHaveLength(1);
    expect(ownerBody.items[0].profile_idRelation.display_name).toBe("Owner Profile");
    expect(ownerBody.items[0].profile_idRelation.internal_notes).toBeUndefined();

    const otherResponse = await app.request(`${appUrl}/api/data/profile_cards?include=profile_id`, {
      headers: {
        origin: appUrl,
        cookie: otherUser.jar.toHeader(),
      },
    });
    expect(otherResponse.status).toBe(200);
    const otherBody = await otherResponse.json();
    expect(otherBody.items).toHaveLength(1);
    expect(otherBody.items[0].profile_idRelation).toBeNull();
  });

  test("listRecords defaults do not allow hidden-field filtering or sorting", async () => {
    await expect(
      crudModule.listRecords("articles", new URLSearchParams({
        filterField: "internal_notes",
        filterValue: "draft",
      })),
    ).rejects.toThrow("Unknown filter field internal_notes");

    await expect(
      crudModule.listRecords("articles", new URLSearchParams({
        sort: "internal_notes",
        order: "asc",
      })),
    ).rejects.toThrow("Unknown sort field internal_notes");
  });

  test("api keys can use permitted routes and are blocked elsewhere", async () => {
    const user = await createUserSession("api.key.owner@authend.test", "API Key Owner");

    const createKeyResponse = await app.request(`${appUrl}/api/auth/api-key/create`, {
      method: "POST",
      headers: jsonHeaders(user.jar),
      body: JSON.stringify({
        name: "Phase 1 Data Key",
      }),
    });
    expect(createKeyResponse.status).toBe(200);
    const keyBody = await createKeyResponse.json();
    expect(typeof keyBody.key).toBe("string");

    await dbModule.sql.unsafe(
      `update "apikey"
       set "permissions" = $2
       where "id" = $1`,
      [keyBody.id, JSON.stringify({ "resource:server_tasks": ["list", "create"] })] as never[],
    );

    const tablesResponse = await app.request(`${appUrl}/api/data`, {
      headers: {
        origin: appUrl,
        "x-api-key": keyBody.key,
      },
    });
    expect(tablesResponse.status).toBe(200);
    const tablesBody = await tablesResponse.json();
    expect(tablesBody.tables).toContain("server_tasks");
    expect(tablesBody.tables).toContain("articles");
    expect(tablesBody.tables).not.toContain("profiles");

    const createTaskResponse = await app.request(`${appUrl}/api/data/server_tasks`, {
      method: "POST",
      headers: {
        ...jsonHeaders(),
        "x-api-key": keyBody.key,
      },
      body: JSON.stringify({
        title: "Sync cache",
        status: "queued",
      }),
    });
    expect(createTaskResponse.status).toBe(200);
    const createdTask = await createTaskResponse.json();
    expect(createdTask.title).toBe("Sync cache");

    const listTaskResponse = await app.request(`${appUrl}/api/data/server_tasks`, {
      headers: {
        origin: appUrl,
        "x-api-key": keyBody.key,
      },
    });
    expect(listTaskResponse.status).toBe(200);
    const listTaskBody = await listTaskResponse.json();
    expect(listTaskBody.items).toHaveLength(1);

    const updateTaskResponse = await app.request(`${appUrl}/api/data/server_tasks/${createdTask.id}`, {
      method: "PATCH",
      headers: {
        ...jsonHeaders(),
        "x-api-key": keyBody.key,
      },
      body: JSON.stringify({
        status: "complete",
      }),
    });
    expect(updateTaskResponse.status).toBe(403);
  });

  test("api key data traffic is rate limited by key id", async () => {
    const user = await createUserSession("api.key.ratelimit@authend.test", "API Key Rate Limit");

    const createKeyResponse = await app.request(`${appUrl}/api/auth/api-key/create`, {
      method: "POST",
      headers: jsonHeaders(user.jar),
      body: JSON.stringify({
        name: "Rate Limited Key",
      }),
    });
    expect(createKeyResponse.status).toBe(200);
    const keyBody = await createKeyResponse.json();

    await dbModule.sql.unsafe(
      `update "apikey"
       set "permissions" = $2
       where "id" = $1`,
      [keyBody.id, JSON.stringify({ "resource:server_tasks": ["list"] })] as never[],
    );

    await withApiRateLimitSettings(
      {
        defaultRateLimitPerMinute: 10,
        maxRateLimitPerMinute: 2,
      },
      async () => {
        const firstResponse = await app.request(`${appUrl}/api/data/server_tasks`, {
          headers: {
            origin: appUrl,
            "x-api-key": keyBody.key,
          },
        });
        expect(firstResponse.status).toBe(200);
        expect(firstResponse.headers.get("x-ratelimit-limit")).toBe("2");
        expect(firstResponse.headers.get("x-ratelimit-remaining")).toBe("1");

        const secondResponse = await app.request(`${appUrl}/api/data/server_tasks`, {
          headers: {
            origin: appUrl,
            "x-api-key": keyBody.key,
          },
        });
        expect(secondResponse.status).toBe(200);
        expect(secondResponse.headers.get("x-ratelimit-remaining")).toBe("0");

        const limitedResponse = await app.request(`${appUrl}/api/data/server_tasks`, {
          headers: {
            origin: appUrl,
            "x-api-key": keyBody.key,
          },
        });
        expect(limitedResponse.status).toBe(429);
        const limitedBody = await limitedResponse.json();
        expect(limitedBody.error).toBe("Rate limit exceeded");
      },
    );
  });
});
