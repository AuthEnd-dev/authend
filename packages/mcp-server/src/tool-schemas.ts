import {
  pluginConfigSchema,
  pluginIdSchema,
  relationBlueprintSchema,
  schemaDraftSchema,
  tableApiConfigSchema,
  tableBlueprintSchema,
} from "@authend/shared";
import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const resourceNameInputSchema = {
  table: z.string().min(1),
};

export const recordIdInputSchema = {
  table: z.string().min(1),
  id: z.string().min(1),
};

export const getSchemaDraftInputSchema = {};

export const previewSchemaInputSchema = {
  draft: schemaDraftSchema,
};

export const applySchemaInputSchema = {
  draft: schemaDraftSchema,
};

export const createTableInputSchema = {
  table: tableBlueprintSchema,
};

export const updateTableInputSchema = {
  tableName: z.string().min(1),
  table: tableBlueprintSchema,
};

export const deleteTableInputSchema = {
  tableName: z.string().min(1),
};

export const createRelationInputSchema = {
  relation: relationBlueprintSchema,
};

export const updateRelationInputSchema = {
  current: relationBlueprintSchema,
  relation: relationBlueprintSchema,
};

export const deleteRelationInputSchema = {
  relation: relationBlueprintSchema,
};

export const setTableApiConfigInputSchema = {
  tableName: z.string().min(1),
  config: tableApiConfigSchema,
};

export const listRecordsInputSchema = {
  table: z.string().min(1),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  sort: z.string().min(1).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  filterField: z.string().min(1).optional(),
  filterValue: z.string().min(1).optional(),
  include: z.array(z.string().min(1)).optional(),
};

export const recordInputSchema = {
  table: z.string().min(1),
  payload: jsonRecordSchema,
};

export const updateRecordInputSchema = {
  table: z.string().min(1),
  id: z.string().min(1),
  payload: jsonRecordSchema,
};

export const listStorageObjectsInputSchema = {
  table: z.string().min(1).optional(),
  recordId: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  prefix: z.string().min(1).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  limit: z.number().int().positive().max(200).optional(),
};

export const getStorageObjectInputSchema = {
  id: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
};

export const putStorageObjectInputSchema = {
  key: z.string().min(1),
  body: z.string(),
  mimeType: z.string().min(1).default("application/octet-stream"),
  visibility: z.enum(["public", "private"]).optional(),
};

export const deleteStorageObjectInputSchema = {
  key: z.string().min(1),
};

export const pluginIdInputSchema = {
  pluginId: pluginIdSchema,
};

export const updatePluginConfigInputSchema = {
  pluginId: pluginIdSchema,
  update: z.object({
    config: pluginConfigSchema.optional(),
    capabilityState: jsonRecordSchema.optional(),
    extensionBindings: jsonRecordSchema.optional(),
  }),
};
