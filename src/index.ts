#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAppContext } from "./bootstrap.js";
import { registerTools } from "./register-tools.js";
import { TrelloApiError, TrelloConfigError } from "./trello-client.js";

function formatError(error: unknown): string {
  if (error instanceof TrelloConfigError || error instanceof TrelloApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

async function main(): Promise<void> {
  const app = createAppContext();

  const server = new McpServer({
    name: "trello-mcp",
    version: "0.5.0",
  });

  registerTools(server, app);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
