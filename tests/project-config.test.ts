import { describe, expect, it } from "vitest";
import {
  getAllowedBoardIds,
  getDefaultBoardId,
  resolveBoardRef,
  type ProjectContext,
} from "../src/project-config.js";

const context: ProjectContext = {
  projectRoot: "/tmp/demo",
  configPath: "/tmp/demo/.trello-mcp.json",
  config: {
    name: "demo",
    boards: [
      { id: "board-a", name: "Sprint Board", alias: "sprint", default: true },
      { id: "board-b", name: "Backlog", alias: "backlog" },
    ],
  },
};

describe("project config", () => {
  it("returns allowed board ids", () => {
    expect(getAllowedBoardIds(context)).toEqual(["board-a", "board-b"]);
  });

  it("resolves default board", () => {
    expect(getDefaultBoardId(context)).toBe("board-a");
    expect(resolveBoardRef(context).boardId).toBe("board-a");
  });

  it("resolves board by alias", () => {
    expect(resolveBoardRef(context, "backlog").boardId).toBe("board-b");
  });

  it("throws for unknown board refs", () => {
    expect(() => resolveBoardRef(context, "missing")).toThrow(/not configured/i);
  });
});