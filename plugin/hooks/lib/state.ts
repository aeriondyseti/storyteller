import type { ActivationReport, Injection } from "../../../src/activation.ts";

// .rp/state.json: what the hooks remember between invocations.
//
//   turn        prompts submitted so far in this story; the clock the
//               activation cooldown runs on (scene logs restart their
//               numbering, this does not)
//   injections  every lore or keyed directive injection since the last
//               compaction: { ref, turn, hash, chars } (spec 20.2). Cooldown
//               and edit re-injection read it; its chars sum is the estimate
//               of lore in the window (spec 20.4). Compaction clears it.
//   activation  the last turn's report: what fired and why, what was cut
//   lastLogged  uuid of the transcript prompt whose exchange the Stop hook
//               last handled, so a repeated Stop never appends twice
//   inForce     ref -> hash of each directive the bible renders in full, as
//               the model last saw them (src/directive-deltas.ts)
//   keyedHashes ref -> hash of each keyed directive switched on
//   sessionId   the Claude Code session the record belongs to; a new one
//               means a fresh system prompt, so the record starts over
//
// The mod's notes job keeps its own keys in the same file (notesTurn,
// notesUpdatedAt); writeState keeps any key it does not own.

export type HookState = {
  turn: number;
  injections: Injection[];
  activation?: ActivationReport;
  lastLogged: string | undefined;
  inForce?: Record<string, string>;
  keyedHashes?: Record<string, string>;
  sessionId?: string;
};

export function statePath(storyDir: string): string {
  return `${storyDir}/.rp/state.json`;
}

// A missing or damaged file starts fresh: losing the record costs at most a
// repeated lore entry, which is better than a hook that stops working.
export async function readState(storyDir: string): Promise<HookState> {
  const file = Bun.file(statePath(storyDir));
  let data: Record<string, unknown> = {};
  if (await file.exists()) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed === "object" && parsed !== null) data = parsed as Record<string, unknown>;
    } catch {}
  }
  const state: HookState = {
    turn: typeof data.turn === "number" ? data.turn : 0,
    injections: injectionsOf(data.injections),
    lastLogged: typeof data.lastLogged === "string" ? data.lastLogged : undefined,
  };
  const isHash = (h: unknown): h is string => typeof h === "string";
  if (isRecord(data.inForce)) state.inForce = recordOf(data.inForce, isHash);
  if (isRecord(data.keyedHashes)) state.keyedHashes = recordOf(data.keyedHashes, isHash);
  if (typeof data.sessionId === "string") state.sessionId = data.sessionId;
  return state;
}

function injectionsOf(value: unknown): Injection[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (i): i is Injection =>
      isRecord(i) &&
      typeof i.ref === "string" &&
      typeof i.turn === "number" &&
      typeof i.hash === "string" &&
      typeof i.chars === "number",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordOf<T>(value: unknown, keep: (v: unknown) => v is T): Record<string, T> {
  const result: Record<string, T> = {};
  if (isRecord(value)) {
    for (const [key, v] of Object.entries(value)) if (keep(v)) result[key] = v;
  }
  return result;
}

export async function writeState(storyDir: string, state: HookState): Promise<void> {
  const file = Bun.file(statePath(storyDir));
  let others: Record<string, unknown> = {};
  try {
    const parsed: unknown = (await file.exists()) ? JSON.parse(await file.text()) : {};
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      others = parsed as Record<string, unknown>;
    }
  } catch {}
  // `injected` (ref -> turn) was the record before `injections` replaced it.
  delete others.injected;
  await Bun.write(file, `${JSON.stringify({ ...others, ...state }, null, 2)}\n`);
}
