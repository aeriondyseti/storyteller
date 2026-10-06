import type { On } from "claude-code";
import { describe, expect, mock, test } from "claude-code/testing";
import type { StageSnapshot, StageWidget } from "./types";

const unset = { note: null, color: null, pane: null, group: null };

// The stage's drawings, through the engine's own test kit (`claude plugin
// test`, via `bun scripts/test-mod.ts`). The kit has no files or processes, so the
// snapshot plugin/scene.ts would print is answered from here, beneath the mod.

const snapshot: StageSnapshot = {
  storyteller: "Vex",
  persona: "Corwin Hale",
  scene: {
    number: 1,
    title: "Arrival",
    location: "Tessaly's Chandlery, the Tallow Stair",
    time: "An hour before dawn",
    mood: "Cold, guarded",
    now: "Corwin has climbed the Tallow Stair\nin the dark to Mira's chandlery.",
    path: "/stories/hollow/scenes/001-arrival/scene.md",
    present: [
      {
        stem: "mira",
        name: "Mira Tessaly",
        portrait: "/stories/hollow/assets/mira.png",
        tags: ["chandler", "fence"],
      },
    ],
    widgets: [
      {
        ...unset,
        name: "Days to the Crown Vote",
        type: "counter",
        value: 9,
        note: "The Five Houses meet.",
      },
    ],
  },
  speakers: [
    { stem: "mira", name: "Mira Tessaly" },
    { stem: "hesketh", name: "Hesketh Crane" },
  ],
};

// A busy scene: a long place, a long "now", four on stage, two widgets with notes.
const busy: StageSnapshot = {
  ...snapshot,
  scene: {
    number: 4,
    title: "The Counting House",
    location:
      "The upper gallery of the Customs House counting room, above the bonded warehouse on Wrack Quay, Saltmere",
    time: "Past midnight, the third bell",
    mood: "Tense, conspiratorial",
    now: [
      "Corwin and Mira have slipped in through the skylight while the night clerk dozes below.",
      "Aldous has the ledger open on the long table and is reading the Crown's tallies aloud in a whisper,",
      "running a finger down columns that do not add up. Hesketh keeps watch at the stair head,",
      "one hand on the lantern shutter, ready to douse it at the first footstep. Somewhere below a",
      "door bangs in the wind, and everyone freezes. The tide is turning; the bonded barges will be",
      "unloaded at dawn, and with them goes any proof of what the Five Houses have been skimming.",
    ].join(" "),
    path: "/stories/hollow/scenes/004-counting-house/scene.md",
    present: [
      {
        stem: "mira",
        name: "Mira Tessaly",
        portrait: "/stories/hollow/assets/mira.png",
        tags: ["chandler", "fence", "Tallow Stair"],
      },
      { stem: "aldous", name: "Aldous Venn", portrait: null, tags: ["archivist", "old guard"] },
      { stem: "hesketh", name: "Hesketh Crane", portrait: null, tags: [] },
      { stem: "edda", name: "Edda Marsh", portrait: null, tags: ["innkeeper"] },
    ],
    widgets: [
      {
        ...unset,
        name: "Days to the Crown Vote",
        type: "counter",
        value: 9,
        note: "The Five Houses meet in the Moot Hall; every vote bought before then is one Corwin must answer.",
      },
      {
        ...unset,
        name: "Suspicion",
        type: "clock",
        value: 2,
        of: 6,
        note: "The night clerk heard something.",
      },
    ],
  },
};

// The example story's widgets (a counter, a clock with a colour, tags), a
// meter and a list in a group, and one widget in a pane of its own.
const boardWidgets: StageWidget[] = [
  {
    ...unset,
    name: "Days to the Crown Vote",
    type: "counter",
    value: 9,
    note: "The Five Houses meet in the Long Room when this reaches zero.",
  },
  {
    ...unset,
    name: "Lamplighters' notice",
    type: "clock",
    value: 1,
    of: 6,
    color: "#d4a017",
    note: "A lantern went past the window. When the clock fills, they knock.",
  },
  { ...unset, name: "Conditions", type: "tags", value: ["cold", "wanted"] },
  { ...unset, name: "Health", type: "meter", value: 7, max: 10, group: "Body" },
  {
    ...unset,
    name: "Wounds",
    type: "list",
    value: ["a cut on the left arm", "bruised ribs"],
    group: "Body",
  },
  {
    ...unset,
    name: "Powers found",
    type: "list",
    value: ["dialogue wheel", "parry"],
    pane: "Powers",
    group: "Gifts",
  },
];

