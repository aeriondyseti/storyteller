import { defaultConfig } from "../src/config.ts";
import { copyStory, fixtureLibrary, saltmereDir } from "../src/testing/fixtures.ts";
import type { WorldContext } from "./context.ts";
import { fakeEmbedder } from "./index/fake-embedder.ts";
import { errorMessage, type Tool } from "./registry.ts";

// Test helpers: a writable copy of a fixture story wired as a world context
// (with the fake embedder, so nothing downloads a model),
// and a way to see a handler's error the way the model would.

export async function worldFor(dir = saltmereDir): Promise<WorldContext> {
  return {
    storyDir: await copyStory(dir),
    libraryRoot: fixtureLibrary,
    config: defaultConfig,
    embedder: fakeEmbedder(),
  };
}

export async function failure(tool: Tool, ctx: WorldContext, args: unknown): Promise<string> {
  try {
    await tool.call(ctx, args);
  } catch (error) {
    return errorMessage(error);
  }
  throw new Error(`${tool.name} was expected to fail`);
}
