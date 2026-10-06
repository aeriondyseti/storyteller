import type { EngineInterface, PluginOptions, Register } from "claude-code";

// The background notes job (spec 7.2). After a completed narrator turn, every
// `notesEvery` turns, ask the notes model to rewrite the current scene's
// `## Now` and `## Notes` from the previous notes and the newest log turns
// (shape and rules: plugin/prompts/notes.md), write them into scene.md, and
// re-embed the scene for recall.
//
// The mod runs in its own environment with no Node and cannot import from
// src/ or server/, so the little it needs (frontmatter fields, log lines,
// the section rule of server/edit.ts setSection) is restated here, and every
// file access goes through $.fs. The job never throws out of the hook: any
// failure is one dim transcript line.
//
// It runs on a timer started from turn.complete rather than inside the hook,
// so the turn ends at once, and it waits for the Stop hook (a settings hook,
// which may finish before or after turn.complete) to append the turn to
// log.jsonl. No id ties the two together: turn.complete's turnId is minted by
// the engine at turn.start, while the Stop hook keys on the transcript row
// uuid of the prompt (state.json lastLogged), which no mod event carries. So
// the job marks what it saw at turn.complete and accepts any of three signs
// that this turn was logged (waitForLoggedTurn).

type Engine = EngineInterface;

export type NotesSettings = { every: number; model: string };

// state.json keys this job owns; the hooks keep theirs (turn, injected, ...).
export type NotesState = { turn?: number; notesTurn?: number; notesUpdatedAt?: number };

const logWaitMs = 500;
const logWaitTries = 40;
const reindexTimeoutMs = 120_000;
const modelTimeoutMs = 180_000;

export function notesSettings(options: PluginOptions): NotesSettings {
  const every =
    typeof options.notesEvery === "number" ? Math.max(1, Math.floor(options.notesEvery)) : 1;
  const model =
    typeof options.notesModel === "string" && options.notesModel.trim()
      ? options.notesModel.trim()
      : "haiku";
  return { every, model };
}

export const registerNotes: Register = (on, options) => {
  const settings = notesSettings(options);
  // One job at a time: a quick second turn queues behind the first, so two
  // jobs never read the same notes and overwrite each other.
  let queue: Promise<void> = Promise.resolve();
  // The prompt of the turn in flight, so a turn that is talk about the story
  // (copilot) or a slash command is skipped without waiting on the log: the
  // Stop hook never logs a command at all.
  let started: { turnId: string; text: string } | undefined;
  on("turn.start", (_$, e, next) => {
    started = { turnId: e.turnId, text: e.text };
    return next(e);
  });
  // The matcher also keeps this registration distinct from the stage's own
  // turn.complete hook: the engine refuses two unmatched hooks on one event.
  on("turn.complete", { reason: "answer" }, async ($, e, next) => {
    const result = await next(e);
    const prompt = started?.turnId === e.turnId ? started.text : undefined;
    if (e.agentId === undefined && e.answer.trim() && !isOutOfStory(prompt)) {
      $.clock.after(0, () => {
        // Marked before queueing: a job still running from the last turn
        // must not delay what "before this turn was logged" means.
        const mark = markTurn($, e.durationMs).catch(() => undefined);
        queue = queue.then(async () =>
          runNotesJob($, settings, e.answer, await mark).catch((error: unknown) => {
            $.ui.log(`notes not updated (${errorText(error)})`);
          }),
        );
      });
    }
    return result;
  });
};

// A copilot prompt (the rule of src/log.ts registerOf) or a slash command.
export function isOutOfStory(prompt: string | undefined): boolean {
  if (prompt === undefined) return false;
  const text = prompt.trim();
  return text.startsWith("((") || text.startsWith("/") || text.includes("[register: copilot]");
}

