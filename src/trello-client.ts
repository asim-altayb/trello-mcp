import { RateLimiter } from "./rate-limiter.js";

const TRELLO_API_BASE = "https://api.trello.com/1";

export class TrelloConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrelloConfigError";
  }
}

export class TrelloApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TrelloApiError";
    this.status = status;
  }
}

export interface TrelloCredentials {
  apiKey: string;
  token: string;
  allowedBoardIds?: string[];
}

export function loadCredentials(): TrelloCredentials {
  const apiKey = process.env.TRELLO_API_KEY?.trim();
  const token = process.env.TRELLO_TOKEN?.trim();

  if (!apiKey || !token) {
    throw new TrelloConfigError(
      "Missing TRELLO_API_KEY or TRELLO_TOKEN. Copy .env.example to .env and add your credentials.",
    );
  }

  const allowedBoards = process.env.TRELLO_ALLOWED_BOARDS?.trim();
  const allowedBoardIds = allowedBoards
    ? allowedBoards.split(",").map((id: string) => id.trim()).filter(Boolean)
    : undefined;

  return { apiKey, token, allowedBoardIds };
}

export class TrelloClient {
  private readonly credentials: TrelloCredentials;
  private readonly keyLimiter = new RateLimiter(300, 10_000);
  private readonly tokenLimiter = new RateLimiter(100, 10_000);

  constructor(credentials: TrelloCredentials) {
    this.credentials = credentials;
  }

  private authParams(): Record<string, string> {
    return {
      key: this.credentials.apiKey,
      token: this.credentials.token,
    };
  }

