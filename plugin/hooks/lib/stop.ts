import { generate } from "../../../src/generate.ts";
import { appendTurn, playerName, registerOf } from "../../../src/log.ts";
import {
  findCharacter,
  type LoadOptions,
  loadStory,
  personaOf,
  type Story,
} from "../../../src/story.ts";
import { type HookInput, isStoryDir } from "./io.ts";
import { type HookState, readState, writeState } from "./state.ts";
import { type Exchange, exchangesSince, latestExchange } from "./transcript.ts";

// Stop (spec 7.1): append the exchange that just finished to the open scene's
// log, then regenerate the system prompt file so a compaction or the next
// session starts from the current bible.
//
// Claude Code writes the transcript asynchronously, so when Stop fires the
// file can still lack the turn's last lines (seen live: the final reply line,
// stamped 140 ms before the hook ran, was not on disk yet, and the turn went
// unlogged). So the hook rereads the file for a few seconds until the reply
// it is told about (last_assistant_message) is there, falls back to that text
// when the wait runs out, and logs every exchange since lastLogged, so a turn
// one Stop missed is caught up by the next.

// The launcher speaks for the player to open a blank story; that message is a
// cue, not something the player said, so the log keeps only Vex's half.
export function isOpeningCue(prompt: string): boolean {
  return prompt.includes("[new story]");
}

// The persona's display name, when the persona has a card.
export function playerNameOf(story: Story): string {
  const persona = personaOf(story);
  return (persona && findCharacter(story, persona)?.name) || playerName;
}

// Returns the new state and the logged turn number, if a turn was logged.
// While no scene is open (a blank story being talked into being, or between a
// close and the next open) nothing is logged, but the exchange still counts as
// handled.
export async function recordExchange(
  story: Story,
  exchange: Exchange | undefined,
  state: HookState,
): Promise<{ state: HookState; logged: number | undefined }> {
  if (!exchange || exchange.promptUuid === state.lastLogged || !exchange.reply) {
    return { state, logged: undefined };
  }
  const handled = { ...state, lastLogged: exchange.promptUuid };
  const scene = story.scene;
  if (scene?.status !== "open") return { state: handled, logged: undefined };
  const player = isOpeningCue(exchange.prompt)
    ? undefined
    : {
        name: playerNameOf(story),
        uuid: exchange.promptUuid,
        text: exchange.prompt,
        at: exchange.promptAt,
      };
  const logged = await appendTurn(scene.logPath, {
    player,
    storyteller: {
      name: story.storyteller.name,
      uuid: exchange.replyUuid,
      text: exchange.reply,
      at: exchange.replyAt,
    },
    register: registerOf(exchange.prompt),
  });
  return { state: handled, logged };
}

export type StopOptions = LoadOptions & { waitMs?: number; stepMs?: number };

const squash = (text: string) => text.replace(/s+/g, " ").trim();

// Whether the transcript has caught up with the turn that just ended: its
// latest reply ends with the final text Claude Code reported, or, without
// that text, a reply to a prompt not yet handled is there.
export function caughtUp(
  latest: Exchange | undefined,
  lastLogged: string | undefined,
  finalText: string | undefined,
): boolean {
  if (!latest) return false;
  const final = squash(finalText ?? "");
  if (final) return squash(latest.reply).endsWith(final);
  return latest.reply !== "" && latest.promptUuid !== lastLogged;
}

// The exchanges to log, oldest first. Rereads the transcript until it has
// caught up or `waitMs` runs out; then a new latest exchange still missing the
// final text gets it from the hook input.
export async function pendingExchanges(
  transcriptPath: string,
  lastLogged: string | undefined,
  finalText: string | undefined,
  { waitMs, stepMs }: { waitMs: number; stepMs: number },
): Promise<Exchange[]> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const text = await Bun.file(transcriptPath).text();
    const latest = latestExchange(text);
    const done = caughtUp(latest, lastLogged, finalText);
    if (done) return exchangesSince(text, lastLogged);
    if (Date.now() >= deadline) return withFinalText(exchangesSince(text, lastLogged), finalText);
    await Bun.sleep(stepMs);
  }
}

// The transcript never caught up: the latest pending exchange takes the final
// text from the hook input (with no transcript uuid to point at). When the
// prompt itself is not on disk yet, the latest exchange on disk is an earlier
// turn that already ended, so nothing gets the text, and the next Stop
// catches the exchange up from the transcript.
function withFinalText(pending: Exchange[], finalText: string | undefined): Exchange[] {
  const last = pending.at(-1);
  const final = finalText?.trim() ?? "";
  if (!last || last.ended || !final || squash(last.reply).includes(squash(final))) return pending;
  const reply = last.reply ? `${last.reply}\n\n${final}` : final;
  return [...pending.slice(0, -1), { ...last, replyUuid: "", replyAt: undefined, reply }];
}

export async function stop(input: HookInput, options: StopOptions = {}): Promise<undefined> {
  if (!(await isStoryDir(input.cwd))) return undefined;
  const { waitMs = 3000, stepMs = 250, ...load } = options;
  const story = await loadStory(input.cwd, load);
  const transcript = input.transcript_path;
  if (transcript && (await Bun.file(transcript).exists())) {
    const before = await readState(story.dir);
    const pending = await pendingExchanges(
      transcript,
      before.lastLogged,
      input.last_assistant_message,
      { waitMs, stepMs },
    );
    let state = before;
    for (const exchange of pending) state = (await recordExchange(story, exchange, state)).state;
    if (state !== before) await writeState(story.dir, state);
  }
  await generate(story);
  return undefined;
}
