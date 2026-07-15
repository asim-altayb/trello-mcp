#!/usr/bin/env python3
"""Build 9 incremental git commits for trello-mcp."""
import json
import os
import shutil
import subprocess
from pathlib import Path

def resolve_root() -> Path:
    env_root = os.environ.get("TRELLO_MCP_ROOT", "").strip()
    if env_root:
        return Path(env_root).resolve()

    script_root = Path(__file__).resolve().parent.parent
    if (script_root / "package.json").exists() and (script_root / "src").exists():
        return script_root

    cwd = Path.cwd().resolve()
    if (cwd / "package.json").exists() and (cwd / "src").exists():
        return cwd

    raise SystemExit(
        "Could not find trello-mcp project root. "
        "Run from the repo or set TRELLO_MCP_ROOT."
    )


ROOT = resolve_root()

CORE_CLIENT = '''import { RateLimiter } from "./rate-limiter.js";

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
'''

INDEX_INLINE = '''#!/usr/bin/env node

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
'''

INDEX_BOOTSTRAP = '''#!/usr/bin/env node

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
'''


def run(cmd, cwd=ROOT, check=True):
    print("+", " ".join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check, text=True, capture_output=True)


def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


SNAPSHOT: dict[str, str] = {}


def snapshot_workspace() -> None:
    """Capture final file contents before incremental commits rewrite the tree."""
    src_files = [
        "access.ts",
        "bootstrap.ts",
        "cli.ts",
        "formatters.ts",
        "project-config.ts",
        "rate-limiter.ts",
        "register-tools.ts",
        "trello-client.ts",
    ]
    for name in src_files:
        SNAPSHOT[f"src/{name}"] = (ROOT / "src" / name).read_text()

    for rel in [
        "README.md",
        "LICENSE",
        "CONTRIBUTING.md",
        "CHANGELOG.md",
        "server.json",
        "mcp-config.example.json",
        ".trello-mcp.example.json",
        "scripts/setup.sh",
        "tests/access.test.ts",
        "tests/formatters.test.ts",
        "tests/project-config.test.ts",
        "vitest.config.ts",
        ".github/workflows/ci.yml",
        "tsconfig.json",
        ".gitignore",
        "package-lock.json",
    ]:
        SNAPSHOT[rel] = (ROOT / rel).read_text()


def read_src(name: str) -> str:
    key = f"src/{name}"
    if key in SNAPSHOT:
        return SNAPSHOT[key]
    return (ROOT / "src" / name).read_text()


def read_snap(rel: str) -> str:
    return SNAPSHOT[rel]


