import { describe, expect, test } from "bun:test";
import type { Activated } from "./activation.ts";
import type { LoreDetails } from "./lore.ts";
import {
  embed,
  playerName,
  renderBible,
  renderClaudeMd,
  renderInjected,
  renderStateHeader,
  renderSystemPrompt,
  renderWidgets,
} from "./render.ts";
import { loadStory, type Scene, type Story } from "./story.ts";
import { blankDir, copyStory, fixtureLibrary, saltmereDir } from "./testing/fixtures.ts";

const load = (dir: string) => loadStory(dir, { libraryRoot: fixtureLibrary });

// Asserts each needle appears, in this order.
function expectInOrder(text: string, needles: string[]) {
  let from = 0;
  for (const needle of needles) {
    const at = text.indexOf(needle, from);
    if (at === -1) throw new Error(`"${needle}" missing or out of order`);
    from = at + needle.length;
  }
}

describe("renderBible", () => {
  test("saltmere: every section, in spec order", async () => {
    const bible = renderBible(await load(saltmereDir));
    expectInOrder(bible, [
      "# Story bible: Saltmere",
      `Story folder: ${saltmereDir}`,
      "## You, the Storyteller",
      "Tagline: Keeper of the tide-bells",
      "## Story notes",
      "A drowned harbour town",
      "## Lines and veils",
      "harm to children",
      "torture",
      "## Rules system",
      "Roll 2d6",
      "## The player's character",
      "### Corwin Hale (corwin)",
      "Salt-white hair",
      "#### Sheet",
      "Moves: Read the water",
      "## Cast (played by you)",
      "### Edda (edda)",
      "### Mira Vane (mira)",
      `${fixtureLibrary}/characters/mira.md (library)`,
      "## Lore always in play",
      "The town sank",
      "## Directives in force",
      "Short sentences. Rain.",
      "## On demand",
      `- The tide-bells: keys bell, bells, tide-bell · ${saltmereDir}/lore/tide-bells.md`,
      "- Fade to black (manual, off)",
      "- Slow burn (keyed, on): keys kiss, romance",
      "## Earlier scenes",
      "### Scene 1: Arrival",
      "### Scene 2: The Drowned Bell",
      "## Current scene",
      "### Scene 3: The Tallow Stair (open)",
      `Log: ${saltmereDir}/scenes/003-the-tallow-stair/log.jsonl`,
      "Present: mira, edda",
      "Player plays: corwin",
      "Widgets:\n  - debt 3 crowns (text) - owed to Edda\n  - tide 4 (counter)",
      "#### Now",
      "#### Notes",
    ]);
    expect(bible).not.toContain("\\");
    expect(bible).not.toContain("Library version: sealed in blood");
    expect(bible).not.toContain("Not referenced by any story");
    // Keyed lore and non-always directives are indexed, not inlined.
    expect(bible).not.toContain("Thirteen bells");
    expect(bible).not.toContain("Cut away from intimate scenes");
    // Corwin is the persona, not cast.
    expect(bible.match(/### Corwin Hale/g)).toHaveLength(1);
  });

  test("lore: public text only; scoped always-on entries are indexed with their scope", async () => {
    const dir = await copyStory(saltmereDir);
    await Bun.write(
      `${dir}/lore/saltmere.md`,
      "---\ntitle: Saltmere\nalways: true\n---\n\nThe town sank.\n\n## Secret\n\nIt was sunk on purpose.\n\n## History\n\n- Scene 1: Corwin came back.\n",
    );
    await Bun.write(
      `${dir}/lore/miras-oath.md`,
      "---\ntitle: Mira's oath\nkeys: [oath]\nalways: true\nscope: character:mira\n---\n\nShe swore.\n",
    );
    const bible = renderBible(await load(dir));
    expect(bible).toContain("## Lore always in play\n\n### Saltmere");
    expect(bible).toContain("The town sank.");
    expect(bible).not.toContain("sunk on purpose");
    expect(bible).not.toContain("Corwin came back");
    expect(bible).not.toContain("She swore.");
    expect(bible).toContain(
      `- Mira's oath: keys oath · character:mira, always · ${dir}/lore/miras-oath.md`,
    );
  });

  test("renderInjected: lore then directives, updated entries marked", () => {
    const entry = (kind: "lore" | "directive", title: string, updated = false) => ({
      kind,
      ref: `${kind}/${title}`,
      title,
      body: `${title} body`,
      updated,
      why: "key",
      chars: 1,
      details:
        kind === "lore"
          ? { secret: undefined, history: undefined, truth: "fact" as const, known: true }
          : undefined,
    });
    expect(
      renderInjected([
        entry("directive", "Hush"),
        entry("lore", "Varrow", true),
        entry("lore", "Bells"),
      ]),
    ).toBe(
      [
        "",
        "Lore in play:",
        "",
        "### Varrow (updated)",
        "",
        "Varrow body",
        "",
        "### Bells",
        "",
        "Bells body",
        "",
        "Directives in play:",
        "",
        "### Hush",
        "",
        "Hush body",
      ].join("\n"),
    );
    expect(renderInjected([])).toBe("");
  });

  test("renderInjected: lore carries its tags, truth note, Secret and History", () => {
    const lamps = (details: Partial<LoreDetails>, updated = false): Activated => ({
      kind: "lore",
      ref: "lore/lamps",
      title: "The Lamplighters",
      body: "They light the city.",
      updated,
      why: "key",
      chars: 1,
      details: { secret: undefined, history: undefined, truth: "fact", known: true, ...details },
    });
    const full = lamps(
      {
        truth: "false",
        known: false,
        secret: "They set the fires.",
        history: "- Scene 3: the Lamp Hall burned.",
      },
      true,
    );
    expect(renderInjected([full], "Corwin")).toBe(
      [
        "",
        "Lore in play:",
        "",
        "### The Lamplighters (updated) (false) (unknown to Corwin)",
        "",
        "Characters believe this; it is not true. The truth is in Secret.",
        "",
        "They light the city.",
        "",
        "Secret (unknown to Corwin):",
        "They set the fires.",
        "",
        "History:",
        "- Scene 3: the Lamp Hall burned.",
      ].join("\n"),
    );
    const rumour = renderInjected([lamps({ truth: "rumor", known: true })]);
    expect(rumour).toContain(
      "### The Lamplighters (rumour)\n\nPeople say this; it may not be so.\n\nThey light the city.",
    );
    const falseNoSecret = renderInjected([lamps({ truth: "false" })]);
    expect(falseNoSecret).toContain("\n\nCharacters believe this; it is not true.\n\n");
    // Known but not the Secret: the heading drops the tag, the Secret keeps it.
    const known = renderInjected([lamps({ secret: "Fires." })], "Corwin");
    expect(known).toContain("### The Lamplighters\n\nThey light the city.");
    expect(known).toContain("Secret (unknown to Corwin):\nFires.");
    expect(renderInjected([lamps({ secret: "Fires.", known: "secret" })])).toContain(
      "Secret:\nFires.",
    );
    expect(renderInjected([lamps({ known: false })])).toContain(
      "### The Lamplighters (unknown to the player)",
    );
  });

  test("playerName: the persona's card name, else its stem, else the player", async () => {
    const story = await load(saltmereDir);
    expect(playerName(story)).toBe(
      story.characters.find((c) => c.stem === "corwin")?.name ?? "missing",
    );
    expect(playerName({ ...story, characters: [] })).toBe("corwin");
    expect(playerName(await load(blankDir))).toBe("the player");
  });

  test("widgets: one line each, grouped, pane named, problems listed", async () => {
    const story = await load(saltmereDir);
    const scene = story.scene as Scene;
    const text = renderWidgets({
      ...scene,
      widgets: {
        Days: { type: "counter", value: 9 },
        Health: { type: "meter", value: 88, max: 100, group: "Body", color: "#c33" },
        Powers: { type: "list", value: ["wheel", "parry"], pane: "Powers" },
        Stamina: { type: "clock", value: 2, of: 6, group: "Body", note: "Running out." },
        Conditions: { type: "tags", value: ["wounded", "hunted"] },
      },
      widgetWarnings: ["Fuel: meter needs max (shown as text until fixed)"],
    });
    expect(text).toBe(
      [
        "Widgets:",
        "  - Days 9 (counter)",
        "  - Powers: wheel, parry (list, pane Powers)",
        "  - Conditions: wounded · hunted (tags)",
        "  Body:",
        "    - Health 88/100 (meter)",
        "    - Stamina 2/6 (clock) - Running out.",
        "Widget problems:",
        "  - Fuel: meter needs max (shown as text until fixed)",
      ].join("\n"),
    );
    expect(renderWidgets({ ...scene, widgets: {}, widgetWarnings: [] })).toBe("");
  });

  test("closed-scene summaries drop oldest first over budget", async () => {
    const story = await load(saltmereDir);
    const tight = renderBible(story, { summaryBudget: 120 });
    expect(tight).toContain("1 earlier scene summary is left out");
    expect(tight).not.toContain("### Scene 1: Arrival");
    expect(tight).toContain("### Scene 2: The Drowned Bell");
    const none = renderBible(story, { summaryBudget: 0 });
    expect(none).toContain("2 earlier scene summaries are left out");
  });

  test("blank story renders without crashing and says what is missing", async () => {
    const bible = renderBible(await load(blankDir));
    expect(bible).toContain("# Story bible: Untitled");
    expect(bible).toContain("## The player's character\n\nNot chosen yet.");
    expect(bible).toContain("## Cast (played by you)\n\nNo cards yet.");
    expect(bible).toContain("## Current scene\n\nNone opened yet.");
    expect(bible).not.toContain("## Earlier scenes");
    expect(bible).not.toContain("## On demand");
  });

  test("a persona without a card renders as no card yet", async () => {
    const dir = await copyStory(blankDir);
    await Bun.write(`${dir}/story.md`, "---\ntitle: T\npersona: nell\n---\n");
    expect(renderBible(await load(dir))).toContain("nell: no card yet.");
  });
});

describe("renderSystemPrompt", () => {
  test("is the base contract followed by the bible", async () => {
    const story = await load(blankDir);
    const prompt = renderSystemPrompt("  You are the Storyteller.\n", story);
    expect(prompt).toBe(`You are the Storyteller.\n\n${renderBible(story)}`);
  });
});

describe("renderClaudeMd", () => {
  test("indexes files and points at the current scene", async () => {
    const md = renderClaudeMd(await load(saltmereDir));
    expect(md).toStartWith("# Saltmere\n");
    expect(md).toContain(
      `Current scene: 3, "The Tallow Stair" (open): ${saltmereDir}/scenes/003-the-tallow-stair/scene.md`,
    );
    expect(md).toContain(`  - Mira Vane: ${fixtureLibrary}/characters/mira.md`);
    expect(md).toContain("  - 1. Arrival (closed):");
  });

  test("blank story", async () => {
    const md = renderClaudeMd(await load(blankDir));
    expect(md).toContain("No scene yet.");
    expect(md).not.toContain("Characters:");
  });
});

describe("renderStateHeader", () => {
  test("one line with scene, place, time and who is present", async () => {
    const header = renderStateHeader(await load(saltmereDir));
    expect(header).toBe(
      "[scene 3: The Tallow Stair · The Tallow Stair, Saltmere · an hour before dawn · present: Mira Vane, Edda]",
    );
    expect(header).not.toContain("\n");
  });

  test("no scene, or a sparse one", async () => {
    const story = await load(blankDir);
    expect(renderStateHeader(story)).toBe("[scene: none open yet]");
    const sparse: Story = {
      ...story,
      scene: {
        number: 1,
        slug: "x",
        title: "X",
        status: "open",
        location: undefined,
        time: undefined,
        mood: undefined,
        present: ["ghost"],
        persona: undefined,
        widgets: {},
        widgetWarnings: [],
        body: "",
        dir: "",
        path: "",
        logPath: "",
      },
    };
    expect(renderStateHeader(sparse)).toBe("[scene 1: X · present: ghost]");
  });
});

describe("embed", () => {
  test("demotes headings two levels, capped at h6, leaving fences and prose", () => {
    const body = [
      "# Title",
      "## Now",
      "##### Deep",
      "###### Deepest",
      "#hashtag stays",
      "```",
      "## not a heading",
      "```",
      "Text with ## inside.",
    ].join("\n");
    expect(embed(body)).toBe(
      [
        "### Title",
        "#### Now",
        "###### Deep",
        "###### Deepest",
        "#hashtag stays",
        "```",
        "## not a heading",
        "```",
        "Text with ## inside.",
      ].join("\n"),
    );
  });

  test("no embedded body reaches the bible's own heading levels", async () => {
    const bible = renderBible(await load(saltmereDir));
    expect(bible).toContain("#### Appearance");
    const h2 = bible.match(/^## .*/gm) ?? [];
    for (const leaked of ["## Appearance", "## Now", "## Notes", "## Summary"]) {
      expect(h2).not.toContain(leaked);
    }
  });
});
