import { describe, expect, test } from "bun:test";
import path from "node:path";
import { type StatusInput, type StoryFacts, sourceTable } from "./status-sources.ts";
import {
  bar,
  defaultLayout,
  type Instance,
  loadLayout,
  parseInstance,
  parseLayout,
  renderInstance,
  renderLayout,
  statusLines,
} from "./statusline-layout.ts";
import { tempDir } from "./testing/fixtures.ts";

const input: StatusInput = {
  model: { display_name: "Opus 5.5" },
  effort: { level: "medium" },
  context_window: { used_percentage: 34 },
  rate_limits: { five_hour: { used_percentage: 14 }, seven_day: { used_percentage: 36 } },
};
const facts: StoryFacts = {
  storyTitle: "Build Failed Successfully",
  storyteller: "Vex",
  sceneNumber: 1,
  sceneTitle: "Spawn Point",
  persona: "asset1",
  register: "copilot",
  notesAgo: 2,
  log: "logged",
};

// The spec's example: the first line joined by the default, the second by its own.
const two = {
  lines: [
    [
      { type: "text", source: "turn.register" },
      { type: "text", label: "You", source: "persona.name" },
      { type: "text", source: "scene.title" },
    ],
    {
      separator: " · ",
      widgets: [
        { type: "meter", label: "ctx", source: "session.context_pct", max: 100, width: 10 },
        { type: "meter", label: "5h", source: "usage.session_pct" },
        { type: "meter", label: "wk", source: "usage.weekly_pct", width: 5 },
        { type: "counter", label: "notes", source: "notes.age", suffix: " ago" },
        { type: "text", label: "log", source: "log.ok" },
      ],
    },
  ],
};

