import { describe, expect, test } from "bun:test";
import { generateSource } from "./generator-lib.mjs";

describe("sdk generator", () => {
  test("emits checksum, include metadata, and typed resource unions", () => {
    const source = generateSource(
      {
        version: "2",
        generatedAt: "2026-03-24T00:00:00.000Z",
        schemaChecksum: "checksum-123",
        resources: [
          {
            key: "posts",
            table: "posts",
            displayName: "Posts",
            description: "Public post records.",
            routeSegment: "posts",
            primaryKey: "id",
            authMode: "public",
            operations: {
              list: true,
              get: true,
              create: true,
              update: false,
              delete: false,
            },
            fields: [
              { name: "id", type: "uuid", nullable: false, unique: true, indexed: true, default: "gen_random_uuid()" },
              { name: "title", type: "text", nullable: false, unique: false, indexed: true, default: null },
              { name: "author_id", type: "uuid", nullable: false, unique: false, indexed: true, default: null, references: { table: "authors", column: "id", onDelete: "cascade", onUpdate: "cascade" } },
            ],
            createFields: [
              { name: "title", type: "text", nullable: false, unique: false, indexed: true, default: null },
              { name: "author_id", type: "uuid", nullable: false, unique: false, indexed: true, default: null, references: { table: "authors", column: "id", onDelete: "cascade", onUpdate: "cascade" } },
            ],
            updateFields: [
              { name: "title", type: "text", nullable: false, unique: false, indexed: true, default: null },
            ],
            filterFields: ["title"],
            sortFields: ["id", "title"],
            includeFields: ["author"],
            includeRelations: [
              { key: "author", resultKey: "author", targetKey: "authors", targetTable: "authors" },
            ],
          },
          {
            key: "authors",
            table: "authors",
            displayName: "Authors",
            description: "Author records.",
            routeSegment: "authors",
            primaryKey: "id",
            authMode: "public",
            operations: {
              list: true,
              get: true,
              create: false,
              update: false,
              delete: false,
            },
            fields: [
              { name: "id", type: "uuid", nullable: false, unique: true, indexed: true, default: "gen_random_uuid()" },
              { name: "name", type: "text", nullable: false, unique: false, indexed: false, default: null },
            ],
            createFields: [],
            updateFields: [],
            filterFields: ["name"],
            sortFields: ["id", "name"],
            includeFields: [],
            includeRelations: [],
          },
        ],
      },
      "http://localhost:7002",
    );

    expect(source).toContain("export const authendSchemaChecksum = \"checksum-123\" as const;");
    expect(source).toContain("export type PostsSortField = \"id\" | \"title\";");
    expect(source).toContain("export type PostsIncludeKey = \"author\";");
    expect(source).toContain("author: AuthendIncludeDefinition<AuthorsRecord, \"author\">;");
    expect(source).toContain("References authors.id.");
    expect(source).toContain("AuthendSchemaResource<PostsRecord, PostsCreateInput, PostsUpdateInput, PostsSortField, PostsFilterField, PostsIncludes");
  });
});

