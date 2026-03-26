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
import type {
  AuthendSignedDownloadRequest,
  AuthendSignedDownloadResult,
  AuthendSignedUploadRequest,
  AuthendSignedUploadResult,
  AuthendStorageHeadResult,
  AuthendStorageUploadInput,
  AuthendStorageUploadResult,
  DataRecord,
  PluginId,
  PluginManifest,
  TableApiOperations,
  TableDescriptor,
} from './types';

export type AuthendAuthClient = ReturnType<typeof createAuthClient>;

export type ResourceListParams<
  TSort extends string = string,
  TFilter extends string = string,
  TInclude extends string = string,
> = {
  page?: number;
  pageSize?: number;
  sort?: TSort;
  order?: 'asc' | 'desc';
  filterField?: TFilter;
  filterValue?: string;
  include?: TInclude | TInclude[];
};

export type ListResponse<TRecord> = {
  items: TRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuthendApiErrorPayload = {
  error?: string;
  code?: string;
  message?: string;
  details?: unknown;
};

export type AuthendApiKeyProvider = string | (() => string | null | undefined);

export class AuthendApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly path: string;
  readonly rawBody: string;

  constructor(input: { status: number; path: string; message: string; code?: string; details?: unknown; rawBody?: string }) {
    super(input.message);
    this.name = 'AuthendApiError';
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.path = input.path;
    this.rawBody = input.rawBody ?? '';
  }
}

export type AuthendSchemaResource<
  TRecord extends DataRecord = DataRecord,
  TCreate = Record<string, unknown>,
  TUpdate = Partial<TCreate>,
  TSort extends string = string,
  TFilter extends string = string,
  TIncludes extends Record<string, AuthendIncludeDefinition<any, any>> = {},
  TOperations extends TableApiOperations = TableApiOperations,
> = {
  routeSegment: string;
  operations: TOperations;
  __record?: TRecord;
  __create?: TCreate;
  __update?: TUpdate;
  __sort?: TSort;
  __filter?: TFilter;
  __includes?: TIncludes;
};

export type AuthendIncludeDefinition<TRecord extends DataRecord = DataRecord, TResultKey extends string = string> = {
  resultKey: TResultKey;
  __record?: TRecord;
};

export type AuthendSchemaShape = {
  resources: Record<string, AuthendSchemaResource<DataRecord, unknown, unknown, string, string, {}, TableApiOperations>>;
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
type AnyAuthendSchemaResource = AuthendSchemaResource<any, any, any, any, any, any, any>;

type InferRecord<TResource extends AnyAuthendSchemaResource> = TResource extends { __record?: infer TRecord }
  ? TRecord
  : DataRecord;
type InferCreate<TResource extends AnyAuthendSchemaResource> = TResource extends { __create?: infer TCreate }
  ? TCreate
  : Record<string, unknown>;
type InferUpdate<TResource extends AnyAuthendSchemaResource> = TResource extends { __update?: infer TUpdate }
  ? TUpdate
  : Partial<Record<string, unknown>>;
type InferSort<TResource extends AnyAuthendSchemaResource> = TResource extends { __sort?: infer TSort }
  ? Extract<TSort, string>
  : string;
type InferFilter<TResource extends AnyAuthendSchemaResource> = TResource extends { __filter?: infer TFilter }
  ? Extract<TFilter, string>
  : string;
type InferIncludes<TResource extends AnyAuthendSchemaResource> = TResource extends { __includes?: infer TIncludes }
  ? TIncludes
  : {};
type InferListParams<TResource extends AnyAuthendSchemaResource> = ResourceListParams<
  InferSort<TResource>,
  InferFilter<TResource>,
  Extract<keyof InferIncludes<TResource>, string>
>;
/** `operations` is always `TableApiOperations`-shaped; indexing with API method keys is valid. */
type InferOperations<TResource extends AnyAuthendSchemaResource> = TResource['operations'];
type EnabledMethod<TEnabled, TMethod> = TEnabled extends false ? never : TMethod;
type IncludeKeysFromParam<TParam> = TParam extends readonly (infer TKey)[] ? Extract<TKey, string> : Extract<TParam, string>;
type SelectedIncludeKeys<TParams> = TParams extends { include?: infer TInclude }
  ? IncludeKeysFromParam<Exclude<TInclude, undefined>>
  : never;
type InferIncludeRecord<TInclude> = TInclude extends { __record?: infer TRecord } ? TRecord : DataRecord;
type InferIncludeResultKey<TInclude> = TInclude extends { resultKey: infer TResultKey } ? Extract<TResultKey, string> : never;
type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer TResult) => void
  ? TResult
  : never;
