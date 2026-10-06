// Widgets (spec 19): small pieces of scene state Vex writes into scene.md and
// the pane draws. This file is the shared definition: the types and their
// fields, validation, the one-line text form the bible and the status line
// use, and the frontmatter shape. Trackers were widgets with no type; old
// `trackers:` blocks migrate through here.

export const widgetTypeNames = ["text", "counter", "meter", "clock", "list", "tags"] as const;
export type WidgetType = (typeof widgetTypeNames)[number];

// Fields every widget may carry. `color` paints the main part of the row,
// never the note; `pane` names a tab; `group` draws a heading (spec 19.4).
export type WidgetCommon = { note?: string; color?: string; pane?: string; group?: string };

export type TextWidget = WidgetCommon & { type: "text"; value: string };
export type CounterWidget = WidgetCommon & { type: "counter"; value: number };
export type MeterWidget = WidgetCommon & { type: "meter"; value: number; max: number };
export type ClockWidget = WidgetCommon & { type: "clock"; value: number; of: number };
export type ListWidget = WidgetCommon & { type: "list"; value: string[] };
export type TagsWidget = WidgetCommon & { type: "tags"; value: string[] };

export type Widget =
  | TextWidget
  | CounterWidget
  | MeterWidget
  | ClockWidget
  | ListWidget
  | TagsWidget;

export type WidgetTypeInfo = { fields: string; use: string };

// The catalog Vex reads: the set_widget description and the invent-and-record
// skill's table are both written from it.
export const widgetTypes: Record<WidgetType, WidgetTypeInfo> = {
  text: {
    fields: "value: a few words",
    use: "A state in words that changes: the weather, a disguise, where the ship is",
  },
  counter: {
    fields: "value: a number",
    use: "A number with no ceiling: days to a vote, crowns owed, flasks of oil",
  },
  meter: {
    fields: "value, max: numbers",
    use: "A number out of a known maximum, drawn as a bar: health, fuel, a hull",
  },
  clock: {
    fields: "value, of: whole numbers",
    use: "Something that happens when it fills, drawn as segments (4, 6 or 8): suspicion, a ritual, pursuit closing in",
  },
  list: {
    fields: "value: short items",
    use: "Things gathered or learned, one per line: powers found, clues, allies",
  },
  tags: {
    fields: "value: one or two words each",
    use: "Conditions that come and go, on one line: wounded, hunted, broke",
  },
};

// The catalog as a markdown table, the form the invent-and-record skill holds.
export function widgetTable(): string {
  const rows = widgetTypeNames.map(
    (t) => `| \`${t}\` | ${widgetTypes[t].fields} | ${widgetTypes[t].use} |`,
  );
  return ["| type | fields | when |", "|---|---|---|", ...rows].join("\n");
}

export const maxClockSegments = 12;

export type ParseResult = { ok: true; widget: Widget } | { ok: false; error: string };

// Validates one widget as written in frontmatter or given to set_widget.
// Errors name the widget and the fix, because Vex reads them and retries.
export function parseWidget(name: string, raw: unknown): ParseResult {
  const fail = (message: string): ParseResult => ({ ok: false, error: `${name}: ${message}` });
  if (!isRecord(raw)) return fail(`a widget is a mapping with a type and a value`);
  const type = widgetTypeNames.find((t) => t === raw.type);
  if (!type) {
    const given = raw.type === undefined ? "needs a type" : `type "${String(raw.type)}" is unknown`;
    return fail(`${given}: one of ${widgetTypeNames.join(", ")}`);
  }
  const common: WidgetCommon = {};
  for (const key of ["note", "pane", "group"] as const) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return fail(`${key} must be text`);
    if (v.trim()) common[key] = v.trim();
  }
  if (raw.color !== undefined && raw.color !== null && raw.color !== "") {
    if (typeof raw.color !== "string" || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.color.trim())) {
      return fail(`color must be a hex colour like "#c0392b" or "#c33"`);
    }
    common.color = raw.color.trim();
  }
  if (type !== "meter" && raw.max !== undefined && raw.max !== null) {
    return fail(`a ${type} takes no max: use a meter for a value out of a maximum`);
  }
  if (type !== "clock" && raw.of !== undefined && raw.of !== null) {
    return fail(`a ${type} takes no of: use a clock for segments that fill`);
  }

  const value = raw.value;
  switch (type) {
    case "text": {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return { ok: true, widget: { type, value: String(value).trim(), ...common } };
      }
      return fail(`text needs value: a few words`);
    }
    case "counter": {
      const n = toNumber(value);
      if (n === undefined) return fail(`counter needs a number value: put words in a text widget`);
      return { ok: true, widget: { type, value: n, ...common } };
    }
    case "meter": {
      const max = toNumber(raw.max);
      if (max === undefined) return fail(`meter needs max: the value is drawn as a bar out of it`);
      if (max <= 0) return fail(`meter max must be above 0`);
      const n = toNumber(value);
      if (n === undefined) return fail(`meter needs a number value, out of max ${max}`);
      if (n < 0 || n > max) {
        return fail(`meter value ${n} is outside 0 to ${max}: change the value or the max`);
      }
      return { ok: true, widget: { type, value: n, max, ...common } };
    }
    case "clock": {
      const of = toNumber(raw.of);
      if (of === undefined) {
        return fail(`clock needs of: the number of segments, usually 4, 6 or 8`);
      }
      if (!Number.isInteger(of) || of < 1 || of > maxClockSegments) {
        return fail(`clock of must be a whole number from 1 to ${maxClockSegments}`);
      }
      const n = toNumber(value);
      if (n === undefined || !Number.isInteger(n)) {
        return fail(`clock needs value: how many of its ${of} segments are filled`);
      }
      if (n < 0 || n > of) return fail(`clock value ${n} is outside 0 to ${of}`);
      return { ok: true, widget: { type, value: n, of, ...common } };
    }
    case "list":
    case "tags": {
      const items = typeof value === "string" ? [value] : value;
      if (!Array.isArray(items) || items.some((i) => isRecord(i) || Array.isArray(i))) {
        return fail(`${type} needs value: a list of short items`);
      }
      const clean = items.map((i) => String(i ?? "").trim()).filter(Boolean);
      return { ok: true, widget: { type, value: clean, ...common } };
    }
  }
}

