#!/usr/bin/env bun
import { registerOf } from "../src/log.ts";
import { posixPath } from "../src/paths.ts";
import type { LogHealth, StatusInput, StoryFacts } from "../src/status-sources.ts";
import { loadLayout, parseLayout, statusLines, statuslinePath } from "../src/statusline-layout.ts";
import { findCharacter, loadStory, personaOf } from "../src/story.ts";
import { isStoryDir } from "./hooks/lib/io.ts";
import { readState } from "./hooks/lib/state.ts";
import { latestExchange } from "./hooks/lib/transcript.ts";

// The story session's status line (spec 10, 19.5), a settings statusLine
// command the launcher wires in place of the player's own. Claude Code sends
// JSON on stdin (transcript_path, context_window, model, rate_limits, ...)
// and shows each line printed. What the lines say is the player's layout in
// ~/.storyteller/statusline.json, or with none the default (coloured:
// labels dark, values bold, meters by usage):
//
//   Model: Opus 5.5 (medium) | Narrator: Vex (copilot) | Persona: asset1 | Story: Build Failed Successfully | Scene: Scene 1: Spawn Point
//   ctx ▰▰▰▱▱▱▱▱▱▱ 34% | 5h ▰▱▱▱▱▱▱▱▱▱ 14% | wk ▰▰▰▰▱▱▱▱▱▱ 36% | notes: 2 ago | log: ✓
//
//   bun plugin/statusline.ts < sample.json
//   bun plugin/statusline.ts --check [file]    validate a layout and preview it

// The Stop hook records the uuid of the prompt whose exchange it last handled
// (`lastLogged`). That should be the latest prompt, or while a turn runs, the
// one before it.
export function logHealth(
  transcript: string,
  lastLogged: string | undefined,
): LogHealth | undefined {
  const latest = latestExchange(transcript);
  if (!latest) return undefined;
  if (latest.promptUuid === lastLogged) return "logged";
  const cut = transcript.lastIndexOf(`"uuid":"${latest.promptUuid}"`);
  const previous = latestExchange(transcript.slice(0, transcript.lastIndexOf("\n", cut) + 1));
  return !previous || previous.promptUuid === lastLogged ? "pending" : "missed";
}

export async function gather(input: StatusInput, dir: string): Promise<StoryFacts> {
  // RP_LIBRARY overrides the library root, as it does for the world server.
  const story = await loadStory(dir, { libraryRoot: process.env.RP_LIBRARY });
  const state = await readState(story.dir);
  const raw: Record<string, unknown> = await Bun.file(`${story.dir}/.rp/state.json`)
    .json()
    .catch(() => ({}));
  const transcriptFile = input.transcript_path ? Bun.file(input.transcript_path) : undefined;
  const transcript =
    transcriptFile && (await transcriptFile.exists()) ? await transcriptFile.text() : "";
  const latest = latestExchange(transcript);
  const persona = personaOf(story);
  // notesUpdatedAt is written by the notes job (plugin/mod/notes.ts): the
  // hooks' `turn` when it last rewrote the notes.
  const notesAt = typeof raw.notesUpdatedAt === "number" ? raw.notesUpdatedAt : null;
  return {
    storyTitle: story.title,
    storyteller: story.storyteller.name,
    sceneNumber: story.scene?.number,
    sceneTitle: story.scene?.title,
    register: latest ? registerOf(latest.prompt) : undefined,
    persona: persona ? (findCharacter(story, persona)?.name ?? persona) : undefined,
    notesAgo: notesAt === null ? null : Math.max(0, state.turn - notesAt),
    log: transcript ? logHealth(transcript, state.lastLogged) : undefined,
  };
}

export async function render(input: StatusInput, dir: string): Promise<string> {
  const facts = await gather(input, dir);
  return statusLines(await loadLayout(), input, facts).join("\n");
}

// Made-up values for a preview outside a session: every source shows.
export const sampleInput: StatusInput = {
  model: { display_name: "Opus 5.5" },
  effort: { level: "medium" },
  context_window: { used_percentage: 34 },
  rate_limits: { five_hour: { used_percentage: 14 }, seven_day: { used_percentage: 36 } },
};
export const sampleFacts: StoryFacts = {
  storyTitle: "Build Failed Successfully",
  storyteller: "Vex",
  sceneNumber: 1,
  sceneTitle: "Spawn Point",
  persona: "asset1",
  register: "copilot",
  notesAgo: 2,
  log: "logged",
};

// For the player after editing the file: what is wrong with it, or the lines
// it draws with sample values. Exit 1 on an invalid file.
export async function check(file: string): Promise<{ ok: boolean; text: string }> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return { ok: false, text: `${file} does not exist yet` };
  let raw: unknown;
  try {
    raw = JSON.parse(await handle.text());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, text: `${file} is not valid JSON: ${reason}` };
  }
  const parsed = parseLayout(raw);
  if (!parsed.ok) return { ok: false, text: `${file}: ${parsed.error}` };
  const lines = statusLines({ kind: "ok", layout: parsed.layout }, sampleInput, sampleFacts);
  return {
    ok: true,
    text: `${file} is valid. With sample values it reads:\n\n${lines.join("\n")}`,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args[0] === "--check") {
    const result = await check(args[1] ?? statuslinePath());
    console.log(result.text);
    process.exit(result.ok ? 0 : 1);
  }
  // A broken status line must not shout over the story: on any failure it
  // prints nothing, and the engine shows an empty line.
  try {
    const input: StatusInput = JSON.parse((await Bun.stdin.text()) || "{}");
    const dir = posixPath(process.env.RP_STORY ?? input.cwd ?? process.cwd());
    if (await isStoryDir(dir)) process.stdout.write(await render(input, dir));
  } catch {}
}
