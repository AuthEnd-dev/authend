import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiAuthMode, TableApiConfig } from "@authend/shared";
import { Braces, Code2, Eye, Lock, Route, Save, SlidersHorizontal } from "lucide-react";
import { client } from "../lib/client";
import { Button } from "./ui/button";
import { useFeedback, getErrorMessage } from "./ui/feedback";
import { Input } from "./ui/input";
import { SidePanel } from "./ui/side-panel";
import { Textarea } from "./ui/textarea";
import { CodeBlock } from "./ui/code-block";

function normaliseFieldList(value: string) {
  return value
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean);
}

function authModeDescription(authMode: ApiAuthMode) {
  switch (authMode) {
    case "public":
      return "No authentication required.";
    case "session":
      return "Any signed-in Better Auth user can access this resource.";
    default:
      return "Only superadmins can access this resource.";
  }
}

export function ApiPreviewPanel({
  tableName,
  isOpen,
  onClose,
}: {
  tableName: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { showNotice } = useFeedback();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["api-preview", tableName],
    queryFn: () => client.system.api.preview(tableName),
    enabled: isOpen,
  });
  const [draft, setDraft] = useState<TableApiConfig | null>(null);

  useEffect(() => {
    if (data) {
      setDraft(data.resource.config);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (input: TableApiConfig) => client.system.api.saveConfig(tableName, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["api-preview", tableName] }),
        queryClient.invalidateQueries({ queryKey: ["tables"] }),
      ]);
      await refetch();
      showNotice({
        title: "API configuration saved",
        description: "OpenAPI metadata, resource capabilities, and SDK-facing naming were updated.",
        variant: "success",
      });
    },
    onError: (error) => {
      showNotice({
        title: "Failed to save API configuration",
        description: getErrorMessage(error, "The API preview configuration could not be saved."),
        variant: "destructive",
      });
    },
  });

  const config = draft ?? data?.resource.config;
  const availableFields = data?.resource.fields.map((field) => field.name).join(", ") ?? "";
  const relationFields = useMemo(
    () => data?.resource.fields.filter((field) => field.references).map((field) => field.name).join(", ") ?? "",
    [data],
  );
  const routeSegment = config?.routeSegment ?? data?.resource.routeSegment ?? tableName;
  const routeBasePreview = `/api/data/${routeSegment}`;
  const securityDescription = config ? authModeDescription(config.authMode) : "";

  const updateOperation = (key: keyof NonNullable<TableApiConfig["operations"]>, enabled: boolean) => {
    if (!config) {
      return;
    }

    setDraft({
      ...config,
      operations: {
        ...config.operations,
        [key]: enabled,
      },
    });
  };

  const updateAuthMode = (authMode: ApiAuthMode) => {
    if (!config) {
      return;
    }

    setDraft({
      ...config,
      authMode,
    });
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={`API Preview - ${tableName}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Contract preview for OpenAPI + SDK</div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={() => config && saveMutation.mutate(config)}
              disabled={!data?.resource.editable || !config || saveMutation.isPending}
              className="min-w-28"
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save API"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-8 pb-8">
        {isLoading && <div className="text-sm text-muted-foreground">Loading API preview...</div>}

        {data && config && (
          <>
            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Route className="h-4 w-4 text-muted-foreground" />
                Endpoint Design
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Route Segment</label>
                  <Input
                    value={config.routeSegment ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...config,
                        routeSegment: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                      })
                    }
                    disabled={!data.resource.editable}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SDK Resource Name</label>
                  <Input
                    value={config.sdkName ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...config,
                        sdkName: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                      })
                    }
                    disabled={!data.resource.editable}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tag</label>
                  <Input
                    value={config.tag ?? ""}
                    onChange={(event) => setDraft({ ...config, tag: event.target.value })}
                    disabled={!data.resource.editable}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Route Base</label>
                  <div className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">
                    {routeBasePreview}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                <Textarea
                  value={config.description ?? ""}
                  onChange={(event) => setDraft({ ...config, description: event.target.value })}
                  disabled={!data.resource.editable}
                  className="min-h-[96px]"
                />
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                Available fields: {availableFields || "None"}
              </div>
              {!data.resource.editable && (
                <div className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                  Built-in tables are previewable, but only generated app tables can be reconfigured.
                </div>
              )}
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Security Contract
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Auth Mode</label>
                  <select
                    value={config.authMode}
                    onChange={(event) => updateAuthMode(event.target.value as ApiAuthMode)}
                    disabled={!data.resource.editable}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    <option value="superadmin">Superadmin</option>
                    <option value="session">Signed-in Session</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                  {securityDescription}
                </div>
              </div>
            </section>

            <section className="grid gap-5 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                Query Contract
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.pagination.enabled}
                    onChange={(event) =>
                      setDraft({
                        ...config,
                        pagination: {
                          ...config.pagination,
                          enabled: event.target.checked,
                        },
                      })
                    }
                    disabled={!data.resource.editable}
                    className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                  />
                  Pagination enabled
                </label>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Default Page Size</label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={String(config.pagination.defaultPageSize)}
                    onChange={(event) =>
                      setDraft({
                        ...config,
                        pagination: {
                          ...config.pagination,
                          defaultPageSize: Number(event.target.value || "20"),
                        },
                      })
                    }
                    disabled={!data.resource.editable}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Max Page Size</label>
                  <Input
                    type="number"
                    min={1}
                    max={250}
                    value={String(config.pagination.maxPageSize)}
                    onChange={(event) =>
                      setDraft({
                        ...config,
                        pagination: {
                          ...config.pagination,
                          maxPageSize: Number(event.target.value || "100"),
                        },
                      })
                    }
                    disabled={!data.resource.editable}
                  />
                </div>
              </div>

              <div className="grid gap-5 border-t border-border/60 pt-5 md:grid-cols-2">
                <div className="grid gap-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Filtering</div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={config.filtering.enabled}
                        onChange={(event) =>
                          setDraft({
                            ...config,
                            filtering: {
                              ...config.filtering,
                              enabled: event.target.checked,
                            },
                          })
                        }
                        disabled={!data.resource.editable}
                        className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                      />
                      Enabled
                    </label>
                  </div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Allowed Fields</label>
                  <Textarea
                    value={config.filtering.fields.join(", ")}
                    onChange={(event) =>
                      setDraft({
                        ...config,
                        filtering: {
                          ...config.filtering,
                          fields: normaliseFieldList(event.target.value),
                        },
                      })
                    }
                    disabled={!data.resource.editable || !config.filtering.enabled}
                    className="mt-1 min-h-[96px]"
                  />
                </div>

                <div className="grid gap-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Sorting</div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={config.sorting.enabled}
                        onChange={(event) =>
                          setDraft({
                            ...config,
                            sorting: {
                              ...config.sorting,
                              enabled: event.target.checked,
                            },
                          })
                        }
                        disabled={!data.resource.editable}
                        className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                      />
                      Enabled
                    </label>
                  </div>
                  <div className="grid gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Allowed Fields</label>
                      <Textarea
                        value={config.sorting.fields.join(", ")}
                        onChange={(event) =>
                          setDraft({
                            ...config,
                            sorting: {
                              ...config.sorting,
                              fields: normaliseFieldList(event.target.value),
                            },
                          })
                        }
                        disabled={!data.resource.editable || !config.sorting.enabled}
                        className="mt-1 min-h-[96px]"
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Default Sort Field</label>
                        <Input
                          value={config.sorting.defaultField ?? ""}
                          onChange={(event) =>
                            setDraft({
                              ...config,
                              sorting: {
                                ...config.sorting,
                                defaultField: event.target.value.toLowerCase(),
                              },
                            })
                          }
                          disabled={!data.resource.editable || !config.sorting.enabled}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Default Order</label>
                        <select
                          value={config.sorting.defaultOrder}
                          onChange={(event) =>
                            setDraft({
                              ...config,
                              sorting: {
                                ...config.sorting,
                                defaultOrder: event.target.value as "asc" | "desc",
                              },
                            })
                          }
                          disabled={!data.resource.editable || !config.sorting.enabled}
                          className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                        >
                          <option value="desc">Descending</option>
                          <option value="asc">Ascending</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 border-t border-border/60 pt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Relation Includes</div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={config.includes.enabled}
                      onChange={(event) =>
                        setDraft({
                          ...config,
                          includes: {
                            ...config.includes,
                            enabled: event.target.checked,
                          },
                        })
                      }
                      disabled={!data.resource.editable}
                      className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                    />
                    Enabled
                  </label>
                </div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Allowed Relation Fields</label>
                <Textarea
                  value={config.includes.fields.join(", ")}
                  onChange={(event) =>
                    setDraft({
                      ...config,
                      includes: {
                        ...config.includes,
                        fields: normaliseFieldList(event.target.value),
                      },
                    })
                  }
                  disabled={!data.resource.editable || !config.includes.enabled}
                  className="mt-1 min-h-[96px]"
                />
                <div className="mt-2 text-xs text-muted-foreground">Relation fields: {relationFields || "None"}</div>
              </div>
            </section>

            <section className="grid gap-3 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Operation Matrix
              </div>
              {data.resource.operations.map((operation) => (
                <div
                  key={operation.operationId}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 py-3 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        {operation.method}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{operation.summary}</span>
                    </div>
                    <div className="mt-1 font-mono text-sm text-muted-foreground">
                      {operation.path.replace(data.resource.routeBase, routeBasePreview)}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
                      operationId: {(config.sdkName ?? tableName) + "_" + operation.key}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={config.operations[operation.key]}
                      onChange={(event) => updateOperation(operation.key, event.target.checked)}
                      disabled={!data.resource.editable}
                      className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                    />
                    Enabled
                  </label>
                </div>
              ))}
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Code2 className="h-4 w-4 text-muted-foreground" />
                Client SDK Snippet
              </div>
              <div className="text-xs text-muted-foreground">Snippets refresh from the saved contract.</div>
              <CodeBlock code={data.snippets.sdk} language="ts" />
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Braces className="h-4 w-4 text-muted-foreground" />
                Fetch Snippet
              </div>
              <CodeBlock code={data.snippets.fetch} language="js" />
            </section>
          </>
        )}
      </div>
    </SidePanel>
  );
}
