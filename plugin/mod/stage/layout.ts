import type { StagePresent, StageScene, StageWidget } from "../types";

// Pure layout behind the scene pane (spec 10): the scene laid out as lines of
// styled runs, already wrapped to the pane's width (or a frame's inside), so
// the drawing only maps lines to Text and the terminal never re-wraps a value
// into one long run. No `$` here, so the tests exercise it directly.

export type Run = { text: string; color?: string; dim?: true; bold?: true };
export type Line = Run[];

export type PresentRow = {
  stem: string;
  name: string;
  color: string;
  // Dim tags, one short line; empty when the card has none.
  tags: string;
  // A portrait drawn left of the name block: only on a wide pane, set by the caller.
  portrait: string | null;
};

// One widget (spec 19.4): its row, which may take several lines (a list, tags
// or text that wrap, a name stacked over its value on a narrow pane), and its
// note, dim, whole, under it.
export type WidgetRow = { lines: Line[]; note: Line[] };
// Widgets sharing a `group`, under its heading; the ungrouped have none.
export type WidgetGroup = { heading: string | null; rows: WidgetRow[] };

// The header spans the pane; Now, Present and Widgets are laid out for the
// inside of a section frame (frameInner), which the caller draws.
export type PanePlan = {
  header: Line[];
  // The Now frame's body: where, when and mood, a blank row, then the prose.
  now: Line[];
  present: PresentRow[];
  // Only the widgets with no pane of their own.
  widgets: WidgetGroup[];
};

export type PaneSize = {
  columns: number;
  rows: number;
  // True where a portrait Image can be drawn beside the name (terminal, wide pane).
  portraits: boolean;
};

export const RULE = "─";
export const ELLIPSIS = "…";
// Image cells beside a name; the rows are also what such a row costs.
export const PORTRAIT = { columns: 6, rows: 3 } as const;
export const WIDE = 60;
const LABEL = 6;

// Code points, not UTF-16 units: an em dash or a curly quote is one cell.
export function width(text: string): number {
  return [...text].length;
}

export function truncate(text: string, w: number): string {
  if (w <= 0) return "";
  const chars = [...text];
  if (chars.length <= w) return text;
  return `${chars
    .slice(0, w - 1)
    .join("")
    .trimEnd()}${ELLIPSIS}`;
}

export function pad(text: string, w: number): string {
  const cut = truncate(text, w);
  return cut + " ".repeat(Math.max(0, w - width(cut)));
}

export function padStart(text: string, w: number): string {
  const cut = truncate(text, w);
  return " ".repeat(Math.max(0, w - width(cut))) + cut;
}