type MergeIncludedRecord<TRecord, TIncludeMap, TSelected extends string> = TRecord &
  UnionToIntersection<
    {
      [K in TSelected]: K extends keyof TIncludeMap
        ? {
            [P in InferIncludeResultKey<TIncludeMap[K]>]: InferIncludeRecord<TIncludeMap[K]> | null;
          }
        : {};
    }[TSelected]
  >;

export type ResourceClient<
  TRecord = DataRecord,
  TCreate = Record<string, unknown>,
  TUpdate = Partial<TCreate>,
  TListParams = ResourceListParams,
> = {
  list: (params?: TListParams) => Promise<ListResponse<TRecord>>;
  page: (
    page: number,
    params?: Omit<TListParams extends object ? TListParams : ResourceListParams, 'page'>,
  ) => Promise<ListResponse<TRecord>>;
  withInclude: (
    include: ResourceListParams['include'],
    params?: Omit<TListParams extends object ? TListParams : ResourceListParams, 'include'>,
  ) => Promise<ListResponse<TRecord>>;
  iteratePages: (params?: TListParams) => AsyncGenerator<ListResponse<TRecord>, void, unknown>;
  iterateItems: (params?: TListParams) => AsyncGenerator<TRecord, void, unknown>;
  get: (id: string) => Promise<TRecord>;
  create: (payload: TCreate) => Promise<TRecord>;
  update: (id: string, payload: TUpdate) => Promise<TRecord>;
  remove: (id: string) => Promise<void>;
};

