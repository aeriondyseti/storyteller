import { activate, loreBudgetChars, sceneStateOf } from "../../../src/activation.ts";
import { type Config, loadConfig } from "../../../src/config.ts";
import { directiveRecord } from "../../../src/directive-deltas.ts";
import { formatTurns, lastTurns, type Turn } from "../../../src/log.ts";
import { renderInjected, renderStateHeader } from "../../../src/render.ts";
import { type LoadOptions, loadStory, type Story, section } from "../../../src/story.ts";
import { additionalContext, type HookInput, isStoryDir } from "./io.ts";
import { type HookState, readState, writeState } from "./state.ts";

// SessionStart (spec 3.5, 7.4, 9): after a compaction or on a resume, the
// conversation no longer holds the recent story verbatim, so hand Vex the
// current scene's Now and Notes and the last turns from the log. A fresh
// startup or /clear gets nothing: the system prompt already has the bible.

export const previouslyTurnCount = 6;

const rebuildSources = new Set(["compact", "resume"]);

export function buildPreviously(story: Story, turns: Turn[]): string | undefined {
  const scene = story.scene;
  if (!scene) return undefined;
  const parts = ["Previously, from the record:", renderStateHeader(story)];
  const now = section(scene.body, "Now");
  const notes = section(scene.body, "Notes");
  if (now) parts.push(`## Now\n\n${now}`);
  if (notes) parts.push(`## Notes\n\n${notes}`);
  if (turns.length) parts.push(`## Last turns\n\n${formatTurns(turns)}`);
  return parts.join("\n\n");
}

export async function sessionStart(
  input: HookInput,
  options: LoadOptions = {},
): Promise<string | undefined> {
  if (!rebuildSources.has(input.source ?? "")) return undefined;
  if (!(await isStoryDir(input.cwd))) return undefined;
  const story = await loadStory(input.cwd, options);
  let lore = "";
  if (input.source === "compact") {
    const rebuilt = rebuildAfterCompaction(story, await readState(story.dir), await loadConfig());
    if (input.session_id !== undefined) rebuilt.state.sessionId = input.session_id;
    await writeState(story.dir, rebuilt.state);
    lore = rebuilt.lore;
  }
  const turns = story.scene ? await lastTurns(story.scene.logPath, previouslyTurnCount) : [];
  const text = [buildPreviously(story, turns), lore].filter(Boolean).join("\n");
  return text ? additionalContext("SessionStart", text) : undefined;
}

// Everything injected before the compaction is gone from the window (spec
// 20.3): the record starts over, and the lore active in the current scene
// goes back in at once, within budget: entries the scene state names (place,
// time, who is present) and always-on entries scoped to it. The system prompt
// is read afresh, so the bible carries the directives as they are on disk.
export function rebuildAfterCompaction(
  story: Story,
  state: HookState,
  config: Pick<Config, "loreBudget" | "loreScanDepth">,
  random?: () => number,
): { state: HookState; lore: string } {
  const { inForce, keyed } = directiveRecord(story.directives);
  const { entries, injections, report } = activate(story, {
    turn: state.turn,
    prompt: "",
    recent: [],
    scene: sceneStateOf(story),
    injections: [],
    budget: loreBudgetChars(config.loreBudget),
    random,
  });
  return {
    state: { ...state, injections, activation: report, inForce, keyedHashes: keyed },
    lore: renderInjected(entries),
  };
}