function withWidgets(widgets: StageWidget[]): StageSnapshot {
  return { ...snapshot, scene: snapshot.scene && { ...snapshot.scene, widgets } };
}
const board = withWidgets(boardWidgets);

const surfaces = ["terminal", "desktop"] as const;
const plugin = "storyteller";

// The test's hooks stand for the engine: the mod's read of its stage value
// finds the snapshot. Registered before the test's first call on `$`.
function withStory(on: On, story: StageSnapshot = snapshot) {
  on("state.get", { plugin, key: "stage" }, () => ({
    value: { value: story, version: 1 },
  }));
}

function paneProps(bodyColumns: number, bodyRows = 60) {
  return {
    title: "Scene",
    isFocused: false,
    bodyColumns,
    placement: "dock" as const,
    scroll: { offset: 0, bodyRows },
    view: {},
  };
}

// Section titles sit in the top edge of their frame: `┌─ Now ───…┐`.
const edge = (title: string) => new RegExp(`^┌─ ${title} ─+┐$`);
const bottom = /^└─+┘$/;

describe("scene pane", () => {
  test("draws title, place, now, cast and widgets", async ($, on) => {
    withStory(on);
    for (const surface of surfaces) {
      const ui = await $.ui.mount({
        plugin,
        surface,
        component: "Pane",
        requestId: "scene",
        props: paneProps(40, 30),
        viewport: { columns: 160, rows: 40, isFullscreen: true },
      });
      expect(await ui.find({ text: "Scene 1 · Arrival" })).toBeDefined();
      expect(await ui.find({ text: /Where\s+Tessaly's Chandlery/ })).toBeDefined();
      expect(await ui.find({ text: /Corwin has climbed the Tallow Stair/ })).toBeDefined();
      expect(await ui.find({ text: /Mira Tessaly {2}chandler, fence/ })).toBeDefined();
      expect(await ui.find({ text: /Days to the… {2}9/ })).toBeDefined();
      expect(await ui.find({ text: /The Five Houses meet/ })).toBeDefined();
      // Under 60 columns a portrait would crowd the name: none is drawn.
      expect(await ui.find({ type: "Image" })).toBeUndefined();
      await ui.unmount();
    }
  });

  test("a busy scene reads in sections, in order, at 48 and 80 columns", async ($, on) => {
    withStory(on, busy);
    for (const surface of surfaces) {
      for (const columns of [48, 80]) {
        const ui = await $.ui.mount({
          plugin,
          surface,
          component: "Pane",
          requestId: "scene",
          props: paneProps(columns),
          viewport: { columns: 160, rows: 60, isFullscreen: true },
        });
        const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
        const at = ["Now", "Present", "Widgets"].map((title) =>
          texts.findIndex((t) => edge(title).test(t)),
        );
        expect(at.every((i) => i >= 0)).toBe(true);
        expect([...at].sort((a, b) => a - b)).toEqual(at);
        expect(texts[0]).toBe("Scene 4 · The Counting House");
        // Where, When and Mood open the Now frame, then a blank framed row, then
        // the prose. Framed lines only: findAll also lists the runs inside them.
        const rows = texts.filter((t) => /^[┌│└].+[┐│┘]$/.test(t));
        const now = rows.findIndex((t) => edge("Now").test(t));
        const nowEnd = rows.findIndex((t, i) => i > now && bottom.test(t));
        const where = rows.findIndex((t) => t.startsWith("│ Where "));
        const when = rows.findIndex((t) => t.startsWith("│ When "));
        const mood = rows.findIndex((t) => t.startsWith("│ Mood "));
        const prose = rows.findIndex((t) => t.startsWith("│ Corwin and Mira"));
        expect(where).toBe(now + 2);
        expect(when).toBeGreaterThan(where);
        expect(mood).toBeGreaterThan(when);
        expect(rows[prose - 1]).toMatch(/^│ +│$/);
        expect(prose).toBeGreaterThan(mood);
        expect(nowEnd).toBeGreaterThan(prose);
        // The prose is dim like a widget's note; the facts' values are not.
        const run = (pattern: RegExp) =>
          ui
            .findAll({ type: "Text", text: pattern })
            .then((all) => all.find((t) => !t.text.startsWith("│")));
        const proseRun = await run(/^Corwin and Mira/);
        expect(proseRun?.props.dimColor).toBe(true);
        expect(proseRun?.props.color).toBeUndefined();
        expect((await run(/^Past midnight/))?.props.dimColor).toBeUndefined();
        // Each section closes before the next opens; the edges span the pane.
        expect(texts.filter((t) => bottom.test(t)).length).toBe(3);
        for (const t of texts.filter((t) => t.startsWith("┌") || t.startsWith("└")))
          expect([...t].length).toBe(columns);
        // The long place wraps under its label; no row is wider than the pane.
        expect(
          texts.filter((t) => t.includes("Counting House") || t.includes("Saltmere")).length,
        ).toBeGreaterThan(0);
        for (const t of texts) expect([...t].length).toBeLessThanOrEqual(columns);
        for (const name of ["Mira Tessaly", "Aldous Venn", "Hesketh Crane", "Edda Marsh"]) {
          expect(await ui.find({ type: "Text", text: name })).toBeDefined();
        }
        expect(
          await ui.find({ type: "Text", text: /^│ Suspicion +◆◆◇◇◇◇ 2\/6 +│$/ }),
        ).toBeDefined();
        const image = await ui.find({ type: "Image" });
        if (surface === "terminal" && columns >= 60) {
          expect(image?.props.alt).toBe("portrait of Mira Tessaly");
        } else expect(image).toBeUndefined();
        await ui.unmount();
      }
    }
  });

  test("a short pane cuts nothing: Now and tracker notes stay whole and scroll", async ($, on) => {
    withStory(on, busy);
    const ui = await $.ui.mount({
      plugin,
      surface: "desktop",
      component: "Pane",
      requestId: "scene",
      props: paneProps(48, 20),
      viewport: { columns: 160, rows: 20, isFullscreen: true },
    });
    const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
    // Only a cast member's tags (to one line) and a widget's name (to the name
    // column) may be cut short; not Now, not a note.
    const present = texts.findIndex((t) => edge("Present").test(t));
    const presentEnd = texts.findIndex((t, i) => i > present && bottom.test(t));
    const outside = [...texts.slice(0, present), ...texts.slice(presentEnd)];
    expect(present).toBeGreaterThan(0);
    const cut = outside.filter((t) => t.includes("…"));
    expect(cut.length).toBeGreaterThan(0);
    for (const t of cut) expect(t).toMatch(/^(│ )?Days to the Cr…/);
    const prose = outside
      .filter((t) => t.startsWith("│"))
      .map((t) => t.slice(1, -1).trim())
      .join(" ")
      .replace(/\s+/g, " ");
    expect(prose).toContain("every vote bought before then is one Corwin must answer.");
    expect(prose).toContain("any proof of what the Five Houses have been skimming.");
    expect(await ui.find({ text: /night clerk heard/ })).toBeDefined();
    expect(await ui.find({ type: "Text", text: "Edda Marsh" })).toBeDefined();
    expect(await ui.find({ type: "Text", text: /^Suspicion/ })).toBeDefined();
    await ui.unmount();
  });

  test("an empty section is left out with its title", async ($, on) => {
    const bare = snapshot.scene && { ...snapshot.scene, now: null, present: [], widgets: [] };
    withStory(on, { ...snapshot, scene: bare });
    const ui = await $.ui.mount({
      plugin,
      surface: "terminal",
      component: "Pane",
      requestId: "scene",
      props: paneProps(40),
      viewport: { columns: 160, rows: 40, isFullscreen: true },
    });
    // No Now text: the Now frame holds just where, when and mood.
    for (const title of ["Present", "Widgets"]) {
      expect(await ui.find({ type: "Text", text: edge(title) })).toBeUndefined();
    }
    const rows = (await ui.findAll({ type: "Text" }))
      .map((t) => t.text)
      .filter((t) => /^[┌│└].+[┐│┘]$/.test(t));
    const now = rows.findIndex((t) => edge("Now").test(t));
    const labels = rows.map((t) => /^│ (Where|When|Mood) /.exec(t)?.[1]);
    expect(labels.filter(Boolean)).toEqual(["Where", "When", "Mood"]);
    expect(labels[now + 2]).toBe("Where");
    // The place wraps under its label; Mood is the last row before the padding.
    expect(rows[labels.indexOf("Mood") + 1]).toMatch(/^│ +│$/);
    expect(rows[labels.indexOf("Mood") + 2]).toMatch(bottom);
    expect(await ui.find({ text: /^│ Mood\s+Cold, guarded +│$/ })).toBeDefined();
    await ui.unmount();
  });

  test("no place, time, mood or Now: no Now frame either", async ($, on) => {
    const empty = snapshot.scene && {
      ...snapshot.scene,
      location: null,
      time: null,
      mood: null,
      now: null,
      present: [],
      widgets: [],
    };
    withStory(on, { ...snapshot, scene: empty });
    const none = await $.ui.mount({
      plugin,
      surface: "terminal",
      component: "Pane",
      requestId: "scene",
      props: paneProps(40),
      viewport: { columns: 160, rows: 40, isFullscreen: true },
    });
    expect(await none.find({ type: "Text", text: edge("Now") })).toBeUndefined();
    expect(await none.find({ type: "Text", text: bottom })).toBeUndefined();
    expect(await none.find({ text: "Scene 1 · Arrival" })).toBeDefined();
    await none.unmount();
  });
});

describe("widgets", () => {
  const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
    (await ui.findAll({ type: "Text" })).map((t) => t.text);

  test("the scene pane draws every type, groups and colour; a named pane's widget is not here", async ($, on) => {
    withStory(on, board);
    for (const surface of surfaces) {
      const ui = await $.ui.mount({
        plugin,
        surface,
        component: "Pane",
        requestId: "scene",
        props: paneProps(48),
        viewport: { columns: 160, rows: 60, isFullscreen: true },
      });
      const all = await texts(ui);
      for (const t of all) expect([...t].length).toBeLessThanOrEqual(48);
      expect(all.some((t) => edge("Widgets").test(t))).toBe(true);
      // One name column: every value starts at the same cell, after the
      // group indent; a name longer than the column ends in an ellipsis.
      const framedRows = all.filter((t) => /^│.*│$/.test(t));
      const rowOf = (pattern: RegExp) => framedRows.find((t) => pattern.test(t));
      const days = rowOf(/^│ Days to the Crow… +9 +│$/);
      const notice = rowOf(/^│ Lamplighters' no… +◆◇◇◇◇◇ 1\/6 +│$/);
      const conditions = rowOf(/^│ Conditions +cold · wanted +│$/);
      const health = rowOf(/^│ {3}Health +▰+▱+ 7\/10 +│$/);
      const wounds = rowOf(/^│ {3}Wounds +• a cut on the left arm +│$/);
      expect(rowOf(/^│ {20}• bruised ribs +│$/)).toBeDefined();
      const valueAt = [
        [days, "9"],
        [notice, "◆"],
        [conditions, "cold"],
        [health, "▰"],
        [wounds, "•"],
      ].map(([row, start]) => row?.indexOf(start ?? "") ?? -1);
      expect(valueAt.every((i) => i === 21)).toBe(true);
      // The group heading, upper-case and bold, then a dim rule across the
      // frame, sits above its widgets, after the ungrouped ones and a blank row.
      const bodyAt = framedRows.indexOf(`│ BODY${" ".repeat(40)} │`);
      expect(framedRows[bodyAt + 1]).toBe(`│ ${"─".repeat(44)} │`);
      const conditionsAt = framedRows.indexOf(conditions ?? "");
      expect(bodyAt).toBeGreaterThan(conditionsAt);
      expect(framedRows.slice(conditionsAt + 1, bodyAt).some((t) => /^│ +│$/.test(t))).toBe(true);
      // Ungrouped rows at the frame's padding, their notes two cells in; every
      // row of the group, wraps and notes included, two cells further in.
      const widgetsAt = framedRows.indexOf(days ?? "");
      for (const t of framedRows.slice(widgetsAt, bodyAt).filter((t) => !/^│ +│$/.test(t)))
        expect(t).toMatch(/^│ \S|^│ {3}\S/);
      const grouped = framedRows.slice(bodyAt + 2).filter((t) => !/^│ +│$/.test(t));
      expect(grouped.length).toBeGreaterThan(2);
      for (const t of grouped) {
        expect(t.startsWith("│   ")).toBe(true);
        expect([...t].length).toBe(48);
      }
      const heading = (await ui.findAll({ type: "Text", text: "BODY" })).find(
        (t) => t.text === "BODY",
      );
      expect(heading?.props.bold).toBe(true);
      expect(heading?.props.underline).toBeUndefined();
      expect(heading?.props.italic).toBeUndefined();
      expect(heading?.props.dimColor).toBeUndefined();
      // The clock's colour on its segments, never on its name; its note dim
      // and uncoloured.
      const runs = await ui.findAll({ type: "Text", text: "◆" });
      expect(runs.find((r) => r.text === "◆")?.props.color).toBe("#d4a017");
      const name = (await ui.findAll({ type: "Text", text: "Lamplighters'" })).find(
        (t) => t.text === "Lamplighters' no…",
      );
      expect(name).toBeDefined();
      expect(name?.props.color).toBeUndefined();
      // The run itself, not the framed line holding it.
      const note = (await ui.findAll({ type: "Text", text: /A lantern went past/ })).find(
        (t) => !t.text.startsWith("│"),
      );
      expect(note?.props.dimColor).toBe(true);
      expect(note?.props.color).toBeUndefined();
      // Powers found lives in its own pane.
      expect(await ui.find({ text: /Powers found|dialogue wheel/ })).toBeUndefined();
      await ui.unmount();

      const powers = await $.ui.mount({
        plugin,
        surface,
        component: "Pane",
        requestId: "widgets-powers",
        props: { ...paneProps(48), title: "Powers" },
        viewport: { columns: 160, rows: 60, isFullscreen: true },
      });
      // Unboxed (the pane is its own frame): the heading, its rule to the edge,
      // then the same two columns as the scene pane.
      const pane = await texts(powers);
      const gifts = pane.indexOf("GIFTS");
      expect(gifts).toBeGreaterThanOrEqual(0);
      expect(pane[gifts + 1]).toBe("─".repeat(48));
      expect(pane).toContain("  Powers found  • dialogue wheel");
      expect(pane).toContain(`${" ".repeat(16)}• parry`);
      expect(await powers.find({ type: "Text", text: /^┌/ })).toBeUndefined();
      expect(await powers.find({ text: /Conditions|Health|Scene 1/ })).toBeUndefined();
      await powers.unmount();
    }
  });

  test("a named pane opens when its first widget appears and closes when the last goes", async ($, on) => {
    const clock = mock.clock(on);
    let story: StageSnapshot = withWidgets(boardWidgets.slice(0, 3));
    const up: string[] = [];
    const opened: string[] = [];
    const closed: string[] = [];
    on("process.run", () => ({
      value: {
        exitCode: 0,
        stdout: JSON.stringify(story),
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }));
    on("ui.panes", () => ({
      value: up.map((id) => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
    }));
    on("ui.open", (_$, e) => {
      if (!up.includes(e.id)) up.push(e.id);
      opened.push(e.id);
      return { value: { isPlaced: true } };
    });
    on("ui.close", (_$, e) => {
      up.splice(up.indexOf(e.id), 1);
      closed.push(e.id);
      return { value: undefined };
    });
    const read = async () => {
      await $.command.run({
        command: "storyteller:scene",
        args: "",
        origin: { kind: "composer" },
        presentation: { isFullscreen: true, columns: 160 },
      });
      // /storyteller:scene reads the story without waiting on it.
      await clock.settle();
    };

    await read();
    expect(opened.filter((id) => id !== "scene")).toEqual([]);

    story = board;
    await read();
    expect(opened.filter((id) => id !== "scene")).toEqual(["widgets-powers"]);
    expect(up).toContain("widgets-powers");

    // Read again with it still there: not opened twice.
    await read();
    expect(opened.filter((id) => id === "widgets-powers").length).toBe(1);

    story = withWidgets(boardWidgets.slice(0, 5));
    await read();
    expect(closed).toEqual(["widgets-powers"]);
    expect(up).not.toContain("widgets-powers");
  });
});

describe("reply", () => {
  const text = [
    "*The Tallow Stair, an hour before dawn.*",
    'Mira sets the cup down. "You\'re late," she says.',
    "The vats tick as they warm.",
    "(( Want me to skip ahead? ))",
  ].join("\n\n");

  test("labels, rules, tints and dims", async ($, on) => {
    withStory(on);
    for (const surface of surfaces) {
      const ui = await $.ui.mount({
        plugin,
        surface,
        component: "AssistantMessage",
        props: { text, isFirstOfReply: true },
        viewport: { columns: 100, rows: 40 },
      });
      const label = await ui.find({ type: "Text", text: "Vex" });
      expect(label?.props.bold).toBe(true);
      expect(
        await ui.find({ type: "Text", text: "The Tallow Stair, an hour before dawn." }),
      ).toBeDefined();
      // find matches by inclusion, outermost first: pick the quote's own run.
      const runs = await ui.findAll({ type: "Text", text: "You're late" });
      const quoted = runs.find((r) => r.text === '"You\'re late,"');
      expect(typeof quoted?.props.color).toBe("string");
      const narration = runs.find((r) => r.text === "Mira sets the cup down. ");
      expect(narration?.props.color).toBeUndefined();
      const aside = await ui.find({ type: "Markdown", text: /skip ahead/ });
      expect(aside?.props.dimColor).toBe(true);
      expect(await ui.find({ type: "Markdown", text: /vats tick/ })).toBeDefined();
      await ui.unmount();
    }
  });

  test("a later block of the reply carries no label", async ($, on) => {
    withStory(on);
    const ui = await $.ui.mount({
      plugin,
      surface: "terminal",
      component: "AssistantMessage",
      props: { text: "The door holds.", isFirstOfReply: false },
    });
    expect(await ui.find({ type: "Text", text: "Vex" })).toBeUndefined();
    await ui.unmount();
  });
});

describe("quiet line and spinner", () => {
  test("a world tool row is one line in voice", async ($, on) => {
    withStory(on);
    for (const surface of surfaces) {
      const ui = await $.ui.mount({
        plugin,
        surface,
        component: "ToolUse",
        props: {
          tool_use_id: "t1",
          tool: "mcp__world__set_widget",
          input: { name: "Days to the Crown Vote", type: "counter", value: 8 },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
        },
      });
      expect(await ui.find({ type: "Text", text: "Vex updates the board." })).toBeDefined();
      await ui.unmount();
    }
  });

  // Beneath the mod the engine draws the spinner; here, its word as text.
  function spinnerAsText(on: On) {
    on("ui.render", { component: "Spinner" }, ($, e) => {
      const { Text } = $.ui.resolve(e);
      return <Text>{e.props.word}</Text>;
    });
  }

  test("the spinner names the Storyteller", async ($, on) => {
    withStory(on);
    spinnerAsText(on);
    for (const [mode, word] of [
      ["responding", "Vex is writing"],
      ["thinking", "Vex is thinking"],
    ] as const) {
      const ui = await $.ui.mount({
        plugin,
        surface: "terminal",
        component: "Spinner",
        props: { word: "Sauteing", message: null, suffix: "…", mode },
      });
      expect((await ui.find({ type: "Text" }))?.text).toBe(word);
      await ui.unmount();
    }
  });

  test("while a card is being read, its character is thinking", async ($, on) => {
    withStory(on);
    spinnerAsText(on);
    on("state.get", { plugin, key: "voicing" }, () => ({
      value: { value: "Mira Tessaly", version: 1 },
    }));
    const ui = await $.ui.mount({
      plugin,
      surface: "terminal",
      component: "Spinner",
      props: { word: "Sauteing", message: null, suffix: "…", mode: "thinking" },
    });
    expect((await ui.find({ type: "Text" }))?.text).toBe("Mira Tessaly is thinking");
    await ui.unmount();
  });

  test("a coding reminder is left out; hook context is not", async ($, on) => {
    on("prompt.attachment", (_$, e) => ({ text: e.text }));
    const todo = await $.prompt.attachment({
      type: "todo_reminder",
      text: "Use the TodoWrite tool",
      origin: { kind: "engine" },
    });
    expect(todo.text).toBeNull();
    const hook = await $.prompt.attachment({
      type: "hook_additional_context",
      text: "[register: narrator]",
      origin: { kind: "hook", event: "UserPromptSubmit" },
    });
    expect(hook.text).toBe("[register: narrator]");
  });
});

// Commands and skills are kept by source (stage/commands.ts):
// ours, the project layer, and a short list of built-ins.
describe("slash commands and skills", () => {
  type Provider = { plugin: string; tier: "core" | "user" };
  const engine: Provider = { plugin: "engine", tier: "core" };
  const project: Provider = { plugin: "project", tier: "user" };
  const ours: Provider = { plugin: "storyteller@inline", tier: "user" };
  const command = (name: string, provider = engine) => ({
    command: name,
    description: name,
    isHidden: false,
    immediate: false,
    provider,
  });

  test("coding built-ins and other plugins are hidden; ours, project and kept built-ins show", async ($, on) => {
    on("command.describe", (_$, e) => ({ description: e.description, isHidden: e.isHidden }));
    const hidden = async (name: string, provider = engine) =>
      (await $.command.describe(command(name, provider))).isHidden;
    for (const name of ["simplify", "code-review", "init", "agents", "memory"]) {
      expect(await hidden(name)).toBe(true);
    }
    expect(await hidden("codex:review", { plugin: "codex", tier: "user" })).toBe(true);
    for (const name of ["clear", "compact", "config", "model", "resume", "rewind", "help"]) {
      expect(await hidden(name)).toBe(false);
    }
    expect(await hidden("storyteller:scene", ours)).toBe(false);
    expect(await hidden("rp-probe", project)).toBe(false);
  });

  test("a hidden skill typed in full is not expanded; a project skill is", async ($, on) => {
    on("command.list", () => ({
      value: [
        { name: "simplify", description: "", source: "builtin" },
        { name: "rp-probe", description: "", source: "user" },
      ],
    }));
    on("skill.prompt", (_$, e) => ({ text: e.text }));
    const simplify = await $.skill.prompt({ skill: "simplify", text: "Review the changed code" });
    expect(simplify.text).not.toContain("Review the changed code");
    expect(simplify.text).toContain("/simplify");
    const probe = await $.skill.prompt({ skill: "rp-probe", text: "Reply with: probe." });
    expect(probe.text).toBe("Reply with: probe.");
    // Not in the command list (user-invocable: false), kept by its prefix.
    const ours = await $.skill.prompt({ skill: "storyteller:scene-close", text: "# Closing" });
    expect(ours.text).toBe("# Closing");
  });

  test("the skill listing keeps ours and the project's, drops the rest", async ($, on) => {
    on("command.list", () => ({
      value: [
        { name: "simplify", description: "", source: "builtin" },
        { name: "rp-probe", description: "", source: "user" },
      ],
    }));
    on("prompt.attachment", (_$, e) => ({ text: e.text }));
    const listing = await $.prompt.attachment({
      type: "skill_listing",
      text: [
        "The following skills are available for use with the Skill tool:",
        "",
        "- storyteller:storyteller-interview: Run the opening interview.",
        "- simplify: Review the changed code.",
        "- rp-probe: A project skill.",
      ].join("\n"),
      origin: { kind: "engine" },
    });
    expect(listing.text).toContain("storyteller:storyteller-interview");
    expect(listing.text).toContain("rp-probe");
    expect(listing.text).not.toContain("simplify");
    const none = await $.prompt.attachment({
      type: "skill_listing",
      text: "The following skills are available for use with the Skill tool:\n\n- simplify: x",
      origin: { kind: "engine" },
    });
    expect(none.text).toBeNull();
  });
});
