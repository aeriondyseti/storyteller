import { describe, expect, test } from "bun:test";
import { readFrontmatterFile } from "../../src/frontmatter.ts";
import { generatedPaths } from "../../src/generate.ts";
import { blankDir, fixtureLibrary } from "../../src/testing/fixtures.ts";
import { load } from "../context.ts";
import { failure, worldFor } from "../testing.ts";
import {
  setDirective,
  updateSheet,
  updateStory,
  upsertCharacter,
  upsertDirective,
  upsertLore,
} from "./canon.ts";

describe("canon tools", () => {
  test("upsert_character creates a card that reaches the prompt", async () => {
    const ctx = await worldFor();
    const text = await upsertCharacter.call(ctx, {
      stem: "old-tom",
      name: "Old Tom",
      tags: ["ferryman"],
      body: "Rows the dead across. Charges double.",
    });
    expect(text).toBe(`Created card old-tom (Old Tom): ${ctx.storyDir}/characters/old-tom.md.`);
    const story = await load(ctx);
    expect(story.characters.find((c) => c.stem === "old-tom")?.tags).toEqual(["ferryman"]);
    const prompt = await Bun.file(generatedPaths(story).promptFile).text();
    expect(prompt).toContain("### Old Tom (old-tom)");
  });

  test("upsert_character updates in place, keeping unknown keys", async () => {
    const ctx = await worldFor();
    const file = `${ctx.storyDir}/characters/edda.md`;
    await Bun.write(file, "---\nname: Edda\ntags: [innkeeper]\nage: 50\n---\n\nOld body.\n");
    const text = await upsertCharacter.call(ctx, { stem: "edda", name: "Edda Rook", body: "New." });
    expect(text).toStartWith("Updated card edda");
    const doc = await readFrontmatterFile(file);
    expect(doc.data).toEqual({ name: "Edda Rook", tags: ["innkeeper"], age: 50 });
    expect(doc.body).toBe("New.");
  });

  test("writing over a library card makes a story copy, library untouched", async () => {
    const ctx = await worldFor();
    const libFile = `${fixtureLibrary}/characters/mira.md`;
    const libBefore = await Bun.file(libFile).text();
    const text = await upsertCharacter.call(ctx, { stem: "mira", name: "Mira", body: "Changed." });
    expect(text).toContain("overriding the library's");
    expect(await Bun.file(libFile).text()).toBe(libBefore);
    const mira = (await load(ctx)).characters.find((c) => c.stem === "mira");
    expect(mira?.source).toBe("story");
    expect(mira?.body).toBe("Changed.");
  });

  test("bad stems are refused with a suggestion", async () => {
    const ctx = await worldFor();
    const message = await failure(upsertCharacter, ctx, { stem: "Old Tom", name: "x", body: "y" });
    expect(message).toContain('like "old-tom"');
  });

  test("upsert_lore", async () => {
    const ctx = await worldFor();
    await upsertLore.call(ctx, {
      stem: "the-ferry",
      title: "The Ferry",
      keys: ["ferry", "crossing"],
      priority: 3,
      body: "Crosses at slack tide only.",
    });
    const lore = (await load(ctx)).lore.find((l) => l.stem === "the-ferry");
    expect(lore).toMatchObject({ title: "The Ferry", keys: ["ferry", "crossing"], priority: 3 });
    expect(lore?.always).toBe(false);
  });

  test("upsert_lore takes every field", async () => {
    const ctx = await worldFor();
    await upsertLore.call(ctx, {
      stem: "lamps",
      title: "The Lamplighters",
      keys: ["Lamplighters"],
      also: { any: ["patrol", "curfew"] },
      unless: ["Feast of Wicks"],
      scope: "place:Varrow",
      cooldown: 3,
      chance: 40,
      group: "city-mood",
      weight: 2,
      recurse: false,
      scan: 1,
      known: true,
      truth: "rumor",
      body: "The night watch.",
    });
    const lamps = (await load(ctx)).lore.find((l) => l.stem === "lamps");
    expect(lamps).toMatchObject({
      also: { mode: "any", keys: ["patrol", "curfew"] },
      unless: ["Feast of Wicks"],
      scope: { kind: "place", text: "Varrow" },
      cooldown: 3,
      chance: 40,
      group: "city-mood",
      weight: 2,
      recurse: false,
      scan: 1,
      known: true,
      truth: "rumor",
    });
  });

  test("upsert_lore refuses bad values and writes nothing", async () => {
    const ctx = await worldFor();
    const base = { stem: "bad", title: "Bad", keys: ["x"], body: "Text." };
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ chance: 101 }, /chance/],
      [{ chance: -1 }, /chance/],
      [{ weight: 0 }, /weight/],
      [{ scope: "harbour" }, /scope "harbour" should be story, character/],
      [{ scope: "character:Mira Vane" }, /scope/],
      [{ also: { any: ["a"], all: ["b"] } }, /also/],
      [{ also: { some: ["a"] } }, /also/],
      [{ also: { any: [] } }, /also/],
      [{ cooldown: 1.5 }, /cooldown/],
    ];
    for (const [extra, message] of cases) {
      expect(await failure(upsertLore, ctx, { ...base, ...extra })).toMatch(message);
    }
    expect(await Bun.file(`${ctx.storyDir}/lore/bad.md`).exists()).toBe(false);
  });

  test("upsert_lore keeps an entry's Secret and History unless the body brings its own", async () => {
    const ctx = await worldFor();
    const file = `${ctx.storyDir}/lore/oath.md`;
    await Bun.write(
      file,
      "---\ntitle: Oath\nkeys: [oath]\n---\n\nOld text.\n\n## Secret\n\nShe lied.\n\n## History\n\n- Scene 1: sworn.\n",
    );
    await upsertLore.call(ctx, { stem: "oath", title: "Oath", keys: ["oath"], body: "New text." });
    expect((await readFrontmatterFile(file)).body).toBe(
      "New text.\n\n## Secret\n\nShe lied.\n\n## History\n\n- Scene 1: sworn.",
    );
    await upsertLore.call(ctx, {
      stem: "oath",
      title: "Oath",
      keys: ["oath"],
      body: "Newer.\n\n## Secret\n\nShe told the truth.",
    });
    expect((await readFrontmatterFile(file)).body).toBe(
      "Newer.\n\n## Secret\n\nShe told the truth.",
    );
  });

  test("upsert_directive and set_directive", async () => {
    const ctx = await worldFor();
    await upsertDirective.call(ctx, {
      stem: "gallows-humour",
      title: "Gallows humour",
      mode: "manual",
      body: "Let people joke when things are worst.",
    });
    let d = (await load(ctx)).directives.find((x) => x.stem === "gallows-humour");
    expect(d).toMatchObject({ mode: "manual", on: false });
    expect(await setDirective.call(ctx, { stem: "gallows-humour", on: true })).toBe(
      "Gallows humour is now on.",
    );
    d = (await load(ctx)).directives.find((x) => x.stem === "gallows-humour");
    expect(d?.on).toBe(true);
    expect(
      await failure(upsertDirective, ctx, { stem: "x", title: "x", mode: "sometimes", body: "x" }),
    ).toStartWith("Invalid input: mode");
  });

  test("set_directive on a library directive copies it into the story", async () => {
    const ctx = await worldFor();
    const text = await setDirective.call(ctx, { stem: "noir", on: false });
    expect(text).toContain("Noir is now off.");
    expect(text).toContain("own copy");
    const noir = (await load(ctx)).directives.find((d) => d.stem === "noir");
    expect(noir).toMatchObject({ on: false, source: "story", mode: "always" });
    expect(noir?.body).toContain("Short sentences.");
    expect(await failure(setDirective, ctx, { stem: "nope", on: true })).toStartWith(
      'No directive "nope".',
    );
  });

  test("update_story on a blank story: interview fields", async () => {
    const ctx = await worldFor(blankDir);
    const text = await updateStory.call(ctx, {
      title: "The Hollow Crown",
      persona: "corwin",
      storyteller: { name: "Vex", tagline: "Keeper of ledgers" },
      notes: "## Premise\n\nA port city with no king.",
      lines: ["Harm to children"],
    });
    expect(text).toContain("Updated story.md (title, persona, storyteller, notes, lines).");
    expect(text).toContain("No card yet for corwin.");
    const story = await load(ctx);
    expect(story.title).toBe("The Hollow Crown");
    expect(story.storyteller).toEqual({
      name: "Vex",
      tagline: "Keeper of ledgers",
      voice: undefined,
    });
    expect(story.notes).toBe("## Premise\n\nA port city with no king.");
    expect(story.lines).toEqual(["Harm to children"]);
  });

  test("update_story merges storyteller and keeps the body when notes are omitted", async () => {
    const ctx = await worldFor();
    await updateStory.call(ctx, { storyteller: { voice: "Hoarse." }, veils: [] });
    const story = await load(ctx);
    expect(story.storyteller).toEqual({
      name: "Vex",
      tagline: "Keeper of the tide-bells",
      voice: "Hoarse.",
    });
    expect(story.veils).toEqual([]);
    expect(story.notes).toStartWith("A drowned harbour town");
    expect(story.uses).toHaveLength(4);
    expect(await failure(updateStory, ctx, {})).toBe("Nothing to change.");
  });

  test("update_sheet rewrites the body and merges stats", async () => {
    const ctx = await worldFor();
    const text = await updateSheet.call(ctx, {
      stem: "Corwin",
      body: "Moves: Read the water.",
      stats: { harm: 1 },
    });
    expect(text).toBe(`Updated sheet for Corwin Hale: ${ctx.storyDir}/sheets/corwin.md.`);
    const doc = await readFrontmatterFile(`${ctx.storyDir}/sheets/corwin.md`);
    expect(doc.data).toEqual({ edge: 2, harm: 1 });
    expect(doc.body).toBe("Moves: Read the water.");
    await updateSheet.call(ctx, { stem: "edda", body: "Moves: Pour." });
    expect((await load(ctx)).sheets.map((s) => s.stem)).toEqual(["corwin", "edda"]);
  });
});
