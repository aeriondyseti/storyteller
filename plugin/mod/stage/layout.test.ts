import { describe, expect, test } from "claude-code/testing";
import type { StageScene, StageWidget } from "../types";
import {
  BAR,
  besidePortrait,
  clip,
  fit,
  frame,
  frameBottom,
  framed,
  frameInner,
  frameTop,
  groupHeading,
  joinWrap,
  type Line,
  labelled,
  namedPanes,
  pad,
  padStart,
  paneChanges,
  paneId,
  paneWidgets,
  planPane,
  planText,
  truncate,
  widgetGroups,
  widgetRow,
  widgetText,
  wrap,
} from "./layout.ts";

describe("text helpers", () => {
  test("wrap breaks at words and collapses whitespace", () => {
    expect(wrap("the tide\nis   coming in", 10)).toEqual(["the tide", "is coming", "in"]);
    expect(wrap("", 10)).toEqual([]);
  });

  test("wrap splits a word longer than the width", () => {
    expect(wrap("abcdefghij kl", 4)).toEqual(["abcd", "efgh", "ij", "kl"]);
    for (const line of wrap("a verylongwordindeed here", 6))
      expect(line.length).toBeLessThanOrEqual(6);
  });

  test("truncate ends in an ellipsis only when it cuts", () => {
    expect(truncate("Mira", 10)).toBe("Mira");
    expect(truncate("Mira Tessaly", 6)).toBe("Mira…");
    expect(truncate("Mira", 0)).toBe("");
  });

  test("pad and padStart fill to the width, cutting what overflows", () => {
    expect(pad("tide", 6)).toBe("tide  ");
    expect(padStart("4", 3)).toBe("  4");
    expect(pad("a long name", 6)).toBe("a lon…");
  });

  test("clip keeps room for an ellipsis on the last kept line", () => {
    expect(clip(["one", "two"], 3, 10)).toEqual({ lines: ["one", "two"], cut: false });
    expect(clip(["abcdefghij", "k"], 1, 10)).toEqual({ lines: ["abcdefghi"], cut: true });
  });

  test("fit cuts runs to the width and keeps their styles", () => {
    const line = fit(
      [
        { text: "● ", color: "red" },
        { text: "Hesketh Crane", color: "red" },
      ],
      8,
    );
    expect(line.map((r) => r.text).join("")).toBe("● Heske…");
    expect(line[1]?.color).toBe("red");
  });

  test("a labelled value hangs under its first line", () => {
    const lines = labelled("Where", "The upper gallery of the counting room", 20).map((l) =>
      l.map((r) => r.text).join(""),
    );
    expect(lines).toEqual(["Where The upper", "      gallery of the", "      counting room"]);
  });
});

const base = { note: null, color: null, pane: null, group: null };
const widget = (w: Partial<StageWidget> & Pick<StageWidget, "name" | "type" | "value">) =>
  ({ ...base, ...w }) as StageWidget;

const scene: StageScene = {
  number: 2,
  title: "Low Tide",
  location: "The Tallow Stair",
  time: null,
  mood: "uneasy",
  now: "word ".repeat(200),
  path: "/s/scene.md",
  present: [{ stem: "mira", name: "Mira", portrait: "/s/mira.png", tags: ["chandler"] }],
  widgets: [
    {
      ...base,
      name: "tide",
      type: "counter",
      value: 4,
      note: "rising; the barges float at six and the stair floods at eight",
    },
    { ...base, name: "debt", type: "text", value: "3 crowns" },
    { ...base, name: "Powers found", type: "list", value: ["parry"], pane: "Powers" },
  ],
};
const color = () => "#fff";
const flat = (line: Line) => line.map((r) => r.text).join("");
const rowText = (w: StageWidget, columns: number) => {
  const row = widgetRow(w, columns);
  return [...row.lines, ...row.note].map(flat);
};