// Greedy word wrap, whitespace (newlines included) collapsed; a word longer
// than the width is split across lines rather than allowed to overflow.
export function wrap(text: string, w: number): string[] {
  if (w < 1) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let word of words) {
    while (width(word) > w) {
      const room = line ? w - width(line) - 1 : w;
      if (room <= 0) {
        lines.push(line);
        line = "";
        continue;
      }
      const chars = [...word];
      const head = chars.slice(0, room).join("");
      lines.push(line ? `${line} ${head}` : head);
      line = "";
      word = chars.slice(room).join("");
    }
    if (!word) continue;
    if (!line) line = word;
    else if (width(line) + 1 + width(word) <= w) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// At most `max` lines; when some are cut, the last kept one is shortened so a
// dim ellipsis fits after it on the same row.
export function clip(lines: string[], max: number, w: number): { lines: string[]; cut: boolean } {
  if (lines.length <= max) return { lines, cut: false };
  if (max <= 0) return { lines: [], cut: true };
  const kept = lines.slice(0, max);
  const last = kept[max - 1] ?? "";
  kept[max - 1] =
    width(last) < w
      ? last
      : [...last]
          .slice(0, w - 1)
          .join("")
          .trimEnd();
  return { lines: kept, cut: true };
}

// A line of runs cut to `w` cells, the last run that fits ending in an ellipsis.
export function fit(line: Line, w: number): Line {
  const total = line.reduce((n, r) => n + width(r.text), 0);
  if (total <= w) return line;
  const out: Line = [];
  let room = w;
  for (const run of line) {
    if (room <= 0) break;
    const n = width(run.text);
    if (n < room) {
      out.push(run);
      room -= n;
    } else {
      out.push({ ...run, text: truncate(run.text, room) });
      room = 0;
    }
  }
  return out;
}

// A labelled value: the label dim in a fixed column, the value wrapped beside
// it with a hanging indent so every continuation lines up under the first.
export function labelled(label: string, value: string, w: number): Line[] {
  const lines = wrap(value, Math.max(1, w - LABEL));
  return lines.map((text, i) => [
    i === 0 ? { text: pad(label, LABEL), dim: true } : { text: " ".repeat(LABEL) },
    { text },
  ]);
}

function prose(lines: string[], cut: boolean, style: Omit<Run, "text">, indent = ""): Line[] {
  return lines.map((text, i) => {
    const line: Line = [{ text: indent + text, ...style }];
    if (cut && i === lines.length - 1) line.push({ text: ELLIPSIS, dim: true });
    return line;
  });
}

export function planPane(
  scene: StageScene,
  size: PaneSize,
  color: string,
  colorOf: (stem: string) => string,
): PanePlan {
  const w = Math.max(16, size.columns);
  const header: Line[] = [
    ...wrap(`Scene ${scene.number} · ${scene.title}`, w).map(
      (text): Line => [{ text, color, bold: true }],
    ),
    [{ text: RULE.repeat(w), dim: true }],
  ];
  const inner = frameInner(w);
  const facts = [
    ["Where", scene.location],
    ["When", scene.time],
    ["Mood", scene.mood],
  ].flatMap(([label, value]) => (label && value ? labelled(label, value, inner) : []));
  const nowAll = scene.now ? wrap(scene.now, inner) : [];
  const portraits = size.portraits && w >= WIDE;
  const present = scene.present.map((who) => presentRow(who, colorOf, portraits));

  // Nothing shrinks to fit the height: the pane scrolls, and the player reads
  // Now and the widget notes whole. Only names and values truncate.
  const now = clip(nowAll, nowAll.length, inner);
  // Dim like a widget's note: the facts above read first, the prose under them.
  const nowProse = prose(now.lines, now.cut, { dim: true });
  // A snapshot kept in $.state from before a reload may predate widgets.
  const widgets = (scene.widgets ?? []).filter((x) => x.pane === null);
  return {
    header,
    // A blank framed row between the facts and the prose, only with both.
    now: [...facts, ...(facts.length > 0 && nowProse.length > 0 ? [[]] : []), ...nowProse],
    present,
    widgets: widgetGroups(widgets, inner),
  };
}

// --- Frames ---

// Sections are boxes with the title set into the top edge, drawn as text so
// every line is exactly the pane's width and nothing rests on how the engine
// lays out borders. Frame and title are dim; the content keeps its styles.
export const FRAME = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" } as const;
// The narrowest pane laid out, as in planPane.
const MIN_FRAME = 16;

// Content width inside a frame: a border and a space on each side.
export function frameInner(columns: number): number {
  return Math.max(MIN_FRAME, columns) - 4;
}

export function frameTop(title: string, columns: number): Line {
  const w = Math.max(MIN_FRAME, columns);
  const label = truncate(title, w - 6);
  const fill = w - width(label) - 5;
  return [{ text: `${FRAME.tl}${FRAME.h} ${label} ${FRAME.h.repeat(fill)}${FRAME.tr}`, dim: true }];
}

export function frameBottom(columns: number): Line {
  const w = Math.max(MIN_FRAME, columns);
  return [{ text: `${FRAME.bl}${FRAME.h.repeat(w - 2)}${FRAME.br}`, dim: true }];
}

// One content line between the side borders, cut or padded to the inside.
export function framed(line: Line, columns: number): Line {
  const inner = frameInner(columns);
  const body = fit(line, inner);
  const used = body.reduce((n, r) => n + width(r.text), 0);
  const fill: Line = used < inner ? [{ text: " ".repeat(inner - used) }] : [];
  return [{ text: `${FRAME.v} `, dim: true }, ...body, ...fill, { text: ` ${FRAME.v}`, dim: true }];
}

// A line beside a portrait inside a frame: a space after the picture, the
// text cut or padded to `w`, then the right edge.
export function besidePortrait(line: Line, w: number): Line {
  const body = fit(line, w);
  const used = body.reduce((n, r) => n + width(r.text), 0);
  const fill: Line = used < w ? [{ text: " ".repeat(w - used) }] : [];
  return [{ text: " " }, ...body, ...fill, { text: ` ${FRAME.v}`, dim: true }];
}

// A blank row. A space, not "": an empty Text may take no row at all.
export const BLANK: Line = [{ text: " " }];

// A whole section as lines, a blank framed row of padding inside each edge;
// none when it is empty, so it is left out.
export function frame(title: string, body: readonly Line[], columns: number): Line[] {
  if (body.length === 0) return [];
  return [
    frameTop(title, columns),
    ...[BLANK, ...body, BLANK].map((l) => framed(l, columns)),
    frameBottom(columns),
  ];
}

// --- Widgets (spec 19.4) ---

// A meter is ten cells of these, a clock one segment per step; the filled part
// takes the widget's colour, the rest the same colour dimmed.
export const BAR = { full: "▰", empty: "▱", cells: 10 } as const;
export const SEGMENT = { full: "◆", empty: "◇" } as const;
export const SEPARATOR = " · ";
const INDENT = "  ";
// Fewer cells than this beside the names and each widget stacks instead:
// name on its own line, value and note under it.
const MIN_VALUE = 16;
const STACK = 4;
// The name column never takes more than this share of the width.
const NAME_SHARE = 0.4;

// Where a widget sits: `indent` cells in (a group's two), its value starting
// at column `valueAt` from the left edge, or stacked under the name (null).
export type Placement = { indent: number; valueAt: number | null };

// One name column for every widget laid out together (a section, a named
// pane), so every value starts at the same column: the longest name plus two,
// capped, after the group indent when any widget has a group.
export function placement(widgets: readonly StageWidget[], w: number): number | null {
  const longest = Math.max(0, ...widgets.map((x) => width(x.name)));
  const nameW = Math.min(longest + INDENT.length, Math.floor(w * NAME_SHARE));
  const valueAt = (widgets.some((x) => x.group !== null) ? INDENT.length : 0) + nameW;
  return w - valueAt < MIN_VALUE ? null : valueAt;
}

// Groups in order of first appearance, the ungrouped first; widgets in file
// order inside each. A group's widgets sit two cells in from its heading.
export function widgetGroups(widgets: readonly StageWidget[], columns: number): WidgetGroup[] {
  const w = Math.max(16, columns);
  const valueAt = placement(widgets, w);
  const order: (string | null)[] = [null];
  for (const x of widgets) if (!order.includes(x.group)) order.push(x.group);
  return order
    .map((heading) => {
      const indent = heading === null ? 0 : INDENT.length;
      const rows = widgets
        .filter((x) => x.group === heading)
        .map((x) => widgetRow(x, w, { indent, valueAt }));
      return { heading, rows };
    })
    .filter((g) => g.rows.length > 0);
}

// The name in the body colour, the value beside it (or under it, stacked) in
// the widget's colour, then the note, dim, two cells in from the name (four
// when stacked), wrapped whole.
export function widgetRow(
  widget: StageWidget,
  w: number,
  at: Placement = { indent: 0, valueAt: placement([widget], w) },
): WidgetRow {
  const lead: Line = at.indent > 0 ? [{ text: " ".repeat(at.indent) }] : [];
  const stacked = at.valueAt === null;
  const valueAt = at.valueAt ?? at.indent + STACK;
  const values = valueLines(widget, w - valueAt).map((l) => fit(l, w - valueAt));
  const gutter: Line = [{ text: " ".repeat(valueAt) }];
  let lines: Line[];
  if (stacked) {
    const name: Line = [...lead, { text: truncate(widget.name, w - at.indent) }];
    lines = [name, ...values.map((l): Line => [...gutter, ...l])];
  } else {
    const name = truncate(widget.name, valueAt - at.indent - INDENT.length);
    const first: Line = [
      ...lead,
      { text: name },
      { text: " ".repeat(valueAt - at.indent - width(name)) },
      ...(values[0] ?? []),
    ];
    lines = [first, ...values.slice(1).map((l): Line => [...gutter, ...l])];
  }
  const noteAt = at.indent + (stacked ? STACK : INDENT.length);
  const note = widget.note
    ? wrap(widget.note, w - noteAt).map(
        (text): Line => [{ text: " ".repeat(noteAt) + text, dim: true }],
      )
    : [];
  return { lines, note };
}

// The value part alone, `w` wide, every run in the widget's colour.
function valueLines(widget: StageWidget, w: number): Line[] {
  const tint: Omit<Run, "text"> = widget.color ? { color: widget.color } : {};
  const none: Line[] = [[{ text: "none", dim: true }]];
  switch (widget.type) {
    case "text": {
      const lines = wrap(widget.value, w);
      if (lines.length === 0) return none;
      return lines.map((text): Line => [{ text, ...tint, bold: true }]);
    }
    case "counter":
      return [[{ text: String(widget.value), ...tint, bold: true }]];
    case "meter": {
      const count = `${widget.value}/${widget.max}`;
      const cells = Math.max(1, Math.min(BAR.cells, w - width(count) - 1));
      return [[...bar(widget, cells, tint), { text: ` ${count}`, ...tint, bold: true }]];
    }
    case "clock": {
      const line: Line = [];
      const filled = SEGMENT.full.repeat(Math.max(0, widget.value));
      const empty = SEGMENT.empty.repeat(Math.max(0, widget.of - widget.value));
      if (filled) line.push({ text: filled, ...tint });
      if (empty) line.push({ text: empty, ...tint, dim: true });
      line.push({ text: ` ${widget.value}/${widget.of}`, ...tint, bold: true });
      return [line];
    }
    case "list": {
      if (widget.value.length === 0) return none;
      return widget.value.flatMap((item) =>
        wrap(item, Math.max(1, w - 2)).map(
          (text, i): Line => [{ text: `${i === 0 ? "• " : "  "}${text}`, ...tint }],
        ),
      );
    }
    case "tags": {
      const lines = joinWrap(widget.value, SEPARATOR, w);
      if (lines.length === 0) return none;
      return lines.map((text): Line => [{ text, ...tint }]);
    }
  }
}

function bar(widget: { value: number; max: number }, cells: number, tint: Omit<Run, "text">): Line {
  const share = widget.max > 0 ? widget.value / widget.max : 0;
  const full = Math.max(0, Math.min(cells, Math.round(share * cells)));
  const line: Line = [];
  if (full > 0) line.push({ text: BAR.full.repeat(full), ...tint });
  if (full < cells) line.push({ text: BAR.empty.repeat(cells - full), ...tint, dim: true });
  return line;
}

// Items joined by a separator, wrapped between items, never inside one unless
// a single item is wider than the line. A wrapped line opens with the
// separator, so it reads as more of the same run of tags.
export function joinWrap(items: readonly string[], separator: string, w: number): string[] {
  const lead = separator.trimStart();
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    if (line && width(line) + width(separator) + width(item) <= w) {
      line += separator + item;
      continue;
    }
    if (line) lines.push(line);
    const next = lines.length > 0 ? lead + item : item;
    if (width(next) <= w) line = next;
    else {
      const pieces = wrap(next, w);
      line = pieces.pop() ?? "";
      lines.push(...pieces);
    }
  }
  if (line) lines.push(line);
  return lines;
}