export async function runNotesJob(
  $: Engine,
  settings: NotesSettings,
  answer: string,
  mark?: TurnMark,
): Promise<void> {
  const storyDir = slash(await $.session.cwd());
  if (!(await $.fs.exists(`${storyDir}/story.md`))) return;
  const scene = await currentScene($, storyDir);
  if (!scene || scene.status === "closed") return;

  const wait = await waitForLoggedTurn($, storyDir, scene.logPath, answer, mark);
  if (wait.kind === "unlogged") return;
  if (wait.kind === "timeout") {
    await appendHookError($, storyDir, waitFailure(wait, answer, mark, await $.clock.now()));
    throw new Error(
      `turn not logged within ${(logWaitMs * logWaitTries) / 1000}s; see .rp/hook-errors.log`,
    );
  }
  const turns = wait.turns;
  // Talk about the story is not story: no notes, and not counted.
  if (turns.at(-1)?.register === "copilot") return;

  const state = await readState($, storyDir);
  const notesTurn = (state.notesTurn ?? 0) + 1;
  await mergeState($, storyDir, { notesTurn });
  if (notesTurn % settings.every !== 0) return;

  const storyText = await $.fs.read(`${storyDir}/story.md`);
  const sceneText = await $.fs.read(scene.path);
  const persona =
    field(frontmatter(sceneText), "persona") ?? field(frontmatter(storyText), "persona");
  const cast = (await characterStems($, storyDir, storyText)).filter((s) => s !== persona);
  const prompt = notesPrompt({
    persona: persona ?? "",
    cast,
    previous: previousNotes(bodyOf(sceneText)),
    turns: renderTurns(lastExchanges(turns, 2 * settings.every + 2)),
  });

  const reply = await $.model.complete({
    model: settings.model,
    system: await $.fs.read(`${slash($.plugin.root)}/prompts/notes.md`),
    prompt,
    maxTokens: 4096,
    timeoutMs: modelTimeoutMs,
  });
  if (!reply.isAnswered) throw new Error(`the notes model gave no reply (${reply.reason})`);
  const notes = parseNotes(reply.text);
  if (!notes) throw new Error("the notes reply did not have ## Now and ## Notes");

  // Re-read: the player or a world tool may have changed scene.md meanwhile.
  const current = await $.fs.read(scene.path);
  await $.fs.write(scene.path, withNotes(current, notes));
  await mergeState($, storyDir, { notesUpdatedAt: (await readState($, storyDir)).turn ?? 0 });

  const script = `${slash($.plugin.root)}/../scripts/reindex.ts`;
  const run = await $.process.run(["bun", script, storyDir, "--incremental"], {
    cwd: storyDir,
    timeoutMs: reindexTimeoutMs,
  });
  if (run.exitCode !== 0) {
    $.ui.log(
      `notes updated, re-index failed (${run.stderr.trim().split("\n")[0] ?? run.exitCode})`,
    );
  }
}

// --- scenes, frontmatter, log ---

export type SceneRef = {
  number: number;
  path: string;
  logPath: string;
  status: string | undefined;
};

// The latest open scene; if every scene is closed, the latest one (the same
// rule as src/story.ts currentScene).
async function currentScene($: Engine, storyDir: string): Promise<SceneRef | undefined> {
  const dir = `${storyDir}/scenes`;
  if (!(await $.fs.exists(dir))) return undefined;
  const scenes: SceneRef[] = [];
  for (const entry of await $.fs.list(dir)) {
    const match = /^(\d+)/.exec(entry.name);
    if (entry.kind !== "dir" || !match) continue;
    const path = `${dir}/${entry.name}/scene.md`;
    if (!(await $.fs.exists(path))) continue;
    const fm = frontmatter(await $.fs.read(path));
    const n = Number.parseInt(field(fm, "number") ?? match[1] ?? "0", 10);
    scenes.push({
      number: n,
      path,
      logPath: `${dir}/${entry.name}/log.jsonl`,
      status: field(fm, "status"),
    });
  }
  scenes.sort((a, b) => b.number - a.number);
  return scenes.find((s) => s.status !== "closed") ?? scenes[0];
}

// One line of log.jsonl, one half of an exchange (the shape src/log.ts Turn
// writes; the fields the job needs).
export type LoggedTurn = {
  n: number;
  speaker: "player" | "storyteller";
  name: string;
  register: "narrator" | "copilot";
  // ISO time and uuid of the transcript row the half came from; "" when
  // unknown. A player half's uuid is the Stop hook's lastLogged for it.
  at: string;
  uuid: string;
  text: string;
};

// A torn last line (the Stop hook mid-write) and anything not a turn are skipped.
export function parseLogTurns(text: string): LoggedTurn[] {
  const turns: LoggedTurn[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let v: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null) continue;
      v = parsed as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof v.n !== "number" || typeof v.text !== "string") continue;
    if (v.speaker !== "player" && v.speaker !== "storyteller") continue;
    turns.push({
      n: v.n,
      speaker: v.speaker,
      name: typeof v.name === "string" ? v.name : "",
      register: v.register === "copilot" ? "copilot" : "narrator",
      at: typeof v.at === "string" ? v.at : "",
      uuid: typeof v.uuid === "string" ? v.uuid : "",
      text: v.text,
    });
  }
  return turns;
}

// Both halves of each of the last `count` exchanges.
export function lastExchanges(turns: LoggedTurn[], count: number): LoggedTurn[] {
  const numbers = [...new Set(turns.map((t) => t.n))].slice(-count);
  return turns.filter((t) => numbers.includes(t.n));
}

