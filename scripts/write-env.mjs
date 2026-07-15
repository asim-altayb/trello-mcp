#!/usr/bin/env node
/**
 * Cross-platform non-interactive credential setup for AI agents.
 * Usage: TRELLO_API_KEY=xxx TRELLO_TOKEN=yyy node scripts/write-env.mjs
 */
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = process.env.TRELLO_ENV_FILE?.trim() || join(rootDir, ".env");
const exampleFile = join(rootDir, ".env.example");

const apiKey = process.env.TRELLO_API_KEY?.trim();
const token = process.env.TRELLO_TOKEN?.trim();

if (!apiKey || !token) {
  console.error("Set TRELLO_API_KEY and TRELLO_TOKEN in the environment.");
  process.exit(1);
}

let content = existsSync(envFile)
  ? readFileSync(envFile, "utf8")
  : readFileSync(exampleFile, "utf8");

if (!existsSync(envFile)) {
  copyFileSync(exampleFile, envFile);
}

content = content
  .split("\n")
  .map((line) => {
    if (line.startsWith("TRELLO_API_KEY=")) return `TRELLO_API_KEY=${apiKey}`;
    if (line.startsWith("TRELLO_TOKEN=")) return `TRELLO_TOKEN=${token}`;
    return line;
  })
  .join("\n");

writeFileSync(envFile, content.endsWith("\n") ? content : `${content}\n`, "utf8");

if (process.platform !== "win32") {
  try {
    chmodSync(envFile, 0o600);
  } catch {
    // Best-effort on platforms that support chmod.
  }
}

console.log(`Saved credentials to ${envFile}.`);