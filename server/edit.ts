import { type Frontmatter, readFrontmatterFile, writeFrontmatterFile } from "../src/frontmatter.ts";
import { migrateTrackers, serializeWidget } from "../src/widgets.ts";
import { ToolError } from "./context.ts";

// Small helpers for writing story files. All writes go through
// src/frontmatter.ts so files round-trip; keys a tool does not touch keep their
// values and order, so the player's hand edits survive.

// Stems become file names, so they keep the kebab-case shape every story file
// uses (which also means a stem can never escape its folder).
export function checkStem(stem: string): string {
  const s = stem.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) {
    const hint = slugify(stem) || "mira";
    throw new ToolError(
      `"${stem}" is not a valid file stem: use lowercase letters, digits and dashes, like "${hint}".`,
    );
  }
  return s;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

// Merges `changes` into a file's frontmatter (creating the file if needed). An
// undefined value leaves that key alone; null removes it. The body is replaced
// only when one is given.
export async function editFile(
  file: string,
  changes: Frontmatter,
  body?: string | ((old: string) => string),
): Promise<void> {
  const doc = (await Bun.file(file).exists())
    ? await readFrontmatterFile(file)
    : { data: {}, body: "" };
  const data = { ...doc.data };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete data[key];
    else if (value !== undefined) data[key] = value;
  }
  const newBody = typeof body === "function" ? body(doc.body) : (body ?? doc.body);
  await writeFrontmatterFile(file, data, newBody);
}

export type WidgetBlock = Record<string, unknown>;

// A scene's `widgets:` block as written, entries Vex never touched kept
// verbatim (even invalid ones, so a hand edit is not lost), plus any
// `trackers:` from before widgets, migrated (spec 19.3).
export function widgetBlockOf(data: Frontmatter): WidgetBlock {
  const block: WidgetBlock = isRecord(data.widgets) ? { ...data.widgets } : {};
  for (const [name, widget] of Object.entries(migrateTrackers(data.trackers))) {
    if (!(name in block)) block[name] = serializeWidget(widget);
  }
  return block;
}

export async function readWidgetBlock(sceneFile: string): Promise<WidgetBlock> {
  return widgetBlockOf((await readFrontmatterFile(sceneFile)).data);
}

// Every write to a scene file goes through here. A scene that still has
// `trackers:` gets it rewritten as `widgets:` on this write; `widgets`, when
// given, edits the block (an empty result removes it).
export async function editScene(
  sceneFile: string,
  changes: Frontmatter,
  edit: {
    body?: string | ((old: string) => string);
    widgets?: (block: WidgetBlock) => WidgetBlock;
  } = {},
): Promise<void> {
  const { data } = await readFrontmatterFile(sceneFile);
  const extra: Frontmatter = {};
  if (data.trackers !== undefined || edit.widgets) {
    const block = edit.widgets ? edit.widgets(widgetBlockOf(data)) : widgetBlockOf(data);
    extra.widgets = Object.keys(block).length ? block : null;
    extra.trackers = null;
  }
  await editFile(sceneFile, { ...changes, ...extra }, edit.body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Replaces the text under "## <heading>" (up to the next "## " heading), or
// appends the section when the body has none.
export function setSection(body: string, heading: string, text: string): string {
  const lines = body.split(/\r?\n/);
  const wanted = heading.toLowerCase();
  const start = lines.findIndex(
    (l) => /^##\s/.test(l) && l.slice(2).trim().toLowerCase() === wanted,
  );
  const block = [`## ${heading}`, "", text.trim(), ""];
  if (start === -1) return [body.trim(), "", ...block].join("\n").trim();
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((l) => /^##\s/.test(l));
  const after = next === -1 ? [] : rest.slice(next);
  return [...lines.slice(0, start), ...block, ...after].join("\n").trim();
}
