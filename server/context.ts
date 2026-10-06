import type { Config } from "../src/config.ts";
import { generate } from "../src/generate.ts";
import { loadStory, type Scene, type Story } from "../src/story.ts";
import type { Embedder } from "./index/embedder.ts";
import { refreshIndexIfPresent } from "./index/world-index.ts";

// What every tool handler gets: where the story and library are. The story is
// reloaded from disk on every call because the files are the truth and the
// player may edit them mid-session. `embedder` is set by tests (a fake); left
// out, the index uses the provider config.embeddings names.

export type WorldContext = {
  storyDir: string;
  libraryRoot: string | undefined;
  config: Config;
  embedder?: Embedder | undefined;
};

// A problem the model caused or can fix (unknown name, no open scene). Its
// message is shown to the model as the tool result.
export class ToolError extends Error {}

export function load(ctx: WorldContext): Promise<Story> {
  return loadStory(ctx.storyDir, { libraryRoot: ctx.libraryRoot });
}

// After any write: reload and regenerate the system prompt file and CLAUDE.md,
// so the bible the engine re-reads is never stale, and re-embed what changed
// so recall and semantic activation see it.
export async function regenerate(ctx: WorldContext): Promise<Story> {
  const story = await load(ctx);
  await generate(story);
  await refreshIndexIfPresent(ctx, story);
  return story;
}

export function requireOpenScene(story: Story): Scene {
  const scene = story.scene;
  if (!scene) throw new ToolError("There is no scene yet. Open one with open_scene.");
  if (scene.status !== "open") {
    throw new ToolError(
      `Scene ${scene.number} ("${scene.title}") is closed. Open the next one with open_scene.`,
    );
  }
  return scene;
}
