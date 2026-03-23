import { describe, expect, test } from "bun:test";
import type { SchemaDraft, TableBlueprint } from "@authend/shared";

async function getNormaliseTableApiConfig() {
  process.env.APP_URL ??= "http://localhost:7002";
  process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/authend";
  process.env.BETTER_AUTH_SECRET ??= "test-secret-value-with-24-chars";
  process.env.SUPERADMIN_EMAIL ??= "admin@example.com";
  process.env.SUPERADMIN_PASSWORD ??= "password123";

  const module = await import("./api-design-service");
  return module.normaliseTableApiConfig;
}

const baseTable: TableBlueprint = {
  name: "post",
  displayName: "Post",
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
      name: "owner_id",
      type: "text",
      nullable: false,
      unique: false,
      indexed: true,
    },
    {
      name: "author_id",
      type: "text",
      nullable: true,
      unique: false,
      indexed: true,
      references: {
        table: "user",
        column: "id",
        onDelete: "restrict",
        onUpdate: "cascade",
      },
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
  },
};

const draft: SchemaDraft = {
  tables: [baseTable],
  relations: [],
};

describe("normaliseTableApiConfig", () => {
  test("expands legacy public authMode into public access for every operation", async () => {
    const normaliseTableApiConfig = await getNormaliseTableApiConfig();
    const config = normaliseTableApiConfig(
      {
        authMode: "public",
        operations: baseTable.api.operations,
        pagination: baseTable.api.pagination,
        filtering: baseTable.api.filtering,
        sorting: baseTable.api.sorting,
        includes: baseTable.api.includes,
      },
      baseTable,
      draft,
      true,
    );

    expect(config.access.list.actors).toEqual(["public", "superadmin"]);
    expect(config.access.get.actors).toEqual(["public", "superadmin"]);
    expect(config.access.create.actors).toEqual(["public", "superadmin"]);
    expect(config.access.update.actors).toEqual(["public", "superadmin"]);
    expect(config.access.delete.actors).toEqual(["public", "superadmin"]);
    expect(config.authMode).toBe("public");
  });

  test("rejects an invalid ownership field", async () => {
    const normaliseTableApiConfig = await getNormaliseTableApiConfig();
    expect(() =>
      normaliseTableApiConfig(
        {
          ...baseTable.api,
          access: {
            ...baseTable.api.access,
            ownershipField: "missing_owner_id",
            update: {
              actors: ["session"],
              scope: "own",
            },
          },
        },
        baseTable,
        draft,
        true,
      ),
    ).toThrow("Ownership field missing_owner_id does not exist on post");
  });

  test("drops invalid filter, sort, and include fields during normalization", async () => {
    const normaliseTableApiConfig = await getNormaliseTableApiConfig();
    const config = normaliseTableApiConfig(
      {
        ...baseTable.api,
        filtering: {
          enabled: true,
          fields: ["missing_field"],
        },
        sorting: {
          enabled: true,
          fields: ["missing_field"],
          defaultField: "missing_field",
          defaultOrder: "asc",
        },
        includes: {
          enabled: true,
          fields: ["missing_include"],
        },
      },
      baseTable,
      draft,
      true,
    );

    expect(config.filtering.fields).toEqual(["id", "title", "owner_id", "author_id"]);
    expect(config.sorting.fields).toEqual(["id", "title", "owner_id", "author_id"]);
    expect(config.sorting.defaultField).toBe("id");
    expect(config.includes.fields).toEqual(["author_id"]);
  });

  test("drops hidden fields from readable config fields", async () => {
    const normaliseTableApiConfig = await getNormaliseTableApiConfig();
    const config = normaliseTableApiConfig(
      {
        ...baseTable.api,
        hiddenFields: ["owner_id"],
        filtering: {
          enabled: true,
          fields: ["id", "title", "owner_id"],
        },
        sorting: {
          enabled: true,
          fields: ["id", "owner_id"],
          defaultField: "owner_id",
          defaultOrder: "asc",
        },
      },
      baseTable,
      draft,
      true,
    );

    expect(config.hiddenFields).toEqual(["owner_id"]);
    expect(config.filtering.fields).toEqual(["id", "title", "author_id"]);
    expect(config.sorting.fields).toEqual(["id"]);
    expect(config.sorting.defaultField).toBe("id");
  });
});
