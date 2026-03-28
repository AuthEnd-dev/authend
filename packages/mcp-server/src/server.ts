import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./constants";
import type { AuthendMcpContext } from "./service-context";
import { registerAuthendTools } from "./tools";

export function createAuthendMcpServer(context: AuthendMcpContext) {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  registerAuthendTools(server, context);
  return server;
}
