# trello-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for Trello — connect AI agents to your boards with per-project configuration and credentials that stay on your machine.

[![CI](https://github.com/asim-altayb/trello-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/asim-altayb/trello-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)

Works with [Cursor](https://cursor.com), [Claude Desktop](https://claude.ai), VS Code Copilot, and any MCP-compatible client.

## Why use this?

Most Trello MCP integrations focus on hosted OAuth or a single global board. This server is built for developers who juggle multiple codebases and want:

- **Local access** — your API key + token, stored locally in `.env`
- **Per-project boards** — each repo declares which Trello boards belong to it
- **Board aliases** — reference `sprint` or `backlog` instead of raw board IDs
- **Agent-ready output** — JSON or Markdown responses

## Comparison

| Feature | **trello-mcp** | Atlassian Trello MCP | `@delorenj/mcp-server-trello` |
|---|---|---|---|
| Auth | API token (local) | Cloud OAuth | API token |
| Per-repo board profiles | `.trello-mcp.json` | One workspace | Global config |
| Board aliases | Yes | No | No |
| Markdown output | Yes | N/A | Yes |
| Checklists + comments | Yes | Partial | Yes |
| Rate limiting | Built-in | Hosted | Built-in |
| Best for | Multi-project workflows | Team OAuth setups | Full-featured installs |

## Quick start

### 1. Clone and configure credentials

```bash
git clone https://github.com/asim-altayb/trello-mcp.git
cd trello-mcp
npm install
npm run setup
npm run build
```

`npm run setup` saves `TRELLO_API_KEY` and `TRELLO_TOKEN` to `.env`.

Get credentials from [Trello Power-Up Admin](https://trello.com/power-ups/admin) → API Key tab.

### 2. Pin boards to a project

From any project directory:

```bash
TRELLO_PROJECT_ROOT=/path/to/your/project npm run init-project
```

This writes `.trello-mcp.json`:

```json
{
  "name": "my-app",
  "boards": [
    { "id": "abc123", "name": "Sprint Board", "alias": "sprint", "default": true },
    { "id": "def456", "name": "Backlog", "alias": "backlog" }
  ]
}
```

Safe to commit — board IDs only, no secrets.

### 3. Connect your AI client

Add to `.mcp.json` (Cursor / Claude Code) or your client's MCP config:

```json
{
  "mcpServers": {
    "trello-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/trello-mcp/dist/index.js"],
      "cwd": "/absolute/path/to/your/project"
    }
  }
}
```

Restart the client after saving.

See [mcp-config.example.json](mcp-config.example.json) for a copy-paste template.

## Example prompts

- "Show my project Trello overview"
- "What's on the sprint board?"
- "Search for auth bug in this project's boards"
- "Create a card: Fix webhook retry"
- "Mark the first checklist item complete on card X"

## Tools

### Project context

| Tool | Description |
|---|---|
| `trello_project_info` | Active project, configured boards, default board |
| `trello_project_overview` | All project boards → lists → cards |

### Boards & lists

| Tool | Description |
|---|---|
| `trello_list_boards` | Project boards (or all with `allBoards: true`) |
| `trello_get_board` | Board with lists and cards |
| `trello_list_lists` | Lists on a board |
| `trello_get_recent_activity` | Recent board activity |
| `trello_add_list` | Create a list |

### Cards

| Tool | Description |
|---|---|
| `trello_get_my_cards` | Cards assigned to you |
| `trello_get_card` | Full card details |
| `trello_get_cards_in_list` | Cards in a list |
| `trello_create_card` | Create a card |
| `trello_update_card` | Update card fields / labels |
| `trello_move_card` | Move card to another list |
| `trello_archive_card` | Archive a card |
| `trello_search` | Search cards/boards |

### Checklists & comments

| Tool | Description |
|---|---|
| `trello_add_checklist` | Add checklist to card |
| `trello_add_checklist_item` | Add checklist item |
| `trello_update_checklist_item` | Update text or completion |
| `trello_delete_checklist_item` | Delete checklist item |
| `trello_add_comment` | Add comment |
| `trello_get_card_comments` | List comments |
| `trello_update_comment` | Edit comment |
| `trello_delete_comment` | Delete comment |

Board tools accept optional `board` (ID, alias, or name). When omitted, the project default is used.

## Multi-project setup

```
~/trello-mcp/               → .env (credentials, once)
~/project-a/             → .trello-mcp.json (boards 1, 2)
~/project-b/             → .trello-mcp.json (boards 3, 4)
```

Point each project's MCP config `cwd` at that project. The server picks up the right boards automatically.

## Security

- Never commit `.env` — it contains your API token
- `.trello-mcp.json` is safe to commit (board IDs only)
- Revoke tokens anytime: Trello → Account → Applications

## Development

```bash
npm run build
npm test
npm run dev
```

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).