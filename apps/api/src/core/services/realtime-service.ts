import type { ServerWebSocket } from "bun";
import { HttpError } from "../lib/http";
import type { RequestActor } from "../middleware/auth";
import { resolveRequestActorFromRequest } from "../middleware/auth";
import { authoriseDataOperationWithActor } from "../routes/data";
import {
  getRecord,
  projectDeletedRecordForFanout,
  type DataMutationPayload,
} from "./crud-service";

type Sub =
  | { kind: "table"; table: string }
  | { kind: "record"; table: string; id: string };

type WsData = {
  actor: RequestActor;
  subs: Set<string>;
};

const sockets = new Set<ServerWebSocket<WsData>>();
const MAX_SUBSCRIPTIONS_PER_SOCKET = 48;

let eventsSentTotal = 0;

function subToKey(sub: Sub): string {
  return JSON.stringify(sub);
}

function keyToSub(key: string): Sub {
  return JSON.parse(key) as Sub;
}

function matchesSubscription(sub: Sub, payload: DataMutationPayload): boolean {
  if (sub.kind === "table") {
    return sub.table === payload.table;
  }
  return sub.table === payload.table && sub.id === payload.id;
}

async function resolveReadAccessForFanout(table: string, actor: RequestActor) {
  try {
    return await authoriseDataOperationWithActor(table, actor, "list");
  } catch {
    try {
      return await authoriseDataOperationWithActor(table, actor, "get");
    } catch {
      return null;
    }
  }
}

async function shapePayloadForSubscriber(
  payload: DataMutationPayload,
  sub: Sub,
  actor: RequestActor,
): Promise<Record<string, unknown> | null> {
  if (sub.kind === "record") {
    try {
      const { access } = await authoriseDataOperationWithActor(sub.table, actor, "get");
      if (payload.kind === "deleted") {
        return projectDeletedRecordForFanout(sub.table, payload.rawRecord, access);
      }
      try {
        return await getRecord(sub.table, payload.id, { access });
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }

  const readAuth = await resolveReadAccessForFanout(sub.table, actor);
  if (!readAuth) {
    return null;
  }

  if (payload.kind === "deleted") {
    return projectDeletedRecordForFanout(sub.table, payload.rawRecord, readAuth.access);
  }

  try {
    return await getRecord(sub.table, payload.id, { access: readAuth.access });
  } catch {
    return null;
  }
}

function sendJson(ws: ServerWebSocket<WsData>, body: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(body));
  }
}

function sendError(ws: ServerWebSocket<WsData>, message: string) {
  sendJson(ws, { type: "error", message });
}

export async function broadcastDataMutation(payload: DataMutationPayload) {
  const name =
    payload.kind === "created"
      ? "record.created"
      : payload.kind === "updated"
        ? "record.updated"
        : "record.deleted";

  await Promise.all(
    [...sockets].map(async (ws) => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }
      const { subs, actor } = ws.data;
      for (const key of subs) {
        const sub = keyToSub(key);
        if (!matchesSubscription(sub, payload)) {
          continue;
        }
        const record = await shapePayloadForSubscriber(payload, sub, actor);
        if (record === null) {
          continue;
        }
        sendJson(ws, {
          type: "event",
          name,
          table: payload.table,
          id: payload.id,
          record,
        });
        eventsSentTotal += 1;
      }
    }),
  );
}

export function getRealtimeDiagnostics() {
  let totalSubs = 0;
  const byTable = new Map<string, number>();
  for (const ws of sockets) {
    totalSubs += ws.data.subs.size;
    for (const key of ws.data.subs) {
      const sub = keyToSub(key);
      byTable.set(sub.table, (byTable.get(sub.table) ?? 0) + 1);
    }
  }
  return {
    connections: sockets.size,
    subscriptions: totalSubs,
    eventsSentTotal,
    byTable: Object.fromEntries(byTable),
  };
}

export async function tryUpgradeRealtime(
  req: Request,
  server: Bun.Server<WsData>,
): Promise<"skip" | "upgraded" | Response> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/realtime") {
    return "skip";
  }
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  try {
    const actor = await resolveRequestActorFromRequest(req);
    const upgraded = server.upgrade(req, {
      data: { actor, subs: new Set<string>() } satisfies WsData,
    });
    if (!upgraded) {
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    return "upgraded";
  } catch (error) {
    if (error instanceof HttpError) {
      return new Response(error.message, { status: error.status });
    }
    throw error;
  }
}

export function createRealtimeWebSocketHandlers(): Bun.WebSocketHandler<WsData> {
  return {
    open(ws: ServerWebSocket<WsData>) {
      sockets.add(ws);
    },
    close(ws: ServerWebSocket<WsData>) {
      sockets.delete(ws);
    },
    async message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(message));
      } catch {
        sendError(ws, "Invalid JSON");
        return;
      }

      if (!parsed || typeof parsed !== "object") {
        sendError(ws, "Invalid message");
        return;
      }

      const msg = parsed as Record<string, unknown>;
      const type = msg.type;

      if (type === "ping") {
        sendJson(ws, { type: "pong", t: Date.now() });
        return;
      }

      if (type === "unsubscribe") {
        const scope = msg.scope;
        const table = typeof msg.table === "string" ? msg.table.trim() : "";
        if (!table) {
          sendError(ws, "table is required");
          return;
        }
        if (scope === "table") {
          ws.data.subs.delete(subToKey({ kind: "table", table }));
        } else if (scope === "record") {
          const id = typeof msg.id === "string" ? msg.id.trim() : "";
          if (!id) {
            sendError(ws, "id is required for record scope");
            return;
          }
          ws.data.subs.delete(subToKey({ kind: "record", table, id }));
        } else {
          sendError(ws, "scope must be table or record");
          return;
        }
        sendJson(ws, { type: "unsubscribed", scope, table, ...(scope === "record" ? { id: msg.id } : {}) });
        return;
      }

      if (type !== "subscribe") {
        sendError(ws, "Unknown message type");
        return;
      }

      const scope = msg.scope === "table" ? "table" : msg.scope === "record" ? "record" : null;
      const table = typeof msg.table === "string" ? msg.table.trim() : "";
      if (!scope || !table) {
        sendError(ws, "scope and table are required");
        return;
      }

      if (ws.data.subs.size >= MAX_SUBSCRIPTIONS_PER_SOCKET) {
        sendError(ws, "Too many subscriptions on this connection");
        return;
      }

      const { actor } = ws.data;

      if (scope === "table") {
        try {
          await authoriseDataOperationWithActor(table, actor, "list");
        } catch {
          sendError(ws, "list access required for table subscriptions");
          return;
        }
        const sub: Sub = { kind: "table", table };
        ws.data.subs.add(subToKey(sub));
        sendJson(ws, { type: "subscribed", scope: "table", table });
        return;
      }

      const id = typeof msg.id === "string" ? msg.id.trim() : "";
      if (!id) {
        sendError(ws, "id is required for record subscriptions");
        return;
      }

      try {
        await authoriseDataOperationWithActor(table, actor, "get");
      } catch {
        sendError(ws, "get access required for record subscriptions");
        return;
      }

      const sub: Sub = { kind: "record", table, id };
      ws.data.subs.add(subToKey(sub));
      sendJson(ws, { type: "subscribed", scope: "record", table, id });
    },
  };
}
