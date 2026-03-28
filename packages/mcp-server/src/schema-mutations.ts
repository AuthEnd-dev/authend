import type { RelationBlueprint, SchemaDraft, TableApiConfig, TableBlueprint } from "@authend/shared";
import { HttpError } from "../../../apps/api/src/core/lib/http";

function relationMatches(left: RelationBlueprint, right: RelationBlueprint) {
  return (
    left.sourceTable === right.sourceTable &&
    left.sourceField === right.sourceField &&
    left.targetTable === right.targetTable &&
    left.targetField === right.targetField &&
    (left.alias ?? null) === (right.alias ?? null) &&
    (left.sourceAlias ?? null) === (right.sourceAlias ?? null) &&
    (left.targetAlias ?? null) === (right.targetAlias ?? null)
  );
}

export function createTableDraft(current: SchemaDraft, table: TableBlueprint): SchemaDraft {
  if (current.tables.some((entry) => entry.name === table.name)) {
    throw new HttpError(400, `Table ${table.name} already exists`);
  }

  return {
    ...current,
    tables: [...current.tables, table],
  };
}

export function updateTableDraft(current: SchemaDraft, tableName: string, table: TableBlueprint): SchemaDraft {
  const index = current.tables.findIndex((entry) => entry.name === tableName);
  if (index === -1) {
    throw new HttpError(404, `Unknown table ${tableName}`);
  }
  if (table.name !== tableName) {
    throw new HttpError(400, "Renaming tables is not supported by authend_update_table");
  }

  return {
    ...current,
    tables: current.tables.map((entry, entryIndex) => (entryIndex === index ? table : entry)),
  };
}

export function deleteTableDraft(current: SchemaDraft, tableName: string): SchemaDraft {
  if (!current.tables.some((entry) => entry.name === tableName)) {
    throw new HttpError(404, `Unknown table ${tableName}`);
  }

  return {
    ...current,
    tables: current.tables.filter((entry) => entry.name !== tableName),
    relations: current.relations.filter((relation) => relation.sourceTable !== tableName && relation.targetTable !== tableName),
  };
}

export function createRelationDraft(current: SchemaDraft, relation: RelationBlueprint): SchemaDraft {
  if (current.relations.some((entry) => relationMatches(entry, relation))) {
    throw new HttpError(400, "Relation already exists");
  }

  return {
    ...current,
    relations: [...current.relations, relation],
  };
}

export function updateRelationDraft(
  current: SchemaDraft,
  existingRelation: RelationBlueprint,
  relation: RelationBlueprint,
): SchemaDraft {
  const index = current.relations.findIndex((entry) => relationMatches(entry, existingRelation));
  if (index === -1) {
    throw new HttpError(404, "Relation to update was not found");
  }

  return {
    ...current,
    relations: current.relations.map((entry, entryIndex) => (entryIndex === index ? relation : entry)),
  };
}

export function deleteRelationDraft(current: SchemaDraft, relation: RelationBlueprint): SchemaDraft {
  const nextRelations = current.relations.filter((entry) => !relationMatches(entry, relation));
  if (nextRelations.length === current.relations.length) {
    throw new HttpError(404, "Relation to delete was not found");
  }

  return {
    ...current,
    relations: nextRelations,
  };
}

export function setTableApiConfigDraft(current: SchemaDraft, tableName: string, config: TableApiConfig): SchemaDraft {
  const index = current.tables.findIndex((entry) => entry.name === tableName);
  if (index === -1) {
    throw new HttpError(404, `Unknown table ${tableName}`);
  }

  return {
    ...current,
    tables: current.tables.map((entry, entryIndex) =>
      entryIndex === index
        ? {
            ...entry,
            api: config,
          }
        : entry,
    ),
  };
}
