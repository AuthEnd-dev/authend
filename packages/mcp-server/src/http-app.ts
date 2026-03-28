import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAuthendMcpServer } from "./server";

type SessionEntry = {
  server: ReturnType<typeof createAuthendMcpServer>;
  transport: WebStandardStreamableHTTPServerTransport;
};

export function createAuthendMcpHttpApp(serverFactory: () => ReturnType<typeof createAuthendMcpServer>) {
  const app = new Hono();
  const sessions = new Map<string, SessionEntry>();

  app.all("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");
    const method = c.req.method.toUpperCase();
    const existing = sessionId ? sessions.get(sessionId) : undefined;

    if (existing) {
      return existing.transport.handleRequest(c.req.raw);
    }

    if (method !== "POST") {
      return new Response("Unknown MCP session", { status: 404 });
    }

    const body = await c.req.raw.clone().json().catch(() => null);
    if (!isInitializeRequest(body)) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    const server = serverFactory();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (nextSessionId) => {
        sessions.set(nextSessionId, {
          server,
          transport,
        });
      },
      onsessionclosed: async (nextSessionId) => {
        const entry = sessions.get(nextSessionId);
        sessions.delete(nextSessionId);
        if (entry) {
          await entry.server.close().catch(() => {});
        }
      },
    });
    transport.onclose = () => {
      const nextSessionId = transport.sessionId;
      if (!nextSessionId) {
        return;
      }
      const entry = sessions.get(nextSessionId);
      sessions.delete(nextSessionId);
      if (entry) {
        void entry.server.close().catch(() => {});
      }
    };
    await server.connect(transport);
    return transport.handleRequest(c.req.raw, { parsedBody: body });
  });

  return app;
}