// --- Named panes (spec 19.4) ---

// A pane of the mod's own per `pane:` name; the prefix keeps them apart from
// the scene and directives panes, and is what their render hook matches.
export const WIDGET_PANE_PREFIX = "widgets-";

export type NamedPane = { id: string; title: string };

// Ids are 1-64 of letters, digits, `_` and `-`; a name with none of those
// (all accents, say) falls back to a hash of it.
export function paneId(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  if (slug) return WIDGET_PANE_PREFIX + slug;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return `${WIDGET_PANE_PREFIX}${hash.toString(36)}`;
}

// The panes the widgets name, in order of first appearance; two names with
// one slug share a pane, titled by the first.
export function namedPanes(widgets: readonly StageWidget[]): NamedPane[] {
  const panes: NamedPane[] = [];
  for (const x of widgets) {
    if (x.pane === null) continue;
    const id = paneId(x.pane);
    if (!panes.some((p) => p.id === id)) panes.push({ id, title: x.pane });
  }
  return panes;
}

export function paneWidgets(widgets: readonly StageWidget[], id: string): StageWidget[] {
  return widgets.filter((x) => x.pane !== null && paneId(x.pane) === id);
}

// What to open and close so the open panes match the widgets: `open` lists
// the ids now up (from $.ui.panes(), which survives a module reload), and
// `closed` the ones the person shut by hand, left shut while their widgets stay.
export function paneChanges(
  wanted: readonly NamedPane[],
  open: readonly string[],
  closed: readonly string[],
): { open: NamedPane[]; close: string[] } {
  return {
    open: wanted.filter((p) => !open.includes(p.id) && !closed.includes(p.id)),
    close: open.filter(
      (id) => id.startsWith(WIDGET_PANE_PREFIX) && !wanted.some((p) => p.id === id),
    ),
  };
}

