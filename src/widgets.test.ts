import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  loadWidgets,
  migrateTracker,
  migrateTrackers,
  parseWidget,
  renderNamedWidgetLine,
  renderWidgetLine,
  serializeWidgets,
  toPlainWidget,
  type Widget,
  widgetKey,
  widgetTable,
  widgetTypeNames,
  widgetTypes,
  widgetValueText,
} from "./widgets.ts";

const ok = (name: string, raw: unknown): Widget => {
  const parsed = parseWidget(name, raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.widget;
};
const error = (name: string, raw: unknown): string => {
  const parsed = parseWidget(name, raw);
  if (parsed.ok) throw new Error(`${name} was expected to fail`);
  return parsed.error;
};

describe("parseWidget", () => {
  test("each type, with the spec's examples", () => {
    expect(ok("Weather", { type: "text", value: "sleet, turning" })).toEqual({
      type: "text",
      value: "sleet, turning",
    });
    expect(ok("Days to vote", { type: "counter", value: 9 })).toEqual({
      type: "counter",
      value: 9,
    });
    expect(
      ok("Health", { type: "meter", value: 88, max: 100, color: "#c0392b", group: "Body" }),
    ).toEqual({ type: "meter", value: 88, max: 100, color: "#c0392b", group: "Body" });
    expect(
      ok("Suspicion", { type: "clock", value: 2, of: 6, note: "The night clerk heard something." }),
    ).toEqual({ type: "clock", value: 2, of: 6, note: "The night clerk heard something." });
    expect(
      ok("Powers found", { type: "list", value: ["dialogue wheel", "parry"], pane: "Powers" }),
    ).toEqual({ type: "list", value: ["dialogue wheel", "parry"], pane: "Powers" });
    expect(ok("Conditions", { type: "tags", value: ["wounded", " hunted ", ""] })).toEqual({
      type: "tags",
      value: ["wounded", "hunted"],
    });
  });

  test("forgiving where the meaning is plain", () => {
    expect(ok("Days", { type: "counter", value: "9" })).toEqual({ type: "counter", value: 9 });
    expect(ok("Gold", { type: "text", value: 12 })).toEqual({ type: "text", value: "12" });
    expect(ok("Clues", { type: "list", value: "a torn map" })).toEqual({
      type: "list",
      value: ["a torn map"],
    });
    expect(ok("X", { type: "text", value: "y", note: "  ", color: "", pane: "" })).toEqual({
      type: "text",
      value: "y",
    });
    expect(ok("X", { type: "text", value: "y", color: "#ABC" }).color).toBe("#ABC");
  });

  test("refusals name the fix", () => {
    expect(error("Health", { type: "meter", value: 88 })).toBe(
      "Health: meter needs max: the value is drawn as a bar out of it",
    );
    expect(error("Health", { type: "meter", value: 120, max: 100 })).toContain("outside 0 to 100");
    expect(error("Health", { type: "meter", value: 1, max: 0 })).toContain("max must be above 0");
    expect(error("Suspicion", { type: "clock", value: 2 })).toContain("clock needs of");
    expect(error("Suspicion", { type: "clock", value: 7, of: 6 })).toContain("outside 0 to 6");
    expect(error("Suspicion", { type: "clock", value: 1.5, of: 6 })).toContain(
      "segments are filled",
    );
    expect(error("Suspicion", { type: "clock", value: 1, of: 40 })).toContain("from 1 to 12");
    expect(error("Days", { type: "counter", value: "nine" })).toContain(
      "put words in a text widget",
    );
    expect(error("Days", { type: "counter", value: 9, max: 10 })).toContain("use a meter");
    expect(error("Days", { type: "counter", value: 9, of: 10 })).toContain("use a clock");
    expect(error("X", { value: 1 })).toBe(
      "X: needs a type: one of text, counter, meter, clock, list, tags",
    );
    expect(error("X", { type: "gauge", value: 1 })).toContain('type "gauge" is unknown');
    expect(error("X", { type: "text", value: "y", color: "red" })).toContain("hex colour");
    expect(error("X", { type: "text", value: "y", color: "#abcd" })).toContain("hex colour");
    expect(error("X", { type: "text", value: "y", note: 3 })).toBe("X: note must be text");
    expect(error("X", { type: "list", value: [{ a: 1 }] })).toContain("a list of short items");
    expect(error("X", 5)).toContain("a mapping");
  });
});

describe("trackers migrate", () => {
  test("numbers become counters, everything else text", () => {
    expect(migrateTracker({ value: 9, note: "Houses meet." })).toEqual({
      type: "counter",
      value: 9,
      note: "Houses meet.",
    });
    expect(migrateTracker({ value: "3 crowns", note: undefined })).toEqual({
      type: "text",
      value: "3 crowns",
    });
  });

  test("a whole block, in order, bare values too", () => {
    const widgets = migrateTrackers({ debt: { value: "3 crowns", note: "owed" }, tide: 4 });
    expect(Object.keys(widgets)).toEqual(["debt", "tide"]);
    expect(widgets.tide).toEqual({ type: "counter", value: 4 });
    expect(migrateTrackers(undefined)).toEqual({});
  });
});

describe("loadWidgets", () => {
  test("never throws: an invalid entry loads as text with a warning", () => {
    const { widgets, warnings } = loadWidgets({
      Health: { type: "meter", value: 88, note: "Bleeding." },
      Days: { type: "counter", value: 9 },
      Clues: { type: "list", value: ["a", "b"] },
    });
    expect(Object.keys(widgets)).toEqual(["Health", "Days", "Clues"]);
    expect(widgets.Health).toEqual({ type: "text", value: "88", note: "Bleeding." });
    expect(widgets.Days).toEqual({ type: "counter", value: 9 });
    expect(warnings).toEqual([
      "Health: meter needs max: the value is drawn as a bar out of it (shown as text until fixed)",
    ]);
  });

  test("a block that is not a mapping is ignored with a warning", () => {
    expect(loadWidgets(["x"]).warnings).toHaveLength(1);
    expect(loadWidgets(undefined)).toEqual({ widgets: {}, warnings: [] });
  });
});

describe("rendering", () => {
  const widgets: Record<string, Widget> = {
    Weather: { type: "text", value: "sleet, turning" },
    "Days to vote": { type: "counter", value: 9 },
    Health: { type: "meter", value: 88, max: 100 },
    Suspicion: { type: "clock", value: 2, of: 6 },
    Powers: { type: "list", value: ["wheel", "parry"] },
    Conditions: { type: "tags", value: ["wounded", "hunted", "broke"] },
  };

  test("the status line form from the spec table", () => {
    const lines = Object.entries(widgets).map(([n, w]) => renderWidgetLine(n, w));
    expect(lines).toEqual([
      "Weather sleet, turning",
      "Days to vote 9",
      "Health 88/100",
      "Suspicion 2/6",
      "Powers: wheel, parry",
      "wounded · hunted · broke",
    ]);
  });

  test("the named form puts the name on tags; empty lists say so", () => {
    expect(renderNamedWidgetLine("Conditions", { type: "tags", value: ["wounded"] })).toBe(
      "Conditions: wounded",
    );
    expect(renderNamedWidgetLine("Health", { type: "meter", value: 1, max: 2 })).toBe("Health 1/2");
    expect(widgetValueText({ type: "list", value: [] })).toBe("(none)");
  });

  test("plain JSON for the pane: nulls, never missing keys", () => {
    expect(toPlainWidget("Health", { type: "meter", value: 88, max: 100, color: "#c33" })).toEqual({
      name: "Health",
      type: "meter",
      value: 88,
      max: 100,
      note: null,
      color: "#c33",
      pane: null,
      group: null,
    });
  });
});

describe("serializeWidgets", () => {
  test("fixed field order, unset fields dropped, round-trips through parseWidget", () => {
    const widgets: Record<string, Widget> = {
      Health: { group: "Body", note: "n", max: 100, value: 88, type: "meter" },
      Days: { type: "counter", value: 9 },
    };
    const out = serializeWidgets(widgets);
    expect(Object.keys(out)).toEqual(["Health", "Days"]);
    expect(Object.keys(out.Health as object)).toEqual(["type", "value", "max", "note", "group"]);
    expect(out.Days).toEqual({ type: "counter", value: 9 });
    expect(loadWidgets(out).widgets).toEqual(widgets);
  });
});

describe("the catalog", () => {
  test("covers every type and matches the skill's table", async () => {
    expect(Object.keys(widgetTypes).sort()).toEqual([...widgetTypeNames].sort());
    const skill = await Bun.file(
      path.join(import.meta.dir, "../plugin/skills/invent-and-record/SKILL.md"),
    ).text();
    expect(skill.replace(/\r\n/g, "\n")).toContain(widgetTable());
  });

  test("names match ignoring case", () => {
    expect(widgetKey({ "Days to vote": 1 }, " days TO vote ")).toBe("Days to vote");
    expect(widgetKey({ a: 1 }, "b")).toBeUndefined();
  });
});