describe("pane plan", () => {
  test("sections in order; absent facts left out; named-pane widgets left out", () => {
    const plan = planPane(scene, { columns: 30, rows: 80, portraits: false }, "#fff", color);
    const lines = planText(plan, 30).split("\n");
    expect(lines[0]).toBe("Scene 2 · Low Tide");
    expect(lines[1]).toBe("─".repeat(30));
    expect(lines.some((l) => l.includes("When"))).toBe(false);
    const top = (title: string) => `┌─ ${title} ${"─".repeat(30 - title.length - 5)}┐`;
    const order = ["Now", "Present", "Widgets"].map((t) => lines.indexOf(top(t)));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Now is shown whole: its title edge, a padding row, every wrapped line,
    // another padding row, its bottom edge.
    expect(plan.now.length).toBeGreaterThan(8);
    expect((order[1] ?? 0) - (order[0] ?? 0)).toBe(plan.now.length + 4);
    expect(lines[(order[0] ?? 0) + 1]).toBe(`│${" ".repeat(28)}│`);
    expect(lines[(order[1] ?? 0) - 2]).toBe(`│${" ".repeat(28)}│`);
    expect(lines[(order[1] ?? 0) - 1]).toBe(`└${"─".repeat(28)}┘`);
    expect(lines.at(-1)).toBe(`└${"─".repeat(28)}┘`);
    expect(lines).toContain(`│ debt  3 crowns${" ".repeat(12)} │`);
    expect(lines).toContain(`│ tide  4${" ".repeat(19)} │`);
    expect(lines.some((l) => l.includes("Powers") || l.includes("parry"))).toBe(false);
    // Every line is the pane's width or less; every framed line exactly it.
    for (const l of lines) expect([...l].length).toBeLessThanOrEqual(30);
    for (const l of lines.slice(order[0])) expect([...l].length).toBe(30);
  });

  test("Now holds where, when and mood, a blank row, then the prose, dim", () => {
    const at = (s: StageScene) =>
      planPane(s, { columns: 30, rows: 80, portraits: false }, "#fff", color);
    const short = { ...scene, time: "dusk", now: "The tide is turning." };
    const lines = planText(at(short), 30).split("\n");
    const now = lines.indexOf(`┌─ Now ${"─".repeat(22)}┐`);
    expect(lines.slice(now, now + 9)).toEqual([
      `┌─ Now ${"─".repeat(22)}┐`,
      `│${" ".repeat(28)}│`,
      `│ Where The Tallow Stair${" ".repeat(4)} │`,
      `│ When  dusk${" ".repeat(16)} │`,
      `│ Mood  uneasy${" ".repeat(14)} │`,
      `│${" ".repeat(28)}│`,
      `│ The tide is turning.${" ".repeat(6)} │`,
      `│${" ".repeat(28)}│`,
      `└${"─".repeat(28)}┘`,
    ]);
    // Labels dim, values in the body colour; the prose dim like a widget's note.
    const plan = at(short);
    expect(plan.now[0]?.[0]?.dim).toBe(true);
    expect(plan.now[0]?.[1]?.dim).toBeUndefined();
    expect(plan.now.at(-1)).toEqual([{ text: "The tide is turning.", dim: true }]);
    // No prose: just the facts, no blank row. Nothing at all: no frame.
    expect(at({ ...short, now: null }).now.map(flat)).toEqual([
      "Where The Tallow Stair",
      "When  dusk",
      "Mood  uneasy",
    ]);
    const bare = { ...short, location: null, time: null, mood: null, now: null };
    expect(at(bare).now).toEqual([]);
    expect(planText(at(bare), 30)).not.toContain("Now");
  });

  test("framed content is laid out four cells narrower than the pane", () => {
    expect(frameInner(30)).toBe(26);
    const plan = planPane(scene, { columns: 30, rows: 80, portraits: false }, "#fff", color);
    for (const l of plan.now) expect([...flat(l)].length).toBeLessThanOrEqual(26);
    const meter = widget({ name: "Health", type: "meter", value: 5, max: 10 });
    const [group] = planPane(
      { ...scene, widgets: [meter] },
      { columns: 30, rows: 80, portraits: false },
      "#fff",
      color,
    ).widgets;
    expect(flat(group?.rows[0]?.lines[0] ?? [])).toBe("Health  ▰▰▰▰▰▱▱▱▱▱ 5/10");
    expect(flat(framed([{ text: "hi" }], 16))).toBe(`│ hi${" ".repeat(10)} │`);
    expect(flat(frameTop("Now", 16))).toBe("┌─ Now ────────┐");
    expect(flat(frameBottom(16))).toBe(`└${"─".repeat(14)}┘`);
    expect(frame("Now", [], 16)).toEqual([]);
    expect(frame("Now", [[{ text: "hi" }]], 16).map(flat)).toEqual([
      "┌─ Now ────────┐",
      `│${" ".repeat(14)}│`,
      `│ hi${" ".repeat(10)} │`,
      `│${" ".repeat(14)}│`,
      `└${"─".repeat(14)}┘`,
    ]);
  });

  test("the frame and its title are dim; the content keeps its own styles", () => {
    const line = framed([{ text: "9", bold: true, color: "#d4a017" }], 20);
    expect(line[0]).toEqual({ text: "│ ", dim: true });
    expect(line[1]).toEqual({ text: "9", bold: true, color: "#d4a017" });
    expect(line.at(-1)).toEqual({ text: " │", dim: true });
    expect(frameTop("Now", 20)[0]?.dim).toBe(true);
  });

  test("a portrait row keeps the frame's right edge in line", () => {
    const plan = planPane(scene, { columns: 80, rows: 80, portraits: true }, "#fff", color);
    const lines = planText(plan, 80).split("\n");
    const img = lines.find((l) => l.startsWith("│ [img]"));
    expect(img?.endsWith(" │")).toBe(true);
    expect([...(img ?? "")].length).toBe(80);
    // Image (6) + one space + this line + the right edge fill the inside.
    const w = frameInner(80) - 6 - 1;
    expect([...flat(besidePortrait([{ text: "Mira" }], w))].length).toBe(w + 3);
  });

  test("a portrait only on a wide pane, when the surface draws images", () => {
    const at = (columns: number, portraits: boolean) =>
      planPane(scene, { columns, rows: 80, portraits }, "#fff", color).present[0]?.portrait;
    expect(at(80, true)).toBe("/s/mira.png");
    expect(at(48, true)).toBeNull();
    expect(at(80, false)).toBeNull();
  });

  test("height never shrinks anything: the pane scrolls", () => {
    const plan = (rows: number) =>
      planPane(scene, { columns: 30, rows, portraits: false }, "#fff", color);
    const tall = plan(60);
    const short = plan(5);
    expect(short.now).toEqual(tall.now);
    expect(short.widgets).toEqual(tall.widgets);
    expect(short.widgets[0]?.rows[0]?.note.length).toBeGreaterThan(1);
    expect(short.present).toEqual(tall.present);
  });

  test("a snapshot from before widgets draws no widgets section", () => {
    const { widgets: _, ...old } = scene;
    const plan = planPane(
      old as StageScene,
      { columns: 30, rows: 60, portraits: false },
      "#fff",
      color,
    );
    expect(plan.widgets).toEqual([]);
  });
});

