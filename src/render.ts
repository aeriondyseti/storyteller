import { type Activated, defaultPlayer } from "./activation.ts";
import { formatScope, renderLoreEntry } from "./lore.ts";
import {
  type Character,
  castOf,
  type Directive,
  findCharacter,
  type LoreEntry,
  personaOf,
  type Scene,
  type Story,
  section,
  sheetFor,
} from "./story.ts";
import { renderNamedWidgetLine, type Widget } from "./widgets.ts";

// Renders what the launcher writes into a story folder: the system prompt
// (Storyteller contract + story bible, spec 6) and the CLAUDE.md index, plus
// the one-line scene state header the per-turn hook injects.

export type RenderOptions = { summaryBudget?: number | undefined };

// Characters of closed-scene summaries kept in the prompt. Roughly 6k tokens;
// older scenes stay reachable through recall.
export const defaultSummaryBudget = 24_000;

export function renderSystemPrompt(
  base: string,
  story: Story,
  options: RenderOptions = {},
): string {
  return `${base.trim()}\n\n${renderBible(story, options)}`;
}

export function renderBible(story: Story, options: RenderOptions = {}): string {
  const parts = [
    `# Story bible: ${story.title}`,
    `Story folder: ${story.dir}`,
    renderStoryteller(story),
    `## Story notes\n\n${embed(story.notes) || "None yet. This story is being talked into being."}`,
    renderBoundaries(story),
    story.system
      ? `## Rules system\n\nFile: ${story.system.path}\n\n${embed(story.system.body)}`
      : "",
    renderPersona(story),
    renderCast(story),
    renderAlwaysLore(story),
    renderAlwaysDirectives(story),
    renderIndex(story),
    renderClosedScenes(story, options.summaryBudget ?? defaultSummaryBudget),
    renderCurrentScene(story),
  ];
  return `${parts.filter(Boolean).join("\n\n")}\n`;
}

export function renderClaudeMd(story: Story): string {
  const scene = story.scene;
  const lines = [
    `# ${story.title}`,
    "",
    "This folder is a story played with the `rp` launcher. Your instructions and the story",
    "bible are already in your system prompt; this file is the index of what is on disk.",
    "",
    scene
      ? `Current scene: ${scene.number}, "${scene.title}" (${scene.status}): ${scene.path}, log ${scene.logPath}`
      : "No scene yet.",
    "",
    "## Files",
    "",
    `- Story: ${story.path}`,
    ...(story.system ? [`- Rules system: ${story.system.path}`] : []),
    ...indexLines("Characters", story.characters, (c) => c.name),
    ...indexLines("Lore", story.lore, (l) => l.title),
    ...indexLines("Directives", story.directives, (d) => d.title),
    ...indexLines("Sheets", story.sheets, (s) => s.stem),
    ...indexLines("Scenes", story.scenes, (s) => `${s.number}. ${s.title} (${s.status})`),
  ];
  return `${lines.join("\n")}\n`;
}

// One line: where and when we are and who is here.
export function renderStateHeader(story: Story): string {
  const scene = story.scene;
  if (!scene) return "[scene: none open yet]";
  // The header says who the player's character is with; the player knows
  // where they are themselves.
  const persona = personaOf(story, scene);
  const present = scene.present
    .filter((stem) => stem !== persona)
    .map((stem) => findCharacter(story, stem)?.name ?? stem);
  return [
    `[scene ${scene.number}: ${scene.title}`,
    scene.location,
    scene.time,
    present.length ? `present: ${present.join(", ")}]` : "present: nobody named]",
  ]
    .filter(Boolean)
    .join(" · ");
}

function renderStoryteller(story: Story): string {
  const { name, tagline, voice } = story.storyteller;
  const lines = [
    `Name: ${name}`,
    tagline ? `Tagline: ${tagline}` : "",
    voice ? `Voice: ${voice}` : "",
  ];
  return `## You, the Storyteller\n\n${lines.filter(Boolean).join("\n")}`;
}

function renderBoundaries(story: Story): string {
  if (story.lines.length === 0 && story.veils.length === 0) {
    return "## Lines and veils\n\nNone set.";
  }
  return [
    "## Lines and veils",
    "",
    `Lines (never, on or off page): ${story.lines.join("; ") || "none"}`,
    `Veils (may happen, always off page): ${story.veils.join("; ") || "none"}`,
  ].join("\n");
}

