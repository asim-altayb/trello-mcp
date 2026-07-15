import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ensureBoardAllowed,
  resolveBoardInput,
  type AccessPolicy,
} from "./access.js";
import type { AppContext } from "./bootstrap.js";
import { TrelloApiError, type TrelloClient } from "./trello-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const boardRefSchema = z
  .string()
  .optional()
  .describe("Board ID, alias, or name from .trello-mcp.json. Uses project default when omitted.");

function enrichBoards(
  boards: Record<string, unknown>[],
  policy: AccessPolicy,
): Record<string, unknown>[] {
  if (policy.source !== "project" || !policy.project) {
    return boards;
  }

  const byId = new Map(
    policy.project.config.boards.map((board) => [board.id, board]),
  );

  return boards
    .filter((board) => policy.allowedBoardIds?.includes(String(board.id)))
    .map((board) => {
      const configured = byId.get(String(board.id));
      return {
        ...board,
        alias: configured?.alias,
        isDefault: configured?.default ?? false,
      };
    });
}

async function getProjectOverview(trello: TrelloClient, policy: AccessPolicy) {
  if (policy.source !== "project" || !policy.project) {
    throw new TrelloApiError(
      "Project overview requires a .trello-mcp.json file in the project root.",
      400,
    );
  }

  const summaries = [];
  for (const configured of policy.project.config.boards) {
    ensureBoardAllowed(policy, configured.id);
    const board = await trello.getBoard(configured.id);
    const lists = Array.isArray(board.lists) ? board.lists : [];
    summaries.push({
      id: configured.id,
      alias: configured.alias,
      name: configured.name ?? board.name,
      default: configured.default ?? false,
      url: board.url,
      lists: lists.map((list) => {
        const cards = Array.isArray((list as Record<string, unknown>).cards)
          ? ((list as Record<string, unknown>).cards as Record<string, unknown>[])
          : [];
        return {
          id: (list as Record<string, unknown>).id,
          name: (list as Record<string, unknown>).name,
          cards: cards.map((card) => ({
            id: card.id,
            name: card.name,
            due: card.due,
            url: card.shortUrl ?? card.url,
          })),
        };
      }),
    });
  }

  return {
    project: policy.project.config.name,
    projectRoot: policy.project.projectRoot,
    configPath: policy.project.configPath,
    boards: summaries,
  };
}

export function registerTools(server: McpServer, app: AppContext): void {
  const { trello, policy, project, projectRoot } = app;

  server.tool(
    "trello_project_info",
    "Show the active project, configured boards, aliases, and default board from .trello-mcp.json.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: formatResult({
            projectRoot,
            access: policy.source,
            configPath: project?.configPath ?? null,
            project: project?.config.name ?? null,
            boards: project?.config.boards ?? [],
            defaultBoardId: policy.defaultBoardId ?? null,
            hint: project
              ? "Use board aliases instead of IDs when calling board tools."
              : "Run `npm run init-project` in a project to pin boards per repo.",
          }),
        },
      ],
    }),
  );

  server.tool(
    "trello_project_overview",
    "Dashboard view of all boards configured for this project, including lists and card titles.",
    {},
    async () => {
      const overview = await getProjectOverview(trello, policy);
      return { content: [{ type: "text", text: formatResult(payload) }] };
    },
  );

  server.tool(
    "trello_list_lists",
    "List open lists on a board.",
    { board: boardRefSchema },
    async ({ board }) => {
      const { boardId, usedDefault } = resolveBoardInput(policy, board);
      ensureBoardAllowed(policy, boardId);
      const lists = await trello.listLists(boardId);
      return {
        content: [
          {
            type: "text",
            text: formatResult({ usedDefaultBoard: usedDefault, boardId, lists }),
          },
        ],
      };
    },
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
    "Get full card details including comments, checklists, members, and attachments.",
    {
      cardId: z.string().describe("Trello card ID"),
    },
    async ({ cardId }) => {
      const card = await trello.getCard(cardId);
      if (policy.allowedBoardIds?.length && !policy.allowedBoardIds.includes(String(card.idBoard))) {
        throw new TrelloApiError("Card is outside the boards allowed for this project.", 403);
      }
      return { content: [{ type: "text", text: formatResult(card) }] };
    },
  );

  server.tool(
    "trello_create_card",
    "Create a new card in a list.",
    {
      listId: z.string().describe("Target list ID"),
      name: z.string().describe("Card title"),
      desc: z.string().optional().describe("Card description"),
      due: z.string().optional().describe("Due date in ISO 8601 format"),
      start: z.string().optional().describe("Start date in YYYY-MM-DD format"),
      pos: z.enum(["top", "bottom"]).optional(),
      labelIds: z.array(z.string()).optional().describe("Label IDs to apply"),
    },
    async ({ listId, name, desc, due, start, pos, labelIds }) => ({
      content: [
        {
          type: "text",
          text: formatResult(
            await trello.createCard({
              idList: listId,
              name,
              desc,
              due,
              start,
              pos,
              idLabels: labelIds,
            }),
          ),
        },
      ],
    }),
  );

  server.tool(
    "trello_update_card",
    "Update a card (name, description, due date, labels, list, archive state).",
    {
      cardId: z.string(),
      name: z.string().optional(),
      desc: z.string().optional(),
      due: z.string().nullable().optional(),
      start: z.string().nullable().optional(),
      dueComplete: z.boolean().optional(),
      closed: z.boolean().optional(),
      listId: z.string().optional(),
      labelIds: z.array(z.string()).optional(),
    },
    async ({ cardId, listId, labelIds, ...rest }) => ({
      content: [
        {
          type: "text",
          text: formatResult(
            await trello.updateCard(cardId, {
              ...rest,
              idList: listId,
              idLabels: labelIds,
            }),
          ),
        },
      ],
    }),
  );












  server.tool(
    "trello_search",
    "Search cards and boards. Scoped to project boards by default when configured.",
    {
      query: z.string(),
      board: boardRefSchema.describe("Optional single board alias/ID"),
      allProjectBoards: z.boolean().optional(),
    },
    async ({ query, board, allProjectBoards }) => {
      let boardIds: string[] | undefined;

      if (board?.trim()) {
        const { boardId } = resolveBoardInput(policy, board);
        boardIds = [boardId];
      } else if (policy.allowedBoardIds?.length) {
        boardIds =
          allProjectBoards === false && policy.defaultBoardId
            ? [policy.defaultBoardId]
            : policy.allowedBoardIds;
      }

      for (const boardId of boardIds ?? []) {
        ensureBoardAllowed(policy, boardId);
      }

      return {
        content: [{ type: "text", text: formatResult(await trello.search(query, boardIds)) }],
      };
    },
  );
}