// The redesign the player approved, at 48 columns: frames padded top and
// bottom, group headings over a rule, one name column, values in their own.
const spawn: StageScene = {
  number: 1,
  title: "Spawn Point",
  location: "Placeholderton, looping endlessly",
  time: "12:00, permanently",
  mood: "Breakneck, looping, absurd",
  now: "Sir Aldric is chasing asset1 down a street that repeats every forty feet.",
  path: "/s/scene.md",
  present: [
    { stem: "aldric", name: "Sir Aldric", portrait: null, tags: ["npc", "former protagonist"] },
  ],
  widgets: [
    widget({
      name: "HP",
      type: "meter",
      value: 100,
      max: 100,
      group: "asset1",
      color: "#c0392b",
      note: "Cartoon damage. Carrots heal 30.",
    }),
    widget({
      name: "Inventory",
      type: "text",
      value: "Thing Shard (1/40)",
      group: "asset1",
      note: "It takes 40 shards to make the Thing.",
    }),
    widget({
      name: "Powers",
      type: "list",
      value: ["dialogue wheel", "parry", "double jump (misfires)"],
      group: "asset1",
    }),
    widget({
      name: "Status",
      type: "tags",
      value: ["auto-running", "the base", "2D", "secretly the player"],
      group: "asset1",
      color: "#8e44ad",
      note: "Conditions currently on asset1.",
    }),
    widget({
      name: "Sir Aldric",
      type: "meter",
      value: 9999,
      max: 9999,
      group: "The fight",
      note: "The Forsaken Blade. Blind, chicken on his helm.",
    }),
    widget({
      name: "Knight Run",
      type: "text",
      value: "503 m · 31 coins · 1 gem",
      group: "The fight",
    }),
    widget({
      name: "Dev Notices",
      type: "clock",
      value: 4,
      of: 6,
      group: "The world",
      color: "#d4a017",
      note: "How close the Dev is to realizing the player is asset1.",
    }),
    widget({
      name: "Reputation",
      type: "counter",
      value: -50,
      group: "The world",
      note: "Lost for exploding Marnie's apples.",
    }),
  ],
};
const spawnPlan = (columns: number) =>
  planPane(spawn, { columns, rows: 80, portraits: false }, "#fff", color);

