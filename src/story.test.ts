import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { StoryError } from "./errors.ts";
import {
  castOf,
  currentScene,
  findCharacter,
  loadStory,
  personaOf,
  type Scene,
  section,
  sheetFor,
} from "./story.ts";
import { blankDir, copyStory, fixtureLibrary, saltmereDir, tempDir } from "./testing/fixtures.ts";

const load = (dir: string) => loadStory(dir, { libraryRoot: fixtureLibrary });

describe("loadStory: saltmere", () => {
  test("reads story.md", async () => {
    const story = await load(saltmereDir);
    expect(story.dir).toBe(saltmereDir);
    expect(story.path).toBe(`${saltmereDir}/story.md`);
    expect(story.title).toBe("Saltmere");
    expect(story.storyteller).toEqual({
      name: "Vex",
      tagline: "Keeper of the tide-bells",
      voice: "Dry, unhurried, fond of weather.",
    });
    expect(story.notes).toStartWith("A drowned harbour town");
    expect(story.persona).toBe("corwin");
    expect(story.lines).toEqual(["harm to children"]);
    expect(story.veils).toEqual(["torture"]);
    expect(story.system?.path).toBe(`${saltmereDir}/rules/tides.md`);
    expect(story.system?.body).toStartWith("Roll 2d6");
  });

  test("merges library refs, story files override, unused library items stay out", async () => {
    const story = await load(saltmereDir);
    expect(story.characters.map((c) => [c.ref, c.source])).toEqual([
      ["characters/corwin", "story"],
      ["characters/edda", "story"],
      ["characters/mira", "library"],
    ]);
    const pact = story.lore.find((l) => l.stem === "the-pact");
    expect(pact?.source).toBe("story");
    expect(pact?.title).toBe("The Pact (Saltmere version)");
    expect(story.directives.map((d) => d.stem).sort()).toEqual([
      "boundaries",
      "fade",
      "noir",
      "slow-burn",
    ]);
    expect(story.characters.find((c) => c.stem === "mira")?.path).toBe(
      `${fixtureLibrary}/characters/mira.md`,
    );
  });

  test("character, lore and directive fields with defaults", async () => {
    const story = await load(saltmereDir);
    const corwin = findCharacter(story, "corwin");
    expect(corwin).toMatchObject({
      name: "Corwin Hale",
      tags: ["smuggler"],
      portrait: "assets/corwin.png",
    });
    expect(findCharacter(story, "edda")?.portrait).toBeUndefined();
    expect(story.lore.map((l) => l.stem)).toEqual(["saltmere", "tide-bells", "the-pact"]);
    expect(story.lore[0]).toMatchObject({ always: true, priority: 10 });
    expect(story.lore[2]).toMatchObject({ always: false, priority: 0, keys: ["pact"] });
    const byStem = Object.fromEntries(story.directives.map((d) => [d.stem, d]));
    expect(byStem["slow-burn"]).toMatchObject({
      mode: "keyed",
      keys: ["kiss", "romance"],
      on: true,
    });
    expect(byStem.fade).toMatchObject({ mode: "manual", on: false });
    expect(byStem.noir).toMatchObject({ mode: "always", on: true, source: "library" });
  });

  test("sheets", async () => {
    const story = await load(saltmereDir);
    expect(sheetFor(story, "corwin")).toMatchObject({ data: { edge: 2, harm: 0 } });
    expect(sheetFor(story, "edda")).toBeUndefined();
  });

  test("scenes in folders, ordered, with the open one current", async () => {
    const story = await load(saltmereDir);
    expect(story.scenes.map((s) => [s.number, s.slug, s.status])).toEqual([
      [1, "arrival", "closed"],
      [2, "the-drowned-bell", "closed"],
      [3, "the-tallow-stair", "open"],
    ]);
    const scene = story.scene;
    expect(scene?.number).toBe(3);
    expect(scene).toMatchObject({
      title: "The Tallow Stair",
      location: "The Tallow Stair, Saltmere",
      time: "an hour before dawn",
      mood: "uneasy",
      present: ["mira", "edda"],
      persona: "corwin",
      dir: `${saltmereDir}/scenes/003-the-tallow-stair`,
      path: `${saltmereDir}/scenes/003-the-tallow-stair/scene.md`,
      logPath: `${saltmereDir}/scenes/003-the-tallow-stair/log.jsonl`,
    });
    expect(scene?.widgets).toEqual({
      debt: { type: "text", value: "3 crowns", note: "owed to Edda" },
      tide: { type: "counter", value: 4 },
    });
    expect(scene?.widgetWarnings).toEqual([]);
    expect(story.scenes[1]?.time).toBeUndefined();
  });

  test("persona and cast", async () => {
    const story = await load(saltmereDir);
    expect(personaOf(story)).toBe("corwin");
    expect(castOf(story).map((c) => c.stem)).toEqual(["edda", "mira"]);
    const swapped: Scene = { ...(story.scene as Scene), persona: "mira" };
    expect(personaOf(story, swapped)).toBe("mira");
    expect(castOf(story, swapped).map((c) => c.stem)).toEqual(["corwin", "edda"]);
  });
});

