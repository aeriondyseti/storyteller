import { describe, expect, test } from "bun:test";
import { appendFile } from "node:fs/promises";
import { readLog } from "../../../src/log.ts";
import { loadStory } from "../../../src/story.ts";
import { blankDir, copyStory, fixtureLibrary, saltmereDir } from "../../../src/testing/fixtures.ts";
import { type HookState, readState, writeState } from "./state.ts";
import { playerNameOf, recordExchange, stop } from "./stop.ts";
import type { Exchange } from "./transcript.ts";

const fresh: HookState = { turn: 3, injections: [], lastLogged: undefined };
const load = (dir: string) => loadStory(dir, { libraryRoot: fixtureLibrary });
const exchange: Exchange = {
  promptUuid: "u9",
  promptAt: "2026-10-05T20:00:00.000Z",
  prompt: "I hold out the map.",
  replyUuid: "a9",
  replyAt: "2026-10-05T20:00:07.000Z",
  reply: "Mira takes it.",
};

describe("recordExchange", () => {
  test("appends both halves to the open scene's log as the next turn", async () => {
    const story = await load(await copyStory(saltmereDir));
    const { state, logged } = await recordExchange(story, exchange, fresh);
    expect(logged).toBe(3);
    expect(state).toEqual({ ...fresh, lastLogged: "u9" });
    expect((await readLog(story.scene?.logPath ?? "")).slice(-2)).toEqual([
      {
        n: 3,
        speaker: "player",
        name: "Corwin Hale",
        register: "narrator",
        at: "2026-10-05T20:00:00.000Z",
        uuid: "u9",
        text: "I hold out the map.",
      },
      {
        n: 3,
        speaker: "storyteller",
        name: "Vex",
        register: "narrator",
        at: "2026-10-05T20:00:07.000Z",
        uuid: "a9",
        text: "Mira takes it.",
      },
    ]);
  });

  test("a (( prompt logs both halves in the copilot register", async () => {
    const story = await load(await copyStory(saltmereDir));
    await recordExchange(story, { ...exchange, prompt: "(( less dread ))" }, fresh);
    const halves = (await readLog(story.scene?.logPath ?? "")).slice(-2);
    expect(halves.map((t) => t.register)).toEqual(["copilot", "copilot"]);
  });

  test("never appends the same prompt's exchange twice", async () => {
    const story = await load(await copyStory(saltmereDir));
    const first = await recordExchange(story, exchange, fresh);
    const second = await recordExchange(story, exchange, first.state);
    expect(second.logged).toBeUndefined();
    expect(second.state).toBe(first.state);
    expect(await readLog(story.scene?.logPath ?? "")).toHaveLength(6);
  });

  test("logs only the reply for the launcher's opening cue, in the copilot register", async () => {
    const story = await load(await copyStory(saltmereDir));
    const cue = {
      ...exchange,
      promptUuid: "u1",
      prompt: "[register: copilot] [new story] Begin.",
      reply: "(( Hello. ))",
    };
    await recordExchange(story, cue, fresh);
    const turns = await readLog(story.scene?.logPath ?? "");
    expect(turns).toHaveLength(5);
    expect(turns.at(-1)).toMatchObject({ n: 3, speaker: "storyteller", register: "copilot" });
  });

  test("marks the exchange handled but logs nothing while no scene is open", async () => {
    const story = await load(blankDir);
    expect(await recordExchange(story, exchange, fresh)).toEqual({
      state: { ...fresh, lastLogged: "u9" },
      logged: undefined,
    });
    const closed = await load(await copyStory(saltmereDir));
    for (const s of closed.scenes) s.status = "closed";
    closed.scene = closed.scenes.at(-1);
    expect((await recordExchange(closed, exchange, fresh)).logged).toBeUndefined();
  });

  test("leaves the state alone when there is no reply text yet", async () => {
    const story = await load(await copyStory(saltmereDir));
    const result = await recordExchange(story, { ...exchange, reply: "" }, fresh);
    expect(result).toEqual({ state: fresh, logged: undefined });
  });
});

describe("playerNameOf", () => {
  test("the persona's card name, else Player", async () => {
    expect(playerNameOf(await load(saltmereDir))).toBe("Corwin Hale");
    expect(playerNameOf(await load(blankDir))).toBe("Player");
  });
});

describe("stop", () => {
  test("logs from the transcript, saves the state and regenerates the prompt file", async () => {
    const dir = await copyStory(saltmereDir);
    await writeState(dir, {
      turn: 7,
      injections: [{ ref: "lore/the-pact", turn: 6, hash: "h", chars: 9 }],
      lastLogged: undefined,
    });
    const transcript = `${dir}/transcript.jsonl`;
    await Bun.write(
      transcript,
      [
        JSON.stringify({ type: "user", uuid: "u1", message: { content: "I wait." } }),
        JSON.stringify({
          type: "assistant",
          uuid: "a1",
          message: { content: [{ type: "text", text: "Rain." }] },
        }),
      ].join("\n"),
    );
    await stop({ cwd: dir, transcript_path: transcript }, { libraryRoot: fixtureLibrary });

    const logged = await readLog(`${dir}/scenes/003-the-tallow-stair/log.jsonl`);
    expect(logged.slice(-2).map((t) => [t.n, t.speaker, t.uuid, t.text])).toEqual([
      [3, "player", "u1", "I wait."],
      [3, "storyteller", "a1", "Rain."],
    ]);
    expect(await readState(dir)).toEqual({
      turn: 7,
      injections: [{ ref: "lore/the-pact", turn: 6, hash: "h", chars: 9 }],
      lastLogged: "u1",
    });
    expect(await Bun.file(`${dir}/.rp/system-prompt.md`).text()).toContain(
      "# Story bible: Saltmere",
    );
  });
});

