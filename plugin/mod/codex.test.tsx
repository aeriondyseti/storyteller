import type { On } from "claude-code";
import { describe, type Engine, expect, test } from "claude-code/testing";
import type { CodexSnapshot, StageSnapshot } from "./types";

// The codex pane (stage/codex.tsx) and the glossary links into it from the
// reply (stage/voice.tsx) and the scene pane (stage/scene.tsx), through the
// engine's test kit. The kit has no processes: plugin/codex.ts and
// plugin/scene.ts are played here by the test's process.run hook.

const plugin = "storyteller";
const surfaces = ["terminal", "desktop"] as const;

const codex: CodexSnapshot = {
  books: [
    {
      name: "Hollow",
      entries: [
        {
          id: "lore/tallow-stair",
          title: "The Tallow Stair",
          keys: ["stair", "chandlers"],
          label: "",
          text: "A crooked stair where the **chandlers** work.",
          history: ["Scene 1: Corwin climbed it before dawn."],
        },
        {
          id: "lore/saint-ash",
          title: "Saint Ash",
          keys: ["ash"],
          label: "Rumour",
          text: "They say she walks the quay at night.",
          secret: "She is Mira's mother.",
          history: [],
        },
      ],
    },
    {
      name: "Saltmere",
      entries: [
        {
          id: "lore/crown-vote",
          title: "The Crown Vote",
          keys: ["vote"],
          label: "",
          text: "The Five Houses choose a regent.",
          history: [],
        },
      ],
    },
  ],
  characters: [
    {
      id: "character/mira",
      name: "Mira Tessaly",
      tags: ["chandler", "fence"],
      appearance: "Soot on her cuffs, a burn scar across one palm.",
    },
  ],
  names: [
    { name: "The Tallow Stair", id: "lore/tallow-stair" },
    { name: "Tallow Stair", id: "lore/tallow-stair" },
    { name: "Saint Ash", id: "lore/saint-ash" },
    { name: "Crown Vote", id: "lore/crown-vote" },
    { name: "Mira Tessaly", id: "character/mira" },
    { name: "Mira", id: "character/mira" },
  ],
};

const stage: StageSnapshot = {
  storyteller: "Vex",
  persona: "Corwin Hale",
  scene: {
    number: 1,
    title: "Arrival",
    location: "Tessaly's Chandlery, the Tallow Stair",
    time: "An hour before dawn",
    mood: null,
    now: "Corwin has come to ask Mira about the Crown Vote.",
    path: "/stories/hollow/scenes/001-arrival/scene.md",
    present: [
      { stem: "mira", name: "Mira Tessaly", portrait: null, tags: ["chandler"] },
      { stem: "hesketh", name: "Hesketh Crane", portrait: null, tags: [] },
    ],
    widgets: [],
  },
  speakers: [{ stem: "mira", name: "Mira Tessaly" }],
};

type World = { runs: string[]; opened: Record<string, unknown>[] };

