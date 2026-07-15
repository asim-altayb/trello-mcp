import { describe, expect, it } from "vitest";
import {
  buildAccessPolicy,
  ensureBoardAllowed,
  resolveBoardInput,
} from "../src/access.js";
import type { ProjectContext } from "../src/project-config.js";

const project: ProjectContext = {
  projectRoot: "/tmp/demo",
  configPath: "/tmp/demo/.trello-mcp.json",
  config: {
    name: "demo",
    boards: [
      { id: "board-a", alias: "sprint", default: true },
      { id: "board-b", alias: "backlog" },
    ],
  },
};

describe("access policy", () => {
  it("builds project-scoped policy", () => {
    const policy = buildAccessPolicy(project);
    expect(policy.source).toBe("project");
    expect(policy.allowedBoardIds).toEqual(["board-a", "board-b"]);
    expect(policy.defaultBoardId).toBe("board-a");
  });

  it("resolves board aliases through policy", () => {
    const policy = buildAccessPolicy(project);
    expect(resolveBoardInput(policy, "backlog").boardId).toBe("board-b");
  });

  it("blocks boards outside project policy", () => {
    const policy = buildAccessPolicy(project);
    expect(() => ensureBoardAllowed(policy, "other-board")).toThrow(/not allowed/i);
  });
});