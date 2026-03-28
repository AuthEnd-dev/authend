import { describe, expect, test } from "bun:test";
import { validateDraft } from "@authend/shared";
import { Hono } from "hono";
import {
  belongsTo,
  defineExtensionSchema,
  idField,
  ref,
  sessionOwnedApi,
  table,
  textField,
  timestampField,
} from "../core/services/schema-helpers";
import { forkAuthContributions } from "./auth";
import { extensionPluginDefaults } from "./plugin-defaults";
import { extensionPluginDefinitions } from "./plugins";
import { registerExtensionRoutes } from "./routes";
import { getExtensionSchemaDraft } from "./schema";

describe("extensions entrypoints", () => {
  test("extension schema draft is valid and includes expected starter entities", () => {
    const draft = getExtensionSchemaDraft();
    const parsed = validateDraft(draft);

    expect(parsed.tables.length).toBe(1);
    expect(parsed.relations.length).toBe(1);

    const project = parsed.tables.find((entry) => entry.name === "project");
    expect(project).toBeDefined();
    expect(project?.displayName).toBe("Project");
    expect(project?.primaryKey).toBe("id");
    expect(project?.fields.map((field) => field.name)).toEqual(["id", "name", "owner_user_id", "created_at"]);

    const ownerField = project?.fields.find((field) => field.name === "owner_user_id");
    expect(ownerField?.references).toEqual({
      table: "user",
      column: "id",
      onDelete: "cascade",
      onUpdate: "no action",
    });

    const relation = parsed.relations[0];
    expect(relation.sourceTable).toBe("project");
    expect(relation.targetTable).toBe("user");
    expect(relation.alias).toBe("owner");
  });

  test("route registration hook is callable", () => {
    const app = new Hono();
    expect(() => registerExtensionRoutes(app)).not.toThrow();
  });

  test("auth contribution hook returns default shape", async () => {
    const result = await forkAuthContributions({
      kind: "app",
      baseURL: "http://localhost:7002",
      appBaseUrl: "http://localhost:7002",
      adminBaseUrl: "http://localhost:7001",
      trustedOrigins: ["http://localhost:7001"],
      generalSettings: {
        projectLabel: "Test",
        appName: "AuthEnd",
        appUrl: "http://localhost:7002",
        adminUrl: "http://localhost:7001",
        timezone: "UTC",
        locale: "en-US",
      },
      authSettings: {
        allowSignUp: true,
        requireEmailVerification: false,
        minPasswordLength: 8,
        maxPasswordLength: 128,
      },
      emailSettings: {
        smtpHost: "",
        smtpPort: 587,
        smtpUsername: "",
        smtpPassword: "",
        smtpSecure: false,
        senderName: "AuthEnd",
        senderEmail: "no-reply@example.com",
        replyToEmail: undefined,
        passwordResetSubject: "Reset your password",
        verificationSubject: "Verify your email",
        testRecipient: undefined,
      },
      domainSettings: {
        trustedOrigins: [],
        corsOrigins: [],
        redirectOrigins: [],
        cookieDomain: undefined,
        secureCookies: false,
      },
    });

    expect(Array.isArray(result.plugins)).toBe(true);
    expect(result.authOptions).toEqual({});
  });

  test("plugin extension registry defaults to an array", () => {
    expect(Array.isArray(extensionPluginDefinitions)).toBe(true);
  });

  test("plugin defaults registry defaults to an array", () => {
    expect(Array.isArray(extensionPluginDefaults)).toBe(true);
  });

  test("auth contribution hook stays runtime-only and does not return plugin state mutations", async () => {
    const result = await forkAuthContributions({
      kind: "app",
      baseURL: "http://localhost:7002",
      appBaseUrl: "http://localhost:7002",
      adminBaseUrl: "http://localhost:7001",
      trustedOrigins: ["http://localhost:7001"],
      generalSettings: {
        projectLabel: "Test",
        appName: "AuthEnd",
        appUrl: "http://localhost:7002",
        adminUrl: "http://localhost:7001",
        timezone: "UTC",
        locale: "en-US",
      },
      authSettings: {
        allowSignUp: true,
        requireEmailVerification: false,
        minPasswordLength: 8,
        maxPasswordLength: 128,
      },
      emailSettings: {
        smtpHost: "",
        smtpPort: 587,
        smtpUsername: "",
        smtpPassword: "",
        smtpSecure: false,
        senderName: "AuthEnd",
        senderEmail: "no-reply@example.com",
        replyToEmail: undefined,
        passwordResetSubject: "Reset your password",
        verificationSubject: "Verify your email",
        testRecipient: undefined,
      },
      domainSettings: {
        trustedOrigins: [],
        corsOrigins: [],
        redirectOrigins: [],
        cookieDomain: undefined,
        secureCookies: false,
      },
    });

    expect("pluginDefaults" in result).toBe(false);
  });
});

describe("schema helpers used by extensions", () => {
  test("idField builds a conventional id column", () => {
    expect(idField()).toEqual({
      name: "id",
      type: "text",
      nullable: false,
      unique: true,
      indexed: true,
    });
  });

  test("field helpers apply expected defaults", () => {
    expect(textField("name")).toMatchObject({
      name: "name",
      type: "text",
      nullable: false,
      unique: false,
      indexed: false,
    });
    expect(timestampField("created_at", { defaultNow: true }).default).toBe("now()");
  });

  test("ref helper defaults actions to no action", () => {
    expect(ref("user", "id")).toEqual({
      table: "user",
      column: "id",
      onDelete: "no action",
      onUpdate: "no action",
    });
  });

  test("sessionOwnedApi sets own-scoped session/superadmin access", () => {
    const api = sessionOwnedApi("owner_user_id");
    expect(api.authMode).toBe("session");
    expect(api.access.ownershipField).toBe("owner_user_id");
    expect(api.access.list.scope).toBe("own");
  });

  test("table helper fills primary key, indexes, and api defaults", () => {
    const created = table({
      name: "demo",
      displayName: "Demo",
      fields: [idField(), textField("name")],
    });
    expect(created.primaryKey).toBe("id");
    expect(created.indexes).toEqual([]);
    expect(created.api.authMode).toBe("session");
  });

  test("belongsTo helper fills defaults", () => {
    const relation = belongsTo({
      sourceTable: "project",
      sourceField: "owner_user_id",
      targetTable: "user",
    });
    expect(relation.targetField).toBe("id");
    expect(relation.joinType).toBe("left");
    expect(relation.onDelete).toBe("no action");
    expect(relation.onUpdate).toBe("no action");
  });

  test("defineExtensionSchema returns same draft value", () => {
    const draft = defineExtensionSchema({ tables: [], relations: [] });
    expect(draft).toEqual({ tables: [], relations: [] });
  });
});