// Labels and separators bright black, values bold, meters by usage.
const dark = (s: string) => `\x1b[90m${s}\x1b[39m`;
const light = (s: string) => `\x1b[1m${s}\x1b[22m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const pipe = dark(" | ");
const dot = dark(" · ");

const render = (raw: Record<string, unknown>, value: string | number | undefined) => {
  const parsed = parseInstance(raw);
  if (typeof parsed === "string") throw new Error(parsed);
  return renderInstance(parsed, value);
};

describe("rendering per type", () => {
  test("text: the value, or label: value, label dark and value light", () => {
    expect(render({ type: "text", source: "turn.register" }, "narrator")).toBe(light("narrator"));
    expect(render({ type: "text", source: "persona.name", label: "Persona" }, "asset1")).toBe(
      "\x1b[90mPersona:\x1b[39m \x1b[1masset1\x1b[22m",
    );
  });

  test("meter: a dark label, a bar of width cells and the percent, or value/max", () => {
    expect(render({ type: "meter", source: "session.context_pct", label: "ctx" }, 34)).toBe(
      `${dark("ctx")} ${green("▰▰▰▱▱▱▱▱▱▱ 34%")}`,
    );
    expect(render({ type: "meter", source: "usage.weekly_pct", width: 4 }, 100)).toBe(
      red("▰▰▰▰ 100%"),
    );
    expect(render({ type: "meter", source: "notes.age", max: 8, width: 4, label: "n" }, 2)).toBe(
      `${dark("n")} ${green("▰▱▱▱ 2/8")}`,
    );
    expect(render({ type: "meter", source: "notes.age", max: 8 }, "never")).toBeUndefined();
  });

  test("meter colour follows the fill: green under 60, yellow to 80, red above", () => {
    const ctx = { type: "meter", source: "session.context_pct", label: "ctx" };
    expect(render(ctx, 59)).toBe(`${dark("ctx")} ${green("▰▰▰▰▰▰▱▱▱▱ 59%")}`);
    expect(render(ctx, 60)).toBe(`${dark("ctx")} ${yellow("▰▰▰▰▰▰▱▱▱▱ 60%")}`);
    expect(render(ctx, 80)).toBe(`${dark("ctx")} ${yellow("▰▰▰▰▰▰▰▰▱▱ 80%")}`);
    expect(render(ctx, 81)).toBe(`${dark("ctx")} ${red("▰▰▰▰▰▰▰▰▱▱ 81%")}`);
  });

  test("a value/max meter is coloured by its ratio", () => {
    const n = { type: "meter", source: "notes.age", max: 8, width: 4 };
    expect(render(n, 4)).toBe(green("▰▰▱▱ 4/8"));
    expect(render(n, 5)).toBe(yellow("▰▰▰▱ 5/8"));
    expect(render(n, 7)).toBe(red("▰▰▰▰ 7/8"));
  });

  test("thresholds override the defaults; color false leaves no codes", () => {
    const ctx = { type: "meter", source: "session.context_pct", width: 4, thresholds: [30, 50] };
    expect(render(ctx, 29)).toBe(green("▰▱▱▱ 29%"));
    expect(render(ctx, 30)).toBe(yellow("▰▱▱▱ 30%"));
    expect(render(ctx, 50)).toBe(yellow("▰▰▱▱ 50%"));
    expect(render(ctx, 51)).toBe(red("▰▰▱▱ 51%"));
    const plain = render({ ...ctx, label: "ctx", color: false }, 95);
    expect(plain).toBe("ctx ▰▰▰▰ 95%");
    expect(plain).not.toContain("\x1b");
  });

  test("counter: label: value with suffix; a word in place of the number keeps no suffix", () => {
    const counter = { type: "counter", source: "notes.age", label: "notes", suffix: " ago" };
    expect(render(counter, 2)).toBe(`${dark("notes:")} ${light("2 ago")}`);
    expect(render(counter, "never")).toBe(`${dark("notes:")} ${light("never")}`);
    expect(render({ type: "counter", source: "scene.number" }, 3)).toBe(light("3"));
  });

  test("clock as value/of", () => {
    expect(render({ type: "clock", source: "scene.number", of: 6, label: "Act" }, 2)).toBe(
      `${dark("Act")} ${light("2/6")}`,
    );
    expect(render({ type: "clock", source: "scene.number", of: 6 }, 9)).toBe(light("6/6"));
  });

  test("list and tags", () => {
    expect(render({ type: "list", source: "persona.name", label: "Cast" }, "Corwin")).toBe(
      `${dark("Cast:")} ${light("Corwin")}`,
    );
    expect(render({ type: "tags", source: "persona.name", label: "x" }, "Corwin")).toBe(
      light("Corwin"),
    );
  });

  test("a source with no value leaves the widget out", () => {
    expect(render({ type: "text", source: "session.model" }, undefined)).toBeUndefined();
  });

  test("bar", () => {
    expect(bar(0.5, 4)).toBe("▰▰▱▱");
    expect(bar(2, 3)).toBe("▰▰▰");
  });
});

test("the spec's two-line layout: the default separator, then the line's own", () => {
  const parsed = parseLayout(two);
  if (!parsed.ok) throw new Error(parsed.error);
  expect(parsed.layout.lines[1]?.separator).toBe(" · ");
  expect(renderLayout(parsed.layout, input, facts)).toEqual([
    [light("copilot"), `${dark("You:")} ${light("asset1")}`, light("Spawn Point")].join(pipe),
    [
      `${dark("ctx")} ${green("▰▰▰▱▱▱▱▱▱▱ 34%")}`,
      `${dark("5h")} ${green("▰▱▱▱▱▱▱▱▱▱ 14%")}`,
      `${dark("wk")} ${green("▰▰▱▱▱ 36%")}`,
      `${dark("notes:")} ${light("2 ago")}`,
      `${dark("log:")} ${light("✓")}`,
    ].join(dot),
  ]);
  // On an API key there is no plan usage: those meters drop out.
  expect(renderLayout(parsed.layout, { context_window: { used_percentage: 34 } }, facts)[1]).toBe(
    [
      `${dark("ctx")} ${green("▰▰▰▱▱▱▱▱▱▱ 34%")}`,
      `${dark("notes:")} ${light("2 ago")}`,
      `${dark("log:")} ${light("✓")}`,
    ].join(dot),
  );
});

describe("validation", () => {
  const error = (instance: Record<string, unknown>) => {
    const parsed = parseLayout({ lines: [[{ type: "text", source: "scene" }, instance]] });
    return parsed.ok ? undefined : parsed.error;
  };

  test("errors name the line, the widget and the fix", () => {
    expect(error({ type: "gauge", source: "scene" })).toBe(
      'line 1, widget 2: type "gauge" is unknown: one of text, counter, meter, clock, list, tags',
    );
    expect(error({ type: "text", source: "hp" })).toBe('line 1, widget 2: unknown source "hp"');
    expect(error({ type: "text" })).toBe("line 1, widget 2: needs a source");
    expect(error({ type: "meter", source: "persona.name" })).toBe(
      "line 1, widget 2: a meter cannot show persona.name (text): use text, list, tags",
    );
    expect(error({ type: "meter", source: "notes.age" })).toBe(
      "line 1, widget 2: a meter of notes.age needs max",
    );
    expect(error({ type: "meter", source: "usage.weekly_pct", width: 0 })).toContain("width");
    const meter = { type: "meter", source: "usage.weekly_pct" };
    const thresholds = "line 1, widget 2: thresholds must be two ascending percents, as [60, 80]";
    expect(error({ ...meter, thresholds: [80, 60] })).toBe(thresholds);
    expect(error({ ...meter, thresholds: [60] })).toBe(thresholds);
    expect(error({ ...meter, thresholds: [60, 120] })).toBe(thresholds);
    expect(error({ ...meter, thresholds: "60,80" })).toBe(thresholds);
    expect(error({ ...meter, color: "no" })).toBe("line 1, widget 2: color must be true or false");
    expect(error({ type: "text", source: "scene", color: false })).toBe(
      "line 1, widget 2: a text takes no color",
    );
    expect(error({ type: "clock", source: "scene.number" })).toContain("a clock needs of");
    expect(error({ type: "text", source: "scene", max: 3 })).toBe(
      "line 1, widget 2: a text takes no max",
    );
    expect(error({ type: "text", source: "scene", label: 3 })).toContain("label must be text");
  });

  test("the file's shape", () => {
    expect(parseLayout([]).ok).toBe(false);
    expect(parseLayout({ lines: [] }).ok).toBe(false);
    expect(parseLayout({ lines: ["x"] })).toEqual({
      ok: false,
      error: "line 1 is not a list of widgets",
    });
    const lineError = (line: unknown) => {
      const parsed = parseLayout({ lines: [line] });
      return parsed.ok ? undefined : parsed.error;
    };
    expect(lineError({ separator: " · " })).toBe('line 1 needs "widgets": a list of widgets');
    expect(lineError({ separator: 3, widgets: [] })).toBe("line 1: separator must be text");
    expect(lineError({ sep: " · ", widgets: [] })).toBe(
      "line 1 takes no sep: only separator and widgets",
    );
    expect(lineError({ widgets: [{ type: "text" }] })).toBe("line 1, widget 1: needs a source");
    expect(parseLayout({ lines: [{ separator: " / ", widgets: [] }] })).toEqual({
      ok: true,
      layout: { lines: [{ widgets: [], separator: " / " }] },
    });
  });

  test("a valid instance keeps only its fields", () => {
    const parsed: Instance | string = parseInstance({
      type: "meter",
      source: "session.context_pct",
      max: 100,
      width: 12,
      label: "ctx",
      thresholds: [50, 90],
      color: true,
    });
    expect(parsed).toEqual({
      type: "meter",
      source: "session.context_pct",
      max: 100,
      width: 12,
      label: "ctx",
      thresholds: [50, 90],
      color: true,
    });
  });
});

describe("statusLines", () => {
  const who = [
    `${dark("Model:")} ${light("Opus 5.5 (medium)")}`,
    `${dark("Narrator:")} ${light("Vex (copilot)")}`,
    `${dark("Persona:")} ${light("asset1")}`,
    `${dark("Story:")} ${light("Build Failed Successfully")}`,
    `${dark("Scene:")} ${light("Scene 1: Spawn Point")}`,
  ].join(pipe);
  const health = [
    `${dark("ctx")} ${green("▰▰▰▱▱▱▱▱▱▱ 34%")}`,
    `${dark("5h")} ${green("▰▱▱▱▱▱▱▱▱▱ 14%")}`,
    `${dark("wk")} ${green("▰▰▰▰▱▱▱▱▱▱ 36%")}`,
    `${dark("notes:")} ${light("2 ago")}`,
    `${dark("log:")} ${light("✓")}`,
  ].join(pipe);
  // ESC spelled out first: biome refuses control characters in a regex.
  const strip = (s: string) => s.replaceAll("\x1b", "ESC").replaceAll(/ESC\[\d+m/g, "");

  test("the default, with no file: model, who and where, then health, and no hint", () => {
    expect(statusLines({ kind: "none" }, input, facts)).toEqual([who, health]);
    expect(strip(who)).toBe(
      "Model: Opus 5.5 (medium) | Narrator: Vex (copilot) | Persona: asset1 | Story: Build Failed Successfully | Scene: Scene 1: Spawn Point",
    );
  });

  test("the default leaves out what has no value: plan usage on an API key", () => {
    const apiKey: StatusInput = { context_window: { used_percentage: 34 } };
    expect(strip(statusLines({ kind: "none" }, apiKey, facts)[1] ?? "")).toBe(
      "ctx ▰▰▰▱▱▱▱▱▱▱ 34% | notes: 2 ago | log: ✓",
    );
  });

  test("the default is a valid layout, every instance labelled", () => {
    expect(parseLayout(JSON.parse(JSON.stringify(defaultLayout)))).toEqual({
      ok: true,
      layout: defaultLayout,
    });
    for (const line of defaultLayout.lines) {
      for (const instance of line.widgets) expect(instance.label).toBeTruthy();
    }
  });

  test("a broken file: the default and the error, dimmed, once", () => {
    expect(statusLines({ kind: "error", error: 'unknown source "hp"' }, input, facts)).toEqual([
      who,
      `${health} \x1b[2m(statusline.json: unknown source "hp")\x1b[22m`,
    ]);
  });

  test("loadLayout: missing, bad JSON, invalid, valid", async () => {
    const dir = await tempDir();
    expect(await loadLayout(`${dir}/none.json`)).toEqual({ kind: "none" });
    await Bun.write(`${dir}/bad.json`, "{ lines: ");
    const bad = await loadLayout(`${dir}/bad.json`);
    expect(bad.kind === "error" && bad.error.startsWith("not valid JSON")).toBe(true);
    await Bun.write(`${dir}/invalid.json`, JSON.stringify({ lines: [[{ type: "text" }]] }));
    expect(await loadLayout(`${dir}/invalid.json`)).toEqual({
      kind: "error",
      error: "line 1, widget 1: needs a source",
    });
    await Bun.write(`${dir}/ok.json`, JSON.stringify(two));
    expect((await loadLayout(`${dir}/ok.json`)).kind).toBe("ok");
  });
});

// The spec's catalog is sourceTable()'s output pasted in: regenerate it with
// `bun -e 'import { sourceTable } from "./src/status-sources.ts"; console.log(sourceTable())'`.
test("spec 19.5 holds the source catalog and the default layout exactly", async () => {
  const spec = (await Bun.file(path.join(import.meta.dir, "../docs/spec.md")).text()).replace(
    /\r\n/g,
    "\n",
  );
  expect(spec).toContain(sourceTable());
  const layouts = [...spec.matchAll(/```json\n([\s\S]*?)```/g)]
    .map((m) => m[1] ?? "")
    .filter((block) => block.includes('"lines"'))
    .map((block) => parseLayout(JSON.parse(block)));
  expect(layouts.length).toBeGreaterThan(1);
  for (const parsed of layouts) expect(parsed.ok ? "valid" : parsed.error).toBe("valid");
  expect(layouts).toContainEqual({ ok: true, layout: defaultLayout });
});
