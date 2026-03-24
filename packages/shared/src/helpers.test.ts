import { describe, expect, test } from "bun:test";
import {
  analyseTableApiPolicyWarnings,
  buildTableApiAccessPreset,
  detectTableApiAccessPreset,
  suggestOwnershipField,
  validateDraft,
} from "./helpers";

describe("validateDraft", () => {
  test("accepts a simple additive draft", () => {
    const draft = validateDraft({
      tables: [
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
              name: "bio",
              type: "text",
              nullable: true,
              unique: false,
              indexed: false,
            },
          ],
          indexes: [],
        },
      ],
      relations: [],
    });

    expect(draft.tables).toHaveLength(1);
  });

  test("rejects duplicate table names", () => {
    expect(() =>
      validateDraft({
        tables: [
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
            ],
            indexes: [],
          },
          {
            name: "profiles",
            displayName: "Profiles Copy",
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
            ],
            indexes: [],
          },
        ],
        relations: [],
      }),
    ).toThrow("Duplicate table name");
  });

  test("accepts relations with aliases to builtin tables", () => {
    const draft = validateDraft({
      tables: [
        {
          name: "posts",
          displayName: "Posts",
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
              name: "author_id",
              type: "text",
              nullable: false,
              unique: false,
              indexed: true,
            },
          ],
          indexes: [],
        },
      ],
      relations: [
        {
          sourceTable: "posts",
          sourceField: "author_id",
          targetTable: "user",
          targetField: "id",
          alias: "author",
          joinType: "left",
          onDelete: "restrict",
          onUpdate: "cascade",
        },
      ],
    });

    expect(draft.relations).toHaveLength(1);
  });

  test("allows reserved names as relation aliases", () => {
    const draft = validateDraft({
      tables: [
        {
          name: "posts",
          displayName: "Posts",
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
              name: "user_id",
              type: "text",
              nullable: false,
              unique: false,
              indexed: true,
            },
          ],
          indexes: [],
        },
      ],
      relations: [
        {
          sourceTable: "posts",
          sourceField: "user_id",
          targetTable: "user",
          targetField: "id",
          alias: "user",
          joinType: "left",
          onDelete: "restrict",
          onUpdate: "cascade",
        },
      ],
    });

    expect(draft.relations[0]?.alias).toBe("user");
  });

  test("rejects an invalid ownership field", () => {
    expect(() =>
      validateDraft({
        tables: [
          {
            name: "posts",
            displayName: "Posts",
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
                name: "author_id",
                type: "text",
                nullable: false,
                unique: false,
                indexed: true,
              },
            ],
            indexes: [],
            api: {
              authMode: "session",
              access: {
                ownershipField: "owner_id",
                list: { actors: ["session"], scope: "all" },
                get: { actors: ["session"], scope: "all" },
                create: { actors: ["session"], scope: "all" },
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
          },
        ],
        relations: [],
      }),
    ).toThrow("Ownership field posts.owner_id does not exist");
  });

  test("rejects an invalid hidden field", () => {
    expect(() =>
      validateDraft({
        tables: [
          {
            name: "posts",
            displayName: "Posts",
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
                name: "password_hash",
                type: "text",
                nullable: false,
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
              hiddenFields: ["password"],
            },
          },
        ],
        relations: [],
      }),
    ).toThrow("Hidden field posts.password does not exist");
  });

  test("rejects hiding the primary key", () => {
    expect(() =>
      validateDraft({
        tables: [
          {
            name: "posts",
            displayName: "Posts",
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
              hiddenFields: ["id"],
            },
          },
        ],
        relations: [],
      }),
    ).toThrow("Primary key posts.id cannot be hidden");
  });

  test("rejects hiding the ownership field", () => {
    expect(() =>
      validateDraft({
        tables: [
          {
            name: "posts",
            displayName: "Posts",
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
            ],
            indexes: [],
            api: {
              authMode: "session",
              access: {
                ownershipField: "owner_id",
                list: { actors: ["session"], scope: "all" },
                get: { actors: ["session"], scope: "all" },
                create: { actors: ["session"], scope: "all" },
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
              hiddenFields: ["owner_id"],
            },
          },
        ],
        relations: [],
      }),
    ).toThrow("Ownership field posts.owner_id cannot be hidden");
  });

  test("rejects duplicate relation aliases on the same table", () => {
    expect(() =>
      validateDraft({
        tables: [
          {
            name: "posts",
            displayName: "Posts",
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
                name: "author_id",
                type: "text",
                nullable: false,
                unique: false,
                indexed: true,
              },
              {
                name: "editor_id",
                type: "text",
                nullable: true,
                unique: false,
                indexed: true,
              },
            ],
            indexes: [],
          },
        ],
        relations: [
          {
            sourceTable: "posts",
            sourceField: "author_id",
            targetTable: "user",
            targetField: "id",
            alias: "person",
            joinType: "left",
            onDelete: "restrict",
            onUpdate: "cascade",
          },
          {
            sourceTable: "posts",
            sourceField: "editor_id",
            targetTable: "user",
            targetField: "id",
            alias: "person",
            joinType: "left",
            onDelete: "set null",
            onUpdate: "cascade",
          },
        ],
      }),
    ).toThrow("Duplicate relation alias");
  });
});