// What the notes model reads in <turns> (plugin/prompts/notes.md): each half
// headed "### <n> · Player" or "### <n> · <Storyteller name>".
export function renderTurns(turns: LoggedTurn[]): string {
  return turns
    .map((t) => `### ${t.n} · ${t.speaker === "player" ? "Player" : t.name}\n\n${t.text.trim()}`)
    .join("\n\n");
}

// What the job saw at turn.complete: when the turn began (by its duration),
// the Stop hook's lastLogged, and how many lines the log had.
export type TurnMark = { startedAt: number; lastLogged: string | undefined; lines: number };

async function markTurn($: Engine, durationMs: number): Promise<TurnMark> {
  const now = await $.clock.now();
  const storyDir = slash(await $.session.cwd());
  const scene = await currentScene($, storyDir);
  const lines = scene ? (await readLog($, scene.logPath)).lines : 0;
  return { startedAt: now - durationMs, lastLogged: await lastLogged($, storyDir), lines };
}

type LogRead = { exists: boolean; lines: number; turns: LoggedTurn[] };

async function readLog($: Engine, logPath: string): Promise<LogRead> {
  if (!(await $.fs.exists(logPath))) return { exists: false, lines: 0, turns: [] };
  const text = await $.fs.read(logPath);
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  return { exists: true, lines, turns: parseLogTurns(text) };
}

async function lastLogged($: Engine, storyDir: string): Promise<string | undefined> {
  const value = (await readState($, storyDir)).lastLogged;
  return typeof value === "string" ? value : undefined;
}

export type WaitResult =
  | { kind: "logged"; turns: LoggedTurn[] }
  // The Stop hook handled the turn and chose not to log it.
  | { kind: "unlogged" }
  | { kind: "timeout"; logPath: string; log: LogRead; lastLogged: string | undefined };

// The Stop hook appends the exchange to log.jsonl, then sets state.json
// lastLogged; it may finish before or after turn.complete. Any one of these
// says this turn was handled:
// - lastLogged moved since the mark: the turn is logged when a player half
//   carries that uuid or the log grew (an opening cue logs no player half),
//   and otherwise the hook chose not to log it;
// - the log's last half is the Storyteller's and ends the way the answer ends;
// - the log's last half is a Storyteller reply written after the turn began.
async function waitForLoggedTurn(
  $: Engine,
  storyDir: string,
  logPath: string,
  answer: string,
  mark: TurnMark | undefined,
): Promise<WaitResult> {
  const tail = squash(answer).slice(-80);
  let log: LogRead = { exists: false, lines: 0, turns: [] };
  let logged: string | undefined;
  for (let i = 0; i < logWaitTries; i++) {
    // State before log: the hook writes the log first, so a moved lastLogged
    // read here means the log read after it is complete.
    logged = await lastLogged($, storyDir);
    log = await readLog($, logPath);
    const last = log.turns.at(-1);
    if (mark && logged !== mark.lastLogged) {
      const isLogged =
        log.lines > mark.lines ||
        log.turns.some((t) => t.speaker === "player" && t.uuid === logged);
      return isLogged ? { kind: "logged", turns: log.turns } : { kind: "unlogged" };
    }
    if (last?.speaker === "storyteller") {
      if (squash(last.text).endsWith(tail)) return { kind: "logged", turns: log.turns };
      if (mark && Date.parse(last.at) >= mark.startedAt) {
        return { kind: "logged", turns: log.turns };
      }
    }
    await new Promise<void>((resolve) => $.clock.after(logWaitMs, resolve));
  }
  return { kind: "timeout", logPath, log, lastLogged: logged };
}

// One line for .rp/hook-errors.log, where the settings hooks leave theirs.
export function waitFailure(
  wait: Extract<WaitResult, { kind: "timeout" }>,
  answer: string,
  mark: TurnMark | undefined,
  now: number,
): string {
  const last = wait.log.turns.at(-1);
  const fields = [
    `log=${wait.logPath}`,
    `exists=${wait.log.exists}`,
    `lines=${mark?.lines ?? "?"}->${wait.log.lines}`,
    `last=${last?.speaker ?? "none"}`,
    `logged=${JSON.stringify(squash(last?.text ?? "").slice(-60))}`,
    `answer=${JSON.stringify(squash(answer).slice(-60))}`,
    `lastLogged=${mark?.lastLogged ?? "none"}->${wait.lastLogged ?? "none"}`,
  ];
  return `${new Date(now).toISOString()} notes: turn not logged ${fields.join(" ")}`;
}

