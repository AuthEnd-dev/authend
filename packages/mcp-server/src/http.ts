import { createAuthendMcpHttpApp } from "./http-app";
import { ensureAuthendRuntime } from "./runtime";
import { createAuthendMcpContext } from "./service-context";
import { createAuthendMcpServer } from "./server";

const port = Number(process.env.AUTHEND_MCP_PORT ?? process.env.MCP_PORT ?? "7003");

await ensureAuthendRuntime();

const app = createAuthendMcpHttpApp(() => createAuthendMcpServer(createAuthendMcpContext()));

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`AuthEnd MCP HTTP server listening on ${port}`);