describe("analyseTableApiPolicyWarnings", () => {
  test("flags unsafe public writes, sensitive public filters, and wide-open includes", () => {
    const warnings = analyseTableApiPolicyWarnings(
      {
        ownershipField: null,
        list: { actors: ["public"], scope: "all" },
        get: { actors: ["public"], scope: "all" },
        create: { actors: ["public"], scope: "all" },
        update: { actors: [], scope: "all" },
        delete: { actors: ["public"], scope: "all" },
      },
      {
        filteringEnabled: true,
        filteringFields: ["display_name", "email"],
        includesEnabled: true,
        includeFields: ["author_id"],
        hiddenFields: [],
      },
    );

    expect(warnings.map((warning) => warning.id)).toEqual([
      "publicWrite",
      "publicSensitiveFilter",
      "wideOpenIncludes",
    ]);
  });

  test("does not flag hidden sensitive filters or disabled public routes", () => {
    const warnings = analyseTableApiPolicyWarnings(
      buildTableApiAccessPreset("sessionPrivate", "owner_id"),
      {
        filteringEnabled: true,
        filteringFields: ["email"],
        includesEnabled: true,
        includeFields: ["owner_id"],
        hiddenFields: ["email"],
      },
    );

    expect(warnings).toHaveLength(0);
  });
});

describe("table API policy presets", () => {
  test("builds the public read-only preset", () => {
    const access = buildTableApiAccessPreset("publicReadOnly");

    expect(access.list).toEqual({ actors: ["public"], scope: "all" });
    expect(access.get).toEqual({ actors: ["public"], scope: "all" });
    expect(access.create).toEqual({ actors: [], scope: "all" });
    expect(access.update).toEqual({ actors: [], scope: "all" });
    expect(access.delete).toEqual({ actors: [], scope: "all" });
    expect(detectTableApiAccessPreset(access)).toBe("publicReadOnly");
  });

  test("detects legacy superadmin noise as a known preset", () => {
    const access = buildTableApiAccessPreset("sessionReadAllWriteOwn", "owner_id");
    access.list.actors.push("superadmin");
    access.get.actors.push("superadmin");

    expect(detectTableApiAccessPreset(access)).toBe("sessionReadAllWriteOwn");
  });

  test("suggests an ownership field using common conventions", () => {
    expect(suggestOwnershipField(["title", "user_id", "created_at"])).toBe("user_id");
    expect(suggestOwnershipField(["title", "created_at"])).toBeNull();
  });
});