async function appendHookError($: Engine, storyDir: string, line: string): Promise<void> {
  const path = `${storyDir}/.rp/hook-errors.log`;
  const before = (await $.fs.exists(path)) ? await $.fs.read(path) : "";
  const sep = before && !before.endsWith("\n") ? "\n" : "";
  await $.fs.write(path, `${before}${sep}${line}\n`);
}

const frontmatterBlock = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

export function frontmatter(text: string): string {
  return frontmatterBlock.exec(text)?.[1] ?? "";
}

export function bodyOf(text: string): string {
  const match = frontmatterBlock.exec(text);
  return (match ? text.slice(match[0].length) : text).trim();
}

// A top-level scalar field of a YAML block, unquoted.
export function field(yaml: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(yaml);
  const value = unquote(match?.[1]?.trim() ?? "");
  return value || undefined;
}

// A top-level list field, inline (`[a, b]`) or as a block of `- item` lines.
export function listField(yaml: string, key: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (start === -1) return [];
  const inline = (lines[start] ?? "").slice(key.length + 1).trim();
  if (inline.startsWith("[")) {
    return inline
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => unquote(s.trim()))
      .filter(Boolean);
  }
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (!item) break;
    items.push(unquote((item[1] ?? "").trim()));
  }
  return items.filter(Boolean);
}

function unquote(value: string): string {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

// Card stems: the story's characters/ folder plus `uses: [characters/...]`.
async function characterStems($: Engine, storyDir: string, storyText: string): Promise<string[]> {
  const stems = new Set<string>();
  const dir = `${storyDir}/characters`;
  if (await $.fs.exists(dir)) {
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind === "file" && entry.name.endsWith(".md")) stems.add(entry.name.slice(0, -3));
    }
  }
  for (const ref of listField(frontmatter(storyText), "uses")) {
    if (ref.startsWith("characters/")) stems.add(ref.slice("characters/".length));
  }
  return [...stems].sort();
}

// --- notes in and out ---

export function notesPrompt(input: {
  persona: string;
  cast: string[];
  previous: string;
  turns: string;
}): string {
  return [
    `<persona>\n${input.persona}\n</persona>`,
    `<cast>\n${input.cast.join("\n")}\n</cast>`,
    `<previous_notes>\n${input.previous}\n</previous_notes>`,
    `<turns>\n${input.turns}\n</turns>`,
  ].join("\n\n");
}

export function previousNotes(body: string): string {
  const now = section(body, "Now");
  const notes = section(body, "Notes");
  return [now ? `## Now\n\n${now}` : "", notes ? `## Notes\n\n${notes}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

export type Notes = { now: string; notes: string };

// The reply should be exactly the two sections; tolerate a code fence or a
// stray line around them, but not a missing section.
export function parseNotes(reply: string): Notes | undefined {
  const text = reply.replace(/^\s*```[a-z]*\s*\n/i, "").replace(/\n```\s*$/, "");
  const now = section(text, "Now");
  const notes = section(text, "Notes");
  if (!now || !notes) return undefined;
  return { now, notes };
}

// scene.md with its Now and Notes replaced; frontmatter kept byte for byte.
export function withNotes(sceneText: string, notes: Notes): string {
  const match = frontmatterBlock.exec(sceneText);
  const head = match ? match[0].replace(/\r?\n?$/, "\n") : "";
  const body = setSection(setSection(bodyOf(sceneText), "Now", notes.now), "Notes", notes.notes);
  return `${head}${head ? "\n" : ""}${body}\n`;
}

// The text under a "## <heading>" line, up to the next "## " heading (as
// src/story.ts section).
export function section(markdown: string, heading: string): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const wanted = heading.trim().toLowerCase();
  const start = lines.findIndex(
    (l) => /^##\s/.test(l) && l.slice(2).trim().toLowerCase() === wanted,
  );
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

// Replaces the text under "## <heading>" (up to the next "## " heading), or
// appends the section when the body has none (as server/edit.ts setSection).
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

// --- state.json ---

async function readState(
  $: Engine,
  storyDir: string,
): Promise<NotesState & Record<string, unknown>> {
  const path = `${storyDir}/.rp/state.json`;
  try {
    if (!(await $.fs.exists(path))) return {};
    const parsed: unknown = JSON.parse(await $.fs.read(path));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// Read-modify-write so the hooks' keys survive (they keep ours the same way).
async function mergeState($: Engine, storyDir: string, changes: NotesState): Promise<void> {
  const state = await readState($, storyDir);
  await $.fs.write(
    `${storyDir}/.rp/state.json`,
    `${JSON.stringify({ ...state, ...changes }, null, 2)}\n`,
  );
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