export type LegacyTracker = { value: string | number; note?: string | undefined };

// A tracker had no type: a number becomes a counter, anything else text.
export function migrateTracker(tracker: LegacyTracker): Widget {
  const note = tracker.note?.trim() ? { note: tracker.note.trim() } : {};
  return typeof tracker.value === "number" && Number.isFinite(tracker.value)
    ? { type: "counter", value: tracker.value, ...note }
    : { type: "text", value: String(tracker.value).trim(), ...note };
}

// A whole `trackers:` block as it was written: `{name: {value, note}}`, or a
// bare value per name.
export function migrateTrackers(raw: unknown): Record<string, Widget> {
  if (!isRecord(raw)) return {};
  const widgets: Record<string, Widget> = {};
  for (const [name, entry] of Object.entries(raw)) {
    const value = isRecord(entry) ? entry.value : entry;
    const note = isRecord(entry) && typeof entry.note === "string" ? entry.note : undefined;
    widgets[name] = migrateTracker({
      value: typeof value === "number" ? value : String(value ?? ""),
      note,
    });
  }
  return widgets;
}

export type WidgetLoad = { widgets: Record<string, Widget>; warnings: string[] };

// A `widgets:` block from disk. Loading never fails: an invalid entry becomes
// a text widget holding its raw value, with a warning saying what to fix.
export function loadWidgets(raw: unknown): WidgetLoad {
  if (raw === undefined || raw === null) return { widgets: {}, warnings: [] };
  if (!isRecord(raw)) {
    return { widgets: {}, warnings: ["widgets: should map each name to a widget; ignored"] };
  }
  const widgets: Record<string, Widget> = {};
  const warnings: string[] = [];
  for (const [name, entry] of Object.entries(raw)) {
    const parsed = parseWidget(name, entry);
    if (parsed.ok) {
      widgets[name] = parsed.widget;
      continue;
    }
    warnings.push(`${parsed.error} (shown as text until fixed)`);
    const value = isRecord(entry) ? entry.value : entry;
    const note = isRecord(entry) && typeof entry.note === "string" ? entry.note.trim() : "";
    widgets[name] = { type: "text", value: stringify(value), ...(note ? { note } : {}) };
  }
  return { widgets, warnings };
}

// The value alone in its short form: "88/100", "wheel, parry".
export function widgetValueText(widget: Widget): string {
  switch (widget.type) {
    case "text":
    case "counter":
      return String(widget.value);
    case "meter":
      return `${widget.value}/${widget.max}`;
    case "clock":
      return `${widget.value}/${widget.of}`;
    case "list":
      return widget.value.join(", ") || "(none)";
    case "tags":
      return widget.value.join(" · ") || "(none)";
  }
}

// The short form, one line, as the status line shows it (spec 19.2): the
// name then the value, a list after a colon, tags with no name at all.
export function renderWidgetLine(name: string, widget: Widget): string {
  const value = widgetValueText(widget);
  if (widget.type === "tags") return value;
  return widget.type === "list" ? `${name}: ${value}` : `${name} ${value}`;
}

// The short form with the name always in it (the tags form has none), for
// lines where the name is the handle: the bible, tool replies.
export function renderNamedWidgetLine(name: string, widget: Widget): string {
  const line = renderWidgetLine(name, widget);
  return widget.type === "tags" ? `${name}: ${line}` : line;
}

// A widget as plain JSON for the pane, which reads it across a process
// boundary: the name inside, and null (never a missing key) for unset fields.
type WidgetBody<W> = W extends Widget ? Omit<W, keyof WidgetCommon> : never;
export type PlainWidget = WidgetBody<Widget> & {
  name: string;
  note: string | null;
  color: string | null;
  pane: string | null;
  group: string | null;
};

export function toPlainWidget(name: string, widget: Widget): PlainWidget {
  const { note, color, pane, group, ...body } = widget;
  return {
    name,
    ...body,
    note: note ?? null,
    color: color ?? null,
    pane: pane ?? null,
    group: group ?? null,
  };
}

// One widget as frontmatter: fields in a fixed order, unset ones left out.
export function serializeWidget(widget: Widget): Record<string, unknown> {
  const out: Record<string, unknown> = { type: widget.type, value: widget.value };
  if (widget.type === "meter") out.max = widget.max;
  if (widget.type === "clock") out.of = widget.of;
  for (const key of ["note", "color", "pane", "group"] as const) {
    if (widget[key] !== undefined) out[key] = widget[key];
  }
  return out;
}

// The `widgets:` block, in the given (draw) order.
export function serializeWidgets(widgets: Record<string, Widget>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(widgets).map(([k, w]) => [k, serializeWidget(w)]));
}

// Widget names are keys Vex types from memory; match them ignoring case.
export function widgetKey(widgets: Record<string, unknown>, name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  return Object.keys(widgets).find((k) => k.toLowerCase() === wanted);
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringify).join(", ");
  return JSON.stringify(value);
}

// Numbers may arrive as text ("9") from a hand edit or a tool call.
function toNumber(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