describe("the approved layout", () => {
  test("at 48 columns the pane is exactly the mock", () => {
    expect(planText(spawnPlan(48), 48)).toBe(
      [
        "Scene 1 · Spawn Point",
        "────────────────────────────────────────────────",
        "┌─ Now ────────────────────────────────────────┐",
        "│                                              │",
        "│ Where Placeholderton, looping endlessly      │",
        "│ When  12:00, permanently                     │",
        "│ Mood  Breakneck, looping, absurd             │",
        "│                                              │",
        "│ Sir Aldric is chasing asset1 down a street   │",
        "│ that repeats every forty feet.               │",
        "│                                              │",
        "└──────────────────────────────────────────────┘",
        "┌─ Present ────────────────────────────────────┐",
        "│                                              │",
        "│ ● Sir Aldric  npc, former protagonist        │",
        "│                                              │",
        "└──────────────────────────────────────────────┘",
        "┌─ Widgets ────────────────────────────────────┐",
        "│                                              │",
        "│ ASSET1                                       │",
        "│ ──────────────────────────────────────────── │",
        "│   HP           ▰▰▰▰▰▰▰▰▰▰ 100/100            │",
        "│     Cartoon damage. Carrots heal 30.         │",
        "│   Inventory    Thing Shard (1/40)            │",
        "│     It takes 40 shards to make the Thing.    │",
        "│   Powers       • dialogue wheel              │",
        "│                • parry                       │",
        "│                • double jump (misfires)      │",
        "│   Status       auto-running · the base · 2D  │",
        "│                · secretly the player         │",
        "│     Conditions currently on asset1.          │",
        "│                                              │",
        "│ THE FIGHT                                    │",
        "│ ──────────────────────────────────────────── │",
        "│   Sir Aldric   ▰▰▰▰▰▰▰▰▰▰ 9999/9999          │",
        "│     The Forsaken Blade. Blind, chicken on    │",
        "│     his helm.                                │",
        "│   Knight Run   503 m · 31 coins · 1 gem      │",
        "│                                              │",
        "│ THE WORLD                                    │",
        "│ ──────────────────────────────────────────── │",
        "│   Dev Notices  ◆◆◆◆◇◇ 4/6                    │",
        "│     How close the Dev is to realizing the    │",
        "│     player is asset1.                        │",
        "│   Reputation   -50                           │",
        "│     Lost for exploding Marnie's apples.      │",
        "│                                              │",
        "└──────────────────────────────────────────────┘",
      ].join("\n"),
    );
  });

  test("at 32 columns each widget stacks: name, then value and note four in", () => {
    const text = planText(spawnPlan(32), 32).split("\n");
    const top = text.findIndex((l) => l.startsWith("┌─ Widgets"));
    expect(text.slice(top, top + 13)).toEqual([
      "┌─ Widgets ────────────────────┐",
      "│                              │",
      "│ ASSET1                       │",
      "│ ──────────────────────────── │",
      "│   HP                         │",
      "│       ▰▰▰▰▰▰▰▰▰▰ 100/100     │",
      "│       Cartoon damage.        │",
      "│       Carrots heal 30.       │",
      "│   Inventory                  │",
      "│       Thing Shard (1/40)     │",
      "│       It takes 40 shards to  │",
      "│       make the Thing.        │",
      "│   Powers                     │",
    ]);
    expect(text).toContain("│       · secretly the player  │");
    for (const l of text) expect([...l].length).toBeLessThanOrEqual(32);
    for (const l of text.slice(2)) expect([...l].length).toBe(32);
  });

  test("colour on the value only; names in the body colour; notes dim", () => {
    const groups = spawnPlan(48).widgets;
    const runs = (name: string) => {
      const row = groups
        .flatMap((g) => g.rows)
        .find((r) => r.lines[0]?.some((run) => run.text === name));
      if (!row) throw new Error(name);
      return row;
    };
    const hp = runs("HP");
    const name = hp.lines[0]?.find((r) => r.text === "HP");
    expect(name?.color).toBeUndefined();
    expect(name?.bold).toBeUndefined();
    const bar = hp.lines[0]?.filter((r) => r.text.includes("▰") || r.text.includes("100"));
    expect(bar?.length).toBeGreaterThan(0);
    for (const r of bar ?? []) expect(r.color).toBe("#c0392b");
    // The clock's empty segments are its colour dimmed.
    const clock = runs("Dev Notices").lines[0] ?? [];
    expect(clock.find((r) => r.text === "◆◆◆◆")?.color).toBe("#d4a017");
    expect(clock.find((r) => r.text === "◇◇")).toMatchObject({ color: "#d4a017", dim: true });
    expect(clock.find((r) => r.text === " 4/6")?.color).toBe("#d4a017");
    // Every tag line, continuations too, in the colour; the note after them, dim.
    const status = runs("Status");
    expect(status.lines.length).toBe(2);
    for (const line of status.lines) expect(line.at(-1)?.color).toBe("#8e44ad");
    for (const run of [...hp.note, ...status.note].flat()) {
      expect(run.dim).toBe(true);
      expect(run.color).toBeUndefined();
    }
  });
});

