import { createHash } from "node:crypto";
import type { FieldBlueprint, SdkSchemaManifest, SdkSchemaResource, TableApiOperations } from "@authend/shared";
import { sdkSchemaManifestSchema } from "@authend/shared";
import { listApiResources } from "./api-design-service";
import { getTableDescriptor } from "./crud-service";
import { getSchemaDraft } from "./schema-service";

function operationFlags(resourceOperations: Array<{ key: keyof TableApiOperations; enabled: boolean }>): TableApiOperations {
  return resourceOperations.reduce<TableApiOperations>(
    (acc, operation) => {
      acc[operation.key] = operation.enabled;
      return acc;
    },
    {
      list: false,
      get: false,
      create: false,
      update: false,
      delete: false,
    },
  );
}

function writableFields(resource: { config: { fieldVisibility?: Record<string, { create: string[]; update: string[] }> } }, fields: FieldBlueprint[], primaryKey: string, operation: "create" | "update") {
  return fields.filter((field) => {
    if (field.name === primaryKey) {
      return false;
    }

    const visibility = resource.config.fieldVisibility?.[field.name];
    return !visibility || visibility[operation].length > 0;
  });
}

function checksumForResources(resources: SdkSchemaResource[]) {
  return createHash("sha256").update(JSON.stringify(resources)).digest("hex");
}

export async function buildSdkSchemaManifest(): Promise<SdkSchemaManifest> {
  const resources = await listApiResources();
  const draft = await getSchemaDraft();
  const keyByTable = new Map(resources.map((resource) => [resource.table, resource.config.sdkName ?? resource.table]));
  const manifestResources = await Promise.all(resources.map<Promise<SdkSchemaResource>>(async (resource) => {
    const descriptor = await getTableDescriptor(resource.table);
    const includeRelations = [
      ...draft.relations
        .filter((relation) => relation.sourceTable === resource.table)
        .map((relation) => ({
          key: relation.alias ?? relation.sourceField,
          resultKey: relation.alias ?? `${relation.sourceField}Relation`,
          targetKey: keyByTable.get(relation.targetTable) ?? relation.targetTable,
          targetTable: relation.targetTable,
        })),
      ...descriptor.fields
        .filter((field) => field.references)
        .map((field) => ({
          key: field.name,
          resultKey: `${field.name}Relation`,
          targetKey: keyByTable.get(field.references!.table) ?? field.references!.table,
          targetTable: field.references!.table,
        })),
    ].filter((relation, index, collection) => collection.findIndex((entry) => entry.key === relation.key) === index);

    return {
      key: resource.config.sdkName ?? resource.table,
      table: resource.table,
      displayName: resource.displayName,
      description: resource.config.description ?? `${resource.displayName} API`,
      routeSegment: resource.routeSegment,
      primaryKey: resource.primaryKey,
      authMode: resource.security.authMode,
      operations: operationFlags(resource.operations.map((operation) => ({ key: operation.key, enabled: operation.enabled }))),
      fields: resource.fields,
      createFields: resource.config.operations.create ? writableFields(resource, descriptor.fields, resource.primaryKey, "create") : [],
      updateFields: resource.config.operations.update ? writableFields(resource, descriptor.fields, resource.primaryKey, "update") : [],
      filterFields: resource.query.filtering.fields,
      sortFields: resource.query.sorting.fields,
      includeFields: resource.query.includes.fields,
      includeRelations,
    };
  }));
  manifestResources.sort((left, right) => left.key.localeCompare(right.key));

  return sdkSchemaManifestSchema.parse({
    version: "2",
    generatedAt: new Date().toISOString(),
    schemaChecksum: checksumForResources(manifestResources),
    resources: manifestResources,
  });
}