export type ResourceClientFromDefinition<TResource extends AnyAuthendSchemaResource = AuthendSchemaResource> = {
  list: EnabledMethod<
    InferOperations<TResource>['list'],
    <TParams extends InferListParams<TResource> | undefined = undefined>(
      params?: TParams,
    ) => Promise<
      ListResponse<MergeIncludedRecord<InferRecord<TResource>, InferIncludes<TResource>, SelectedIncludeKeys<TParams>>>
    >
  >;
  page: EnabledMethod<
    InferOperations<TResource>['list'],
    (page: number, params?: Omit<InferListParams<TResource>, 'page'>) => Promise<ListResponse<InferRecord<TResource>>>
  >;
  withInclude: EnabledMethod<
    InferOperations<TResource>['list'],
    (
      include: InferListParams<TResource>['include'],
      params?: Omit<InferListParams<TResource>, 'include'>,
    ) => Promise<ListResponse<InferRecord<TResource>>>
  >;
  iteratePages: EnabledMethod<
    InferOperations<TResource>['list'],
    (params?: InferListParams<TResource>) => AsyncGenerator<ListResponse<InferRecord<TResource>>, void, unknown>
  >;
  iterateItems: EnabledMethod<
    InferOperations<TResource>['list'],
    (params?: InferListParams<TResource>) => AsyncGenerator<InferRecord<TResource>, void, unknown>
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

export type AuthendRealtimeEventMessage = {
  type: 'event';
  name: 'record.created' | 'record.updated' | 'record.deleted';
  table: string;
  id: string;
  record: Record<string, unknown>;
};

export type AuthendRealtimeConnection = {
  readonly ws: WebSocket;
  subscribeTable: (table: string) => void;
  subscribeRecord: (table: string, id: string) => void;
  unsubscribeTable: (table: string) => void;
  unsubscribeRecord: (table: string, id: string) => void;
  ping: () => void;
  close: (code?: number, reason?: string) => void;
};

export type AuthendRealtimeClient = {
  /**
   * Opens a WebSocket to `/api/realtime` (or `realtimeBasePath`). Uses cookies when `credentials` apply,
   * or appends `x-api-key` when an API key is configured on the client.
   */
  connect: (handlers?: {
    onEvent?: (event: AuthendRealtimeEventMessage) => void;
    onServerError?: (message: string) => void;
    onOpen?: () => void;
    onClose?: (ev: CloseEvent) => void;
  }) => AuthendRealtimeConnection;
};

type AuthendClientBaseOptions = {
  baseURL: string;
  fetch?: typeof fetch;
  enabledPlugins?: PluginId[];
  authClient?: AuthendAuthClient;
  dataBasePath?: string;
  storageBasePath?: string;
  realtimeBasePath?: string;
  apiKey?: AuthendApiKeyProvider;
  apiKeyHeaderName?: string;
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
  storage: AuthendStorageClient;
  realtime: AuthendRealtimeClient;
};

export function createAuthendClient(options: AuthendClientOptionsWithoutSchema): {
  auth: AuthendAuthClient;
  data: TypedDataClient<undefined>;
  storage: AuthendStorageClient;
  realtime: AuthendRealtimeClient;
};

export function createAuthendClient<TSchema extends AuthendSchemaShape>(
  options: AuthendClientOptions<TSchema> | AuthendClientOptionsWithoutSchema,
) {
  const dataBasePath = options.dataBasePath ?? '/api/data';
  const storageBasePath = options.storageBasePath ?? '/api/storage';
  const realtimeBasePath = options.realtimeBasePath ?? '/api/realtime';
  const apiKeyHeaderName = options.apiKeyHeaderName ?? 'x-api-key';
  const auth =
    options.authClient ??
    createAuthClient({
      baseURL: options.baseURL,
      fetch: options.fetch,
      plugins:
        options.enabledPlugins === undefined ? defaultAuthClientPlugins : createAuthendAuthClientPlugins(options.enabledPlugins),
    });

  const resolveApiKey = () => {
    if (typeof options.apiKey === 'function') {
      return options.apiKey() ?? undefined;
    }
    return options.apiKey ?? undefined;
  };

  const composeHeaders = (initHeaders?: HeadersInit) => {
    const headers = new Headers(initHeaders);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const apiKey = resolveApiKey();
    if (apiKey && !headers.has(apiKeyHeaderName)) {
      headers.set(apiKeyHeaderName, apiKey);
    }

    return headers;
  };

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const headers = composeHeaders(init?.headers);
    const response = await (options.fetch ?? fetch)(`${options.baseURL}${path}`, {
      credentials: 'include',
      ...init,
      headers,
    });

    if (!response.ok) {
      const rawBody = await response.text();
      let parsedPayload: AuthendApiErrorPayload | null = null;

      if (rawBody.trim().length > 0) {
        try {
          parsedPayload = JSON.parse(rawBody) as AuthendApiErrorPayload;
        } catch {
          parsedPayload = null;
        }
      }

      const message =
        parsedPayload?.message ??
        parsedPayload?.error ??
        (rawBody.trim().length > 0 ? rawBody : `Request failed: ${response.status}`);

      throw new AuthendApiError({
        status: response.status,
        path,
        message,
        code: parsedPayload?.code,
        details: parsedPayload?.details,
        rawBody,
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };

  const requestMultipart = async <T>(path: string, formData: FormData): Promise<T> => {
    const headers = composeHeaders();
    headers.delete('content-type');
    const response = await (options.fetch ?? fetch)(`${options.baseURL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const rawBody = await response.text();
      let parsedPayload: AuthendApiErrorPayload | null = null;
      if (rawBody.trim().length > 0) {
        try {
          parsedPayload = JSON.parse(rawBody) as AuthendApiErrorPayload;
        } catch {
          parsedPayload = null;
        }
      }
      throw new AuthendApiError({
        status: response.status,
        path,
        message: parsedPayload?.message ?? parsedPayload?.error ?? (rawBody || `Request failed: ${response.status}`),
        code: parsedPayload?.code,
        details: parsedPayload?.details,
        rawBody,
      });
    }

    return (await response.json()) as T;
  };

  const toStorageFile = (input: AuthendStorageUploadInput) => {
    const fileName = input.fileName ?? 'upload.bin';
    if (input.file instanceof File) {
      return input.file;
    }
    if (input.file instanceof Blob) {
      return new File([input.file], fileName, { type: input.mimeType ?? (input.file.type || 'application/octet-stream') });
    }
    if (input.file instanceof ArrayBuffer) {
      return new File([new Uint8Array(input.file)], fileName, { type: input.mimeType ?? 'application/octet-stream' });
    }
    if (input.file instanceof Uint8Array) {
      return new File([new Uint8Array(input.file)], fileName, { type: input.mimeType ?? 'application/octet-stream' });
    }
    return new File([input.file], fileName, { type: input.mimeType ?? 'application/octet-stream' });
  };

  const resource = <
    TRecord = DataRecord,
    TCreate = Record<string, unknown>,
    TUpdate = Partial<TCreate>,
    TListParams = ResourceListParams,
  >(
    table: string,
  ): ResourceClient<TRecord, TCreate, TUpdate, TListParams> => {
    const listWithParams = (params?: TListParams) => {
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
      return request<ListResponse<TRecord>>(
        `${dataBasePath}/${table}${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
      );
    };

    return {
      list: listWithParams,
      page: (page, params) =>
        listWithParams({
          ...(params as ResourceListParams | undefined),
          page,
        } as TListParams),
      withInclude: (include, params) =>
        listWithParams({
          ...(params as ResourceListParams | undefined),
          include,
        } as TListParams),
      iteratePages: async function* (params?: TListParams) {
        let currentPage = (params as ResourceListParams | undefined)?.page ?? 1;
        const sharedParams = {
          ...(params as ResourceListParams | undefined),
        };
        delete sharedParams.page;

        while (true) {
          const response = await listWithParams({
            ...sharedParams,
            page: currentPage,
          } as TListParams);
          if (response.items.length === 0) {
            return;
          }
          yield response;
          if (response.page * response.pageSize >= response.total) {
            return;
          }
          currentPage += 1;
        }
      },
      iterateItems: async function* (params?: TListParams) {
        for await (const page of this.iteratePages(params)) {
          for (const item of page.items) {
            yield item;
          }
        }
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
    };
  };

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

  const realtime: AuthendRealtimeClient = {
    connect: (handlers) => {
      const base = new URL(options.baseURL);
      const proto = base.protocol === 'https:' ? 'wss:' : 'ws:';
      const key = resolveApiKey();
      const qs = key ? `?x-api-key=${encodeURIComponent(key)}` : '';
      const ws = new WebSocket(`${proto}//${base.host}${realtimeBasePath}${qs}`);

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String((ev as MessageEvent).data)) as Record<string, unknown>;
          if (msg.type === 'event' && handlers?.onEvent) {
            handlers.onEvent(msg as unknown as AuthendRealtimeEventMessage);
          }
          if (msg.type === 'error' && handlers?.onServerError) {
            handlers.onServerError(String(msg.message ?? 'Unknown error'));
          }
        } catch {
          /* ignore non-JSON frames */
        }
      });

      ws.addEventListener('open', () => handlers?.onOpen?.());
      ws.addEventListener('close', (ev) => handlers?.onClose?.(ev));

      return {
        ws,
        subscribeTable: (table: string) => {
          ws.send(JSON.stringify({ type: 'subscribe', scope: 'table', table }));
        },
        subscribeRecord: (table: string, id: string) => {
          ws.send(JSON.stringify({ type: 'subscribe', scope: 'record', table, id }));
        },
        unsubscribeTable: (table: string) => {
          ws.send(JSON.stringify({ type: 'unsubscribe', scope: 'table', table }));
        },
        unsubscribeRecord: (table: string, id: string) => {
          ws.send(JSON.stringify({ type: 'unsubscribe', scope: 'record', table, id }));
        },
        ping: () => {
          ws.send(JSON.stringify({ type: 'ping' }));
        },
        close: (code, reason) => {
          ws.close(code, reason);
        },
      };
    },
  };

  const storage: AuthendStorageClient = {
    upload: async (input) => {
      const formData = new FormData();
      const file = toStorageFile(input);
      formData.set('file', file);
      if (input.visibility) {
        formData.set('visibility', input.visibility);
      }
      if (input.prefix) {
        formData.set('prefix', input.prefix);
      }
      return requestMultipart<AuthendStorageUploadResult>(`${storageBasePath}/upload`, formData);
    },
    createSignedUploadUrl: (input) =>
      request<AuthendSignedUploadResult>(`${storageBasePath}/signed-upload`, {
        method: 'POST',
        body: JSON.stringify(input satisfies AuthendSignedUploadRequest),
      }),
    createSignedDownloadUrl: (input) =>
      request<AuthendSignedDownloadResult>(`${storageBasePath}/signed-download`, {
        method: 'POST',
        body: JSON.stringify(input satisfies AuthendSignedDownloadRequest),
      }),
    head: ({ key }) => request<AuthendStorageHeadResult>(`${storageBasePath}/head/${encodeURIComponent(key)}`),
    remove: ({ key }) =>
      request<void>(`${storageBasePath}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }),
  };

  return {
    auth,
    data,
    storage,
    realtime,
  };
}

export type AuthendStorageClient = {
  upload: (input: AuthendStorageUploadInput) => Promise<AuthendStorageUploadResult>;
  createSignedUploadUrl: (input: AuthendSignedUploadRequest) => Promise<AuthendSignedUploadResult>;
  createSignedDownloadUrl: (input: AuthendSignedDownloadRequest) => Promise<AuthendSignedDownloadResult>;
  head: (input: { key: string }) => Promise<AuthendStorageHeadResult>;
  remove: (input: { key: string }) => Promise<void>;
};