describe("widget rows", () => {
  test("text: the value beside the name, wrapping in the value column", () => {
    const weather = widget({ name: "Weather", type: "text", value: "sleet, turning" });
    expect(rowText(weather, 30)).toEqual(["Weather  sleet, turning"]);
    const long = widget({
      name: "Weather",
      type: "text",
      value: "sleet turning to snow by the third bell",
    });
    expect(rowText(long, 30)).toEqual([
      "Weather  sleet turning to snow",
      "         by the third bell",
    ]);
    expect(rowText(widget({ name: "Debt", type: "text", value: "" }), 30)).toEqual(["Debt  none"]);
  });

  test("counter: left-aligned in the value column, bold", () => {
    const row = widgetRow(widget({ name: "Days to vote", type: "counter", value: 9 }), 40);
    expect(row.lines.map(flat)).toEqual(["Days to vote  9"]);
    expect(row.lines[0]?.at(-1)).toMatchObject({ text: "9", bold: true });
  });

  test("meter: ten cells, then value/max", () => {
    const health = widget({ name: "Health", type: "meter", value: 88, max: 100 });
    expect(rowText(health, 30)).toEqual([`Health  ${BAR.full.repeat(9)}${BAR.empty} 88/100`]);
    // Narrower than ten cells and a count: the bar gives way, the line fits.
    const tight = widgetRow(health, 22, { indent: 0, valueAt: 8 });
    expect(flat(tight.lines[0] ?? [])).toBe(`Health  ${BAR.full.repeat(6)}${BAR.empty} 88/100`);
  });

  test("clock: filled and empty segments, then value/of", () => {
    const clock = widget({ name: "Suspicion", type: "clock", value: 2, of: 6 });
    expect(rowText(clock, 30)).toEqual(["Suspicion  ◆◆◇◇◇◇ 2/6"]);
  });

  test("list: one bullet per item in the value column, long items hanging", () => {
    const list = widget({
      name: "Powers found",
      type: "list",
      value: ["dialogue wheel", "a parry that turns any blade"],
      note: "Found on the road.",
    });
    expect(rowText(list, 40)).toEqual([
      "Powers found  • dialogue wheel",
      "              • a parry that turns any",
      "                blade",
      "  Found on the road.",
    ]);
    expect(rowText(widget({ name: "Clues", type: "list", value: [] }), 30)).toEqual([
      "Clues  none",
    ]);
  });

  test("tags: joined with a dot, a wrapped line opening with the dot", () => {
    const tags = widget({
      name: "Conditions",
      type: "tags",
      value: ["wounded", "hunted", "broke"],
    });
    expect(rowText(tags, 40)).toEqual(["Conditions  wounded · hunted · broke"]);
    expect(rowText(tags, 30)).toEqual(["Conditions  wounded · hunted", "            · broke"]);
    expect(joinWrap(["a", "bb", "cc"], " · ", 6)).toEqual(["a · bb", "· cc"]);
  });

  test("notes start two cells in from the name and wrap whole, dim", () => {
    const row = widgetRow(
      widget({
        name: "Notice",
        type: "clock",
        value: 1,
        of: 6,
        color: "#d4a017",
        note: "A lantern went past the window. When the clock fills, they knock.",
      }),
      24,
    );
    expect(row.lines[0]?.[0]).toEqual({ text: "Notice" });
    expect(row.note.length).toBeGreaterThan(2);
    for (const line of row.note) expect(flat(line)).toMatch(/^ {2}\S/);
    for (const run of row.note.flat()) {
      expect(run.color).toBeUndefined();
      expect(run.dim).toBe(true);
    }
    expect(row.note.map(flat).join(" ").replace(/\s+/g, " ").trim()).toBe(
      "A lantern went past the window. When the clock fills, they knock.",
    );
  });

  test("one name column for the section: grouped and ungrouped values line up", () => {
    const groups = widgetGroups(
      [
        widget({ name: "Gold", type: "counter", value: 3 }),
        widget({ name: "Hit points", type: "meter", value: 5, max: 10, group: "Body" }),
      ],
      40,
    );
    const lines = widgetText(groups, 40);
    expect(lines).toContain("Gold          3");
    expect(lines).toContain(`  Hit points  ${BAR.full.repeat(5)}${BAR.empty.repeat(5)} 5/10`);
  });

  test("the name column is capped; a longer name ends in an ellipsis", () => {
    const groups = widgetGroups(
      [
        widget({ name: "A name far too long for the column", type: "counter", value: 1 }),
        widget({ name: "Short", type: "counter", value: 2 }),
      ],
      40,
    );
    expect(widgetText(groups, 40)).toEqual(["A name far to…  1", "Short           2"]);
  });

  test("too little room beside the names: every widget stacks", () => {
    const groups = widgetGroups(
      [
        widget({ name: "Gold", type: "counter", value: 3, note: "In the purse." }),
        widget({ name: "Wounds", type: "list", value: ["a cut"], group: "Body" }),
      ],
      20,
    );
    expect(widgetText(groups, 20)).toEqual([
      "Gold",
      "    3",
      "    In the purse.",
      "",
      "BODY",
      "─".repeat(20),
      "  Wounds",
      "      • a cut",
    ]);
  });

  test("groups in order of first appearance, the ungrouped first", () => {
    const groups = widgetGroups(
      [
        widget({ name: "a", type: "counter", value: 1, group: "Body" }),
        widget({ name: "b", type: "counter", value: 2 }),
        widget({ name: "c", type: "counter", value: 3, group: "Purse" }),
        widget({ name: "d", type: "counter", value: 4, group: "Body" }),
      ],
      30,
    );
    expect(groups.map((g) => g.heading)).toEqual([null, "Body", "Purse"]);
    expect(widgetText(groups, 30)).toEqual([
      "b    2",
      "",
      "BODY",
      "─".repeat(30),
      "  a  1",
      "  d  4",
      "",
      "PURSE",
      "─".repeat(30),
      "  c  3",
    ]);
  });

  test("a group heading is upper-case and bold, a dim rule the full width under it", () => {
    expect(groupHeading("The fight", 24)).toEqual([
      [{ text: "THE FIGHT", bold: true }],
      [{ text: "─".repeat(24), dim: true }],
    ]);
    expect(flat(groupHeading("A heading far too long to fit", 12)[0] ?? [])).toBe("A HEADING F…");
  });
});