describe("loadStory: blank and edge cases", () => {
  test("a story.md with only a title loads", async () => {
    const story = await load(blankDir);
    expect(story.title).toBe("Untitled");
    expect(story.persona).toBeUndefined();
    expect(story.scene).toBeUndefined();
    expect(story.system).toBeUndefined();
    expect(story.storyteller.name).toBe("Vex");
    for (const list of [
      story.characters,
      story.lore,
      story.directives,
      story.sheets,
      story.scenes,
    ]) {
      expect(list).toEqual([]);
    }
    expect(personaOf(story)).toBeUndefined();
  });

  test("a persona without a card is allowed", async () => {
    const dir = await copyStory(blankDir);
    await Bun.write(`${dir}/story.md`, "---\ntitle: T\npersona: nell\n---\n");
    const story = await load(dir);
    expect(personaOf(story)).toBe("nell");
    expect(findCharacter(story, "nell")).toBeUndefined();
  });

  test("old trackers load as widgets; bad widgets load as text with a warning", async () => {
    const dir = await copyStory(blankDir);
    await Bun.write(
      `${dir}/scenes/001-a/scene.md`,
      [
        "---",
        "title: A",
        "widgets:",
        "  Health: { type: meter, value: 88 }",
        "  Days: { type: counter, value: 2 }",
        "trackers:",
        "  Days: { value: 9 }",
        "  debt: { value: 3 crowns, note: owed }",
        "---",
      ].join("\n"),
    );
    const scene = (await load(dir)).scene;
    expect(scene?.widgets).toEqual({
      Health: { type: "text", value: "88" },
      Days: { type: "counter", value: 2 },
      debt: { type: "text", value: "3 crowns", note: "owed" },
    });
    expect(scene?.widgetWarnings).toEqual([
      "Health: meter needs max: the value is drawn as a bar out of it (shown as text until fixed)",
    ]);
  });

  test("system.md is picked up when system: is not named", async () => {
    const dir = await copyStory(blankDir);
    await Bun.write(`${dir}/system.md`, "Roll high.");
    expect((await load(dir)).system?.body).toBe("Roll high.");
  });

  test("errors name the problem", async () => {
    const empty = await tempDir();
    await expect(load(empty)).rejects.toThrow(/No story\.md/);
    const dir = await copyStory(blankDir);
    await Bun.write(`${dir}/story.md`, "---\npersona: x\n---\n");
    await expect(load(dir)).rejects.toThrow(/needs a title/);
    await Bun.write(`${dir}/story.md`, "---\ntitle: T\nsystem: nope.md\n---\n");
    await expect(load(dir)).rejects.toThrow(/nope\.md/);
    await Bun.write(`${dir}/story.md`, "---\ntitle: T\nuses: [characters/ghost]\n---\n");
    await expect(load(dir)).rejects.toThrow(StoryError);
    await Bun.write(`${dir}/story.md`, "---\ntitle: T\n---\n");
    await Bun.write(`${dir}/directives/x.md`, "---\nmode: sometimes\n---\n");
    await expect(load(dir)).rejects.toThrow(/mode "sometimes"/);
    await rm(`${dir}/directives`, { recursive: true });
    await Bun.write(`${dir}/lore/bad.md`, "---\ntitle: [oops\n---\n");
    await expect(load(dir)).rejects.toThrow(/bad\.md/);
  });
});

