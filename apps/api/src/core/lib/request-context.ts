export type RequestActorLogContext = {
  actorKind: "public" | "session" | "superadmin" | "apiKey";
  subjectId: string | null;
  userId?: string;
  sessionId?: string;
  apiKeyId?: string;
};

export type RequestLogContext = {
  requestId?: string;
  actor?: RequestActorLogContext;
};

const requestContextStore = new WeakMap<Request, RequestLogContext>();

export function getRequestLogContext(request: Request): RequestLogContext {
  return requestContextStore.get(request) ?? {};
}

export function updateRequestLogContext(request: Request, partial: Partial<RequestLogContext>) {
  const current = requestContextStore.get(request) ?? {};
  requestContextStore.set(request, {
    ...current,
    ...partial,
    actor: partial.actor ? { ...current.actor, ...partial.actor } : current.actor,
  });
}