// A sanitized excerpt of a live transcript (Claude Code 2.1.290) whose turn
// went unlogged: Stop fired while the final reply line was not on disk yet.
// The previous turn (u1) is logged and ended; u2's turn called a tool and
// then answered in one text line, the line that lagged.
const line = (fields: Record<string, unknown>) => JSON.stringify({ isSidechain: false, ...fields });
const loggedTurn = [
  line({
    type: "user",
    uuid: "u1",
    promptSource: "typed",
    message: { content: "((Rewrite the widgets.))" },
  }),
  line({
    type: "assistant",
    uuid: "a1",
    message: { content: [{ type: "text", text: "((Done.))" }] },
  }),
  line({ type: "system", subtype: "stop_hook_summary", hookCount: 1, hookErrors: [] }),
  line({ type: "system", subtype: "turn_duration", durationMs: 14772 }),
];
const laggingTurn = [
  line({
    type: "user",
    uuid: "u2",
    promptSource: "typed",
    timestamp: "2026-10-06T03:45:43.946Z",
    message: { content: 'Can you shorten the "Now" section?' },
  }),
  line({ type: "attachment", attachment: { type: "total_tokens_reminder" } }),
  line({
    type: "attachment",
    attachment: { type: "hook_additional_context", content: ["[register: narrator]"] },
  }),
  line({
    type: "assistant",
    uuid: "a2",
    message: { content: [{ type: "thinking", thinking: "" }] },
  }),
  line({
    type: "assistant",
    uuid: "a3",
    message: {
      content: [{ type: "tool_use", id: "t1", name: "mcp__world__set_scene_state", input: {} }],
    },
  }),
  line({
    type: "user",
    uuid: "r1",
    message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
  }),
  line({ type: "attachment", attachment: { type: "total_tokens_reminder" } }),
];
const finalText = "((I can't shorten Now myself.))";
const finalLine = line({
  type: "assistant",
  uuid: "a4",
  timestamp: "2026-10-06T03:45:58.571Z",
  message: { content: [{ type: "text", text: finalText }] },
});
const fast = { libraryRoot: fixtureLibrary, waitMs: 300, stepMs: 20 };
const sceneLog = (dir: string) => `${dir}/scenes/003-the-tallow-stair/log.jsonl`;

async function lagSetup(lines: string[], lastLogged = "u1") {
  const dir = await copyStory(saltmereDir);
  await writeState(dir, { turn: 7, injections: [], lastLogged });
  const transcript = `${dir}/transcript.jsonl`;
  await Bun.write(transcript, `${lines.join("\n")}\n`);
  return { dir, transcript };
}

describe("stop with a lagging transcript", () => {
  test("rereads the transcript until the reply it was told about lands", async () => {
    const { dir, transcript } = await lagSetup([...loggedTurn, ...laggingTurn]);
    const late = Bun.sleep(80).then(async () => {
      await appendFile(transcript, `${finalLine}\n`);
    });
    await stop({ cwd: dir, transcript_path: transcript, last_assistant_message: finalText }, fast);
    await late;
    const logged = await readLog(sceneLog(dir));
    expect(logged.slice(-2).map((t) => [t.speaker, t.uuid, t.text])).toEqual([
      ["player", "u2", 'Can you shorten the "Now" section?'],
      ["storyteller", "a4", finalText],
    ]);
    expect((await readState(dir)).lastLogged).toBe("u2");
  });

  test("falls back to the final text from the hook input when the wait runs out", async () => {
    const { dir, transcript } = await lagSetup([...loggedTurn, ...laggingTurn]);
    await stop({ cwd: dir, transcript_path: transcript, last_assistant_message: finalText }, fast);
    expect((await readLog(sceneLog(dir))).at(-1)).toMatchObject({
      speaker: "storyteller",
      uuid: "",
      text: finalText,
    });
    expect((await readState(dir)).lastLogged).toBe("u2");
  });

  test("gives the final text to no one while the prompt itself is not on disk", async () => {
    const { dir, transcript } = await lagSetup(loggedTurn);
    const before = await readLog(sceneLog(dir));
    await stop({ cwd: dir, transcript_path: transcript, last_assistant_message: finalText }, fast);
    expect(await readLog(sceneLog(dir))).toEqual(before);
    expect((await readState(dir)).lastLogged).toBe("u1");
  });

  test("the next Stop catches up every exchange since the last logged one, in order", async () => {
    const third = [
      line({ type: "system", subtype: "stop_hook_summary" }),
      line({ type: "user", uuid: "u3", message: { content: "Thanks." } }),
      line({
        type: "assistant",
        uuid: "a5",
        message: { content: [{ type: "text", text: "((Any time.))" }] },
      }),
    ];
    const { dir, transcript } = await lagSetup([
      ...loggedTurn,
      ...laggingTurn,
      finalLine,
      ...third,
    ]);
    await stop(
      { cwd: dir, transcript_path: transcript, last_assistant_message: "((Any time.))" },
      fast,
    );
    const logged = await readLog(sceneLog(dir));
    expect(logged.slice(-4).map((t) => [t.n, t.uuid])).toEqual([
      [3, "u2"],
      [3, "a4"],
      [4, "u3"],
      [4, "a5"],
    ]);
    expect((await readState(dir)).lastLogged).toBe("u3");
  });
});
