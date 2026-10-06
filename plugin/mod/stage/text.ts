import type { StageCharacter } from "../types";

// Pure text work behind the stage's drawings: colours, the quiet-line phrases,
// and how a reply splits into what gets drawn differently. No `$` here, so the
// tests exercise it directly.

// Readable on dark and light terminals alike; a name always lands on the same one.
const palette = ["#d19a66", "#61afef", "#c678dd", "#98c379", "#e06c75", "#56b6c2", "#e5c07b"];

export function colorFor(key: string): string {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return palette[hash % palette.length] ?? "#d19a66";
}

// --- Quiet line (spec 10): a tool row becomes one phrase in voice ---

export const quietTool = /^(mcp__world__.+|Read|Glob|Grep|Skill)$/;

const phrases: Record<string, string> = {
  set_widget: "updates the board",
  remove_widget: "wipes a mark from the board",
  roll: "rolls",
  upsert_character: "writes a card",
  update_sheet: "writes a card",
  upsert_lore: "writes into the lore",
  upsert_directive: "amends the rules",
  set_directive: "amends the rules",
  update_story: "amends the story",
  open_scene: "opens a scene",
  close_scene: "closes the scene",
  set_persona: "changes your part",
  // A procedure from plugin/skills (the interview, closing a scene, ...).
  Skill: "considers the craft",
};

export function quietPhrase(tool: string, input: unknown, output: unknown): string {
  const name = tool.replace(/^mcp__world__/, "");
  if (name === "set_scene_state")
    return hasKey(input, "time") ? "notes the time" : "sets the scene";
  if (name === "roll") {
    const expr = field(input, "expr");
    const result = firstLine(textOf(output));
    return ["rolls", expr, result ? `→ ${result}` : ""].filter(Boolean).join(" ");
  }
  return phrases[name] ?? "consults the archive";
}

// The text an MCP tool answered: a string, or its text content blocks.
function textOf(output: unknown): string {
  if (typeof output === "string") return output;
  const blocks = Array.isArray(output)
    ? output
    : isRecord(output) && Array.isArray(output.content)
      ? output.content
      : [];
  return blocks
    .map((b: unknown) => (isRecord(b) && typeof b.text === "string" ? b.text : ""))
    .join("\n");
}

function firstLine(text: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? "";
  return line.length > 40 ? `${line.slice(0, 39)}…` : line;
}

function field(input: unknown, key: string): string {
  return isRecord(input) && typeof input[key] === "string" ? input[key] : "";
}

