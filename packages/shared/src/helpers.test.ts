import { describe, expect, test } from "bun:test";
import { validateDraft } from "./helpers";

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
