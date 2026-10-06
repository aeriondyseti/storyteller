// The player's status line layout (spec 19.5): ~/.claude-roleplay/statusline.json
// holds lines of widget instances, each bound to a source from the catalog in
// src/status-sources.ts. This file validates the layout and renders it to
// text; plugin/statusline.ts reads the file and gathers the facts.
//
//   { "lines": [ [ { "type": "text", "label": "Persona", "source": "persona.name" } ] ] }

import path from "node:path";
import { rpHome } from "./paths.ts";
import {
  findSource,
  kindSuits,
  type SourceValue,
  type StatusInput,
  type StoryFacts,
} from "./status-sources.ts";
import { maxClockSegments, type WidgetType, widgetTypeNames } from "./widgets.ts";

export type Instance = {
  type: WidgetType;
  source: string;
  label?: string;
  // meter: the value's ceiling (a percent source needs none); width: bar cells.
  max?: number;
  width?: number;
  // meter colour (spec 19.5): green below thresholds[0], yellow up to and
  // including thresholds[1], red above; color false leaves it uncoloured.
  thresholds?: [number, number];
  color?: boolean;
  // clock: the number of segments.
  of?: number;
  // counter: text after the number, " ago".
  suffix?: string;
};

// In the file a line is a list of widgets, or { "separator": " · ", "widgets": [...] }
// to join that line with something other than the default.
export type Line = { widgets: Instance[]; separator?: string };

export type Layout = { lines: Line[] };

export type LayoutResult = { ok: true; layout: Layout } | { ok: false; error: string };

export const defaultSeparator = " | ";
export const defaultMeterWidth = 10;
export const defaultThresholds: [number, number] = [60, 80];
const maxMeterWidth = 40;

// What a story session shows with no statusline.json: the model, who and
// where, then the session's health. Plan usage is left out on an API key, as
// any widget with no value is.
export const defaultLayout: Layout = {
  lines: [
    {
      widgets: [
        { type: "text", label: "Model", source: "session.model_effort" },
        { type: "text", label: "Narrator", source: "narrator" },
        { type: "text", label: "Persona", source: "persona.name" },
        { type: "text", label: "Story", source: "story.title" },
        { type: "text", label: "Scene", source: "scene" },
      ],
    },
    {
      widgets: [
        { type: "meter", label: "ctx", source: "session.context_pct", width: 10 },
        { type: "meter", label: "5h", source: "usage.session_pct" },
        { type: "meter", label: "wk", source: "usage.weekly_pct" },
        { type: "counter", label: "notes", source: "notes.age", suffix: " ago" },
        { type: "text", label: "log", source: "log.ok" },
      ],
    },
  ],
};

// RP_STATUSLINE overrides the file, as RP_LIBRARY does the library.
export function statuslinePath(): string {
  return process.env.RP_STATUSLINE ?? path.join(rpHome(), "statusline.json");
}

const fields: Record<WidgetType, string[]> = {
  text: [],
  list: [],
  tags: [],
  counter: ["suffix"],
  meter: ["max", "width", "thresholds", "color"],
  clock: ["of"],
};

export function parseLayout(raw: unknown): LayoutResult {
  if (!isRecord(raw) || !Array.isArray(raw.lines) || raw.lines.length === 0) {
    return { ok: false, error: `needs "lines": a list of lines, each a list of widgets` };
  }
  const lines: Line[] = [];
  for (const [l, entry] of raw.lines.entries()) {
    const line = parseLine(entry);
    if (typeof line === "string") return { ok: false, error: `line ${l + 1}${line}` };
    const instances: Instance[] = [];
    for (const [i, item] of line.items.entries()) {
      const parsed = parseInstance(item);
      if (typeof parsed === "string") {
        return { ok: false, error: `line ${l + 1}, widget ${i + 1}: ${parsed}` };
      }
      instances.push(parsed);
    }
    lines.push(
      line.separator === undefined
        ? { widgets: instances }
        : { widgets: instances, separator: line.separator },
    );
  }
  return { ok: true, layout: { lines } };
}

// A line's raw widgets and its separator, or the rest of an error after
// "line N".
function parseLine(raw: unknown): { items: unknown[]; separator?: string } | string {
  if (Array.isArray(raw)) return { items: raw };
  if (!isRecord(raw)) return " is not a list of widgets";
  const extra = Object.keys(raw).find((k) => k !== "widgets" && k !== "separator");
  if (extra) return ` takes no ${extra}: only separator and widgets`;
  if (!Array.isArray(raw.widgets)) return ` needs "widgets": a list of widgets`;
  if (raw.separator === undefined) return { items: raw.widgets };
  if (typeof raw.separator !== "string") return ": separator must be text";
  return { items: raw.widgets, separator: raw.separator };
}