describe("loadStory: lore entries", () => {
  async function storyWith(lore: Record<string, string>, uses: string[] = []): Promise<string> {
    const dir = await tempDir();
    await Bun.write(`${dir}/story.md`, `---\ntitle: T\nuses: ${JSON.stringify(uses)}\n---\n`);
    for (const [stem, text] of Object.entries(lore))
      await Bun.write(`${dir}/lore/${stem}.md`, text);
    return dir;
  }

  test("every field has its default", async () => {
    const dir = await storyWith({ bare: "Just text." });
    const [bare] = (await load(dir)).lore;
    expect(bare).toMatchObject({
      title: "bare",
      keys: [],
      also: undefined,
      unless: [],
      always: false,
      priority: 0,
      scope: { kind: "story" },
      cooldown: 6,
      chance: 100,
      group: undefined,
      weight: 1,
      recurse: true,
      scan: undefined,
      known: false,
      truth: "fact",
      body: "Just text.",
      secret: undefined,
      history: undefined,
      book: undefined,
    });
  });

  test("reads every field, and keeps Secret and History out of the body", async () => {
    const dir = await storyWith({
      lamps: [
        "---",
        "title: The Lamplighters",
        "keys: [Lamplighters, lamp hall]",
        "also: { all: [patrol, curfew] }",
        "unless: [Feast of Wicks]",
        "always: true",
        "priority: 5",
        "scope: place:Varrow",
        "cooldown: 2",
        "chance: 50",
        "group: city-mood",
        "weight: 3",
        "recurse: false",
        "scan: 1",
        "known: secret",
        "truth: rumor",
        "---",
        "",
        "The night watch.",
        "",
        "## Secret",
        "",
        "They answer to Velde.",
        "",
        "## Ranks",
        "",
        "Sergeants and wicks.",
        "",
        "## History",
        "",
        "- Scene 3: the Lamp Hall burned.",
      ].join("\n"),
    });
    const [lamps] = (await load(dir)).lore;
    expect(lamps).toMatchObject({
      keys: ["Lamplighters", "lamp hall"],
      also: { mode: "all", keys: ["patrol", "curfew"] },
      unless: ["Feast of Wicks"],
      always: true,
      priority: 5,
      scope: { kind: "place", text: "Varrow" },
      cooldown: 2,
      chance: 50,
      group: "city-mood",
      weight: 3,
      recurse: false,
      scan: 1,
      known: "secret",
      truth: "rumor",
      body: "The night watch.\n\n## Ranks\n\nSergeants and wicks.",
      secret: "They answer to Velde.",
      history: "- Scene 3: the Lamp Hall burned.",
    });
  });

  test("a bad field names the file and the field", async () => {
    for (const bad of ["scope: harbour", "chance: 120", "weight: 0", "also: [x]", "truth: maybe"]) {
      const dir = await storyWith({ bad: `---\n${bad}\n---\n\nText.\n` });
      await expect(load(dir)).rejects.toThrow(/lore\/bad\.md: /);
    }
  });

  test("a library book: the whole book, one entry, and story overrides by stem", async () => {
    const whole = await load(await storyWith({}, ["lore/harbour-town"]));
    expect(whole.lore.map((l) => [l.ref, l.source, l.book, l.title])).toEqual([
      ["lore/ferry", "library", "harbour-town", "The Ferry"],
      ["lore/the-pact", "library", "harbour-town", "The Pact (harbour-town book)"],
    ]);
    const one = await load(await storyWith({}, ["lore/harbour-town/ferry"]));
    expect(one.lore.map((l) => l.ref)).toEqual(["lore/ferry"]);
    const overridden = await load(
      await storyWith({ "the-pact": "---\ntitle: Ours\n---\n\nMine." }, ["lore/harbour-town"]),
    );
    expect(overridden.lore.map((l) => [l.ref, l.source, l.title])).toEqual([
      ["lore/the-pact", "story", "Ours"],
      ["lore/ferry", "library", "The Ferry"],
    ]);
  });

  test("of two library entries with the same stem, the first listed wins", async () => {
    const story = await load(await storyWith({}, ["lore/the-pact", "lore/harbour-town"]));
    expect(story.lore.find((l) => l.stem === "the-pact")).toMatchObject({
      book: undefined,
      body: "Library version: sealed in blood.",
    });
  });
});

describe("helpers", () => {
  test("currentScene prefers the latest open scene, else the latest", async () => {
    const story = await load(saltmereDir);
    const [one, two, three] = story.scenes as [Scene, Scene, Scene];
    expect(currentScene([three, one, two])?.number).toBe(3);
    expect(currentScene([one, two])?.number).toBe(2);
    expect(currentScene([])).toBeUndefined();
  });

  test("findCharacter matches stem or display name, case-insensitively", async () => {
    const story = await load(saltmereDir);
    expect(findCharacter(story, "Mira Vane")?.stem).toBe("mira");
    expect(findCharacter(story, "EDDA")?.stem).toBe("edda");
    expect(findCharacter(story, "nobody")).toBeUndefined();
  });

  test("section reads a ## block up to the next one", () => {
    const md = "## Now\n\nRain.\n\n## Notes\n\n- a\n- b\n\n### sub\n\nstill notes\n\n## Summary\n";
    expect(section(md, "Now")).toBe("Rain.");
    expect(section(md, "notes")).toBe("- a\n- b\n\n### sub\n\nstill notes");
    expect(section(md, "Summary")).toBe("");
    expect(section(md, "Missing")).toBeUndefined();
  });
});
