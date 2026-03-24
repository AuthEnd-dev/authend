import type { FieldBlueprint, SdkSchemaManifest, SdkSchemaResource, TableApiOperations } from "@authend/shared";
import { sdkSchemaManifestSchema } from "@authend/shared";
import { listApiResources } from "./api-design-service";
import { getTableDescriptor } from "./crud-service";

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

export async function buildSdkSchemaManifest(): Promise<SdkSchemaManifest> {
  const resources = await listApiResources();

  return sdkSchemaManifestSchema.parse({
    generatedAt: new Date().toISOString(),
    resources: await Promise.all(resources.map<Promise<SdkSchemaResource>>(async (resource) => {
      const descriptor = await getTableDescriptor(resource.table);
      return {
        key: resource.config.sdkName ?? resource.table,
        table: resource.table,
        displayName: resource.displayName,
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
      };
    })),
  });
}