describe("named panes", () => {
  test("ids are slugs of the pane name, prefixed", () => {
    expect(paneId("Powers")).toBe("widgets-powers");
    expect(paneId("The Crew's Debts!")).toBe("widgets-the-crew-s-debts");
    expect(paneId("Épées")).toBe("widgets-epees");
    expect(paneId("龍")).toMatch(/^widgets-[0-9a-z]+$/);
    expect(paneId("x".repeat(100)).length).toBeLessThanOrEqual(64);
  });

  test("one pane per name, in order of first appearance", () => {
    const widgets = [
      widget({ name: "a", type: "counter", value: 1, pane: "Powers" }),
      widget({ name: "b", type: "counter", value: 1 }),
      widget({ name: "c", type: "counter", value: 1, pane: "Crew" }),
      widget({ name: "d", type: "counter", value: 1, pane: "powers" }),
    ];
    expect(namedPanes(widgets)).toEqual([
      { id: "widgets-powers", title: "Powers" },
      { id: "widgets-crew", title: "Crew" },
    ]);
    expect(paneWidgets(widgets, "widgets-powers").map((w) => w.name)).toEqual(["a", "d"]);
  });

  test("open what is wanted and not up, close only our panes no widget names", () => {
    const wanted = [
      { id: "widgets-powers", title: "Powers" },
      { id: "widgets-crew", title: "Crew" },
    ];
    expect(paneChanges(wanted, ["scene", "widgets-crew", "widgets-old"], [])).toEqual({
      open: [{ id: "widgets-powers", title: "Powers" }],
      close: ["widgets-old"],
    });
    // Shut by hand: left shut while its widgets stay.
    expect(paneChanges(wanted, [], ["widgets-powers"]).open).toEqual([
      { id: "widgets-crew", title: "Crew" },
    ]);
  });
});
