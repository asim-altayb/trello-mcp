# AI agent instructions

This repository is designed to be installed and configured by AI coding agents on **Linux, macOS, and Windows**.

## One-line setup (paste into any agent)

```
Fetch https://raw.githubusercontent.com/asim-altayb/trello-mcp/main/docs/agent-setup/prompt.md and follow every step to install trello-mcp and wire it to the current project.
```

Shorter variant if your agent already fetched the prompt:

```
Follow https://raw.githubusercontent.com/asim-altayb/trello-mcp/main/docs/agent-setup/prompt.md
```

## What the agent will do

1. Detect OS (Linux / macOS / Windows) and pick the correct paths
2. Clone or update the shared server install (see table below)
3. Store Trello credentials in `SERVER_DIR/.env` (never committed)
4. Write `.trello-mcp.json` in the project root (safe to commit)
5. Register the MCP server in `.mcp.json` (or the client-specific config)
6. Verify with `trello_project_info`

## Key paths by OS

| | Linux | macOS | Windows |
|---|---|---|---|
| **Server install** | `~/.local/share/trello-mcp/` | `~/.local/share/trello-mcp/` | `%LOCALAPPDATA%\trello-mcp\` |
| **Credentials** | `~/.local/share/trello-mcp/.env` | same | `%LOCALAPPDATA%\trello-mcp\.env` |
| **Project boards** | `PROJECT_ROOT/.trello-mcp.json` | same | same |
| **MCP config** | `PROJECT_ROOT/.mcp.json` | same | same |

In JSON MCP configs on Windows, use forward slashes in paths (e.g. `C:/Users/you/AppData/Local/trello-mcp/dist/index.js`).

## Full prompt

[docs/agent-setup/prompt.md](docs/agent-setup/prompt.md)

Published URL (for agents that support URL fetch):

`https://raw.githubusercontent.com/asim-altayb/trello-mcp/main/docs/agent-setup/prompt.md`