  ensureBoardAllowed(boardId: string): void {
    const allowed = this.credentials.allowedBoardIds;
    if (allowed && allowed.length > 0 && !allowed.includes(boardId)) {
      throw new TrelloApiError(
        `Board ${boardId} is not allowed for this project.`,
        403,
      );
    }
  }

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      query?: Record<string, string | number | boolean | null | undefined>;
      body?: Record<string, unknown>;
    } = {},
  ): Promise<T> {
    await this.keyLimiter.acquire();
    await this.tokenLimiter.acquire();

    const method = options.method ?? "GET";
    const url = new URL(`${TRELLO_API_BASE}${path}`);

    for (const [key, value] of Object.entries(this.authParams())) {
      url.searchParams.set(key, value);
    }

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    let body: string | undefined;
    if (options.body) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({
        ...options.body,
        ...this.authParams(),
      });
    }

    const response = await fetch(url, { method, headers, body });

    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try {
        const parsed = JSON.parse(text) as { message?: string };
        message = parsed.message ?? text;
      } catch {
        // keep raw text
      }
      throw new TrelloApiError(message || response.statusText, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  getMe() {
    return this.request<Record<string, unknown>>("/members/me", {
      query: { fields: "fullName,username,url,email" },
    });
  }

  listBoards() {
    return this.request<Record<string, unknown>[]>("/members/me/boards", {
      query: {
        fields: "name,desc,url,shortUrl,closed,starred,dateLastActivity,idOrganization",
        filter: "open",
      },
    });
  }

  getMyCards() {
    return this.request<Record<string, unknown>[]>("/members/me/cards", {
      query: {
        fields: "name,desc,due,dueComplete,idBoard,idList,url,shortUrl,labels,dateLastActivity",
      },
    });
  }

  getBoard(boardId: string) {
    this.ensureBoardAllowed(boardId);
    return this.request<Record<string, unknown>>(`/boards/${boardId}`, {
      query: {
        lists: "open",
        cards: "open",
        card_fields: "name,desc,due,dueComplete,idList,url,shortUrl,labels,dateLastActivity,idMembers",
        list_fields: "name,pos,closed",
        fields: "name,desc,url,shortUrl,closed,labelNames",
      },
    });
  }

  listLists(boardId: string) {
    this.ensureBoardAllowed(boardId);
    return this.request<Record<string, unknown>[]>(`/boards/${boardId}/lists`, {
      query: { filter: "open", fields: "name,pos,closed" },
    });
  }

  getRecentActivity(boardId: string, limit = 10) {
    this.ensureBoardAllowed(boardId);
    return this.request<Record<string, unknown>[]>(`/boards/${boardId}/actions`, {
      query: {
        limit,
        fields: "date,type,data,memberCreator",
      },
    });
  }

  getCardsInList(listId: string) {
    return this.request<Record<string, unknown>[]>(`/lists/${listId}/cards`, {
      query: {
        fields: "name,desc,due,dueComplete,idList,url,shortUrl,labels,dateLastActivity",
      },
    });
  }

  getCard(cardId: string) {
    return this.request<Record<string, unknown>>(`/cards/${cardId}`, {
      query: {
        fields: "name,desc,due,dueComplete,idList,idBoard,url,shortUrl,labels,dateLastActivity",
        actions: "commentCard",
        actions_limit: "50",
        checklists: "all",
        checkItems: "all",
        members: "true",
        attachments: "true",
      },
    });
  }

  getCardComments(cardId: string, limit = 50) {
    return this.request<Record<string, unknown>[]>(`/cards/${cardId}/actions`, {
      query: {
        filter: "commentCard",
        limit,
      },
    });
  }

  createCard(input: {
    idList: string;
    name: string;
    desc?: string;
    due?: string;
    start?: string;
    pos?: "top" | "bottom";
    idLabels?: string[];
  }) {
    return this.request<Record<string, unknown>>("/cards", {
      method: "POST",
      query: {
        idList: input.idList,
        name: input.name,
        desc: input.desc,
        due: input.due,
        start: input.start,
        pos: input.pos ?? "bottom",
        idLabels: input.idLabels?.join(","),
      },
    });
  }

  updateCard(
    cardId: string,
    input: {
      name?: string;
      desc?: string;
      due?: string | null;
      start?: string | null;
      dueComplete?: boolean;
      closed?: boolean;
      idList?: string;
      idLabels?: string[];
    },
  ) {
    return this.request<Record<string, unknown>>(`/cards/${cardId}`, {
      method: "PUT",
      query: {
        ...input,
        idLabels: input.idLabels?.join(","),
      },
    });
  }

  moveCard(cardId: string, listId: string) {
    return this.updateCard(cardId, { idList: listId });
  }

  archiveCard(cardId: string) {
    return this.updateCard(cardId, { closed: true });
  }

  addList(boardId: string, name: string) {
    this.ensureBoardAllowed(boardId);
    return this.request<Record<string, unknown>>("/lists", {
      method: "POST",
      query: { name, idBoard: boardId, pos: "bottom" },
    });
  }

  addChecklist(cardId: string, name: string) {
    return this.request<Record<string, unknown>>(`/cards/${cardId}/checklists`, {
      method: "POST",
      query: { name },
    });
  }

  addChecklistItem(cardId: string, checklistId: string, text: string) {
    return this.request<Record<string, unknown>>(
      `/cards/${cardId}/checklist/${checklistId}/checkItem`,
      {
        method: "POST",
        query: { name: text, pos: "bottom" },
      },
    );
  }

  updateChecklistItem(
    cardId: string,
    checkItemId: string,
    input: {
      name?: string;
      state?: "complete" | "incomplete";
    },
  ) {
    return this.request<Record<string, unknown>>(
      `/cards/${cardId}/checkItem/${checkItemId}`,
      {
        method: "PUT",
        query: input,
      },
    );
  }

  deleteChecklistItem(cardId: string, checkItemId: string) {
    return this.request<void>(`/cards/${cardId}/checkItem/${checkItemId}`, {
      method: "DELETE",
    });
  }

  addComment(cardId: string, text: string) {
    return this.request<Record<string, unknown>>(`/cards/${cardId}/actions/comments`, {
      method: "POST",
      query: { text },
    });
  }

  updateComment(commentId: string, text: string) {
    return this.request<Record<string, unknown>>(`/actions/${commentId}`, {
      method: "PUT",
      query: { text },
    });
  }

  deleteComment(commentId: string) {
    return this.request<void>(`/actions/${commentId}`, {
      method: "DELETE",
    });
  }

  search(query: string, boardIds?: string[]) {
    for (const boardId of boardIds ?? []) {
      this.ensureBoardAllowed(boardId);
    }

    return this.request<Record<string, unknown>>("/search", {
      query: {
        query,
        modelTypes: "cards,boards",
        cards_limit: "25",
        boards_limit: "10",
        card_fields: "name,desc,due,idBoard,idList,url,shortUrl",
        board_fields: "name,url,shortUrl",
        idBoards: boardIds?.join(","),
      },
    });
  }
}