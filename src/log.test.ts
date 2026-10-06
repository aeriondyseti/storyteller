import { describe, expect, test } from "bun:test";
import {
  appendTurn,
  countTurns,
  exchanges,
  formatTurns,
  lastTurns,
  parseLog,
  readLog,
  registerOf,
} from "./log.ts";
import { saltmereDir, tempDir } from "./testing/fixtures.ts";

const fixtureLog = `${saltmereDir}/scenes/003-the-tallow-stair/log.jsonl`;

describe("parseLog", () => {
  test("one turn per line, both halves of an exchange under one number", async () => {
    const turns = await readLog(fixtureLog);
    expect(turns.map((t) => [t.n, t.speaker, t.name])).toEqual([
      [1, "player", "Corwin Hale"],
      [1, "storyteller", "Vex"],
      [2, "player", "Corwin Hale"],
      [2, "storyteller", "Vex"],
    ]);
    expect(turns[1]).toEqual({
      n: 1,
      speaker: "storyteller",
      name: "Vex",
      register: "narrator",
      at: "2026-10-05T20:00:12.000Z",
      uuid: "a1",
      text: "*The Tallow Stair, an hour before dawn.*\n\nMira lifts the lantern.",
    });
  });

  test("skips a torn last line, blank lines and lines that are not turns", () => {
    const good = JSON.stringify({ n: 1, speaker: "storyteller", name: "Vex", text: "Welcome." });
    const text = `${good}\r\n\n{"n":2,"speaker":"x","text":"?"}\n{"n":2,"speaker":"pla`;
    expect(parseLog(text)).toEqual([
      {
        n: 1,
        speaker: "storyteller",
        name: "Vex",
        register: "narrator",
        at: "",
        uuid: "",
        text: "Welcome.",
      },
    ]);
  });

  test("empty or missing logs", async () => {
    expect(parseLog("")).toEqual([]);
    expect(await readLog(`${await tempDir()}/none.jsonl`)).toEqual([]);
    expect(await countTurns(`${await tempDir()}/none.jsonl`)).toBe(0);
  });
});

describe("registerOf", () => {
  test("(( or the copilot tag is copilot; anything else is narrator", () => {
    expect(registerOf("  (( less dread ))")).toBe("copilot");
    expect(registerOf("[register: copilot] [new story] Begin.")).toBe("copilot");
    expect(registerOf("I climb the stair. ((quietly))")).toBe("narrator");
  });
});

describe("formatTurns", () => {
  test("Player: … / <storyteller name>: …", async () => {
    expect(formatTurns(await lastTurns(fixtureLog, 1))).toBe(
      'Player: "You waited."\n\nVex: "Someone had to."',
    );
  });
});

describe("appendTurn", () => {
  test("numbers exchanges, one line per half, creating the folder", async () => {
    const log = `${await tempDir()}/scenes/001-x/log.jsonl`;
    const vex = (uuid: string, text: string) => ({ name: "Vex", uuid, text });
    expect(await appendTurn(log, { storyteller: vex("a1", "Begin."), register: "copilot" })).toBe(
      1,
    );
    expect(
      await appendTurn(log, {
        player: { name: "Corwin Hale", uuid: "p2", text: "Hello.", at: "2026-10-05T20:00:00.000Z" },
        storyteller: vex("a2", "Hi."),
        register: "narrator",
      }),
    ).toBe(2);
    const lines = (await Bun.file(log).text()).split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("");
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({
      n: 2,
      speaker: "player",
      name: "Corwin Hale",
      register: "narrator",
      at: "2026-10-05T20:00:00.000Z",
      uuid: "p2",
      text: "Hello.",
    });
    const turns = await readLog(log);
    expect(turns.map((t) => [t.n, t.speaker, t.register])).toEqual([
      [1, "storyteller", "copilot"],
      [2, "player", "narrator"],
      [2, "storyteller", "narrator"],
    ]);
    expect(Number.isNaN(Date.parse(turns[2]?.at ?? ""))).toBe(false);
    expect(await countTurns(log)).toBe(2);
  });

  test("continues after a torn last line", async () => {
    const log = `${await tempDir()}/log.jsonl`;
    await Bun.write(
      log,
      `${JSON.stringify({ n: 4, speaker: "storyteller", text: "Earlier." })}\n{"n":5,"spe`,
    );
    const n = await appendTurn(log, {
      storyteller: { name: "Vex", uuid: "a", text: "Yes." },
      register: "narrator",
    });
    expect(n).toBe(5);
    expect((await readLog(log)).map((t) => t.text)).toEqual(["Earlier.", "Yes."]);
  });
});

describe("lastTurns and exchanges", () => {
  test("the halves of the last exchanges", async () => {
    expect((await lastTurns(fixtureLog, 1)).map((t) => [t.n, t.speaker])).toEqual([
      [2, "player"],
      [2, "storyteller"],
    ]);
    expect(await lastTurns(fixtureLog, 10)).toHaveLength(4);
    expect(await lastTurns(fixtureLog, 0)).toEqual([]);
    expect(exchanges(await readLog(fixtureLog)).map((g) => g.length)).toEqual([2, 2]);
  });
});
