import { describe, expect, test } from "bun:test";
import { exchangesSince, latestExchange } from "./transcript.ts";

// Lines shaped like a real Claude Code transcript (see transcript.ts).
const user = (uuid: string, content: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "user",
    uuid,
    isSidechain: false,
    message: { role: "user", content },
    ...extra,
  });
const assistant = (uuid: string, block: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "assistant",
    uuid,
    isSidechain: false,
    message: { id: "msg_1", role: "assistant", content: [block] },
    ...extra,
  });
const text = (t: string) => ({ type: "text", text: t });
const toolUse = { type: "tool_use", id: "toolu_1", name: "Read", input: {} };
const toolResult = [{ type: "tool_result", tool_use_id: "toolu_1", content: "file body" }];

const jsonl = (...lines: string[]) => `${lines.join("\n")}\n`;

describe("latestExchange", () => {
  test("pairs the last prompt with the text of every assistant line after it", () => {
    const transcript = jsonl(
      user("u1", "First prompt."),
      assistant("a1", text("First reply.")),
      user("u2", "I set the map on the table."),
      JSON.stringify({ type: "attachment", attachment: { type: "hook_additional_context" } }),
      assistant("a2", { type: "thinking", thinking: "hmm" }),
      assistant("a3", text("Mira does not look at it.")),
      assistant("a4", toolUse),
      user("u3", toolResult),
      assistant("a5", text("She folds her hands."), { timestamp: "2026-10-05T20:00:09.000Z" }),
      assistant("a6", toolUse),
    );
    expect(latestExchange(transcript)).toEqual({
      promptUuid: "u2",
      promptAt: undefined,
      prompt: "I set the map on the table.",
      replyUuid: "a5",
      replyAt: "2026-10-05T20:00:09.000Z",
      reply: "Mira does not look at it.\n\nShe folds her hands.",
    });
  });

  test("accepts a prompt given as an array of text blocks", () => {
    const transcript = jsonl(
      user("u1", [text("(( less dread ))"), { type: "image", source: {} }]),
      assistant("a1", text("(( Done. ))")),
    );
    expect(latestExchange(transcript)?.prompt).toBe("(( less dread ))");
  });

  test("skips user lines that are not prompts", () => {
    const transcript = jsonl(
      user("u1", "The real prompt."),
      user("m1", [text("Base directory for this skill: ...")], { isMeta: true }),
      user("t1", "<task-notification>done</task-notification>", { promptSource: "system" }),
      user("c1", "Summary of the conversation so far.", { isCompactSummary: true }),
      user("i1", [text("[Request interrupted by user]")]),
      user("s1", "<command-name>/directives</command-name>"),
      user("r1", toolResult),
      assistant("a1", text("Reply.")),
    );
    expect(latestExchange(transcript)).toMatchObject({ promptUuid: "u1", reply: "Reply." });
  });

  test("ignores subagent (sidechain) lines and duplicated uuids", () => {
    const transcript = jsonl(
      user("u1", "Prompt."),
      user("x1", "Subagent task.", { isSidechain: true }),
      assistant("x2", text("Subagent reply."), { isSidechain: true }),
      assistant("a1", text("Reply.")),
      assistant("a1", text("Reply.")),
    );
    expect(latestExchange(transcript)).toMatchObject({
      promptUuid: "u1",
      prompt: "Prompt.",
      replyUuid: "a1",
      reply: "Reply.",
    });
  });

  test("returns an empty reply when the assistant has not answered in text", () => {
    const transcript = jsonl(
      user("u1", "Prompt.", { timestamp: "2026-10-05T20:00:00.000Z" }),
      assistant("a1", toolUse),
    );
    expect(latestExchange(transcript)).toMatchObject({
      promptAt: "2026-10-05T20:00:00.000Z",
      replyUuid: "",
      replyAt: undefined,
      reply: "",
    });
  });

  test("survives a torn last line and an empty transcript", () => {
    expect(latestExchange(`${user("u1", "Prompt.")}\n{"type":"assis`)?.promptUuid).toBe("u1");
    expect(latestExchange("")).toBeUndefined();
  });
});

describe("exchangesSince", () => {
  const turnEnd = (subtype: string) => JSON.stringify({ type: "system", subtype });
  const transcript = jsonl(
    user("u1", "First."),
    assistant("a1", text("One.")),
    turnEnd("stop_hook_summary"),
    user("u2", "Second."),
    assistant("a2", toolUse),
    user("r2", toolResult),
    assistant("a3", text("Two.")),
    turnEnd("turn_duration"),
    user("u3", "Third."),
    assistant("a4", text("Three.")),
  );

  test("every exchange after the last logged prompt, oldest first", () => {
    expect(exchangesSince(transcript, "u1").map((e) => [e.promptUuid, e.reply])).toEqual([
      ["u2", "Two."],
      ["u3", "Three."],
    ]);
    expect(exchangesSince(transcript, "u3")).toEqual([]);
  });

  test("only the latest when the last logged prompt is unset or not in this transcript", () => {
    expect(exchangesSince(transcript, undefined).map((e) => e.promptUuid)).toEqual(["u3"]);
    expect(exchangesSince(transcript, "elsewhere").map((e) => e.promptUuid)).toEqual(["u3"]);
  });

  test("marks an exchange ended once the transcript shows its Stop hooks ran", () => {
    expect(exchangesSince(transcript, "u1").map((e) => e.ended)).toEqual([true, undefined]);
  });
});