function hasKey(input: unknown, key: string): boolean {
  return isRecord(input) && input[key] !== undefined && input[key] !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The character a card read is about: a Read of characters/<stem>.md, or the
// world server's get_character. Undefined for any other call.
export function cardRead(tool: string, input: unknown): string | undefined {
  if (tool === "Read") {
    return /[\\/]characters[\\/]([^\\/]+)\.md$/.exec(field(input, "file_path"))?.[1];
  }
  if (tool === "mcp__world__get_character") return field(input, "name") || undefined;
  return undefined;
}

export function findSpeaker(
  speakers: readonly StageCharacter[],
  nameOrStem: string,
): StageCharacter | undefined {
  const wanted = nameOrStem.trim().toLowerCase();
  return speakers.find((s) => s.stem === wanted || s.name.toLowerCase() === wanted);
}

// --- Reply blocks ---

export type Block =
  | { kind: "prose"; text: string }
  // Copilot register: an aside wholly inside (( )).
  | { kind: "ooc"; text: string }
  // A paragraph that is exactly one short italic phrase (spec 16).
  | { kind: "setting"; text: string }
  // Prose with quoted dialogue that belongs to one character.
  | { kind: "dialogue"; text: string; speaker: StageCharacter };

// Code fences are left whole: a reply holding one is drawn as plain markdown.
export function replyBlocks(text: string, speakers: readonly StageCharacter[]): Block[] {
  if (text.includes("```")) return [{ kind: "prose", text }];
  const blocks: Block[] = [];
  let ooc: string[] | undefined;
  for (const para of text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    if (ooc || para.startsWith("((")) {
      ooc = [...(ooc ?? []), para];
      if (para.endsWith("))")) {
        blocks.push({ kind: "ooc", text: ooc.join("\n\n") });
        ooc = undefined;
      }
      continue;
    }
    const setting = /^\*([^*\n]{1,100})\*$/.exec(para)?.[1];
    if (setting) {
      blocks.push({ kind: "setting", text: setting.trim() });
      continue;
    }
    const speaker = speakerOf(para, speakers);
    if (speaker) {
      blocks.push({ kind: "dialogue", text: para, speaker });
      continue;
    }
    const last = blocks.at(-1);
    if (last?.kind === "prose") last.text += `\n\n${para}`;
    else blocks.push({ kind: "prose", text: para });
  }
  // An aside that never closed is still an aside.
  if (ooc) blocks.push({ kind: "ooc", text: ooc.join("\n\n") });
  return blocks;
}

// Markdown beyond *emphasis* (headings, lists, quotes, code, links) would be
// lost in a tinted drawing, so such a paragraph stays plain.
const richMarkdown = /^(#|[-+] |\d+\. |>)|`|\]\(/m;

// The one character a paragraph's quoted lines belong to: exactly one speaker
// named outside the quotes (full name or first name). None or several named:
// no tint, rather than a wrong one.
export function speakerOf(
  para: string,
  speakers: readonly StageCharacter[],
): StageCharacter | undefined {
  if (richMarkdown.test(para)) return undefined;
  const spans = quoteSpans(para);
  if (!spans.some((s) => s.quoted)) return undefined;
  const narration = spans
    .filter((s) => !s.quoted)
    .map((s) => s.text)
    .join(" ");
  const named = speakers.filter((s) => namesOf(s).some((n) => wordIn(narration, n)));
  return named.length === 1 ? named[0] : undefined;
}

function namesOf(s: StageCharacter): string[] {
  const first = s.name.split(/\s+/)[0] ?? "";
  return first.length >= 3 && first !== s.name ? [s.name, first] : [s.name];
}

function wordIn(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}(?![\\p{L}])`, "u").test(text);
}

export type Span = { text: string; quoted: boolean };

// Splits on double quotes, straight or curly; the quote marks stay in the
// quoted span.
export function quoteSpans(para: string): Span[] {
  const spans: Span[] = [];
  let current = "";
  let quoted = false;
  const flush = () => {
    if (current) spans.push({ text: current, quoted });
    current = "";
  };
  for (const ch of para) {
    const opens = !quoted && (ch === '"' || ch === "“");
    const closes = quoted && (ch === '"' || ch === "”");
    if (opens) {
      flush();
      quoted = true;
      current = ch;
    } else if (closes) {
      current += ch;
      flush();
      quoted = false;
    } else {
      current += ch;
    }
  }
  flush();
  return spans;
}

export type Run = { text: string; italic: boolean; bold: boolean };

// *italic* and **bold** inside a tinted paragraph, the only markdown it keeps.
export function emphasisRuns(text: string): Run[] {
  const runs: Run[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let at = 0;
  for (const m of text.matchAll(pattern)) {
    const index = m.index ?? 0;
    if (index > at) runs.push({ text: text.slice(at, index), italic: false, bold: false });
    if (m[1] !== undefined) runs.push({ text: m[1], italic: false, bold: true });
    else runs.push({ text: m[2] ?? "", italic: true, bold: false });
    at = index + m[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), italic: false, bold: false });
  return runs;
}

// --- Spinner ---

export function spinnerWord(storyteller: string, mode: string, voicing: string | null): string {
  return mode === "thinking"
    ? `${voicing ?? storyteller} is thinking`
    : `${storyteller} is writing`;
}

// --- Quieting (spec 10) ---

// Engine reminders aimed at a coding session: todo lists and task tools, plan
// and auto modes (their Bash and file-editing steers), memory files, listings
// of skills and agents the Storyteller has no tool to call, and nudges whose
// answer would leak into narration. Hook context, the date, the model, the
// token budget and tool listings stay.
export const codingAttachments = [
  "todo_reminder",
  "task_reminder",
  "plan_mode",
  "plan_mode_reentry",
  "plan_mode_exit",
  "auto_mode",
  "auto_mode_exit",
  "nested_memory",
  "agent_listing_delta",
  "silent_turn_reminder",
  "bash_output_audience_note",
  "remote_session_change",
];

// The skill listing names every skill the Skill tool can load, one entry per
// "- name: description" line (a description may run onto further lines).
// Only the entries `keep` accepts stay; null when none does, so the
// attachment is dropped.
export function keepSkillEntries(text: string, keep: (name: string) => boolean): string | null {
  const [head = "", ...entries] = text.split(/^(?=- [^\s:]+:)/m);
  const kept = entries.filter((entry) => keep(/^- ([^\s:]+(?::[^\s:]+)?):/.exec(entry)?.[1] ?? ""));
  return kept.length ? `${head}${kept.join("")}`.trimEnd() : null;
}

// The instructions attachment carries every CLAUDE.md in reach. The story's
// own (generated: index and current scene) stays; the player's global one is
// their coding notebook and goes. Text in any other shape passes untouched.
export function withoutUserInstructions(text: string): string {
  const header = /^Contents of .+ \((.+)\):$/gm;
  const starts = [...text.matchAll(header)].map((m) => ({
    at: m.index ?? 0,
    isUser: (m[1] ?? "").startsWith("user's private global instructions"),
  }));
  if (!starts.some((s) => s.isUser)) return text;
  let out = text.slice(0, starts[0]?.at ?? 0);
  starts.forEach((s, i) => {
    if (!s.isUser) out += text.slice(s.at, starts[i + 1]?.at ?? text.length);
  });
  return out.trimEnd();
}
