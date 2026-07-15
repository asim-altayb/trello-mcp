#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  loadCredentials,
  TrelloApiError,
  TrelloClient,
  TrelloConfigError,
} from "./trello-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

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
  const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  loadEnv({ path: resolve(serverRoot, ".env") });

  const trello = new TrelloClient(loadCredentials());

  const server = new McpServer({
    name: "trello-mcp",
    version: "0.1.0",
  });

  server.tool(
    "trello_get_me",
    "Verify Trello connection and return the authenticated member profile.",
    {},
    async () => ({
      content: [{ type: "text", text: formatResult(await trello.getMe()) }],
    }),
  );

  server.tool(
    "trello_list_boards",
    "List open boards on your Trello account.",
    {},
    async () => ({
      content: [{ type: "text", text: formatResult(await trello.listBoards()) }],
    }),
  );

  server.tool(
    "trello_get_board",
    "Get a board with open lists and cards.",
    { boardId: z.string().describe("Trello board ID") },
    async ({ boardId }) => ({
      content: [{ type: "text", text: formatResult(await trello.getBoard(boardId)) }],
    }),
  );

  server.tool(
    "trello_list_lists",
    "List open lists on a board.",
    { boardId: z.string().describe("Trello board ID") },
    async ({ boardId }) => ({
      content: [{ type: "text", text: formatResult(await trello.listLists(boardId)) }],
    }),
  );

  server.tool(
    "trello_get_cards_in_list",
    "Get open cards in a list.",
    { listId: z.string().describe("Trello list ID") },
    async ({ listId }) => ({
      content: [{ type: "text", text: formatResult(await trello.getCardsInList(listId)) }],
    }),
  );

  server.tool(
    "trello_get_card",
    "Get full card details.",
    { cardId: z.string().describe("Trello card ID") },
    async ({ cardId }) => ({
      content: [{ type: "text", text: formatResult(await trello.getCard(cardId)) }],
    }),
  );

  server.tool(
    "trello_create_card",
    "Create a new card in a list.",
    {
      listId: z.string().describe("Target list ID"),
      name: z.string().describe("Card title"),
      desc: z.string().optional().describe("Card description"),
      due: z.string().optional().describe("Due date in ISO 8601 format"),
    },
    async ({ listId, name, desc, due }) => ({
      content: [
        {
          type: "text",
          text: formatResult(await trello.createCard({ idList: listId, name, desc, due })),
        },
      ],
    }),
  );

  server.tool(
    "trello_update_card",
    "Update a card.",
    {
      cardId: z.string(),
      name: z.string().optional(),
      desc: z.string().optional(),
      due: z.string().nullable().optional(),
      closed: z.boolean().optional(),
      listId: z.string().optional(),
    },
    async ({ cardId, listId, ...rest }) => ({
      content: [
        {
          type: "text",
          text: formatResult(await trello.updateCard(cardId, { ...rest, idList: listId })),
        },
      ],
    }),
  );

  server.tool(
    "trello_search",
    "Search cards and boards.",
    {
      query: z.string(),
      boardIds: z.array(z.string()).optional().describe("Optional board IDs to scope search"),
    },
    async ({ query, boardIds }) => ({
      content: [{ type: "text", text: formatResult(await trello.search(query, boardIds)) }],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
