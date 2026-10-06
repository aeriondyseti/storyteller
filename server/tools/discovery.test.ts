import { describe, expect, test } from "bun:test";
import { blankDir, fixtureLibrary } from "../../src/testing/fixtures.ts";
import { load, type WorldContext } from "../context.ts";
import { failure, worldFor } from "../testing.ts";
import { appendLoreHistory, revealLore } from "./discovery.ts";

// Hand-written on purpose: one-line lists, a comment, odd spacing. The tools
// must change only their own line.
const lamps = [
  "---",
  "title: The Lamplighters",
  "keys: [Lamplighters, lamp hall]  # who to ask",
  "known: false",
  "truth: rumor",
  "---",
  "",
  "They light the city.",
  "",
  "## Secret",
  "",
  "They set the fires.",
  "",
].join("\n");

async function withLamps(ctx: WorldContext): Promise<string> {
  const file = `${ctx.storyDir}/lore/lamps.md`;
  await Bun.write(file, lamps);
  return file;
}

// Saltmere with the harbour-town library book in its `uses:`.
async function withBook(): Promise<WorldContext> {
  const ctx = await worldFor();
  const storyFile = `${ctx.storyDir}/story.md`;
  const text = await Bun.file(storyFile).text();
  await Bun.write(
    storyFile,
    text.replace("  - lore/the-pact\n", "  - lore/the-pact\n  - lore/harbour-town\n"),
  );
  return ctx;
}

const loreOf = async (ctx: WorldContext, stem: string) =>
  (await load(ctx)).lore.find((l) => l.stem === stem);

describe("reveal_lore", () => {
  test("marks an entry known, changing only the known line", async () => {
    const ctx = await worldFor();
    const file = await withLamps(ctx);
    const text = await revealLore.call(ctx, { stem: "lamps" });
    expect(text).toBe(`The Lamplighters is now known to the player's character: ${file}.`);
    expect(await Bun.file(file).text()).toBe(lamps.replace("known: false", "known: true"));
    expect((await loreOf(ctx, "lamps"))?.known).toBe(true);
  });

  test("part secret reveals the Secret too, from unknown or known", async () => {
    const ctx = await worldFor();
    const file = await withLamps(ctx);
    await revealLore.call(ctx, { stem: "lamps" });
    const text = await revealLore.call(ctx, { stem: "lamps", part: "secret" });
    expect(text).toStartWith("The Lamplighters, Secret included, is now known");
    expect(await Bun.file(file).text()).toBe(lamps.replace("known: false", "known: secret"));
    expect((await loreOf(ctx, "lamps"))?.known).toBe("secret");
  });

  test("revealing what is already known is a no-op that says so", async () => {
    const ctx = await worldFor();
    const file = await withLamps(ctx);
    await revealLore.call(ctx, { stem: "lamps" });
    const before = await Bun.file(file).text();
    expect(await revealLore.call(ctx, { stem: "lamps" })).toBe(
      "The Lamplighters is already known (its Secret is still hidden). Nothing changed.",
    );
    await revealLore.call(ctx, { stem: "lamps", part: "secret" });
    expect(await revealLore.call(ctx, { stem: "lamps" })).toBe(
      "The Lamplighters is already known (Secret included). Nothing changed.",
    );
    expect(await revealLore.call(ctx, { stem: "tide-bells" })).toBe(
      "The tide-bells is already known. Nothing changed.",
    );
    expect(await Bun.file(file).text()).toBe(before.replace("known: true", "known: secret"));
  });

  test("a library entry is revealed in a story copy; the library is untouched", async () => {
    const ctx = await withBook();
    const libFile = `${fixtureLibrary}/lore/harbour-town/ferry.md`;
    const libText = await Bun.file(libFile).text();
    const text = await revealLore.call(ctx, { stem: "ferry" });
    expect(text).toContain("overriding the library's");
    expect(await Bun.file(libFile).text()).toBe(libText);
    expect(await Bun.file(`${ctx.storyDir}/lore/ferry.md`).text()).toBe(
      libText.replace("known: false", "known: true"),
    );
    const ferry = await loreOf(ctx, "ferry");
    expect(ferry).toMatchObject({ source: "story", known: true });
  });

  test("an unknown stem names the entries there are", async () => {
    const ctx = await worldFor();
    expect(await failure(revealLore, ctx, { stem: "dragons" })).toBe(
      'No lore entry "dragons". Entries: saltmere, tide-bells, the-pact.',
    );
  });
});

describe("append_lore_history", () => {
  test("adds a dated line under a new History section", async () => {
    const ctx = await worldFor();
    const file = await withLamps(ctx);
    const text = await appendLoreHistory.call(ctx, {
      stem: "lamps",
      line: "the Lamp Hall burned.",
    });
    expect(text).toBe(
      `Added to The Lamplighters's History: "- Scene 3: the Lamp Hall burned." (${file}).`,
    );
    expect(await Bun.file(file).text()).toBe(
      `${lamps}\n## History\n\n- Scene 3: the Lamp Hall burned.\n`,
    );
    expect((await loreOf(ctx, "lamps"))?.history).toBe("- Scene 3: the Lamp Hall burned.");
  });

  test("newest last; a dash or scene prefix in the line is not doubled", async () => {
    const ctx = await worldFor();
    await withLamps(ctx);
    await appendLoreHistory.call(ctx, { stem: "lamps", line: "first" });
    await appendLoreHistory.call(ctx, { stem: "lamps", line: "- Scene 9: second\nline" });
    expect((await loreOf(ctx, "lamps"))?.history).toBe("- Scene 3: first\n- Scene 3: second line");
  });

  test("a library entry gets a story copy", async () => {
    const ctx = await withBook();
    const libFile = `${fixtureLibrary}/lore/harbour-town/ferry.md`;
    const libText = await Bun.file(libFile).text();
    const text = await appendLoreHistory.call(ctx, { stem: "ferry", line: "it sank" });
    expect(text).toContain("overriding the library's");
    expect(await Bun.file(libFile).text()).toBe(libText);
    expect(await Bun.file(`${ctx.storyDir}/lore/ferry.md`).text()).toBe(
      `${libText}\n## History\n\n- Scene 3: it sank\n`,
    );
  });

  test("needs a scene to date the line", async () => {
    const ctx = await worldFor(blankDir);
    await Bun.write(`${ctx.storyDir}/lore/lamps.md`, lamps);
    expect(await failure(appendLoreHistory, ctx, { stem: "lamps", line: "x" })).toContain(
      "There is no scene yet",
    );
  });
});
