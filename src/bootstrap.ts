import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildAccessPolicy } from "./access.js";
import { loadProjectConfig, resolveProjectRoot } from "./project-config.js";
import { loadCredentials, TrelloClient } from "./trello-client.js";
import type { AccessPolicy } from "./access.js";
import type { ProjectContext } from "./project-config.js";

export interface AppContext {
  serverRoot: string;
  projectRoot: string;
  project: ProjectContext | null;
  policy: AccessPolicy;
  trello: TrelloClient;
}

export function createAppContext(): AppContext {
  const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  loadEnv({ path: resolve(serverRoot, ".env") });

  const projectRoot = resolveProjectRoot();
  const project = loadProjectConfig(projectRoot);
  const policy = buildAccessPolicy(project);

  const credentials = loadCredentials();
  if (policy.allowedBoardIds?.length) {
    credentials.allowedBoardIds = policy.allowedBoardIds;
  }

  return {
    serverRoot,
    projectRoot,
    project,
    policy,
    trello: new TrelloClient(credentials),
  };
}