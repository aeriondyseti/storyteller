import { exchanges, formatTurns, readLog, type Turn } from "../../src/log.ts";
import { type Scene, type Story, section } from "../../src/story.ts";

// What gets embedded (spec 7.3): lore entries, directives, log turns, each
// scene's Now + Notes, and closed scenes' summaries. Long texts are cut into
// chunks on paragraph breaks, because the model reads only its first ~256
// tokens; each chunk is one passage with its own vector.
//
// A passage's `key` says where it came from and is stable across rebuilds:
//
//   lore:lore/varrow#0      directive:directives/noir#0
//   turn:3:12#0             (scene 3, turn 12, first chunk)
//   notes:3#1               summary:2#0
//
// Narrowing an update to one scene or turn deletes the keys under its prefix
// (see scope* below) that the new text no longer produces.

export const passageKinds = ["lore", "directive", "turn", "notes", "summary"] as const;
export type PassageKind = (typeof passageKinds)[number];

export type Passage = {
  key: string;
  kind: PassageKind;
  ref: string | undefined;
  scene: number | undefined;
  turn: number | undefined;
  text: string;
  path: string;
};

export const maxChunkChars = 1000;

export function lorePassages(story: Pick<Story, "lore" | "directives">): Passage[] {
  const lore = story.lore.flatMap((l) =>
    chunked(`${l.title}${l.keys.length ? ` (${l.keys.join(", ")})` : ""}`, l.body).map(
      (text, i) => ({
        key: `lore:${l.ref}#${i}`,
        kind: "lore" as const,
        ref: l.ref,
        scene: undefined,
        turn: undefined,
        text,
        path: l.path,
      }),
    ),
  );
  const directives = story.directives.flatMap((d) =>
    chunked(d.title, d.body).map((text, i) => ({
      key: `directive:${d.ref}#${i}`,
      kind: "directive" as const,
      ref: d.ref,
      scene: undefined,
      turn: undefined,
      text,
      path: d.path,
    })),
  );
  return [...lore, ...directives];
}

// One exchange (both halves of turn n) is one passage, chunked when long:
// recall answers "scene 3, turn 12", and a question reads best with its reply.
export function turnPassages(scene: Scene, exchange: Turn[]): Passage[] {
  const n = exchange[0]?.n;
  if (n === undefined) return [];
  return chunked("", formatTurns(exchange)).map((text, i) => ({
    key: `turn:${scene.number}:${n}#${i}`,
    kind: "turn",
    ref: undefined,
    scene: scene.number,
    turn: n,
    text,
    path: scene.logPath,
  }));
}

export function notesPassages(scene: Scene): Passage[] {
  const body = [section(scene.body, "Now"), section(scene.body, "Notes")]
    .filter(Boolean)
    .join("\n\n");
  return scenePassages(scene, "notes", body);
}

export function summaryPassages(scene: Scene): Passage[] {
  return scenePassages(scene, "summary", section(scene.body, "Summary") ?? "");
}

export async function scenePassagesAll(scene: Scene): Promise<Passage[]> {
  const turns = exchanges(await readLog(scene.logPath));
  return [
    ...turns.flatMap((exchange) => turnPassages(scene, exchange)),
    ...notesPassages(scene),
    ...summaryPassages(scene),
  ];
}

export async function storyPassages(story: Story): Promise<Passage[]> {
  const scenes = await Promise.all(story.scenes.map(scenePassagesAll));
  return [...lorePassages(story), ...scenes.flat()];
}

// Key prefixes for a narrowed update.
export const scopeAll = [""];
export const scopeLore = ["lore:", "directive:"];
export const scopeScene = (n: number) => [`turn:${n}:`, `notes:${n}#`, `summary:${n}#`];
export const scopeTurn = (scene: number, turn: number) => [`turn:${scene}:${turn}#`];
export const scopeNotes = (scene: number) => [`notes:${scene}#`, `summary:${scene}#`];

function scenePassages(scene: Scene, kind: "notes" | "summary", body: string): Passage[] {
  return chunked(`Scene ${scene.number}: ${scene.title}`, body).map((text, i) => ({
    key: `${kind}:${scene.number}#${i}`,
    kind,
    ref: undefined,
    scene: scene.number,
    turn: undefined,
    text,
    path: scene.path,
  }));
}

// Paragraphs packed into chunks of at most maxChunkChars (a single longer
// paragraph is split on sentence ends, then hard-cut). The heading, when given,
// leads every chunk so each one still says what it is about.
export function chunked(heading: string, body: string): string[] {
  const text = body.trim();
  if (!text) return [];
  const pieces = text.split(/\n\s*\n/).flatMap(splitLong);
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > maxChunkChars) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return heading ? chunks.map((c) => `${heading}\n\n${c}`) : chunks;
}

function splitLong(paragraph: string): string[] {
  const p = paragraph.trim();
  if (p.length <= maxChunkChars) return p ? [p] : [];
  const out: string[] = [];
  let current = "";
  for (const sentence of p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [p]) {
    if (current && current.length + sentence.length > maxChunkChars) {
      out.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out.flatMap((s) =>
    s.length <= maxChunkChars
      ? [s]
      : Array.from({ length: Math.ceil(s.length / maxChunkChars) }, (_, i) =>
          s.slice(i * maxChunkChars, (i + 1) * maxChunkChars),
        ),
  );
}
