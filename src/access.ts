import type { ProjectContext } from "./project-config.js";
import { getAllowedBoardIds, resolveBoardRef } from "./project-config.js";
import { TrelloApiError } from "./trello-client.js";

export interface AccessPolicy {
  source: "project" | "env" | "none";
  project?: ProjectContext;
  allowedBoardIds?: string[];
  defaultBoardId?: string;
}

export function buildAccessPolicy(project: ProjectContext | null): AccessPolicy {
  if (project) {
    return {
      source: "project",
      project,
      allowedBoardIds: getAllowedBoardIds(project),
      defaultBoardId: project.config.boards.find((board) => board.default)?.id ??
        project.config.boards[0]?.id,
    };
  }

  const envBoards = process.env.TRELLO_ALLOWED_BOARDS?.trim();
  if (envBoards) {
    return {
      source: "env",
      allowedBoardIds: envBoards.split(",").map((id) => id.trim()).filter(Boolean),
    };
  }

  return { source: "none" };
}

export function ensureBoardAllowed(policy: AccessPolicy, boardId: string): void {
  const allowed = policy.allowedBoardIds;
  if (!allowed || allowed.length === 0) {
    return;
  }

  if (!allowed.includes(boardId)) {
    const hint =
      policy.source === "project"
        ? `Configure boards in ${policy.project?.configPath ?? ".trello-mcp.json"}.`
        : "Update TRELLO_ALLOWED_BOARDS.";
    throw new TrelloApiError(`Board ${boardId} is not allowed for this project. ${hint}`, 403);
  }
}

export function resolveBoardInput(
  policy: AccessPolicy,
  board?: string,
): { boardId: string; usedDefault: boolean } {
  if (policy.source === "project" && policy.project) {
    if (!board?.trim()) {
      const resolved = resolveBoardRef(policy.project);
      return { boardId: resolved.boardId, usedDefault: true };
    }
    const resolved = resolveBoardRef(policy.project, board);
    return { boardId: resolved.boardId, usedDefault: false };
  }

  if (!board?.trim()) {
    if (policy.defaultBoardId) {
      return { boardId: policy.defaultBoardId, usedDefault: true };
    }
    throw new TrelloApiError(
      "board is required when no project default board is configured.",
      400,
    );
  }

  return { boardId: board.trim(), usedDefault: false };
}