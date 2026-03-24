import { apiKeyClient } from '@better-auth/api-key/client';
import {
  adminClient,
  jwtClient,
  magicLinkClient,
  organizationClient,
  twoFactorClient,
  usernameClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { DataRecord, PluginId, PluginManifest, TableApiOperations, TableDescriptor } from './types';

export type AuthendAuthClient = ReturnType<typeof createAuthClient>;

export type ResourceListParams = {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filterField?: string;
  filterValue?: string;
  include?: string | string[];
};

export type ListResponse<TRecord> = {
  items: TRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuthendSchemaResource<
  TRecord extends DataRecord = DataRecord,
  TCreate = Record<string, unknown>,
  TUpdate = Partial<TCreate>,
  TListParams extends ResourceListParams = ResourceListParams,
  TOperations extends TableApiOperations = TableApiOperations,
> = {
  routeSegment: string;
  operations: TOperations;
  __record?: TRecord;
  __create?: TCreate;
  __update?: TUpdate;
  __listParams?: TListParams;
};

export type AuthendSchemaShape = {
  resources: Record<string, AuthendSchemaResource<DataRecord, unknown, unknown, ResourceListParams, TableApiOperations>>;
};

export type AuthendSchemaRuntime<TSchema extends AuthendSchemaShape> = {
  resources: {
    [K in keyof TSchema['resources']]: Pick<TSchema['resources'][K], 'routeSegment' | 'operations'>;
  };
};

export function defineAuthendSchema<TSchema extends AuthendSchemaShape>(schema: AuthendSchemaRuntime<TSchema>) {
  return schema;
}

/** Loose bound so indexed schema resources (e.g. `TSchema['resources'][K]`) still satisfy the constraint. */
type AnyAuthendSchemaResource = AuthendSchemaResource<any, any, any, any, any>;

type InferRecord<TResource extends AnyAuthendSchemaResource> = TResource extends { __record?: infer TRecord }
  ? TRecord
  : DataRecord;
type InferCreate<TResource extends AnyAuthendSchemaResource> = TResource extends { __create?: infer TCreate }
  ? TCreate
  : Record<string, unknown>;
type InferUpdate<TResource extends AnyAuthendSchemaResource> = TResource extends { __update?: infer TUpdate }
  ? TUpdate
  : Partial<Record<string, unknown>>;
type InferListParams<TResource extends AnyAuthendSchemaResource> = TResource extends { __listParams?: infer TParams }
  ? TParams
  : ResourceListParams;
/** `operations` is always `TableApiOperations`-shaped; indexing with API method keys is valid. */
type InferOperations<TResource extends AnyAuthendSchemaResource> = TResource['operations'];
type EnabledMethod<TEnabled, TMethod> = TEnabled extends false ? never : TMethod;

export type ResourceClient<
  TRecord = DataRecord,
  TCreate = Record<string, unknown>,
  TUpdate = Partial<TCreate>,
  TListParams = ResourceListParams,
> = {
  list: (params?: TListParams) => Promise<ListResponse<TRecord>>;
  get: (id: string) => Promise<TRecord>;
  create: (payload: TCreate) => Promise<TRecord>;
  update: (id: string, payload: TUpdate) => Promise<TRecord>;
  remove: (id: string) => Promise<void>;
};

export type ResourceClientFromDefinition<TResource extends AnyAuthendSchemaResource = AuthendSchemaResource> = {
  list: EnabledMethod<
    InferOperations<TResource>['list'],
    (params?: InferListParams<TResource>) => Promise<ListResponse<InferRecord<TResource>>>
  >;
  get: EnabledMethod<InferOperations<TResource>['get'], (id: string) => Promise<InferRecord<TResource>>>;
  create: EnabledMethod<
    InferOperations<TResource>['create'],
    (payload: InferCreate<TResource>) => Promise<InferRecord<TResource>>
  >;
  update: EnabledMethod<
    InferOperations<TResource>['update'],
    (id: string, payload: InferUpdate<TResource>) => Promise<InferRecord<TResource>>
  >;
  remove: EnabledMethod<InferOperations<TResource>['delete'], (id: string) => Promise<void>>;
};

type DynamicResourceClient = ResourceClient<
  DataRecord,
  Record<string, unknown>,
  Partial<Record<string, unknown>>,
  ResourceListParams
>;

type BaseDataClient = {
  resource: <
    TRecord = DataRecord,
    TCreate = Record<string, unknown>,
    TUpdate = Partial<TCreate>,
    TListParams = ResourceListParams,
  >(
    table: string,
  ) => ResourceClient<TRecord, TCreate, TUpdate, TListParams>;
  tables: () => Promise<{ tables: string[] }>;
  meta: (table: string) => Promise<TableDescriptor>;
  list: (table: string, searchParams?: URLSearchParams) => Promise<ListResponse<DataRecord>>;
  get: (table: string, id: string) => Promise<DataRecord>;
  create: (table: string, payload: Record<string, unknown>) => Promise<DataRecord>;
  update: (table: string, id: string, payload: Record<string, unknown>) => Promise<DataRecord>;
  remove: (table: string, id: string) => Promise<void>;
};

export type TypedDataClient<TSchema extends AuthendSchemaShape | undefined> = BaseDataClient &
  (TSchema extends AuthendSchemaShape
    ? {
        [K in keyof TSchema['resources']]: ResourceClientFromDefinition<TSchema['resources'][K]>;
      }
    : {});

type AuthendClientBaseOptions = {
  baseURL: string;
  fetch?: typeof fetch;
  enabledPlugins?: PluginId[];
  authClient?: AuthendAuthClient;
  dataBasePath?: string;
};

export type AuthendClientOptions<TSchema extends AuthendSchemaShape> = AuthendClientBaseOptions & {
  schema: AuthendSchemaRuntime<TSchema>;
};

export type AuthendClientOptionsWithoutSchema = AuthendClientBaseOptions & {
  schema?: undefined;
};

const defaultAuthClientPlugins = [
  usernameClient(),
  jwtClient(),
  organizationClient(),
  twoFactorClient(),
  apiKeyClient(),
  magicLinkClient(),
  adminClient(),
];

export function createAuthendAuthClientPlugins(enabled: PluginId[]) {
  const enabledSet = new Set(enabled);
  const plugins = [];
  if (enabledSet.has('username')) {
    plugins.push(usernameClient());
  }
  if (enabledSet.has('jwt')) {
    plugins.push(jwtClient());
  }
  if (enabledSet.has('organization')) {
    plugins.push(organizationClient());
  }
  if (enabledSet.has('twoFactor')) {
    plugins.push(twoFactorClient());
  }
  if (enabledSet.has('apiKey')) {
    plugins.push(apiKeyClient());
  }
  if (enabledSet.has('magicLink')) {
    plugins.push(magicLinkClient());
  }
  if (enabledSet.has('admin')) {
    plugins.push(adminClient());
  }
  return plugins;
}

export function createAuthendAuthClientPluginsFromManifest(manifests: PluginManifest[]) {
  return createAuthendAuthClientPlugins(
    manifests.filter((manifest) => manifest.installState.enabled).map((manifest) => manifest.id),
  );
}

export function createAuthendClient<TSchema extends AuthendSchemaShape>(
  options: AuthendClientOptions<TSchema>,
): {
  auth: AuthendAuthClient;
  data: TypedDataClient<TSchema>;
};

export function createAuthendClient(
  options: AuthendClientOptionsWithoutSchema,
): {
  auth: AuthendAuthClient;
  data: TypedDataClient<undefined>;
};

export function createAuthendClient<TSchema extends AuthendSchemaShape>(
  options: AuthendClientOptions<TSchema> | AuthendClientOptionsWithoutSchema,
) {
  const dataBasePath = options.dataBasePath ?? '/api/data';
  const auth =
    options.authClient ??
    createAuthClient({
      baseURL: options.baseURL,
      fetch: options.fetch,
      plugins:
        options.enabledPlugins === undefined ? defaultAuthClientPlugins : createAuthendAuthClientPlugins(options.enabledPlugins),
    });

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await (options.fetch ?? fetch)(`${options.baseURL}${path}`, {
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Request failed: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };

  const resource = <
    TRecord = DataRecord,
    TCreate = Record<string, unknown>,
    TUpdate = Partial<TCreate>,
    TListParams = ResourceListParams,
  >(
    table: string,
  ): ResourceClient<TRecord, TCreate, TUpdate, TListParams> => ({
    list: (params?: TListParams) => {
      const searchParams = new URLSearchParams();
      const typedParams = params as ResourceListParams | undefined;
      if (typedParams?.page) {
        searchParams.set('page', String(typedParams.page));
      }
      if (typedParams?.pageSize) {
        searchParams.set('pageSize', String(typedParams.pageSize));
      }
      if (typedParams?.sort) {
        searchParams.set('sort', typedParams.sort);
      }
      if (typedParams?.order) {
        searchParams.set('order', typedParams.order);
      }
      if (typedParams?.filterField) {
        searchParams.set('filterField', typedParams.filterField);
      }
      if (typedParams?.filterValue) {
        searchParams.set('filterValue', typedParams.filterValue);
      }
      if (typedParams?.include) {
        searchParams.set('include', Array.isArray(typedParams.include) ? typedParams.include.join(',') : typedParams.include);
      }
      return request<ListResponse<TRecord>>(`${dataBasePath}/${table}${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`);
    },
    get: (id: string) => request<TRecord>(`${dataBasePath}/${table}/${id}`),
    create: (payload: TCreate) =>
      request<TRecord>(`${dataBasePath}/${table}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: TUpdate) =>
      request<TRecord>(`${dataBasePath}/${table}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      request<void>(`${dataBasePath}/${table}/${id}`, {
        method: 'DELETE',
      }),
  });

  const schemaResources = ((options.schema as AuthendSchemaRuntime<TSchema> | undefined)?.resources ?? {}) as Record<
    string,
    { routeSegment: string }
  >;

  const dataBase: BaseDataClient = {
    resource,
    tables: () => request<{ tables: string[] }>(dataBasePath),
    meta: (table: string) => request<TableDescriptor>(`${dataBasePath}/meta/${table}`),
    list: (table: string, searchParams?: URLSearchParams) =>
      resource(table).list(
        searchParams
          ? {
              page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
              pageSize: searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined,
              sort: searchParams.get('sort') ?? undefined,
              order: (searchParams.get('order') as 'asc' | 'desc' | null) ?? undefined,
              filterField: searchParams.get('filterField') ?? undefined,
              filterValue: searchParams.get('filterValue') ?? undefined,
              include: searchParams.get('include') ?? undefined,
            }
          : undefined,
      ),
    get: (table: string, id: string) => resource(table).get(id),
    create: (table: string, payload: Record<string, unknown>) => resource(table).create(payload),
    update: (table: string, id: string, payload: Record<string, unknown>) => resource(table).update(id, payload),
    remove: (table: string, id: string) => resource(table).remove(id),
  };

  const data = new Proxy(dataBase as TypedDataClient<TSchema>, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string') {
        return Reflect.get(target, prop, receiver);
      }

      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }

      const routeSegment = schemaResources[prop]?.routeSegment ?? prop;
      return resource(routeSegment);
    },
  });

  return {
    auth,
    data,
  };
}
