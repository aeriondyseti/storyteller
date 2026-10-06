import { describe, expect, test } from "bun:test";
import { appendTurn } from "../../src/log.ts";
import { indexExists } from "../index/index.ts";
import { worldIndex } from "../index/world-index.ts";
import { worldFor } from "../testing.ts";
import { tools } from "../world.ts";
import { upsertLore } from "./canon.ts";
import { searchLore } from "./read.ts";
import { recall } from "./recall.ts";

describe("recall", () => {
  test("is a world tool", () => {
    expect(tools.map((t) => t.name)).toContain("recall");
  });

  test("builds the index on first use and returns passages with scene and turn", async () => {
    const ctx = await worldFor();
    expect(await indexExists(ctx.storyDir)).toBe(false);
    const text = await recall.call(ctx, { query: "Edda debt crowns" });
    expect(await indexExists(ctx.storyDir)).toBe(true);
    expect(text).toMatch(/^## Scene \d+, (turn \d+|notes|summary) · score \d\.\d\d$/m);
    expect(text).not.toContain("lore/");
  });

  test("sees turns appended since the index was built", async () => {
    const ctx = await worldFor();
    await recall.call(ctx, { query: "anything" });
    await appendTurn(`${ctx.storyDir}/scenes/003-the-tallow-stair/log.jsonl`, {
      player: {
        name: "Corwin Hale",
        uuid: "p",
        text: "Where did the harpooner hide the brass astrolabe?",
      },
      storyteller: {
        name: "Vex",
        uuid: "a",
        text: "Under the third floorboard, Edda says, and no further questions.",
      },
      register: "narrator",
    });
    const text = await recall.call(ctx, { query: "brass astrolabe floorboard", scope: "turns" });
    expect(text).toStartWith("## Scene 3, turn");
    expect(text).toContain("brass astrolabe");
  });

  test("scope narrows the kind, and nothing close says so", async () => {
    const ctx = await worldFor();
    const summaries = await recall.call(ctx, { query: "bell drowned", scope: "summaries" });
    for (const heading of summaries.match(/^## .*$/gm) ?? []) expect(heading).toContain("summary");
    expect(await recall.call(ctx, { query: "zeppelin quantum" })).toStartWith(
      "Nothing in the record matches",
    );
  });

  test("writes through the server re-index an existing index", async () => {
    const ctx = await worldFor();
    await recall.call(ctx, { query: "anything" });
    await upsertLore.call(ctx, {
      stem: "glass-eels",
      title: "Glass eels",
      keys: ["glass eels"],
      body: "Translucent eels netted at the weir on moonless nights, sold by the jar.",
    });
    // Straight to the index, with no rebuild before the search.
    const hits = await worldIndex(ctx).search("translucent eels weir moonless", {
      kinds: ["lore"],
    });
    expect(hits[0]?.ref).toBe("lore/glass-eels");
  });
});

describe("search_lore with meaning", () => {
  test("unions keyword hits with semantic hits", async () => {
    const ctx = await worldFor();
    // "rang thirteen times" is not a key or title, but shares words with the
    // tide-bells body, which the fake embedder scores as close.
    const text = await searchLore.call(ctx, { query: "rang thirteen times at the harbour" });
    expect(text).toContain("The tide-bells");
    expect(await searchLore.call(ctx, { query: "dragons" })).toStartWith("No lore matches");
  });
});