function renderPersona(story: Story): string {
  const stem = personaOf(story);
  const heading = "## The player's character";
  if (!stem) return `${heading}\n\nNot chosen yet.`;
  const card = findCharacter(story, stem);
  if (!card) return `${heading}\n\n${stem}: no card yet.`;
  const sheet = sheetFor(story, card.stem);
  const sheetText = sheet ? `\n\n#### Sheet\n\nFile: ${sheet.path}\n\n${embed(sheet.body)}` : "";
  return `${heading}\n\n${renderCard(card)}${sheetText}`;
}

function renderCast(story: Story): string {
  const cast = castOf(story);
  if (cast.length === 0) return "## Cast (played by you)\n\nNo cards yet.";
  return `## Cast (played by you)\n\n${cast.map(renderCard).join("\n\n")}`;
}

function renderCard(c: Character): string {
  const meta = [
    `Card: ${c.path} (${c.source})`,
    c.tags.length ? `Tags: ${c.tags.join(", ")}` : "",
    c.portrait ? `Portrait: ${c.portrait}` : "",
  ].filter(Boolean);
  return `### ${c.name} (${c.stem})\n\n${meta.join("\n")}\n\n${embed(c.body)}`.trim();
}

// Story-scoped always-on lore only: the bible is written once a session, so an
// entry scoped to a character or place travels with the turn instead, while
// its scope holds (src/activation.ts). Public text only, never the Secret.
function renderAlwaysLore(story: Story): string {
  const always = story.lore.filter(inBible);
  if (always.length === 0) return "";
  const entries = always.map(
    (l) => `### ${l.title}\n\nFile: ${l.path} (${l.source})\n\n${embed(l.body)}`,
  );
  return `## Lore always in play\n\n${entries.join("\n\n")}`;
}

function renderAlwaysDirectives(story: Story): string {
  // Always-on directives and manual ones switched on are in force in full;
  // keyed ones arrive with the turn when their keys match.
  const active = story.directives.filter((d) => d.on && d.mode !== "keyed");
  if (active.length === 0) return "";
  const entries = active.map(
    (d) => `### ${d.title}\n\nFile: ${d.path} (${d.source})\n\n${embed(d.body)}`,
  );
  return `## Directives in force\n\n${entries.join("\n\n")}`;
}

function renderIndex(story: Story): string {
  const lore = story.lore.filter((l) => !inBible(l));
  const directives = story.directives.filter((d) => d.mode === "keyed" || !d.on);
  if (lore.length === 0 && directives.length === 0) return "";
  const parts = [
    "## On demand",
    "",
    "Read an entry when one of its keys comes up or it is relevant. Matching entries are",
    "also injected with the turn.",
  ];
  if (lore.length) parts.push("", "Lore:", ...lore.map(loreIndexLine));
  if (directives.length) parts.push("", "Directives:", ...directives.map(directiveIndexLine));
  return parts.join("\n");
}

function inBible(l: LoreEntry): boolean {
  return l.always && l.scope.kind === "story";
}

function loreIndexLine(l: LoreEntry): string {
  const scope =
    l.scope.kind === "story" ? "" : ` · ${formatScope(l.scope)}${l.always ? ", always" : ""}`;
  return `- ${l.title}: keys ${l.keys.join(", ") || "(none)"}${scope} · ${l.path}`;
}

// The player character's display name, as injected lore names it: the card's
// name, the stem when there is no card yet, "the player" when none is chosen.
export function playerName(story: Story): string {
  const stem = personaOf(story);
  if (!stem) return defaultPlayer;
  return findCharacter(story, stem)?.name ?? stem;
}

