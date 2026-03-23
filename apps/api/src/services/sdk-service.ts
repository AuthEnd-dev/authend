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

function writableFields(fields: FieldBlueprint[], primaryKey: string) {
  return fields.filter((field) => field.name !== primaryKey);
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
        createFields: resource.config.operations.create ? writableFields(descriptor.fields, resource.primaryKey) : [],
        updateFields: resource.config.operations.update ? writableFields(descriptor.fields, resource.primaryKey) : [],
        filterFields: resource.query.filtering.fields,
        sortFields: resource.query.sorting.fields,
        includeFields: resource.query.includes.fields,
      };
    })),
  });
}
