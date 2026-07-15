import { describe, expect, it } from "vitest";
import { cardToMarkdown } from "../src/formatters.js";

describe("cardToMarkdown", () => {
  it("renders card sections", () => {
    const markdown = cardToMarkdown({
      name: "Fix login bug",
      shortUrl: "https://trello.com/c/abc",
      desc: "Reproduce on mobile",
      labels: [{ name: "bug", color: "red" }],
      checklists: [
        {
          name: "Acceptance Criteria",
          checkItems: [{ name: "Add test", state: "incomplete" }],
        },
      ],
    });

    expect(markdown).toContain("# Fix login bug");
    expect(markdown).toContain("## Description");
    expect(markdown).toContain("## Labels");
    expect(markdown).toContain("## Checklist: Acceptance Criteria");
  });
});