// One instance, or what is wrong with it in a few words: the error is shown
// on the status line itself.
export function parseInstance(raw: unknown): Instance | string {
  if (!isRecord(raw)) return "a widget is an object with a type and a source";
  const type = widgetTypeNames.find((t) => t === raw.type);
  if (!type) {
    const given = raw.type === undefined ? "needs a type" : `type "${String(raw.type)}" is unknown`;
    return `${given}: one of ${widgetTypeNames.join(", ")}`;
  }
  if (typeof raw.source !== "string") return "needs a source";
  const source = findSource(raw.source);
  if (!source) return `unknown source "${raw.source}"`;
  if (!kindSuits[source.kind].includes(type)) {
    return `a ${type} cannot show ${source.name} (${source.kind}): use ${kindSuits[source.kind].join(", ")}`;
  }
  const allowed = new Set(["type", "source", "label", ...fields[type]]);
  const extra = Object.keys(raw).find((k) => !allowed.has(k));
  if (extra) return `a ${type} takes no ${extra}`;

  const instance: Instance = { type, source: source.name };
  for (const key of ["label", "suffix"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (typeof v !== "string") return `${key} must be text`;
    instance[key] = v;
  }
  if (type === "meter") {
    if (raw.max === undefined) {
      if (source.kind !== "percent") return `a meter of ${source.name} needs max`;
    } else if (typeof raw.max !== "number" || !(raw.max > 0)) {
      return "max must be a number above 0";
    } else instance.max = raw.max;
    if (raw.width !== undefined) {
      const w = raw.width;
      if (typeof w !== "number" || !Number.isInteger(w) || w < 1 || w > maxMeterWidth) {
        return `width must be a whole number from 1 to ${maxMeterWidth}`;
      }
      instance.width = w;
    }
    if (raw.thresholds !== undefined) {
      const t = raw.thresholds;
      if (
        !Array.isArray(t) ||
        t.length !== 2 ||
        !t.every((n) => typeof n === "number" && n >= 0 && n <= 100) ||
        !(t[0] < t[1])
      ) {
        return "thresholds must be two ascending percents, as [60, 80]";
      }
      instance.thresholds = [t[0], t[1]];
    }
    if (raw.color !== undefined) {
      if (typeof raw.color !== "boolean") return "color must be true or false";
      instance.color = raw.color;
    }
  }
  if (type === "clock") {
    const of = raw.of;
    if (typeof of !== "number" || !Number.isInteger(of) || of < 1 || of > maxClockSegments) {
      return `a clock needs of: a whole number from 1 to ${maxClockSegments}`;
    }
    instance.of = of;
  }
  return instance;
}

// One instance as text, or undefined when its source has no value now (no
// plan usage on an API key, no scene yet): the widget is left out.
export function renderInstance(instance: Instance, value: SourceValue): string | undefined {
  if (value === undefined || value === "") return undefined;
  const label = instance.label?.trim() ?? "";
  // label + glue + value, the label dark and the value light; the value
  // alone when the instance has no label.
  const named = (glue: string, text: string) =>
    label ? `${dark(`${label}${glue}`)} ${light(text)}` : light(text);
  switch (instance.type) {
    case "text":
    case "list":
      return named(":", String(value));
    case "tags":
      return light(String(value));
    case "counter":
      // A word in place of the number (notes never) takes no suffix.
      return named(":", typeof value === "number" ? `${value}${instance.suffix ?? ""}` : value);
    case "clock": {
      if (typeof value !== "number") return undefined;
      const of = instance.of ?? 1;
      return named("", `${clamp(Math.round(value), 0, of)}/${of}`);
    }
    case "meter": {
      if (typeof value !== "number") return undefined;
      const isPercent = findSource(instance.source)?.kind === "percent";
      const max = instance.max ?? 100;
      const shown = clamp(value, 0, max);
      const tail = isPercent && max === 100 ? `${shown}%` : `${shown}/${max}`;
      const plain = `${bar(shown / max, instance.width ?? defaultMeterWidth)} ${tail}`;
      // color false: no codes at all for this meter, label included.
      if (instance.color === false) return label ? `${label} ${plain}` : plain;
      const meter = paint(plain, (shown / max) * 100, instance.thresholds ?? defaultThresholds);
      return label ? `${dark(label)} ${meter}` : meter;
    }
  }
}

// Standard SGR codes, so the terminal's theme decides the exact shade.
// Labels and separators are bright black (90); values are bold in the
// default colour, which reads on dark and light themes alike, where bright
// white (97) would vanish on a light one.
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const red = "\x1b[31m";
const reset = "\x1b[0m";
export const dark = (text: string) => `\x1b[90m${text}\x1b[39m`;
export const light = (text: string) => `\x1b[1m${text}\x1b[22m`;

export function paint(text: string, percent: number, [warn, alarm]: [number, number]): string {
  const colour = percent < warn ? green : percent <= alarm ? yellow : red;
  return `${colour}${text}${reset}`;
}

export function bar(fraction: number, width: number): string {
  const filled = Math.round(clamp(fraction, 0, 1) * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

// Each layout line joined with its separator, dark; a line whose widgets all
// have no value is left out.
export function renderLayout(layout: Layout, input: StatusInput, facts: StoryFacts): string[] {
  return layout.lines
    .map((line) =>
      line.widgets
        .map((instance) => {
          const value = findSource(instance.source)?.resolve(input, facts);
          return renderInstance(instance, value);
        })
        .filter((part): part is string => part !== undefined)
        .join(dark(line.separator ?? defaultSeparator)),
    )
    .filter(Boolean);
}

export type LoadedLayout =
  | { kind: "none" }
  | { kind: "ok"; layout: Layout }
  | { kind: "error"; error: string };

// A missing file is the default; a broken one is reported, never thrown.
export async function loadLayout(file = statuslinePath()): Promise<LoadedLayout> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return { kind: "none" };
  let raw: unknown;
  try {
    raw = JSON.parse(await handle.text());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind: "error", error: `not valid JSON (${reason})` };
  }
  const parsed = parseLayout(raw);
  return parsed.ok ? { kind: "ok", layout: parsed.layout } : { kind: "error", error: parsed.error };
}

const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;

// The lines to print. With no file, the default; with a broken one, the
// default and the error, dimmed, after its last line.
export function statusLines(loaded: LoadedLayout, input: StatusInput, facts: StoryFacts): string[] {
  if (loaded.kind === "ok") return renderLayout(loaded.layout, input, facts);
  const lines = renderLayout(defaultLayout, input, facts);
  if (loaded.kind === "none") return lines;
  const error = dim(`(statusline.json: ${loaded.error})`);
  const last = lines.pop();
  return [...lines, last ? `${last} ${error}` : error];
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
