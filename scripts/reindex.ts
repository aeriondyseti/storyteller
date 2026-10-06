#!/usr/bin/env bun
// Builds or refreshes a story's semantic index with the real embedder. Never
// run by `bun test` (it may download the model, ~23 MB, on first use).
//
//   bun scripts/reindex.ts <story folder> [--incremental]
//
// Full (default): syncs every passage of the story and prints timings: model
// load, embedding, a few warm queries, and the index's size. Unchanged
// passages are never re-embedded, so a second run is the warm figure.
// --incremental: syncs the current scene only (its log, notes, summary) and
// prints one line; the notes job runs it after rewriting a scene's notes.

import { stat } from "node:fs/promises";
import { embedderFor } from "../server/index/embedder.ts";
import { indexPath, StoryIndex } from "../server/index/index.ts";
import { loadConfig } from "../src/config.ts";
import { posixPath } from "../src/paths.ts";
import { loadStory } from "../src/story.ts";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const incremental = args.includes("--incremental");
if (!dir) {
  console.error("usage: bun scripts/reindex.ts <story folder> [--incremental]");
  process.exit(2);
}

const started = performance.now();
const ms = (from: number) => `${Math.round(performance.now() - from)} ms`;
const storyDir = posixPath(dir);
const story = await loadStory(storyDir);
const embedder = embedderFor(await loadConfig());
const index = StoryIndex.open(storyDir, embedder);

if (incremental) {
  const scene = story.scene;
  const result = scene ? await index.indexScene(scene) : { embedded: 0, removed: 0, kept: 0 };
  console.log(
    `reindex: scene ${scene?.number ?? "-"}: ${result.embedded} embedded, ${result.removed} removed, ${result.kept} unchanged (${ms(started)})`,
  );
  index.close();
  process.exit(0);
}

let at = performance.now();
await embedder.embed(["warm up"]);
console.log(`model load + first embed: ${ms(at)}`);

at = performance.now();
const result = await index.indexStory(story);
console.log(
  `indexStory: ${result.embedded} embedded, ${result.removed} removed, ${result.kept} unchanged in ${ms(at)}`,
);

for (const query of [
  "who owes whom money",
  "the vote of the five houses",
  "what the lamplighters do",
]) {
  at = performance.now();
  const hits = await index.search(query, { limit: 3 });
  const top = hits.map((h) => `${h.key} ${h.score.toFixed(2)}`).join(", ");
  console.log(`search "${query}": ${ms(at)} -> ${top || "(nothing)"}`);
}

const passages = index.count();
index.close();
const size = (await stat(indexPath(storyDir))).size;
console.log(`index: ${passages} passages, ${(size / 1024).toFixed(0)} KiB, ${indexPath(storyDir)}`);
console.log(`total: ${ms(started)}`);
