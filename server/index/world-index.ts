import type { Story } from "../../src/story.ts";
import type { WorldContext } from "../context.ts";
import { embedderFor } from "./embedder.ts";
import { indexExists, StoryIndex } from "./index.ts";

// The world server's handle on the index. Opened once per story folder for the
// life of the process and brought up to date before each use: indexStory
// embeds only passages whose text changed, so a missing index is built on the
// first recall and a stale one (log turns the Stop hook appended, notes the
// notes job rewrote, a hand edit) catches up on the next.

const open = new Map<string, StoryIndex>();

export function worldIndex(ctx: WorldContext): StoryIndex {
  let index = open.get(ctx.storyDir);
  if (!index) {
    index = StoryIndex.open(ctx.storyDir, ctx.embedder ?? embedderFor(ctx.config));
    open.set(ctx.storyDir, index);
  }
  return index;
}

export async function freshIndex(ctx: WorldContext, story: Story): Promise<StoryIndex> {
  const index = worldIndex(ctx);
  await index.indexStory(story);
  return index;
}

// After a write through the server. Only when an index already exists: the
// first recall builds it, and a write should never wait on a model download.
// A failure here is dropped on purpose: the write itself succeeded, and the
// next recall re-syncs whatever was missed.
export async function refreshIndexIfPresent(ctx: WorldContext, story: Story): Promise<void> {
  if (!(await indexExists(ctx.storyDir))) return;
  try {
    await freshIndex(ctx, story);
  } catch {}
}
