import { useEffect, useMemo, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiContext, AiRun } from "@authend/shared";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { client } from "../lib/client";
import { SidePanel } from "./ui/side-panel";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { CodeBlock } from "./ui/code-block";
import { getErrorMessage, useFeedback } from "./ui/feedback";

function prettyRoute(pathname: string) {
  if (pathname === "/" || pathname === "/general") return "General";
  return pathname
    .replace(/^\//, "")
    .split("/")
    .map((segment) => segment.replace(/-/g, " "))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" / ");
}

function runStatusVariant(status: AiRun["status"]) {
  switch (status) {
    case "completed":
      return "default";
    case "failed":
    case "rejected":
      return "destructive";
    default:
      return "secondary";
  }
}

function buildContext(pathname: string, search: Record<string, unknown>): AiContext {
  const selectedTable = typeof search.table === "string" ? search.table : null;
  return {
    route: pathname,
    pageTitle: prettyRoute(pathname),
    selectedTable,
    selectedPluginId: null,
    selectedResource: selectedTable,
  };
}

export function AiAssistantDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { showNotice } = useFeedback();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ selectedPluginId?: string | null }>).detail;
      setSelectedPluginId(typeof detail?.selectedPluginId === "string" ? detail.selectedPluginId : null);
    };

    window.addEventListener("authend:assistant-context", handler as EventListener);
    return () => window.removeEventListener("authend:assistant-context", handler as EventListener);
  }, []);

  const aiContext = useMemo(
    () => ({
      ...buildContext(location.pathname, (location.search as Record<string, unknown>) ?? {}),
      selectedPluginId,
    }),
    [location.pathname, location.search, selectedPluginId],
  );

  const threadsQuery = useQuery({
    queryKey: ["ai", "threads"],
    queryFn: () => client.system.ai.threads(),
    enabled: isOpen,
  });

  useEffect(() => {
    if (!activeThreadId && threadsQuery.data && threadsQuery.data.length > 0) {
      setActiveThreadId(threadsQuery.data[0].id);
    }
  }, [activeThreadId, threadsQuery.data]);

  const threadQuery = useQuery({
    queryKey: ["ai", "thread", activeThreadId],
    queryFn: () => client.system.ai.thread(activeThreadId!),
    enabled: isOpen && Boolean(activeThreadId),
  });

  const invalidateAi = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ai", "threads"] }),
      queryClient.invalidateQueries({ queryKey: ["ai", "thread", activeThreadId] }),
      queryClient.invalidateQueries({ queryKey: ["tables"] }),
      queryClient.invalidateQueries({ queryKey: ["plugins"] }),
      queryClient.invalidateQueries({ queryKey: ["plugin-manifests"] }),
      queryClient.invalidateQueries({ queryKey: ["schema"] }),
      queryClient.invalidateQueries({ queryKey: ["api-preview"] }),
      queryClient.invalidateQueries({ queryKey: ["rows"] }),
      queryClient.invalidateQueries({ queryKey: ["settings", "api"] }),
      queryClient.invalidateQueries({ queryKey: ["settings"] }),
    ]);
  };

  const createThreadMutation = useMutation({
    mutationFn: (title?: string) => client.system.ai.createThread(title),
    onSuccess: async (thread) => {
      setActiveThreadId(thread.id);
      await queryClient.invalidateQueries({ queryKey: ["ai", "threads"] });
    },
    onError: (error) =>
      showNotice({
        title: "Failed to create thread",
        description: getErrorMessage(error, "Could not create an AI assistant thread."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      let threadId = activeThreadId;
      if (!threadId) {
        const thread = await client.system.ai.createThread(content.slice(0, 60));
        threadId = thread.id;
        setActiveThreadId(thread.id);
      }
      return client.system.ai.sendMessage(threadId, {
        content,
        context: aiContext,
      });
    },
    onSuccess: async (detail) => {
      setMessage("");
      setActiveThreadId(detail.thread.id);
      await invalidateAi();
    },
    onError: (error) =>
      showNotice({
        title: "Assistant request failed",
        description: getErrorMessage(error, "Could not generate an AI assistant plan."),
        variant: "destructive",
        durationMs: 7000,
      }),
  });

  const approveRunMutation = useMutation({
    mutationFn: (runId: string) => client.system.ai.approveRun(runId),
    onSuccess: async (detail) => {
      setActiveThreadId(detail.thread.id);
      await invalidateAi();
      showNotice({
        title: "AI run applied",
        description: "Approved assistant actions were executed.",
        variant: "success",
        durationMs: 4500,
      });
    },
    onError: (error) =>
      showNotice({
        title: "Failed to apply AI run",
        description: getErrorMessage(error, "The approved assistant actions could not be executed."),
        variant: "destructive",
        durationMs: 7000,
      }),
  });

  const rejectRunMutation = useMutation({
    mutationFn: (runId: string) => client.system.ai.rejectRun(runId),
    onSuccess: async (detail) => {
      setActiveThreadId(detail.thread.id);
      await invalidateAi();
    },
    onError: (error) =>
      showNotice({
        title: "Failed to reject run",
        description: getErrorMessage(error, "The AI run could not be rejected."),
        variant: "destructive",
        durationMs: 6000,
      }),
  });

  const activeDetail = threadQuery.data;
  const runsById = new Map((activeDetail?.runs ?? []).map((run) => [run.id, run]));
  const messages = activeDetail?.messages ?? [];

  async function handleSend() {
    if (!message.trim() || sendMessageMutation.isPending) {
      return;
    }
    await sendMessageMutation.mutateAsync(message.trim());
  }

  const footer = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted/50 px-2.5 py-1">{aiContext.pageTitle ?? "Unknown"}</span>
        {aiContext.selectedTable ? <span className="rounded-full bg-muted/50 px-2.5 py-1">table {aiContext.selectedTable}</span> : null}
        {aiContext.selectedPluginId ? <span className="rounded-full bg-muted/50 px-2.5 py-1">plugin {aiContext.selectedPluginId}</span> : null}
      </div>
      <div className="flex items-end gap-3">
        <Textarea
          className="min-h-[88px] resize-none border-border/70 bg-background"
          placeholder="Ask the assistant to create tables, enable plugins, change API config, or update data..."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void handleSend();
            }
          }}
        />
        <Button onClick={() => void handleSend()} disabled={!message.trim() || sendMessageMutation.isPending}>
          {sendMessageMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send
        </Button>
      </div>
    </div>
  );

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="AI Assistant" footer={footer}>
      <div className="grid h-full min-h-[70vh] gap-0 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border/60 pb-4 lg:border-b-0 lg:border-r lg:pb-0">
          <div className="flex items-center justify-between px-1 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Threads</h3>
              <p className="text-xs text-muted-foreground">Persistent sessions</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => createThreadMutation.mutate(message.trim() ? message.trim().slice(0, 60) : undefined)}
              disabled={createThreadMutation.isPending}
            >
              New
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto pr-3">
            {threadsQuery.isLoading ? (
              <div className="px-1 py-4 text-sm text-muted-foreground">Loading threads...</div>
            ) : (threadsQuery.data ?? []).length === 0 ? (
              <div className="px-1 py-4 text-sm text-muted-foreground">No assistant threads yet.</div>
            ) : (
              <div className="space-y-1">
                {(threadsQuery.data ?? []).map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setActiveThreadId(thread.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                      activeThreadId === thread.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">{thread.title}</p>
                      {thread.latestRunStatus ? <Badge variant={runStatusVariant(thread.latestRunStatus)}>{thread.latestRunStatus}</Badge> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{new Date(thread.updatedAt).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col lg:pl-6">
          <div className="border-b border-border/60 pb-3">
            <h3 className="text-sm font-semibold text-foreground">{activeDetail?.thread.title ?? "New assistant thread"}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Preview + confirm only. No env edits, backups, crons, raw SQL, or danger-zone actions.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto py-5">
            {!activeThreadId ? (
              <div className="px-1 py-10 text-sm text-muted-foreground">
                Start a conversation to prepare schema, plugin, API, or data changes.
              </div>
            ) : threadQuery.isLoading ? (
              <div className="px-1 py-6 text-sm text-muted-foreground">Loading conversation...</div>
            ) : threadQuery.error ? (
              <div className="px-1 py-6 text-sm text-destructive">
                {getErrorMessage(threadQuery.error, "Failed to load the selected AI thread.")}
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((messageRecord) => {
                  const run = messageRecord.runId ? runsById.get(messageRecord.runId) : undefined;
                  const linkedUserMessage = run
                    ? messages.find((candidate) => candidate.id === run.userMessageId)
                    : null;

                  return (
                    <div key={messageRecord.id} className="space-y-3">
                      <div className={`flex ${messageRecord.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] ${messageRecord.role === "user" ? "rounded-2xl rounded-br-md bg-secondary px-4 py-3" : "px-1 py-1"}`}>
                          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            <span>{messageRecord.role === "user" ? "You" : "Assistant"}</span>
                            <span className="normal-case tracking-normal">{new Date(messageRecord.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{messageRecord.content}</p>
                        </div>
                      </div>

                      {run ? (
                        <div className="ml-1 border-l border-border/70 pl-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">{run.summary}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{run.rationale}</p>
                            </div>
                            <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>
                          </div>

                          {run.actionBatch.warnings.length > 0 ? (
                            <div className="mt-3 text-sm text-amber-700">
                              {run.actionBatch.warnings.join(" ")}
                            </div>
                          ) : null}

                          {run.previews.length > 0 ? (
                            <div className="mt-4 space-y-4">
                              {run.previews.map((preview, index) => (
                                <div key={`${run.id}-${index}`} className="space-y-2 border-t border-border/50 pt-4 first:border-t-0 first:pt-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-foreground">{preview.title}</p>
                                      <p className="mt-1 text-sm text-muted-foreground">{preview.description}</p>
                                    </div>
                                    {typeof preview.affectedCount === "number" ? <Badge variant="secondary">{preview.affectedCount} affected</Badge> : null}
                                  </div>

                                  {preview.details.length > 0 ? (
                                    <div className="space-y-1 text-sm text-muted-foreground">
                                      {preview.details.map((detail) => (
                                        <p key={detail}>{detail}</p>
                                      ))}
                                    </div>
                                  ) : null}

                                  {preview.sampleRecords.length > 0 ? (
                                    <CodeBlock language="json" code={JSON.stringify(preview.sampleRecords, null, 2)} />
                                  ) : null}

                                  {preview.sqlPreview.length > 0 ? (
                                    <CodeBlock language="sql" code={preview.sqlPreview.join("\n\n")} />
                                  ) : null}

                                  {preview.warnings.length > 0 ? (
                                    <div className="space-y-1 text-sm text-amber-700">
                                      {preview.warnings.map((warning) => (
                                        <p key={warning}>{warning}</p>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {run.results.length > 0 ? (
                            <div className="mt-5 space-y-2 border-t border-border/50 pt-4">
                              <p className="text-sm font-semibold text-foreground">Execution timeline</p>
                              <div className="space-y-2">
                                {run.results.map((result) => (
                                  <div key={`${run.id}-${result.actionIndex}`} className="flex items-start justify-between gap-3 rounded-lg bg-muted/25 px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-foreground">{result.actionType}</p>
                                      <p className="mt-0.5 text-sm text-muted-foreground">{result.message}</p>
                                    </div>
                                    <Badge variant={result.status === "completed" ? "default" : "destructive"}>{result.status}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            {run.status === "pending" ? (
                              <>
                                <Button
                                  onClick={() => approveRunMutation.mutate(run.id)}
                                  disabled={approveRunMutation.isPending || rejectRunMutation.isPending}
                                >
                                  {approveRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  Approve and apply
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => rejectRunMutation.mutate(run.id)}
                                  disabled={approveRunMutation.isPending || rejectRunMutation.isPending}
                                >
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            {(run.status === "failed" || run.status === "rejected") && linkedUserMessage ? (
                              <Button
                                variant="outline"
                                onClick={() => sendMessageMutation.mutate(linkedUserMessage.content)}
                                disabled={sendMessageMutation.isPending}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Retry from prompt
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </SidePanel>
  );
}
