import { describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { appendTurn } from "../../src/log.ts";
import { loadStory } from "../../src/story.ts";
import { copyStory, fixtureLibrary, saltmereDir } from "../../src/testing/fixtures.ts";
import { editFile, setSection } from "../edit.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { indexExists, indexPath, StoryIndex } from "./index.ts";
import { chunked, maxChunkChars } from "./passages.ts";

async function setup() {
  const dir = await copyStory(saltmereDir);
  const embedder = fakeEmbedder();
  const index = StoryIndex.open(dir, embedder);
  const story = await loadStory(dir, { libraryRoot: fixtureLibrary });
  return { dir, embedder, index, story };
}

describe("story index", () => {
  test("indexStory embeds lore, directives, turns, notes and summaries once", async () => {
    const { dir, embedder, index, story } = await setup();
    expect(await indexExists(dir)).toBe(true);
    expect(indexPath(dir)).toBe(`${dir}/.rp/index.sqlite`);
    const first = await index.indexStory(story);
    expect(first.embedded).toBeGreaterThan(5);
    expect(first.removed).toBe(0);
    const kinds = new Set(
      (await index.search("bells tide crowns debt", { limit: 50 })).map((h) => h.kind),
    );
    for (const kind of ["lore", "turn", "notes", "summary"] as const) expect(kinds).toContain(kind);

    const calls = embedder.calls.length;
    const again = await index.indexStory(story);
    expect(again).toEqual({ embedded: 0, removed: 0, kept: first.embedded });
    expect(embedder.calls.slice(calls).flat()).toEqual([]);
  });

  test("search returns kind, scene, turn, path and score, best first", async () => {
    const { index, story } = await setup();
    await index.indexStory(story);
    const hits = await index.search("thirteen bells rang tide", { kinds: ["lore"], limit: 3 });
    expect(hits[0]?.kind).toBe("lore");
    expect(hits[0]?.ref).toBe("lore/tide-bells");
    expect(hits[0]?.path).toEndWith("/lore/tide-bells.md");
    const scores = hits.map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const turns = await index.search("Edda", { kinds: ["turn"], limit: 2 });
    expect(turns.every((h) => h.kind === "turn" && h.scene === 3)).toBe(true);
    expect(typeof turns[0]?.turn).toBe("number");
    expect(turns[0]?.path).toEndWith("/scenes/003-the-tallow-stair/log.jsonl");
  });

  test("increments: a new turn and rewritten notes re-embed only themselves", async () => {
    const { dir, embedder, index, story } = await setup();
    await index.indexStory(story);
    const scene = story.scene;
    if (!scene) throw new Error("fixture has a scene");
    const n = await appendTurn(scene.logPath, {
      player: {
        name: "Corwin Hale",
        uuid: "p",
        text: "I ask about the lighthouse keeper's ledger.",
      },
      storyteller: {
        name: "Vex",
        uuid: "a",
        text: "Edda wipes the bar. The ledger burned with the keeper, she says.",
      },
      register: "narrator",
    });
    await editFile(scene.path, {}, (body) =>
      setSection(body, "Now", "Corwin asks after the ledger; Edda says it burned."),
    );
    const fresh = await loadStory(dir, { libraryRoot: fixtureLibrary });
    const freshScene = fresh.scene;
    if (!freshScene) throw new Error("fixture has a scene");

    const before = embedder.calls.length;
    const half = { name: "Vex", register: "narrator", at: "", uuid: "" } as const;
    const turn = await index.indexTurn(freshScene, [
      { ...half, n, speaker: "player", text: "x" },
      { ...half, n, speaker: "storyteller", text: "the ledger burned" },
    ]);
    expect(turn.embedded).toBe(1);
    expect(await index.indexTurn(freshScene, [])).toEqual({ embedded: 0, removed: 0, kept: 0 });
    const notes = await index.indexNotes(freshScene);
    expect(notes.embedded).toBeGreaterThanOrEqual(1);
    expect(embedder.calls.length - before).toBe(2);

    // A whole-scene pass picks up the real text of the turn and keeps the rest.
    const scenePass = await index.indexScene(freshScene);
    expect(scenePass.embedded).toBe(1);
    expect(scenePass.removed).toBe(0);
    const hit = (await index.search("lighthouse keeper ledger", { kinds: ["turn"] }))[0];
    expect(hit?.turn).toBe(n);
    expect(hit?.text).toBe(
      "Player: I ask about the lighthouse keeper's ledger.\n\nVex: Edda wipes the bar. The ledger burned with the keeper, she says.",
    );
  });

  test("removed sources disappear from the index", async () => {
    const { dir, index, story } = await setup();
    await index.indexStory(story);
    await unlink(`${dir}/lore/tide-bells.md`);
    const result = await index.indexStory(await loadStory(dir, { libraryRoot: fixtureLibrary }));
    expect(result.removed).toBeGreaterThan(0);
    const refs = (await index.search("bells", { kinds: ["lore"], limit: 20 })).map((h) => h.ref);
    expect(refs).not.toContain("lore/tide-bells");
  });

  test("a different model rebuilds from scratch", async () => {
    const { dir, index, story } = await setup();
    await index.indexStory(story);
    index.close();
    const other = { ...fakeEmbedder(), model: "another-model" };
    const reopened = StoryIndex.open(dir, other);
    expect(reopened.count()).toBe(0);
    reopened.close();
  });
});

describe("chunked", () => {
  test("packs paragraphs under the limit and leads each chunk with the heading", () => {
    const para = "A sentence that goes on. ".repeat(20).trim();
    const chunks = chunked("Title", [para, para, para, para].join("\n\n"));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.startsWith("Title\n\n")).toBe(true);
      expect(c.length).toBeLessThanOrEqual(maxChunkChars + "Title\n\n".length);
    }
    expect(chunked("T", "   ")).toEqual([]);
    const long = chunked("", "x".repeat(maxChunkChars * 2 + 5));
    expect(long.length).toBe(3);
  });
});
