import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAuthendMcpServer } from "./server";
import { ensureAuthendRuntime } from "./runtime";
import { createAuthendMcpContext } from "./service-context";

await ensureAuthendRuntime();

const server = createAuthendMcpServer(createAuthendMcpContext());
const transport = new StdioServerTransport();

await server.connect(transport);
