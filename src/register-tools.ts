import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ensureBoardAllowed,
  resolveBoardInput,
  type AccessPolicy,
} from "./access.js";
import type { AppContext } from "./bootstrap.js";
import { boardsToMarkdown, cardToMarkdown } from "./formatters.js";
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
    {
      format: z.enum(["json", "markdown"]).optional().describe("Output format (default: json)"),
    },
    async ({ format }) => {
      const overview = await getProjectOverview(trello, policy);
      if (format === "markdown") {
        const markdown = [
          `# ${String(overview.project ?? "Project")} Trello overview`,
          "",
          ...overview.boards.flatMap((board) => {
            const header = `## ${String(board.name)}${board.alias ? ` (${board.alias})` : ""}`;
            const listLines = board.lists.flatMap((list) => [
              `### ${String(list.name)}`,
              ...list.cards.map((card) => `- ${String(card.name)}`),
              "",
            ]);
            return [header, "", ...listLines];
          }),
        ].join("\n");
        return { content: [{ type: "text", text: markdown }] };
      }
      return { content: [{ type: "text", text: formatResult(overview) }] };
    },
  );

  server.tool(
    "trello_get_me",
    "Verify your Trello connection and return the authenticated member profile.",
    {},
    async () => ({
      content: [{ type: "text", text: formatResult(await trello.getMe()) }],
    }),
  );

  server.tool(
    "trello_list_boards",
    "List boards for the current context. With project config, returns only boards selected for this project.",
    {
      allBoards: z.boolean().optional().describe("List every open board on your account"),
      format: z.enum(["json", "markdown"]).optional(),
    },
    async ({ allBoards, format }) => {
      const boards = await trello.listBoards();
      const result = allBoards ? boards : enrichBoards(boards, policy);
      const text =
        format === "markdown" ? boardsToMarkdown(result) : formatResult(result);
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "trello_get_my_cards",
    "List cards assigned to you. Optionally scoped to project boards.",
    {
      projectOnly: z.boolean().optional().describe("When true, only return cards on project boards"),
    },
    async ({ projectOnly }) => {
      const cards = await trello.getMyCards();
      const filtered =
        projectOnly && policy.allowedBoardIds?.length
          ? cards.filter((card) => policy.allowedBoardIds?.includes(String(card.idBoard)))
          : cards;
      return { content: [{ type: "text", text: formatResult(filtered) }] };
    },
  );

  server.tool(
    "trello_get_board",
    "Get a board with open lists and cards. Uses project default board when board is omitted.",
    {
      board: boardRefSchema,
      format: z.enum(["json", "markdown"]).optional(),
    },
    async ({ board, format }) => {
      const { boardId, usedDefault } = resolveBoardInput(policy, board);
      ensureBoardAllowed(policy, boardId);
      const data = await trello.getBoard(boardId);
      const payload = { usedDefaultBoard: usedDefault, boardId, ...data };
      if (format === "markdown") {
        const lists = Array.isArray(data.lists) ? data.lists : [];
        const lines = [`# ${String(data.name ?? "Board")}`, ""];
        for (const list of lists) {
          lines.push(`## ${String((list as Record<string, unknown>).name ?? "List")}`);
          const cards = Array.isArray((list as Record<string, unknown>).cards)
            ? ((list as Record<string, unknown>).cards as Record<string, unknown>[])
            : [];
          for (const card of cards) {
            lines.push(`- ${String(card.name)}`);
          }
          lines.push("");
        }
        return { content: [{ type: "text", text: lines.join("\n").trim() }] };
      }
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
    "trello_get_recent_activity",
    "Fetch recent activity on a board.",
    {
      board: boardRefSchema,
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ board, limit }) => {
      const { boardId, usedDefault } = resolveBoardInput(policy, board);
      ensureBoardAllowed(policy, boardId);
      const activity = await trello.getRecentActivity(boardId, limit ?? 10);
      return {
        content: [
          {
            type: "text",
            text: formatResult({ usedDefaultBoard: usedDefault, boardId, activity }),
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
      format: z.enum(["json", "markdown"]).optional(),
    },
    async ({ cardId, format }) => {
      const card = await trello.getCard(cardId);
      if (policy.allowedBoardIds?.length && !policy.allowedBoardIds.includes(String(card.idBoard))) {
        throw new TrelloApiError("Card is outside the boards allowed for this project.", 403);
      }
      const text = format === "markdown" ? cardToMarkdown(card) : formatResult(card);
      return { content: [{ type: "text", text }] };
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
    "trello_move_card",
    "Move a card to another list.",
    {
      cardId: z.string(),
      listId: z.string(),
    },
    async ({ cardId, listId }) => ({
      content: [{ type: "text", text: formatResult(await trello.moveCard(cardId, listId)) }],
    }),
  );

  server.tool(
    "trello_archive_card",
    "Archive a card.",
    { cardId: z.string() },
    async ({ cardId }) => ({
      content: [{ type: "text", text: formatResult(await trello.archiveCard(cardId)) }],
    }),
  );

  server.tool(
    "trello_add_list",
    "Add a new list to a board.",
    {
      board: boardRefSchema,
      name: z.string(),
    },
    async ({ board, name }) => {
      const { boardId } = resolveBoardInput(policy, board);
      ensureBoardAllowed(policy, boardId);
      return {
        content: [{ type: "text", text: formatResult(await trello.addList(boardId, name)) }],
      };
    },
  );

  server.tool(
    "trello_add_checklist",
    "Add a checklist to a card.",
    { cardId: z.string(), name: z.string() },
    async ({ cardId, name }) => ({
      content: [{ type: "text", text: formatResult(await trello.addChecklist(cardId, name)) }],
    }),
  );

  server.tool(
    "trello_add_checklist_item",
    "Add an item to a checklist.",
    {
      cardId: z.string(),
      checklistId: z.string(),
      text: z.string(),
    },
    async ({ cardId, checklistId, text }) => ({
      content: [
        {
          type: "text",
          text: formatResult(await trello.addChecklistItem(cardId, checklistId, text)),
        },
      ],
    }),
  );

  server.tool(
    "trello_update_checklist_item",
    "Update a checklist item (text or completion state).",
    {
      cardId: z.string(),
      checkItemId: z.string(),
      text: z.string().optional(),
      complete: z.boolean().optional(),
    },
    async ({ cardId, checkItemId, text, complete }) => ({
      content: [
        {
          type: "text",
          text: formatResult(
            await trello.updateChecklistItem(cardId, checkItemId, {
              name: text,
              state: complete === undefined ? undefined : complete ? "complete" : "incomplete",
            }),
          ),
        },
      ],
    }),
  );

  server.tool(
    "trello_delete_checklist_item",
    "Delete a checklist item.",
    { cardId: z.string(), checkItemId: z.string() },
    async ({ cardId, checkItemId }) => {
      await trello.deleteChecklistItem(cardId, checkItemId);
      return {
        content: [{ type: "text", text: formatResult({ deleted: true, cardId, checkItemId }) }],
      };
    },
  );

  server.tool(
    "trello_add_comment",
    "Add a comment to a card.",
    { cardId: z.string(), text: z.string() },
    async ({ cardId, text }) => ({
      content: [{ type: "text", text: formatResult(await trello.addComment(cardId, text)) }],
    }),
  );

  server.tool(
    "trello_get_card_comments",
    "Get comments on a card without fetching full card data.",
    {
      cardId: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ cardId, limit }) => ({
      content: [{ type: "text", text: formatResult(await trello.getCardComments(cardId, limit)) }],
    }),
  );

  server.tool(
    "trello_update_comment",
    "Update an existing comment.",
    { commentId: z.string(), text: z.string() },
    async ({ commentId, text }) => ({
      content: [{ type: "text", text: formatResult(await trello.updateComment(commentId, text)) }],
    }),
  );

  server.tool(
    "trello_delete_comment",
    "Delete a comment.",
    { commentId: z.string() },
    async ({ commentId }) => {
      await trello.deleteComment(commentId);
      return {
        content: [{ type: "text", text: formatResult({ deleted: true, commentId }) }],
      };
    },
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