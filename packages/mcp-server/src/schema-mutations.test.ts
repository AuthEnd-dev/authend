import { describe, expect, test } from "bun:test";
import type { RelationBlueprint, SchemaDraftInput, TableBlueprintInput } from "@authend/shared";
import {
  createRelationDraft,
  createTableDraft,
  deleteRelationDraft,
  deleteTableDraft,
  setTableApiConfigDraft,
  updateRelationDraft,
  updateTableDraft,
} from "./schema-mutations";

const postTable: TableBlueprintInput = {
  name: "post",
  displayName: "Post",
  primaryKey: "id",
  fields: [
    { name: "id", type: "text", nullable: false, unique: true, indexed: true },
    { name: "title", type: "text", nullable: false, unique: false, indexed: false },
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
    operations: { list: true, get: true, create: true, update: true, delete: true },
    pagination: { enabled: true, defaultPageSize: 20, maxPageSize: 100 },
    filtering: { enabled: true, fields: ["title"] },
    sorting: { enabled: true, fields: ["title"], defaultOrder: "desc" },
    includes: { enabled: true, fields: [] },
    hiddenFields: [],
    fieldVisibility: {},
  },
  hooks: [],
};

const relation: RelationBlueprint = {
  sourceTable: "post",
  sourceField: "author_id",
  targetTable: "user",
  targetField: "id",
  alias: "author",
  sourceAlias: null,
  targetAlias: null,
  joinType: "left",
  onDelete: "no action",
  onUpdate: "no action",
  description: null,
};

function baseDraft(): SchemaDraftInput {
  return {
    tables: [postTable],
    relations: [],
  };
}

describe("schema-mutations", () => {
  test("create/update/delete table flows operate on the draft", () => {
    const created = createTableDraft(baseDraft(), {
      ...postTable,
      name: "comment",
      displayName: "Comment",
    });
    expect(created.tables.map((table) => table.name)).toEqual(["post", "comment"]);

    const updated = updateTableDraft(created, "comment", {
      ...postTable,
      name: "comment",
      displayName: "Comment Entry",
    });
    expect(updated.tables.find((table) => table.name === "comment")?.displayName).toBe("Comment Entry");

    const removed = deleteTableDraft(updated, "comment");
    expect(removed.tables.map((table) => table.name)).toEqual(["post"]);
  });

  test("create/update/delete relation flows operate on the draft", () => {
    const created = createRelationDraft(baseDraft(), relation);
    expect(created.relations).toHaveLength(1);

    const updated = updateRelationDraft(created, relation, {
      ...relation,
      alias: "writer",
    });
    expect(updated.relations[0]?.alias).toBe("writer");

    const removed = deleteRelationDraft(updated, {
      ...relation,
      alias: "writer",
    });
    expect(removed.relations).toEqual([]);
  });

  test("set table api config updates only the selected table", () => {
    const next = setTableApiConfigDraft(baseDraft(), "post", {
      ...postTable.api,
      routeSegment: "posts",
      authMode: "session",
    });
    expect(next.tables[0]?.api.routeSegment).toBe("posts");
    expect(next.tables[0]?.api.authMode).toBe("session");
  });
});
