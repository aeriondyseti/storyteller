import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../src/config.ts";
import { posixPath } from "../src/paths.ts";
import type { WorldContext } from "./context.ts";
import { createServer, type Tool } from "./registry.ts";
import { canonTools } from "./tools/canon.ts";
import { readTools } from "./tools/read.ts";
import { recall } from "./tools/recall.ts";
import { sceneTools } from "./tools/scenes.ts";
import { stateTools } from "./tools/state.ts";

// The `world` MCP server (spec 8): the Storyteller's tools for reading and
// changing the story on disk. Started by the launcher as `bun server/world.ts`
// with RP_STORY (story folder), optional RP_LIBRARY and RP_CONFIG.

export const tools: Tool[] = [...readTools, recall, ...stateTools, ...canonTools, ...sceneTools];

export async function contextFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<WorldContext> {
  if (!env.RP_STORY) throw new Error("RP_STORY is not set: it must name the story folder.");
  return {
    storyDir: posixPath(env.RP_STORY),
    libraryRoot: env.RP_LIBRARY ? posixPath(env.RP_LIBRARY) : undefined,
    config: await loadConfig(env),
  };
}

if (import.meta.main) {
  try {
    const server = createServer(await contextFromEnv(), tools);
    await server.connect(new StdioServerTransport());
  } catch (error) {
    // stdout is the MCP channel; startup problems go to stderr.
    console.error(`world server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
