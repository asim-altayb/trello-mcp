# Contributing

Thanks for helping improve **trello-mcp**.

## Getting started

```bash
git clone https://github.com/asim-altayb/trello-mcp.git
cd trello-mcp
npm install
cp .env.example .env
npm run setup
npm run build
npm test
```

## Development workflow

1. Create a branch from `main`
2. Make focused changes with tests when behavior changes
3. Run `npm run build && npm test`
4. Open a pull request with:
   - what changed
   - why it changed
   - how you tested it

## Project principles

- **Credentials stay local** — never commit `.env`
- **Project board config is shareable** — `.trello-mcp.json` is safe to commit per repo
- **Keep tools agent-friendly** — clear names, useful defaults, markdown output where helpful
- **Respect Trello rate limits** — use the built-in limiter for new API calls

## Adding a new tool

1. Add the API method in `src/trello-client.ts`
2. Register the MCP tool in `src/register-tools.ts`
3. Respect project board policy via `ensureBoardAllowed` / `resolveBoardInput`
4. Add tests if the logic is non-trivial

## Reporting issues

Include:

- MCP client (Cursor, Claude Desktop, VS Code, etc.)
- whether `.trello-mcp.json` is present
- the tool name and inputs
- the error message (redact tokens)