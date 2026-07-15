#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  CONFIG_FILENAME,
  type ProjectBoard,
  type ProjectConfig,
  resolveProjectRoot,
  saveProjectConfig,
} from "./project-config.js";
import { loadCredentials, TrelloClient } from "./trello-client.js";

async function promptLine(question: string, defaultValue = ""): Promise<string> {
  const rl = createInterface({ input, output });
  const answer = (await rl.question(
    defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `,
  )).trim();
  rl.close();
  return answer || defaultValue;
}

async function initProject(): Promise<void> {
  const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  loadEnv({ path: resolve(serverRoot, ".env") });

  const projectRoot = resolveProjectRoot();
  const projectNameDefault = basename(projectRoot);
  const configPath = resolve(projectRoot, CONFIG_FILENAME);

  console.log("trello-mcp — project board setup");
  console.log("==========================");
  console.log(`Project root: ${projectRoot}`);
  console.log(`Config file:  ${configPath}`);
  console.log();

  const trello = new TrelloClient(loadCredentials());
  const boards = await trello.listBoards();

  if (boards.length === 0) {
    console.log("No open boards found on your Trello account.");
    return;
  }

  console.log("Your open Trello boards:");
  boards.forEach((board, index) => {
    const name = String(board.name ?? "Untitled");
    const id = String(board.id ?? "");
    console.log(`  ${index + 1}. ${name} (${id})`);
  });
  console.log();

  const selection = await promptLine(
    "Enter board numbers for this project (comma-separated, e.g. 1,3,4)",
  );

  const indexes = selection
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10) - 1)
    .filter((value) => Number.isInteger(value) && value >= 0 && value < boards.length);

  if (indexes.length === 0) {
    console.error("No valid boards selected.");
    process.exit(1);
  }

  const projectName = await promptLine("Project name", projectNameDefault);
  const defaultInput = await promptLine(
    "Default board number for this project",
    String(indexes[0] + 1),
  );
  const defaultIndex = Number.parseInt(defaultInput, 10) - 1;

  const selectedBoards: ProjectBoard[] = indexes.map((index) => {
    const board = boards[index];
    const id = String(board.id);
    const name = String(board.name ?? "Untitled");
    return {
      id,
      name,
      alias: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      default: index === defaultIndex,
    };
  });

  const config: ProjectConfig = {
    name: projectName,
    boards: selectedBoards,
  };

  saveProjectConfig(configPath, config);

  console.log();
  console.log(`Saved ${CONFIG_FILENAME} with ${selectedBoards.length} board(s).`);
  console.log("Add this to the project's .mcp.json if needed:");
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          "trello-mcp": {
            command: "node",
            args: [resolve(serverRoot, "dist/index.js")],
            cwd: projectRoot,
          },
        },
      },
      null,
      2,
    ),
  );
}

const command = process.argv[2];

if (command === "init") {
  initProject().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
} else {
  console.log("Usage: trello-mcp-server init");
  process.exit(command ? 1 : 0);
}