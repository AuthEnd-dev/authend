import { apiKeyClient } from "@better-auth/api-key/client";
import { adminClient, jwtClient, magicLinkClient, organizationClient, twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type {
  ApiPreview,
  ApiResource,
  AuditLog,
  DataRecord,
  MigrationRecord,
  PluginCatalogItem,
  PluginConfigUpdate,
  PluginId,
  PluginManifest,
  SchemaDraft,
  SetupStatus,
  TableApiConfig,
  TableDescriptor,
} from "@authend/shared";

export type AuthendClientOptions = {
  baseURL: string;
  fetch?: typeof fetch;
  /**
   * When set, only registers matching Better Auth client plugins (aligned with server-enabled plugins).
   * When omitted, all curated client plugins are registered (backward compatible).
   */
  enabledPlugins?: PluginId[];
};

export type ResourceListParams = {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: "asc" | "desc";
  filterField?: string;
  filterValue?: string;
  include?: string | string[];
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

/**
 * Better Auth client plugins matching the curated server plugin order.
 * Pass the list from `setupStatus.enabledPlugins` to align with the API.
 */
export function createAuthendAuthClientPlugins(enabled: PluginId[]) {
  const enabledSet = new Set(enabled);
  const plugins = [];
  if (enabledSet.has("username")) {
    plugins.push(usernameClient());
  }
  if (enabledSet.has("jwt")) {
    plugins.push(jwtClient());
  }
  if (enabledSet.has("organization")) {
    plugins.push(organizationClient());
  }
  if (enabledSet.has("twoFactor")) {
    plugins.push(twoFactorClient());
  }
  if (enabledSet.has("apiKey")) {
    plugins.push(apiKeyClient());
  }
  if (enabledSet.has("magicLink")) {
    plugins.push(magicLinkClient());
  }
  if (enabledSet.has("admin")) {
    plugins.push(adminClient());
  }
  return plugins;
}

export function createAuthendAuthClientPluginsFromManifest(manifests: PluginManifest[]) {
  return createAuthendAuthClientPlugins(
    manifests.filter((manifest) => manifest.installState.enabled).map((manifest) => manifest.id),
  );
}

export function createAuthendClient(options: AuthendClientOptions) {
  const auth = createAuthClient({
    baseURL: options.baseURL,
    fetch: options.fetch,
    plugins:
      options.enabledPlugins === undefined ? defaultAuthClientPlugins : createAuthendAuthClientPlugins(options.enabledPlugins),
  });

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await (options.fetch ?? fetch)(`${options.baseURL}${path}`, {
      credentials: "include",
      headers: {
        "content-type": "application/json",
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

  const resource = (table: string) => ({
    list: (params?: ResourceListParams) => {
      const searchParams = new URLSearchParams();
      if (params?.page) {
        searchParams.set("page", String(params.page));
      }
      if (params?.pageSize) {
        searchParams.set("pageSize", String(params.pageSize));
      }
      if (params?.sort) {
        searchParams.set("sort", params.sort);
      }
      if (params?.order) {
        searchParams.set("order", params.order);
      }
      if (params?.filterField) {
        searchParams.set("filterField", params.filterField);
      }
      if (params?.filterValue) {
        searchParams.set("filterValue", params.filterValue);
      }
      if (params?.include) {
        searchParams.set("include", Array.isArray(params.include) ? params.include.join(",") : params.include);
      }
      return request<{ items: DataRecord[]; total: number; page: number; pageSize: number }>(
        `/api/data/${table}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
      );
    },
    get: (id: string) => request<DataRecord>(`/api/data/${table}/${id}`),
    create: (payload: Record<string, unknown>) =>
      request<DataRecord>(`/api/data/${table}`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Record<string, unknown>) =>
      request<DataRecord>(`/api/data/${table}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      request<void>(`/api/data/${table}/${id}`, {
        method: "DELETE",
      }),
  });

  return {
    auth,
    system: {
      setupStatus: () => request<SetupStatus>("/api/setup/status"),
      auditLogs: () => request<AuditLog[]>("/api/admin/audit"),
      migrations: () => request<MigrationRecord[]>("/api/admin/migrations"),
      previewMigrations: () => request<MigrationRecord[]>("/api/admin/migrations/preview", { method: "POST" }),
      applyMigrations: () => request<{ applied: string[] }>("/api/admin/migrations/apply", { method: "POST" }),
      plugins: {
        list: () => request<PluginCatalogItem[]>("/api/admin/plugins"),
        manifests: () => request<PluginManifest[]>("/api/admin/plugins/manifests"),
        manifest: (pluginId: string) => request<PluginManifest>(`/api/admin/plugins/${pluginId}/manifest`),
        saveConfig: (pluginId: string, payload: PluginConfigUpdate) =>
          request<PluginManifest>(`/api/admin/plugins/${pluginId}/config`, {
            method: "POST",
            body: JSON.stringify(payload),
          }),
        enable: (pluginId: string) =>
          request<PluginManifest>(`/api/admin/plugins/${pluginId}/enable`, {
            method: "POST",
          }),
        disable: (pluginId: string) =>
          request<PluginManifest>(`/api/admin/plugins/${pluginId}/disable`, {
            method: "POST",
          }),
      },
      pluginManifest: () => request<PluginManifest[]>("/api/system/plugin-manifest"),
      schema: {
        get: () => request<SchemaDraft>("/api/admin/schema"),
        preview: (draft: SchemaDraft) =>
          request<{ sql: string[]; warnings: string[] }>("/api/admin/schema/preview", {
            method: "POST",
            body: JSON.stringify(draft),
          }),
        apply: (draft: SchemaDraft) =>
          request<{ migrationId: string; sql: string[] }>("/api/admin/schema/apply", {
            method: "POST",
            body: JSON.stringify(draft),
          }),
      },
      api: {
        list: () => request<ApiResource[]>("/api/admin/api-preview"),
        preview: (table: string) => request<ApiPreview>(`/api/admin/api-preview/${table}`),
        saveConfig: (table: string, config: TableApiConfig) =>
          request<ApiPreview>(`/api/admin/api-preview/${table}`, {
            method: "POST",
            body: JSON.stringify(config),
          }),
      },
    },
    data: {
      resource,
      tables: () => request<{ tables: string[] }>("/api/data"),
      meta: (table: string) => request<TableDescriptor>(`/api/data/meta/${table}`),
      list: (table: string, searchParams?: URLSearchParams) => resource(table).list(searchParams ? {
        page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
        pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
        sort: searchParams.get("sort") ?? undefined,
        order: (searchParams.get("order") as "asc" | "desc" | null) ?? undefined,
        filterField: searchParams.get("filterField") ?? undefined,
        filterValue: searchParams.get("filterValue") ?? undefined,
        include: searchParams.get("include") ?? undefined,
      } : undefined),
      get: (table: string, id: string) => resource(table).get(id),
      create: (table: string, payload: Record<string, unknown>) => resource(table).create(payload),
      update: (table: string, id: string, payload: Record<string, unknown>) => resource(table).update(id, payload),
      remove: (table: string, id: string) => resource(table).remove(id),
    },
  };
}
