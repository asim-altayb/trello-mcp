function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[]
    : [];
}

export function cardToMarkdown(card: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`# ${String(card.name ?? "Untitled card")}`);
  lines.push("");

  if (card.url || card.shortUrl) {
    lines.push(`**URL:** ${String(card.shortUrl ?? card.url)}`);
  }
  if (card.due) {
    lines.push(`**Due:** ${String(card.due)}${card.dueComplete ? " (complete)" : ""}`);
  }
  lines.push("");

  if (card.desc) {
    lines.push("## Description");
    lines.push(String(card.desc));
    lines.push("");
  }

  const labels = asArray(card.labels);
  if (labels.length > 0) {
    lines.push("## Labels");
    for (const label of labels) {
      lines.push(`- ${String(label.name ?? label.color ?? label.id)}`);
    }
    lines.push("");
  }

  const checklists = asArray(card.checklists);
  for (const checklist of checklists) {
    lines.push(`## Checklist: ${String(checklist.name ?? "Checklist")}`);
    const items = asArray(checklist.checkItems);
    for (const item of items) {
      const done = item.state === "complete" ? "x" : " ";
      lines.push(`- [${done}] ${String(item.name ?? item.text ?? "")}`);
    }
    lines.push("");
  }

  const actions = asArray(card.actions);
  const comments = actions.filter((action) => action.type === "commentCard");
  if (comments.length > 0) {
    lines.push("## Comments");
    for (const comment of comments) {
      const data = asRecord(comment.data);
      lines.push(`- ${String(data?.text ?? "")}`);
    }
    lines.push("");
  }

  const attachments = asArray(card.attachments);
  if (attachments.length > 0) {
    lines.push("## Attachments");
    for (const attachment of attachments) {
      lines.push(`- ${String(attachment.name ?? attachment.id)} (${String(attachment.url ?? "")})`);
    }
  }

  return lines.join("\n").trim();
}

export function boardsToMarkdown(boards: Record<string, unknown>[]): string {
  const lines = ["# Project boards", ""];
  for (const board of boards) {
    const alias = board.alias ? ` (${String(board.alias)})` : "";
    const defaultTag = board.isDefault ? " [default]" : "";
    lines.push(`- **${String(board.name ?? board.id)}**${alias}${defaultTag}`);
    lines.push(`  - ID: ${String(board.id)}`);
    if (board.url) {
      lines.push(`  - URL: ${String(board.url)}`);
    }
  }
  return lines.join("\n");
}