function world(on: On): World {
  const w: World = { runs: [], opened: [] };
  on("process.run", (_$, e) => {
    const script = e.argv[1] ?? "";
    w.runs.push(script.split("/").at(-1) ?? script);
    const out = script.endsWith("/codex.ts") ? codex : stage;
    return {
      value: {
        exitCode: 0,
        stdout: JSON.stringify(out),
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  on("ui.open", (_$, e) => {
    w.opened.push({ ...e });
    return { value: { isPlaced: true } };
  });
  on("ui.scroll", () => ({}));
  on("ui.focus", () => ({}));
  on("ui.panes", () => ({ value: [] }));
  on("ui.log", () => ({ value: undefined }));
  return w;
}

function run($: Engine, args = "") {
  return $.command.run({
    command: "storyteller:codex",
    args,
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 160 },
  });
}

function mountPane($: Engine, surface: (typeof surfaces)[number]) {
  return $.ui.mount({
    plugin,
    surface,
    component: "Pane",
    requestId: "codex",
    props: {
      title: "Codex",
      isFocused: true,
      bodyColumns: 70,
      placement: "dock" as const,
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
    viewport: { columns: 160, rows: 40, isFullscreen: true },
  });
}

describe("/storyteller:codex", () => {
  test("reads codex.ts and opens a focused dialog pane on the index", async ($, on) => {
    const w = world(on);
    await run($);
    expect(w.runs).toEqual(["codex.ts"]);
    expect(w.opened).toEqual([
      expect.objectContaining({ id: "codex", title: "Codex", focus: true, closeOnEscape: true }),
    ]);
    for (const surface of surfaces) {
      const ui = await mountPane($, surface);
      expect(await ui.find({ key: "search" })).toBeDefined();
      expect(await ui.find({ type: "Text", text: "Hollow" })).toBeDefined();
      expect(await ui.find({ type: "Text", text: "Saltmere" })).toBeDefined();
      expect(await ui.find({ type: "Text", text: "Characters" })).toBeDefined();
      expect((await ui.find({ key: "entry:lore/saint-ash" }))?.text).toContain("Rumour: Saint Ash");
      expect((await ui.find({ key: "entry:lore/tallow-stair" }))?.text).toContain(
        "The Tallow Stair",
      );
      expect(await ui.find({ key: "entry:character/mira" })).toBeDefined();
      await ui.unmount();
    }
  });

  test("the search filters titles and keys as you type", async ($, on) => {
    world(on);
    await run($);
    const ui = await mountPane($, "terminal");
    await ui.input({ key: "search", text: "VOTE", kind: "change" });
    expect(await ui.find({ key: "entry:lore/crown-vote" })).toBeDefined();
    expect(await ui.find({ key: "entry:lore/tallow-stair" })).toBeUndefined();
    expect(await ui.find({ type: "Text", text: "Hollow" })).toBeUndefined();
    await ui.input({ key: "search", text: "chandlers", kind: "change" });
    expect(await ui.find({ key: "entry:lore/tallow-stair" })).toBeDefined();
    expect(await ui.find({ key: "entry:lore/crown-vote" })).toBeUndefined();
    await ui.input({ key: "search", text: "zzz", kind: "change" });
    expect(await ui.find({ text: 'Nothing matches "zzz".' })).toBeDefined();
    // Enter opens the first match.
    await ui.input({ key: "search", text: "ash" });
    expect(await ui.find({ key: "back" })).toBeDefined();
    expect(await ui.find({ text: "Rumour: Saint Ash" })).toBeDefined();
    await ui.unmount();
  });

  test("an entry shows its book, text, Secret when known, History, and goes back", async ($, on) => {
    world(on);
    await run($);
    for (const surface of surfaces) {
      const ui = await mountPane($, surface);
      await ui.press({ key: "entry:lore/tallow-stair" });
      expect(await ui.find({ type: "Text", text: "The Tallow Stair" })).toBeDefined();
      expect(await ui.find({ type: "Text", text: "Hollow" })).toBeDefined();
      expect(await ui.find({ type: "Markdown", text: /crooked stair/ })).toBeDefined();
      expect(await ui.find({ type: "Text", text: "Secret" })).toBeUndefined();
      expect(await ui.find({ type: "Text", text: "History" })).toBeDefined();
      expect(await ui.find({ text: "- Scene 1: Corwin climbed it before dawn." })).toBeDefined();
      await ui.press({ key: "back" });
      expect(await ui.find({ key: "search" })).toBeDefined();
      await ui.press({ key: "entry:lore/saint-ash" });
      expect(await ui.find({ type: "Text", text: "Rumour: Saint Ash" })).toBeDefined();
      expect(await ui.find({ type: "Text", text: "Secret" })).toBeDefined();
      expect(await ui.find({ type: "Markdown", text: /Mira's mother/ })).toBeDefined();
      expect(await ui.find({ type: "Text", text: "History" })).toBeUndefined();
      await ui.press({ key: "back" });
      await ui.unmount();
    }
  });

  test("a character shows name, tags and appearance only", async ($, on) => {
    world(on);
    await run($);
    const ui = await mountPane($, "terminal");
    await ui.press({ key: "entry:character/mira" });
    expect(await ui.find({ type: "Text", text: "Mira Tessaly" })).toBeDefined();
    expect(await ui.find({ type: "Text", text: "chandler, fence" })).toBeDefined();
    expect(await ui.find({ type: "Text", text: "Appearance" })).toBeDefined();
    expect(await ui.find({ type: "Markdown", text: /burn scar/ })).toBeDefined();
    await ui.unmount();
  });

  test("an id opens that entry; an unknown id opens the index", async ($, on) => {
    world(on);
    await run($, "lore/crown-vote");
    let ui = await mountPane($, "terminal");
    expect(await ui.find({ type: "Text", text: "The Crown Vote" })).toBeDefined();
    await ui.unmount();
    await run($, "lore/forgotten");
    ui = await mountPane($, "terminal");
    expect(await ui.find({ key: "back" })).toBeUndefined();
    expect(await ui.find({ key: "search" })).toBeDefined();
    await ui.unmount();
  });

  test("outside a story the pane says so", async ($, on) => {
    on("process.run", () => ({
      value: {
        exitCode: 0,
        stdout: "null",
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }));
    on("ui.open", () => ({ value: { isPlaced: true } }));
    await run($);
    const ui = await mountPane($, "terminal");
    expect(await ui.find({ text: "No story codex to show here." })).toBeDefined();
    await ui.unmount();
  });
});

// The reply and the scene pane read the stage value; the codex value is
// filled as at session start, by running the command once.
function withStage(on: On) {
  on("state.get", { plugin, key: "stage" }, () => ({ value: { value: stage, version: 1 } }));
}

describe("glossary links", () => {
  const reply = [
    "*The Tallow Stair, an hour before dawn.*",
    "Rain runs down the Tallow Stair. Mira is not at her vats; the Crown Vote is all anyone talks of, and Mira Tessaly knows it.",
    'Mira sets the cup down. "Saint Ash walks tonight," she says.',
    "(( The Crown Vote is in nine days. ))",
  ].join("\n\n");

  test("narration links the first mention of each name; dialogue, setting and asides do not", async ($, on) => {
    world(on);
    withStage(on);
    await run($);
    for (const surface of surfaces) {
      const ui = await $.ui.mount({
        plugin,
        surface,
        component: "AssistantMessage",
        props: { text: reply, isFirstOfReply: true },
        viewport: { columns: 100, rows: 40 },
      });
      const prose = await ui.find({ type: "Markdown", key: "prose:1" });
      expect(prose?.props.text).toBe(
        "Rain runs down [the Tallow Stair](https://codex.invalid/lore/tallow-stair). " +
          "[Mira](https://codex.invalid/character/mira) is not at her vats; the " +
          "[Crown Vote](https://codex.invalid/lore/crown-vote) is all anyone talks of, and Mira Tessaly knows it.",
      );
      expect(prose?.props.pressableLinks).toEqual([
        "https://codex.invalid/lore/tallow-stair",
        "https://codex.invalid/character/mira",
        "https://codex.invalid/lore/crown-vote",
      ]);
      expect(await ui.find({ type: "Text", text: "Saint Ash walks tonight" })).toBeDefined();
      expect(await ui.find({ text: /codex\.invalid\/lore\/saint-ash/ })).toBeUndefined();
      const aside = await ui.find({ type: "Markdown", text: /nine days/ });
      expect(aside?.props.text).toBe("(( The Crown Vote is in nine days. ))");
      await ui.unmount();
    }
  });

  test("pressing a link opens the codex at that entry", async ($, on) => {
    const w = world(on);
    withStage(on);
    await run($);
    w.opened = [];
    const ui = await $.ui.mount({
      plugin,
      surface: "terminal",
      component: "AssistantMessage",
      props: { text: "Rain runs down the Tallow Stair.", isFirstOfReply: true },
      viewport: { columns: 100, rows: 40, isFullscreen: true },
    });
    await ui.press({
      key: "prose:0",
      link: { href: "https://codex.invalid/lore/tallow-stair" },
    });
    await ui.unmount();
    expect(w.opened).toEqual([expect.objectContaining({ id: "codex", focus: true })]);
    const pane = await mountPane($, "terminal");
    expect(await pane.find({ key: "back" })).toBeDefined();
    expect(await pane.find({ type: "Markdown", text: /crooked stair/ })).toBeDefined();
    await pane.unmount();
  });

  test("the scene pane's names in Now and Present are buttons into the codex", async ($, on) => {
    const w = world(on);
    withStage(on);
    await run($);
    w.opened = [];
    for (const surface of surfaces) {
      const ui = await $.ui.mount({
        plugin,
        surface,
        component: "Pane",
        requestId: "scene",
        props: {
          title: "Scene",
          isFocused: false,
          bodyColumns: 60,
          placement: "dock" as const,
          scroll: { offset: 0, bodyRows: 40 },
          view: {},
        },
        viewport: { columns: 160, rows: 40, isFullscreen: true },
      });
      expect((await ui.find({ key: "present:character/mira" }))?.text).toBe("Mira Tessaly");
      // A character the codex does not list stays plain text.
      expect(await ui.find({ key: "present:character/hesketh" })).toBeUndefined();
      expect(await ui.find({ text: /Hesketh Crane/ })).toBeDefined();
      expect((await ui.find({ key: "now:lore/tallow-stair" }))?.text).toBe("the Tallow Stair");
      expect((await ui.find({ key: "now:character/mira" }))?.text).toBe("Mira");
      expect((await ui.find({ key: "now:lore/crown-vote" }))?.text).toBe("Crown Vote");
      await ui.press({ key: "present:character/mira" });
      await ui.unmount();
    }
    expect(w.opened.length).toBe(2);
    const pane = await mountPane($, "terminal");
    expect(await pane.find({ type: "Text", text: "Appearance" })).toBeDefined();
    await pane.unmount();
  });
});
