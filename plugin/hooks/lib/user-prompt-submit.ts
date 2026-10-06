import { activationScores } from "../../../server/index/activation-scores.ts";
import type { Embedder } from "../../../server/index/embedder.ts";
import {
  activate,
  loreBudgetChars,
  type SemanticScore,
  scanDepthNeeded,
  sceneStateOf,
} from "../../../src/activation.ts";
import { type Config, defaultConfig, loadConfig } from "../../../src/config.ts";
import { type DirectiveRecord, directiveDeltas } from "../../../src/directive-deltas.ts";
import { exchanges, lastTurns, registerOf, type Turn } from "../../../src/log.ts";
import { playerName, renderInjected, renderStateHeader } from "../../../src/render.ts";
import { type LoadOptions, loadStory, type Story } from "../../../src/story.ts";
import { additionalContext, type HookInput, isStoryDir } from "./io.ts";
import { type HookState, readState, writeState } from "./state.ts";

// UserPromptSubmit (spec 6, 16, 20.2): before Vex sees the player's message, add
//
//   [register: narrator|copilot]
//   [scene 3: The Tallow Stair · ... · present: Mira, Edda]
//   Directives changed since the bible was written: (only on a turn after a
//   directive in force was switched, edited, added or removed, spec 6)
//   Lore in play: / Directives in play: (what activation chose this turn;
//   "(updated)" after a title when an older version is in the window; lore
//   with its truth and discovery tags, Secret and History, spec 20.11)
//   Names that keep coming up with no lore or card: ... (once per name,
//   from the notes job's `suggest` list, spec 20.11)

export type PromptContextOptions = {
  semantic?: readonly SemanticScore[] | undefined;
  sessionId?: string | undefined;
  config?: Pick<Config, "loreBudget" | "loreScanDepth"> | undefined;
  random?: (() => number) | undefined;
};

export function buildPromptContext(
  story: Story,
  prompt: string,
  recent: Turn[],
  state: HookState,
  options: PromptContextOptions = {},
): { context: string; state: HookState } {
  const { sessionId } = options;
  const config = options.config ?? defaultConfig;
  const turn = state.turn + 1;
  const deltas = directiveDeltas(story.directives, previousRecord(state, sessionId));
  const player = playerName(story);
  const { entries, injections, report } = activate(story, {
    turn,
    prompt,
    recent: exchanges(recent).map((halves) => halves.map((t) => t.text).join("\n\n")),
    scene: sceneStateOf(story),
    injections: state.injections,
    semantic: options.semantic,
    scanDepth: config.loreScanDepth,
    budget: loreBudgetChars(config.loreBudget),
    random: options.random,
    player,
  });
  const suggestions = newSuggestions(story, state.suggest ?? [], state.suggested ?? []);
  const context = [
    `[register: ${registerOf(prompt)}]`,
    renderStateHeader(story),
    deltas.block && `\n${deltas.block}`,
    renderInjected(entries, player),
    suggestions.length > 0 && `\n${suggestionLine(suggestions)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const next: HookState = {
    ...state,
    turn,
    injections,
    activation: report,
    inForce: deltas.record.inForce,
    keyedHashes: deltas.record.keyed,
  };
  if (suggestions.length > 0) next.suggested = [...(state.suggested ?? []), ...suggestions];
  if (sessionId !== undefined) next.sessionId = sessionId;
  return { context, state: next };
}

export function suggestionLine(names: readonly string[]): string {
  return `Names that keep coming up with no lore or card: ${names.join(", ")}. Record them if they matter.`;
}

// Names the notes job keeps listing (spec 20.11) that Vex has not been told
// about and that still have no lore entry (title or key) and no card. Vex may
// have recorded one since the notes job listed it.
export function newSuggestions(
  story: Pick<Story, "lore" | "characters">,
  suggest: readonly string[],
  suggested: readonly string[],
): string[] {
  const seen = new Set(suggested.map(fold));
  for (const l of story.lore) for (const name of [l.title, ...l.keys]) seen.add(fold(name));
  for (const c of story.characters) for (const name of [c.name, c.stem]) seen.add(fold(name));
  const fresh: string[] = [];
  for (const name of suggest.map((n) => n.trim())) {
    if (!name || seen.has(fold(name))) continue;
    seen.add(fold(name));
    fresh.push(name);
  }
  return fresh;
}

function fold(name: string): string {
  return name.trim().toLowerCase();
}

// No record, or a record from another session (whose system prompt was
// rendered afresh at launch): the bible already carries the current set.
function previousRecord(
  state: HookState,
  sessionId: string | undefined,
): DirectiveRecord | undefined {
  if (!state.inForce || sessionId !== state.sessionId) return undefined;
  return { inForce: state.inForce, keyed: state.keyedHashes ?? {} };
}

export type PromptHookOptions = LoadOptions & { embedder?: Embedder | undefined };

export async function userPromptSubmit(
  input: HookInput,
  options: PromptHookOptions = {},
): Promise<string | undefined> {
  if (!(await isStoryDir(input.cwd))) return undefined;
  const story = await loadStory(input.cwd, options);
  const config = await loadConfig();
  const prompt = input.prompt ?? "";
  const depth = scanDepthNeeded(story, config.loreScanDepth);
  const recent = story.scene ? await lastTurns(story.scene.logPath, depth) : [];
  const semantic = await activationScores(story.dir, semanticQueries(prompt, recent), {
    config,
    embedder: options.embedder,
  });
  const { context, state } = buildPromptContext(story, prompt, recent, await readState(story.dir), {
    semantic,
    sessionId: input.session_id,
    config,
  });
  await writeState(story.dir, state);
  return additionalContext("UserPromptSubmit", context);
}

// The prompt and the last exchange, embedded separately: one long text would be
// cut at the model's input limit, and the prompt is what matters most.
export function semanticQueries(prompt: string, recent: Turn[]): string[] {
  const last = exchanges(recent).at(-1) ?? [];
  const exchange = last
    .map((t) => t.text)
    .join("\n\n")
    .trim();
  return [prompt, exchange].filter((q) => q.trim() !== "");
}
