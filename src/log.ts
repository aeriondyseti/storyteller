import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

// A scene's log.jsonl: the verbatim, canonical turn record (spec 7.1), written
// by the Stop hook and read only by code. One JSON object per line, one line
// per half of an exchange. Both halves of an exchange share its number `n`:
//
//   {"n":12,"speaker":"player","name":"Corwin Hale","register":"narrator","at":"…","uuid":"…","text":"I set the map down."}
//   {"n":12,"speaker":"storyteller","name":"Vex","register":"narrator","at":"…","uuid":"…","text":"Mira does not look."}
//
// The player's half is absent when the Storyteller speaks unprompted (the
// launcher's opening cue on a blank story). `register` is the player half's,
// copied to the Storyteller's half. `uuid` is the transcript line the text
// came from. A torn last line (a write cut short) is skipped on read.

export type Speaker = "player" | "storyteller";
export type Register = "narrator" | "copilot";

export type Turn = {
  n: number;
  speaker: Speaker;
  name: string;
  register: Register;
  at: string;
  uuid: string;
  text: string;
};

// What the player half is called when the persona has no card name.
export const playerName = "Player";

export type Half = { name: string; uuid: string; text: string; at?: string | undefined };

export type NewExchange = {
  player?: Half | undefined;
  storyteller: Half;
  register: Register;
};

// The launcher's opening message on a blank story carries the tag itself
// ("[register: copilot] [new story] Begin."); the player steps out with "((".
export function registerOf(prompt: string): Register {
  return prompt.trim().startsWith("((") || prompt.includes("[register: copilot]")
    ? "copilot"
    : "narrator";
}

export function parseLog(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const turn = toTurn(JSON.parse(line));
      if (turn) turns.push(turn);
    } catch {
      // A torn line is skipped.
    }
  }
  return turns;
}

function toTurn(value: unknown): Turn | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.n !== "number" || typeof v.text !== "string") return undefined;
  if (v.speaker !== "player" && v.speaker !== "storyteller") return undefined;
  return {
    n: v.n,
    speaker: v.speaker,
    name: typeof v.name === "string" ? v.name : "",
    register: v.register === "copilot" ? "copilot" : "narrator",
    at: typeof v.at === "string" ? v.at : "",
    uuid: typeof v.uuid === "string" ? v.uuid : "",
    text: v.text,
  };
}

// Consecutive halves grouped by exchange number.
export function exchanges(turns: Turn[]): Turn[][] {
  const groups: Turn[][] = [];
  for (const turn of turns) {
    const group = groups.at(-1);
    if (group && group[0]?.n === turn.n) group.push(turn);
    else groups.push([turn]);
  }
  return groups;
}

// One half as the model reads it: "Player: …" or "Vex: …".
export function formatTurn(turn: Turn): string {
  const label = turn.speaker === "player" ? playerName : turn.name;
  return `${label}: ${turn.text.trim()}`;
}

export function formatTurns(turns: Turn[]): string {
  return turns.map(formatTurn).join("\n\n");
}

export async function readLog(logPath: string): Promise<Turn[]> {
  const file = Bun.file(logPath);
  return (await file.exists()) ? parseLog(await file.text()) : [];
}

export async function countTurns(logPath: string): Promise<number> {
  return (await readLog(logPath)).at(-1)?.n ?? 0;
}

// Both halves of each of the last `count` exchanges.
export async function lastTurns(logPath: string, count: number): Promise<Turn[]> {
  if (count <= 0) return [];
  return exchanges(await readLog(logPath))
    .slice(-count)
    .flat();
}

// Appends one exchange (one line per half) and returns its number.
export async function appendTurn(logPath: string, exchange: NewExchange): Promise<number> {
  const file = Bun.file(logPath);
  const existing = (await file.exists()) ? await file.text() : "";
  const n = (parseLog(existing).at(-1)?.n ?? 0) + 1;
  const now = new Date().toISOString();
  const line = (speaker: Speaker, half: Half): string =>
    JSON.stringify({
      n,
      speaker,
      name: half.name,
      register: exchange.register,
      at: half.at ?? now,
      uuid: half.uuid,
      text: half.text,
    });
  const lines = [
    ...(exchange.player ? [line("player", exchange.player)] : []),
    line("storyteller", exchange.storyteller),
  ];
  // A torn last line gets its own line ended, so the new entries parse.
  const lead = existing === "" || existing.endsWith("\n") ? "" : "\n";
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${lead}${lines.join("\n")}\n`);
  return n;
}
