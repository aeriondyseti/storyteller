#!/usr/bin/env bun
import { codexOf } from "../src/codex.ts";
import { posixPath } from "../src/paths.ts";
import { loadStory } from "../src/story.ts";
import { isStoryDir } from "./hooks/lib/io.ts";
import type { CodexSnapshot } from "./mod/types";

// The Bun half of the codex pane (spec 20.13), as plugin/scene.ts is for the
// scene pane: `bun plugin/codex.ts` in a story folder (or with RP_STORY set)
// prints a CodexSnapshot, or `null` outside a story.

if (import.meta.main) {
  const dir = posixPath(process.env.RP_STORY ?? process.cwd());
  const out: CodexSnapshot | null = (await isStoryDir(dir))
    ? codexOf(await loadStory(dir, { libraryRoot: process.env.RP_LIBRARY }))
    : null;
  process.stdout.write(`${JSON.stringify(out)}\n`);
}