def patch_names(text: str) -> str:
    replacements = [
        ("trello-mcp-personal", "trello-mcp"),
        ("io.github.asim-altayb/trello-mcp-personal", "io.github.asim-altayb/trello-mcp"),
        ("trello-personal", "trello-mcp"),
        ("Personal Trello MCP", "Trello MCP"),
        ("personal Trello token", "Trello token"),
        ("personal credentials", "credentials"),
        ("your personal credentials", "your credentials"),
        ("your personal token", "your token"),
        ("Personal credentials", "Credentials"),
        ("personal-token", "api-token"),
        ("Personal access", "Local access"),
        ("personal API token", "API token"),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text


def strip_markdown_from_register_tools(text: str) -> str:
    import re

    text = text.replace(
        "import { boardsToMarkdown, cardToMarkdown } from \"./formatters.js\";\n", ""
    )
    # Regex replacements must run before signature/schema edits that remove `format`.
    text = re.sub(
        r"      if \(format === \"markdown\"\) \{.*?\n      \}\n      return \{ content: \[\{ type: \"text\", text: formatResult\(payload\) \}\] \};",
        "      return { content: [{ type: \"text\", text: formatResult(payload) }] };",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"    async \(\{ format \}\) => \{.*?return \{ content: \[\{ type: \"text\", text: formatResult\(overview\) \}\] \};\n    \},",
        "    async () => {\n      const overview = await getProjectOverview(trello, policy);\n      return { content: [{ type: \"text\", text: formatResult(overview) }] };\n    },",
        text,
        flags=re.S,
    )
    text = text.replace(
        "    {\n      cardId: z.string().describe(\"Trello card ID\"),\n      format: z.enum([\"json\", \"markdown\"]).optional(),\n    },\n    async ({ cardId, format }) => {",
        "    {\n      cardId: z.string().describe(\"Trello card ID\"),\n    },\n    async ({ cardId }) => {",
    )
    text = text.replace(
        "      const text = format === \"markdown\" ? cardToMarkdown(card) : formatResult(card);\n      return { content: [{ type: \"text\", text }] };",
        "      return { content: [{ type: \"text\", text: formatResult(card) }] };",
    )
    text = text.replace(
        "      board: boardRefSchema,\n      format: z.enum([\"json\", \"markdown\"]).optional(),\n    },\n    async ({ board, format }) => {",
        "      board: boardRefSchema,\n    },\n    async ({ board }) => {",
    )
    text = text.replace(
        "    {\n      format: z.enum([\"json\", \"markdown\"]).optional().describe(\"Output format (default: json)\"),\n    },\n    async ({ format }) => {",
        "    {},\n    async () => {",
    )
    text = text.replace(
        "    {\n      format: z.enum([\"json\", \"markdown\"]).optional().describe(\"Output format (default: json)\"),\n    },\n    async () => {",
        "    {},\n    async () => {",
    )
    text = text.replace(
        "      allBoards: z.boolean().optional().describe(\"List every open board on your account\"),\n      format: z.enum([\"json\", \"markdown\"]).optional(),\n    },\n    async ({ allBoards, format }) => {",
        "      allBoards: z.boolean().optional().describe(\"List every open board on your account\"),\n    },\n    async ({ allBoards }) => {",
    )
    text = text.replace(
        "      const text =\n        format === \"markdown\" ? boardsToMarkdown(result) : formatResult(result);\n      return { content: [{ type: \"text\", text }] };",
        "      return { content: [{ type: \"text\", text: formatResult(result) }] };",
    )
    return text


def remove_extended_tools(text: str) -> str:
    tool_markers = [
        "trello_get_my_cards",
        "trello_get_recent_activity",
        "trello_move_card",
        "trello_archive_card",
        "trello_add_list",
        "trello_add_checklist",
        "trello_add_checklist_item",
        "trello_update_checklist_item",
        "trello_delete_checklist_item",
        "trello_add_comment",
        "trello_get_card_comments",
        "trello_update_comment",
        "trello_delete_comment",
    ]
    scoped = text
    for marker in tool_markers:
        start = scoped.find(f'  server.tool(\n    "{marker}"')
        if start == -1:
            continue
        end = scoped.find("  );\n", start)
        if end != -1:
            scoped = scoped[:start] + scoped[end + 5 :]
    return scoped


def load_register_tools_scoped() -> str:
    full = patch_names(read_src("register-tools.ts"))
    scoped = strip_markdown_from_register_tools(full)
    return remove_extended_tools(scoped)


def load_register_tools_extended_no_md() -> str:
    full = patch_names(read_src("register-tools.ts"))
    return strip_markdown_from_register_tools(full)


def load_extended_client() -> str:
    text = patch_names(read_src("trello-client.ts"))
    return text


def minimal_package():
    return {
        "name": "trello-mcp",
        "version": "0.1.0",
        "description": "MCP server for Trello with per-project board profiles",
        "type": "module",
        "main": "dist/index.js",
        "scripts": {"build": "tsc", "start": "node dist/index.js"},
        "license": "MIT",
        "engines": {"node": ">=22"},
        "dependencies": {
            "@modelcontextprotocol/sdk": "^1.25.2",
            "dotenv": "^17.4.2",
            "zod": "^4.1.11",
        },
        "devDependencies": {
            "@types/node": "^24.3.0",
            "typescript": "^5.9.2",
        },
    }


def test_package():
    pkg = full_package()
    pkg["version"] = "1.0.0"
    pkg["scripts"]["test"] = "vitest run"
    pkg["scripts"]["test:watch"] = "vitest"
    pkg["devDependencies"]["vitest"] = "^3.2.4"
    return pkg


def full_package():
    return {
        "name": "trello-mcp",
        "version": "1.0.0",
        "description": "MCP server for Trello with per-project board profiles",
        "type": "module",
        "main": "dist/index.js",
        "mcpName": "io.github.asim-altayb/trello-mcp",
        "bin": {
            "trello-mcp": "dist/index.js",
            "trello-mcp-init": "dist/cli.js",
        },
        "scripts": {
            "build": "tsc",
            "start": "node dist/index.js",
            "dev": "tsx src/index.ts",
            "setup": "bash scripts/setup.sh",
            "init-project": "node dist/cli.js init",
            "test": "vitest run",
            "test:watch": "vitest",
            "prepublishOnly": "npm run build && npm test",
        },
        "keywords": [
            "mcp",
            "trello",
            "model-context-protocol",
            "cursor",
            "claude",
            "ai-agents",
            "kanban",
            "typescript",
        ],
        "license": "MIT",
        "repository": {
            "type": "git",
            "url": "git+https://github.com/asim-altayb/trello-mcp.git",
        },
        "bugs": {"url": "https://github.com/asim-altayb/trello-mcp/issues"},
        "homepage": "https://github.com/asim-altayb/trello-mcp#readme",
        "engines": {"node": ">=22"},
        "files": [
            "dist",
            "scripts",
            ".trello-mcp.example.json",
            "mcp-config.example.json",
            "server.json",
            "README.md",
            "LICENSE",
        ],
        "dependencies": {
            "@modelcontextprotocol/sdk": "^1.25.2",
            "dotenv": "^17.4.2",
            "zod": "^4.1.11",
        },
        "devDependencies": {
            "@types/node": "^24.3.0",
            "tsx": "^4.20.5",
            "typescript": "^5.9.2",
            "vitest": "^3.2.4",
        },
    }


def clean_workspace():
    git = ROOT / ".git"
    if git.exists():
        shutil.rmtree(git)
    dist = ROOT / "dist"
    if dist.exists():
        shutil.rmtree(dist)


def commit(message: str, files: dict):
    for rel, content in files.items():
        path = ROOT / rel
        if content is None:
            if path.exists():
                path.unlink()
        else:
            write(path, content)
    run(["git", "add", "--"] + list(files.keys()))
    run(["git", "commit", "-m", message])


def main():
    snapshot_workspace()
    clean_workspace()
    run(["git", "init", "-b", "main"])

    # 1
    commit(
        "chore: bootstrap typescript mcp server scaffold",
        {
            "package.json": json.dumps(minimal_package(), indent=2) + "\n",
            "tsconfig.json": read_snap("tsconfig.json"),
            ".gitignore": read_snap(".gitignore"),
            ".env.example": "TRELLO_API_KEY=your_api_key_here\nTRELLO_TOKEN=your_token_here\n",
        },
    )

    # 2
    commit(
        "feat: add trello api client with rate limiting",
        {
            "src/rate-limiter.ts": read_src("rate-limiter.ts"),
            "src/trello-client.ts": CORE_CLIENT,
        },
    )

    # 3
    commit("feat: register core board and card mcp tools", {"src/index.ts": INDEX_INLINE})

    # 4
    env4 = """# Trello API credentials — never commit .env or share these values.
# Get your API key: https://trello.com/power-ups/admin (API Key tab)
# Generate a token: run `npm run setup` or open the authorize URL printed by setup.sh

TRELLO_API_KEY=your_api_key_here
TRELLO_TOKEN=your_token_here

# Per-project boards are configured in each repo's .trello-mcp.json (recommended).
# Run: npm run init-project
#
# Optional global fallback (only used when a project has no .trello-mcp.json):
# TRELLO_ALLOWED_BOARDS=boardId1,boardId2
#
# Optional: force project root when MCP client cwd is unreliable
# TRELLO_PROJECT_ROOT=/path/to/your/project
"""
    commit(
        "feat: add per-project board configuration",
        {
            "src/project-config.ts": read_src("project-config.ts"),
            ".trello-mcp.example.json": read_snap(".trello-mcp.example.json"),
            ".env.example": env4,
        },
    )

    # 5
    commit(
        "feat: scope tools to project boards with alias support",
        {
            "src/access.ts": read_src("access.ts"),
            "src/bootstrap.ts": read_src("bootstrap.ts"),
            "src/register-tools.ts": load_register_tools_scoped(),
            "src/index.ts": INDEX_BOOTSTRAP,
        },
    )

    # 6
    commit(
        "feat: add checklist comment and activity tools",
        {
            "src/trello-client.ts": load_extended_client(),
            "src/register-tools.ts": load_register_tools_extended_no_md(),
        },
    )

    # 7
    setup_sh = patch_names(read_snap("scripts/setup.sh"))
    cli_ts = patch_names(read_src("cli.ts"))
    commit(
        "feat: add markdown formatters and project init cli",
        {
            "src/formatters.ts": read_src("formatters.ts"),
            "src/cli.ts": cli_ts,
            "scripts/setup.sh": setup_sh,
            "src/register-tools.ts": patch_names(read_src("register-tools.ts")),
            "package.json": json.dumps(
                {
                    **minimal_package(),
                    "version": "0.8.0",
                    "bin": {
                        "trello-mcp": "dist/index.js",
                        "trello-mcp-init": "dist/cli.js",
                    },
                    "scripts": {
                        "build": "tsc",
                        "start": "node dist/index.js",
                        "dev": "tsx src/index.ts",
                        "setup": "bash scripts/setup.sh",
                        "init-project": "node dist/cli.js init",
                    },
                    "devDependencies": {
                        "@types/node": "^24.3.0",
                        "tsx": "^4.20.5",
                        "typescript": "^5.9.2",
                    },
                },
                indent=2,
            )
            + "\n",
        },
    )

    # 8
    commit(
        "test: add unit tests and ci workflow",
        {
            "tests/access.test.ts": read_snap("tests/access.test.ts"),
            "tests/formatters.test.ts": read_snap("tests/formatters.test.ts"),
            "tests/project-config.test.ts": read_snap("tests/project-config.test.ts"),
            "vitest.config.ts": read_snap("vitest.config.ts"),
            ".github/workflows/ci.yml": read_snap(".github/workflows/ci.yml"),
            "package.json": json.dumps(test_package(), indent=2) + "\n",
            "package-lock.json": read_snap("package-lock.json"),
        },
    )

    # 9 docs
    readme = patch_names(read_snap("README.md"))
    readme = readme.replace(
        "| **trello-mcp** | Atlassian Trello MCP | `@delorenj/mcp-server-trello` |",
        "| **trello-mcp** | Atlassian Trello MCP | `@delorenj/mcp-server-trello` |",
    )
    readme = readme.replace("~/trello-mcp/", "~/trello-mcp/   ")
    contributing = patch_names(read_snap("CONTRIBUTING.md"))
    contributing = contributing.replace(
        "- **Personal credentials stay local**", "- **Credentials stay local**"
    )
    changelog = read_snap("CHANGELOG.md").replace("trello-mcp-personal", "trello-mcp")
    changelog = changelog.replace("personal-token", "api-token").replace(
        "Initial personal-token MCP server", "Initial MCP server"
    )
    license_text = read_snap("LICENSE").replace(
        "trello-mcp-personal contributors", "trello-mcp contributors"
    )
    server_json = patch_names(read_snap("server.json"))
    server_json = server_json.replace(
        "Personal Trello MCP server with per-project board profiles, aliases, and local-only credentials.",
        "Trello MCP server with per-project board profiles, aliases, and local-only credentials.",
    )
    server_json = server_json.replace(
        '"description": "Your personal Trello token"',
        '"description": "Your Trello API token"',
    )
    mcp_config = patch_names(read_snap("mcp-config.example.json"))

    commit(
        "docs: add readme license and mcp registry metadata",
        {
            "README.md": readme,
            "LICENSE": license_text,
            "CONTRIBUTING.md": contributing,
            "CHANGELOG.md": changelog,
            "server.json": server_json,
            "mcp-config.example.json": mcp_config,
            "package.json": json.dumps(full_package(), indent=2) + "\n",
            "src/index.ts": patch_names(INDEX_BOOTSTRAP).replace('"0.5.0"', '"1.0.0"'),
        },
    )

    result = run(["git", "log", "--oneline", "--reverse"])
    print(result.stdout)


if __name__ == "__main__":
    main()