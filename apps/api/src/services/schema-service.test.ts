import { describe, expect, test } from "bun:test";
import type { SchemaDraft } from "@authend/shared";

describe("schema-service", () => {
  test("renders generated schema indexes with array callback syntax", async () => {
    process.env.APP_URL ??= "http://localhost:7002";
    process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/authend";
    process.env.BETTER_AUTH_SECRET ??= "test-secret-value-with-24-chars";
    process.env.SUPERADMIN_EMAIL ??= "admin@example.com";
    process.env.SUPERADMIN_PASSWORD ??= "password123";

    const { schemaServiceTestUtils } = await import("./schema-service");

    const draft: SchemaDraft = {
      tables: [
        {
          name: "release_notes",
          displayName: "Release Notes",
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
              indexed: true,
            },
            {
              name: "status",
              type: "text",
              nullable: false,
              unique: false,
              indexed: false,
            },
          ],
          indexes: [["title", "status"]],
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
              fields: [],
            },
            sorting: {
              enabled: true,
              fields: [],
              defaultOrder: "desc",
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
    expect(rendered).toContain("(table) => [");
    expect(rendered).toContain('index("release_notes_title_idx").on(table.title)');
    expect(rendered).toContain('index("release_notes_title_status_idx").on(table.title, table.status)');
    expect(rendered).not.toContain("(table) => ({");
  });
});
