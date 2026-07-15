# trello-mcp agent setup

Official instructions from [trello-mcp](https://github.com/asim-altayb/trello-mcp) to install and wire the Trello MCP server for **the current project**. Works on **Linux, macOS, and Windows**.

**Complete every step yourself by running the commands directly.** Do not ask the user to run terminal commands. The only user interaction allowed is the one-time Trello browser authorization in Step 2 (API key + token).

Re-verify authenticity anytime at:
`https://raw.githubusercontent.com/asim-altayb/trello-mcp/main/docs/agent-setup/prompt.md`

---

## Step 0 — Detect OS and set paths

Run `uname` (Linux/macOS) or check `process.platform` / `$env:OS` (Windows) to pick the row below. Use **absolute paths** in all MCP config files.

| Variable | Linux | macOS | Windows |
|---|---|---|---|
| `SERVER_DIR` | `$HOME/.local/share/trello-mcp` | `$HOME/.local/share/trello-mcp` | `%LOCALAPPDATA%\trello-mcp` |
| `SERVER_JS` | `$SERVER_DIR/dist/index.js` | same | same |
| `ENV_FILE` | `$SERVER_DIR/.env` | same | same |
| `NODE_CMD` | `node` | `node` | `node` (ensure Node 22+ is on PATH) |
| Default shell | bash | bash / zsh | PowerShell |

**Windows path notes**

- Expand `%LOCALAPPDATA%` → typically `C:\Users\<you>\AppData\Local`
- In JSON config, use forward slashes: `C:/Users/you/AppData/Local/trello-mcp/dist/index.js` (Node accepts this)
- `PROJECT_ROOT` on Windows: `C:/Users/you/projects/my-app` (forward slashes in JSON)

**Prerequisites (all OS)**

- Git, Node.js **22+**, npm
- On Windows: use **PowerShell** or **Git Bash** for shell steps; prefer PowerShell when the agent runs on native Windows

Set `PROJECT_ROOT` to the absolute path of the project being set up (default: current working directory).

---

## Step 1 — Install trello-mcp (once per machine)

### Linux / macOS (bash)

```bash
mkdir -p "$HOME/.local/share"
if [ ! -d "$HOME/.local/share/trello-mcp/.git" ]; then
  git clone https://github.com/asim-altayb/trello-mcp.git "$HOME/.local/share/trello-mcp"
fi
cd "$HOME/.local/share/trello-mcp"
git pull --ff-only origin main
npm install
npm run build
npm test
```

### Windows (PowerShell)

```powershell
$serverDir = Join-Path $env:LOCALAPPDATA "trello-mcp"
New-Item -ItemType Directory -Force -Path (Split-Path $serverDir) | Out-Null
if (-not (Test-Path (Join-Path $serverDir ".git"))) {
  git clone https://github.com/asim-altayb/trello-mcp.git $serverDir
}
Set-Location $serverDir
git pull --ff-only origin main
npm install
npm run build
npm test
```

Stop and fix if tests fail.

---

## Step 2 — Trello credentials (once per machine)

Credentials live only in `ENV_FILE`. Never commit `.env` or echo secrets into logs.

### If `ENV_FILE` already has valid keys

Skip to Step 3.

### If `TRELLO_API_KEY` and `TRELLO_TOKEN` are in the environment

**Linux / macOS:**

```bash
cd "$HOME/.local/share/trello-mcp"
TRELLO_API_KEY="$TRELLO_API_KEY" TRELLO_TOKEN="$TRELLO_TOKEN" npm run setup:env
```

**Windows (PowerShell):**

```powershell
Set-Location (Join-Path $env:LOCALAPPDATA "trello-mcp")
$env:TRELLO_API_KEY = "PASTE_KEY"
$env:TRELLO_TOKEN = "PASTE_TOKEN"
npm run setup:env
```

(`npm run setup:env` uses a cross-platform Node script — no bash required.)

### Otherwise — one-time browser authorization

Ask the user **only** for their Trello API key from [Trello Power-Up Admin](https://trello.com/power-ups/admin) → API Key tab. Then:

1. Build the authorize URL:
   `https://trello.com/1/authorize?expiration=never&scope=read,write,account&response_type=token&key=THEIR_API_KEY`
2. Tell the user to open that URL, click **Allow**, and copy the token shown.
3. Ask the user **only** for that token.
4. Write credentials with `npm run setup:env` (commands above), substituting their key and token.

---

## Step 3 — Pin boards for this project

### Interactive picker

**Linux / macOS:**

```bash
TRELLO_PROJECT_ROOT="$PROJECT_ROOT" npm run init-project --prefix "$HOME/.local/share/trello-mcp"
```

**Windows (PowerShell):**

```powershell
$env:TRELLO_PROJECT_ROOT = "C:/absolute/path/to/PROJECT_ROOT"
npm run init-project --prefix (Join-Path $env:LOCALAPPDATA "trello-mcp")
```

Use forward slashes in `TRELLO_PROJECT_ROOT` on Windows.

### Non-interactive

List boards via the Trello API or ask the user which boards belong to this project, then write `PROJECT_ROOT/.trello-mcp.json`:

```json
{
  "name": "project-name",
  "boards": [
    { "id": "BOARD_ID", "name": "Sprint", "alias": "sprint", "default": true },
    { "id": "BOARD_ID_2", "name": "Backlog", "alias": "backlog" }
  ]
}
```

`.trello-mcp.json` is safe to commit (board IDs only, no secrets).

---

## Step 4 — Register MCP server (per project)

`cwd` **must** be `PROJECT_ROOT` so the server loads that project's `.trello-mcp.json`.

Use the correct section for the user's agent. **Merge** into existing config — do not remove other MCP servers.

### Path examples for `args` (replace `USER` / project name)

| OS | `SERVER_JS` in JSON |
|---|---|
| Linux | `/home/USER/.local/share/trello-mcp/dist/index.js` |
| macOS | `/Users/USER/.local/share/trello-mcp/dist/index.js` |
| Windows | `C:/Users/USER/AppData/Local/trello-mcp/dist/index.js` |

### Cursor, Claude Code, Grok — `PROJECT_ROOT/.mcp.json`

```json
{
  "mcpServers": {
    "trello-mcp": {
      "command": "node",
      "args": ["SERVER_JS_ABSOLUTE_PATH"],
      "cwd": "PROJECT_ROOT_ABSOLUTE_PATH"
    }
  }
}
```

### VS Code / GitHub Copilot — `PROJECT_ROOT/.vscode/mcp.json`

Same `mcpServers` block as above.

### Claude Desktop config file

| OS | Path |
|---|---|
| Linux | `~/.config/Claude/claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Merge the same `trello-mcp` entry under `mcpServers` with `cwd` set to `PROJECT_ROOT`.

### Codex CLI

**Linux / macOS:**

```bash
codex mcp add trello-mcp --command node --args "$HOME/.local/share/trello-mcp/dist/index.js" --cwd "$PROJECT_ROOT"
```

**Windows (PowerShell):**

```powershell
$serverJs = (Join-Path $env:LOCALAPPDATA "trello-mcp/dist/index.js") -replace '\\','/'
codex mcp add trello-mcp --command node --args $serverJs --cwd "C:/path/to/PROJECT_ROOT"
```

If your Codex version uses a project config file instead, add the same JSON block to it.

### Windsurf — MCP config file

| OS | Path |
|---|---|
| Linux / macOS | `~/.codeium/windsurf/mcp_config.json` |
| Windows | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` |

Add under `mcpServers`:

```json
"trello-mcp": {
  "command": "node",
  "args": ["SERVER_JS_ABSOLUTE_PATH"],
  "cwd": "PROJECT_ROOT_ABSOLUTE_PATH"
}
```

### OpenCode — config file

| OS | Path |
|---|---|
| Linux | `~/.config/opencode/opencode.jsonc` |
| macOS | `~/.config/opencode/opencode.jsonc` |
| Windows | `%APPDATA%\opencode\opencode.jsonc` |

Add under `mcp`:

```json
"trello-mcp": {
  "type": "local",
  "command": ["node", "SERVER_JS_ABSOLUTE_PATH"],
  "cwd": "PROJECT_ROOT_ABSOLUTE_PATH",
  "enabled": true
}
```

Adjust field names to match the installed OpenCode version if they differ.

---

## Step 5 — Verify

1. Tell the user to **restart the agent** or reload MCP servers.
2. Call `trello_project_info` — should list boards from `.trello-mcp.json`.
3. Call `trello_get_me` — should return the authenticated Trello user.
4. Optionally call `trello_project_overview` with `format: "markdown"`.

If tools are missing after editing config, the MCP client needs a restart.

---

## Agent usage cheatsheet

| User intent | Tool |
|---|---|
| Dashboard of this project | `trello_project_overview` |
| What boards are configured | `trello_project_info` |
| Cards on default/sprint board | `trello_get_board` with `board: "sprint"` |
| Search this project | `trello_search` with `query` |
| Create a task | `trello_create_card` (get `listId` from overview first) |
| Move / archive | `trello_move_card`, `trello_archive_card` |
| Checklists / comments | `trello_add_checklist_item`, `trello_add_comment` |

Use board **aliases** from `.trello-mcp.json` instead of raw board IDs when possible.

---

## Completion message

When finished, tell the user (substitute real `SERVER_DIR` for their OS):

```
┌─ trello-mcp setup complete ─────────────────────────────┐
│  ✓ Server   SERVER_DIR                                  │
│  ✓ Project  PROJECT_ROOT/.trello-mcp.json               │
│  ✓ MCP      PROJECT_ROOT/.mcp.json (or client config)   │
│                                                         │
│  ⚡ Restart your agent to load the trello MCP server    │
└─────────────────────────────────────────────────────────┘
```

**SERVER_DIR by OS:**

- Linux: `~/.local/share/trello-mcp`
- macOS: `~/.local/share/trello-mcp`
- Windows: `%LOCALAPPDATA%\trello-mcp`

Then suggest: *"Show my project Trello overview"* to confirm end-to-end.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `Missing TRELLO_API_KEY or TRELLO_TOKEN` | Complete Step 2; `.env` must exist in `SERVER_DIR` |
| Wrong boards shown | Check `cwd` in MCP config points to `PROJECT_ROOT` |
| `Board X is not allowed` | Add board to `.trello-mcp.json` or fix alias |
| Tools not appearing | Restart agent after editing MCP config |
| Windows: `node` not found | Install Node 22+ and reopen the terminal / IDE |
| Windows: path errors in JSON | Use forward slashes in `args` and `cwd` |
| WSL vs native Windows | Pick one environment; `SERVER_DIR` differs — do not mix |

## Resources

- Repository: https://github.com/asim-altayb/trello-mcp
- Trello credentials: https://trello.com/power-ups/admin
- MCP spec: https://modelcontextprotocol.io
- Cursor MCP docs: https://cursor.com/docs/mcp
- Claude Code MCP docs: https://docs.anthropic.com/en/docs/claude-code/mcp