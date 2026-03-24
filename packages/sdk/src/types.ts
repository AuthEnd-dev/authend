export type PluginId =
  | 'username'
  | 'jwt'
  | 'organization'
  | 'twoFactor'
  | 'apiKey'
  | 'magicLink'
  | 'socialAuth'
  | 'admin';

export type DataRecord = object;

export type TableApiOperations = {
  list: boolean;
  get: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type ApiPaginationConfig = {
  enabled: boolean;
  defaultPageSize: number;
  maxPageSize: number;
};

export type FieldBlueprint = {
  name: string;
  type: 'text' | 'varchar' | 'integer' | 'bigint' | 'boolean' | 'timestamp' | 'date' | 'jsonb' | 'uuid' | 'numeric' | 'enum';
  nullable?: boolean;
  default?: string | null;
  unique?: boolean;
  indexed?: boolean;
  size?: number | null;
  enumValues?: string[] | null;
  references?: {
    table: string;
    column: string;
    onDelete?: 'no action' | 'restrict' | 'cascade' | 'set null';
    onUpdate?: 'no action' | 'restrict' | 'cascade' | 'set null';
  } | null;
};

export type TableDescriptor = {
  table: string;
  primaryKey: string;
  fields: FieldBlueprint[];
  source: 'builtin' | 'generated' | 'plugin';
  mutableSchema: boolean;
  ownerPluginId?: PluginId | null;
  pagination?: ApiPaginationConfig;
};

export type PluginManifest = {
  id: PluginId;
  installState: {
    enabled: boolean;
  };
};

export type AuthendStorageVisibility = 'public' | 'private';

export type AuthendStorageUploadInput = {
  file: File | Blob | ArrayBuffer | Uint8Array;
  fileName?: string;
  mimeType?: string;
  visibility?: AuthendStorageVisibility;
  prefix?: string;
};

export type AuthendStorageUploadResult = {
  key: string;
  visibility: AuthendStorageVisibility;
  driver: 'local' | 's3';
  sizeBytes: number;
  mimeType: string;
  url: string | null;
};

export type AuthendSignedUploadRequest = {
  key: string;
  contentType?: string;
  visibility?: AuthendStorageVisibility;
  expiresIn?: number;
};

export type AuthendSignedUploadResult = {
  url: string;
  method: 'PUT';
  key: string;
  expiresAt: string;
  headers?: Record<string, string>;
};

export type AuthendSignedDownloadRequest = {
  key: string;
  expiresIn?: number;
};

export type AuthendSignedDownloadResult = {
  url: string;
  method: 'GET';
  key: string;
  expiresAt: string;
};

export type AuthendStorageHeadResult = {
  key: string;
  exists: boolean;
  sizeBytes: number | null;
  mimeType: string | null;
  etag?: string | null;
  lastModified?: string | null;
  visibility?: AuthendStorageVisibility | null;
};
