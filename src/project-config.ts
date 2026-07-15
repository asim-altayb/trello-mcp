import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CONFIG_FILENAME = ".trello-mcp.json";

export interface ProjectBoard {
  id: string;
  name?: string;
  alias?: string;
  default?: boolean;
}

export interface ProjectConfig {
  name?: string;
  boards: ProjectBoard[];
}

export interface ProjectContext {
  projectRoot: string;
  configPath: string;
  config: ProjectConfig;
}

export function findProjectRoot(startDir: string): string | null {
  let current = resolve(startDir);

  while (true) {
    const configPath = join(current, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function resolveProjectRoot(): string {
  const explicitRoot = process.env.TRELLO_PROJECT_ROOT?.trim();
  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  const explicitConfig = process.env.TRELLO_CONFIG_PATH?.trim();
  if (explicitConfig) {
    return dirname(resolve(explicitConfig));
  }

  const fromCwd = findProjectRoot(process.cwd());
  if (fromCwd) {
    return fromCwd;
  }

  return process.cwd();
}

export function loadProjectConfig(projectRoot: string): ProjectContext | null {
  const configPath = join(projectRoot, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    return null;
  }

  const raw = readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as ProjectConfig;

  if (!Array.isArray(parsed.boards) || parsed.boards.length === 0) {
    throw new Error(`${CONFIG_FILENAME} must include a non-empty "boards" array.`);
  }

  const boards = parsed.boards.map((board, index) => {
    if (!board.id?.trim()) {
      throw new Error(`boards[${index}] is missing "id".`);
    }
    return {
      ...board,
      id: board.id.trim(),
      alias: board.alias?.trim() || undefined,
      name: board.name?.trim() || undefined,
    };
  });

  const defaultCount = boards.filter((board) => board.default).length;
  if (defaultCount > 1) {
    throw new Error(`${CONFIG_FILENAME} can only mark one board as default.`);
  }

  return {
    projectRoot,
    configPath,
    config: {
      ...parsed,
      name: parsed.name?.trim() || undefined,
      boards,
    },
  };
}

export function getDefaultBoardId(context: ProjectContext): string | undefined {
  const explicit = context.config.boards.find((board) => board.default);
  return explicit?.id ?? context.config.boards[0]?.id;
}

export function getAllowedBoardIds(context: ProjectContext): string[] {
  return context.config.boards.map((board) => board.id);
}

export function resolveBoardRef(
  context: ProjectContext,
  ref?: string,
): { boardId: string; board: ProjectBoard } {
  if (!ref?.trim()) {
    const boardId = getDefaultBoardId(context);
    if (!boardId) {
      throw new Error("No default board configured for this project.");
    }
    const board = context.config.boards.find((item) => item.id === boardId);
    if (!board) {
      throw new Error(`Default board ${boardId} is missing from project config.`);
    }
    return { boardId, board };
  }

  const normalized = ref.trim().toLowerCase();
  const match =
    context.config.boards.find((board) => board.id === ref) ??
    context.config.boards.find((board) => board.alias?.toLowerCase() === normalized) ??
    context.config.boards.find((board) => board.name?.toLowerCase() === normalized);

  if (!match) {
    const options = context.config.boards
      .map((board) => board.alias ?? board.name ?? board.id)
      .join(", ");
    throw new Error(
      `Board "${ref}" is not configured for this project. Available: ${options}`,
    );
  }

  return { boardId: match.id, board: match };
}

export function saveProjectConfig(configPath: string, config: ProjectConfig): void {
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}