function presentRow(
  who: StagePresent,
  colorOf: (stem: string) => string,
  portraits: boolean,
): PresentRow {
  return {
    stem: who.stem,
    name: who.name,
    color: colorOf(who.stem),
    // A snapshot kept in $.state from before a reload may predate the field.
    tags: (who.tags ?? []).join(", "),
    portrait: portraits ? who.portrait : null,
  };
}

// One row of the Present list as runs: a bullet and the name in the
// character's colour, tags dim after it, cut to the width. Beside a portrait
// the tags take the second row instead (see presentLines).
export function presentLine(row: PresentRow, w: number): Line {
  const line: Line = [
    { text: "● ", color: row.color },
    { text: row.name, color: row.color },
  ];
  if (row.tags) line.push({ text: `  ${row.tags}`, dim: true });
  return fit(line, w);
}

export function presentLines(row: PresentRow, w: number): Line[] {
  if (!row.portrait) return [presentLine(row, w)];
  const text = w - PORTRAIT.columns - 1;
  const name = fit([{ text: row.name, color: row.color, bold: true }], text);
  return row.tags ? [name, fit([{ text: row.tags, dim: true }], text)] : [name];
}

const flat = (line: Line) => line.map((r) => r.text).join("");

// The plan as plain text, for tests and for showing a layout outside a
// terminal: the frames the pane draws, a portrait shown as [img].
export function planText(plan: PanePlan, columns: number): string {
  const w = Math.max(MIN_FRAME, columns);
  const inner = frameInner(w);
  const present = plan.present.flatMap((row): Line[] => {
    const lines = presentLines(row, inner).map(flat);
    if (!row.portrait) return lines.map((text) => [{ text }]);
    const pic = (i: number) => (i === 0 ? "[img] " : "      ");
    return Array.from({ length: PORTRAIT.rows }, (_, i) => [
      { text: `${pic(i)} ${lines[i] ?? ""}` },
    ]);
  });
  return [
    ...plan.header,
    ...frame("Now", plan.now, w),
    ...frame("Present", present, w),
    ...frame("Widgets", groupLines(plan.widgets, inner), w),
  ]
    .map((l) => flat(l).trimEnd())
    .join("\n");
}

// A group's heading: its name upper-case and bold in the body colour, then on
// the next line a dim rule the full width. Section titles sit in frame borders
// in title case, so the two levels never look alike.
export function groupHeading(heading: string, w: number): Line[] {
  return [
    [{ text: truncate(heading.toUpperCase(), w), bold: true }],
    [{ text: RULE.repeat(w), dim: true }],
  ];
}

// Widget groups as lines, `w` wide: a blank line before each group but the first.
export function groupLines(groups: readonly WidgetGroup[], w: number): Line[] {
  return groups.flatMap((g, i) => [
    ...(i > 0 ? [BLANK] : []),
    ...(g.heading === null ? [] : groupHeading(g.heading, w)),
    ...g.rows.flatMap((r) => [...r.lines, ...r.note]),
  ]);
}

export function widgetText(groups: readonly WidgetGroup[], w: number): string[] {
  return groupLines(groups, w).map((l) => flat(l).trimEnd());
}