// The turn's injected entries (spec 20.2, 20.11): lore, then directives, each
// as "### Title", marked "(updated)" when an earlier version is in the window.
// Lore also carries its truth and discovery tags, Secret and History.
export function renderInjected(entries: readonly Activated[], player = defaultPlayer): string {
  const render = (e: Activated) =>
    e.details
      ? renderLoreEntry({ ...e, ...e.details }, player)
      : `### ${e.title}${e.updated ? " (updated)" : ""}\n\n${e.body.trim()}`;
  const block = (heading: string, list: readonly Activated[]) => {
    if (list.length === 0) return "";
    return `\n${heading}\n\n${list.map(render).join("\n\n")}`;
  };
  return [
    block(
      "Lore in play:",
      entries.filter((e) => e.kind === "lore"),
    ),
    block(
      "Directives in play:",
      entries.filter((e) => e.kind === "directive"),
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function directiveIndexLine(d: Directive): string {
  const keys = d.mode === "keyed" ? `keys ${d.keys.join(", ") || "(none)"} · ` : "";
  return `- ${d.title} (${d.mode}, ${d.on ? "on" : "off"}): ${keys}${d.path}`;
}

// Closed scenes' summaries, oldest first. When they exceed the budget the
// oldest go first, since the recent past matters most to the next turn.
function renderClosedScenes(story: Story, budget: number): string {
  const blocks = story.scenes
    .filter((s) => s.status === "closed")
    .map((s) => {
      const summary = section(s.body, "Summary");
      return summary ? `### Scene ${s.number}: ${s.title}\n\n${embed(summary)}` : undefined;
    })
    .filter((b) => b !== undefined);
  if (blocks.length === 0) return "";
  let kept = blocks;
  while (kept.length > 0 && kept.join("\n\n").length > budget) kept = kept.slice(1);
  const dropped = blocks.length - kept.length;
  const note = dropped
    ? `${dropped} earlier scene summar${dropped === 1 ? "y is" : "ies are"} left out for length; recall them when needed.`
    : "";
  return ["## Earlier scenes", note, ...kept].filter(Boolean).join("\n\n");
}

function renderCurrentScene(story: Story): string {
  const scene = story.scene;
  if (!scene) return "## Current scene\n\nNone opened yet.";
  return `## Current scene\n\n${renderSceneState(story, scene)}\n\n${embed(scene.body)}`.trim();
}

function renderSceneState(story: Story, scene: Scene): string {
  const persona = personaOf(story, scene);
  return [
    `### Scene ${scene.number}: ${scene.title} (${scene.status})`,
    "",
    `File: ${scene.path}`,
    `Log: ${scene.logPath}`,
    scene.location ? `Location: ${scene.location}` : "",
    scene.time ? `Time: ${scene.time}` : "",
    scene.mood ? `Mood: ${scene.mood}` : "",
    `Present: ${scene.present.join(", ") || "nobody named"}`,
    persona ? `Player plays: ${persona}` : "",
    renderWidgets(scene),
  ]
    .filter(Boolean)
    .join("\n");
}

// The scene's widgets as plain lines for the model: the short form with the
// type (so Vex can update it with set_widget), the note after a dash, grouped
// under their `group` in order of first appearance. Problems found loading
// them follow, so Vex can fix the file.
export function renderWidgets(scene: Scene): string {
  const groups = new Map<string, [string, Widget][]>();
  for (const entry of Object.entries(scene.widgets)) {
    const group = entry[1].group ?? "";
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }
  const lines: string[] = [];
  for (const [group, entries] of groups) {
    if (group) lines.push(`  ${group}:`);
    const indent = group ? "    " : "  ";
    for (const [name, widget] of entries) lines.push(`${indent}- ${widgetText(name, widget)}`);
  }
  const problems = scene.widgetWarnings.map((w) => `  - ${w}`);
  return [
    lines.length ? `Widgets:\n${lines.join("\n")}` : "",
    problems.length ? `Widget problems:\n${problems.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function widgetText(name: string, widget: Widget): string {
  const where = widget.pane ? `, pane ${widget.pane}` : "";
  const note = widget.note ? ` - ${widget.note}` : "";
  return `${renderNamedWidgetLine(name, widget)} (${widget.type}${where})${note}`;
}

// Bodies embedded in the bible sit under its "### <entry>" headings, so their
// own "## Now" or "# Notes" would read as new bible sections. Every heading is
// pushed down two levels (capped at h6); fenced code is left alone.
export function embed(body: string): string {
  let fenced = false;
  return body
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      return line.replace(/^#{1,6}(?=\s)/, (h) => "#".repeat(Math.min(6, h.length + 2)));
    })
    .join("\n");
}

function indexLines<T extends { path: string }>(
  label: string,
  items: T[],
  name: (item: T) => string,
): string[] {
  if (items.length === 0) return [];
  return [`- ${label}:`, ...items.map((i) => `  - ${name(i)}: ${i.path}`)];
}
