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
