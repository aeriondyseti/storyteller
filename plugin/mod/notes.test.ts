import type { ModelCompleteResult, On } from "claude-code";
import { describe, expect, mock, test } from "claude-code/testing";
import {
  lastExchanges,
  parseLogTurns,
  parseNames,
  parseNotes,
  renderTurns,
  tallyNames,
  unknownNames,
  withNotes,
} from "./notes.ts";

// The notes job against an in-memory story folder: $.fs, $.session.cwd,
// $.model.complete and $.process.run are answered by the test's own hooks,
// which sit beneath the plugin where the engine would.

const story = "C:/stories/hollow";
const library = "C:/library";
const sceneMd = `${story}/scenes/001-arrival/scene.md`;
const logJsonl = `${story}/scenes/001-arrival/log.jsonl`;
const stateJson = `${story}/.rp/state.json`;

const sceneText = `---
number: 1
title: Arrival
status: open
present: [corwin, mira]
persona: corwin
---

## Now

Corwin is at the door.

## Notes

### Threads

- open: The letter.

### People

### Continuity

- It is cold.
`;

type Half = [n: number, speaker: "player" | "storyteller", text: string, register?: string];
const jsonl = (halves: Half[]) =>
  halves
    .map(([n, speaker, text, register = "narrator"]) =>
      JSON.stringify({
        n,
        speaker,
        name: speaker === "player" ? "Corwin Hale" : "Vex",
        register,
        at: "2026-10-05T20:00:00.000Z",
        uuid: `${speaker}-${n}`,
        text,
      }),
    )
    .map((line) => `${line}\n`)
    .join("");

const halves: Half[] = [
  [1, "player", "I knock."],
  [1, "storyteller", "Mira opens the door."],
  [2, "player", "I step inside."],
  [2, "storyteller", "She bars the door behind you."],
];
const logText = jsonl(halves);

const reply = `## Now

Corwin is inside the chandlery and Mira has barred the door. Neither has spoken of the debt.

## Notes

### Threads

- open: The letter.

### People

#### mira
- knows: Corwin is back.
- suspects: nothing yet
- feels: Wary.

### Continuity

- It is cold.
- The door is barred.
`;

const usage = {
  input_tokens: 1,
  output_tokens: 1,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

type World = {
  files: Map<string, string>;
  prompts: { model: string; prompt: string; system: string | undefined }[];
  runs: string[][];
  logs: string[];
};

// The engine hands fs hooks native paths (backslashes on Windows).
const slash = (path: string) => path.replaceAll("\\", "/");

// The test environment has no file system, so the plugin's own prompt file is
// stood in for too. Matched on "/prompts/notes.md" alone: scripts/test-mod.ts
// stages the mod in a temporary folder, so $.plugin.root is not ".../plugin".
const notesPromptText = "# Scene notes keeper (stand-in)";

function world(
  on: On,
  files: Record<string, string>,
  answer: ModelCompleteResult = { isAnswered: true, text: reply, usage },
): World {
  const w: World = { files: new Map(Object.entries(files)), prompts: [], runs: [], logs: [] };
  const isDir = (path: string) => [...w.files.keys()].some((f) => f.startsWith(`${path}/`));
  on("session.cwd", () => ({ value: story }));
  on("fs.exists", (_$, e) => ({ value: w.files.has(slash(e.path)) || isDir(slash(e.path)) }));
  on("fs.read", (_$, e) => {
    if (slash(e.path).endsWith("/prompts/notes.md")) return { value: notesPromptText };
    const text = w.files.get(slash(e.path));
    if (text === undefined) throw new Error(`ENOENT ${e.path}`);
    return { value: text };
  });
  on("fs.write", (_$, e) => {
    w.files.set(slash(e.path), e.text);
    return { value: undefined };
  });
  on("fs.list", (_$, e) => {
    const dir = slash(e.path);
    const names = new Map<string, "file" | "dir">();
    for (const f of w.files.keys()) {
      if (!f.startsWith(`${dir}/`)) continue;
      const [name, ...rest] = f.slice(dir.length + 1).split("/");
      if (name) names.set(name, rest.length ? "dir" : "file");
    }
    return {
      value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })),
    };
  });
  on("model.complete", (_$, e) => {
    w.prompts.push({ model: e.model, prompt: e.prompt, system: e.system });
    return { value: answer };
  });
  on("process.run", (_$, e) => {
    // The stage's scene read (plugin/scene.ts) runs after every turn too; it
    // prints nothing here, and only the notes job's runs are recorded.
    if (!e.argv[1]?.endsWith("/scene.ts")) w.runs.push([...e.argv]);
    return {
      value: {
        exitCode: 0,
        stdout: "",
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  on("ui.log", (_$, e) => {
    w.logs.push(e.text);
    return { value: undefined };
  });
  on("turn.complete", () => ({ text: "" }));
  on("turn.start", (_$, e) => ({ turnId: e.turnId }));
  return w;
}

function storyFiles(extra: Record<string, string> = {}): Record<string, string> {
  return {
    [`${story}/story.md`]:
      "---\ntitle: The Hollow Crown\npersona: corwin\nuses:\n  - characters/edda\n---\n",
    [`${story}/characters/corwin.md`]: "---\nname: Corwin\n---\n",
    [`${story}/characters/mira.md`]: "---\nname: Mira\n---\n",
    [sceneMd]: sceneText,
    [logJsonl]: logText,
    [stateJson]: JSON.stringify({ turn: 2, injected: {} }),
    ...extra,
  };
}

const finished = {
  answer: "She bars the door behind you.",
  durationMs: 10,
  isAborted: false,
  turnId: "t1",
  reason: "answer",
} as const;

// Later than every `at` in the fixture log, so only the signal a test sets up
// can tell the job that its turn was logged.
const afterLog = { now: Date.parse("2026-10-06T00:00:00.000Z") };

describe("notes job", () => {
  test("rewrites Now and Notes in scene.md after a narrator turn", async ($, on) => {
    const clock = mock.clock(on);
    const w = world(on, storyFiles());
    await $.turn.complete(finished);
    await clock.advance(1000);

    expect(w.logs).toEqual([]);
    expect(w.prompts.length).toBe(1);
    const sent = w.prompts[0];
    expect(sent?.model).toBe("haiku");
    expect(sent?.system).toBe(notesPromptText);
    expect(sent?.prompt).toContain("<persona>\ncorwin\n</persona>");
    expect(sent?.prompt).toContain("<cast>\nedda\nmira\n</cast>");
    expect(sent?.prompt).toContain("<previous_notes>\n## Now\n\nCorwin is at the door.");
    expect(sent?.prompt).toContain("### 2 · Vex\n\nShe bars the door behind you.\n</turns>");

    const scene = w.files.get(sceneMd) ?? "";
    expect(scene).toStartWith(
      "---\nnumber: 1\ntitle: Arrival\nstatus: open\npresent: [corwin, mira]\npersona: corwin\n---\n\n## Now\n\nCorwin is inside the chandlery",
    );
    expect(scene).toContain("#### mira\n- knows: Corwin is back.");
    expect(scene).toContain("- The door is barred.");
    expect(scene).not.toContain("Corwin is at the door.");

    const state = JSON.parse(w.files.get(stateJson) ?? "{}");
    expect(state).toEqual({ turn: 2, injected: {}, notesTurn: 1, notesUpdatedAt: 2 });
    expect(w.runs.length).toBe(1);
    expect(w.runs[0]?.slice(0, 1)).toEqual(["bun"]);
    expect(w.runs[0]?.[1]).toEndWith("/../scripts/reindex.ts");
    expect(w.runs[0]?.slice(2)).toEqual([story, "--incremental"]);
  });

  test("waits for the Stop hook to log the turn", async ($, on) => {
    const clock = mock.clock(on);
    const early = `${jsonl(halves.slice(0, 3))}{"n":2,"speaker":"storyteller","te`;
    const w = world(on, storyFiles({ [logJsonl]: early }));
    await $.turn.complete(finished);
    await clock.advance(600);
    expect(w.prompts.length).toBe(0);
    w.files.set(logJsonl, logText);
    await clock.advance(600);
    expect(w.prompts.length).toBe(1);
  });

  test("skips copilot-register turns and counts to notesEvery", async ($, on) => {
    const clock = mock.clock(on);
    const ooc = jsonl([
      ...halves.slice(0, 2),
      [2, "player", "(( make Mira warmer ))", "copilot"],
      [2, "storyteller", "She bars the door behind you.", "copilot"],
    ]);
    const w = world(on, storyFiles({ [logJsonl]: ooc }));
    await $.turn.complete(finished);
    await clock.advance(1000);
    expect(w.prompts.length).toBe(0);
    expect(JSON.parse(w.files.get(stateJson) ?? "{}").notesTurn).toBeUndefined();
  });

  test("every second turn when notesEvery is 2", { options: { notesEvery: 2 } }, async ($, on) => {
    const clock = mock.clock(on);
    const w = world(on, storyFiles());
    await $.turn.complete(finished);
    await clock.advance(1000);
    expect(w.prompts.length).toBe(0);
    await $.turn.complete(finished);
    await clock.advance(1000);
    expect(w.prompts.length).toBe(1);
  });

  test("a bad reply leaves scene.md alone and says so in one line", async ($, on) => {
    const clock = mock.clock(on);
    const w = world(on, storyFiles(), { isAnswered: false, reason: "empty-reply", usage });
    await $.turn.complete(finished);
    await clock.advance(1000);
    expect(w.files.get(sceneMd)).toBe(sceneText);
    // ui.log puts the plugin's name in front; the job adds none of its own.
    expect(w.logs).toEqual(["notes not updated (the notes model gave no reply (empty-reply))"]);
  });

  test("lastLogged moving is enough, whatever the logged text", async ($, on) => {
    const clock = mock.clock(on, afterLog);
    const w = world(
      on,
      storyFiles({
        [logJsonl]: jsonl(halves.slice(0, 2)),
        [stateJson]: JSON.stringify({ turn: 2, lastLogged: "player-1" }),
      }),
    );
    await $.turn.complete({ ...finished, answer: "Not what the log will say." });
    await clock.advance(600);
    expect(w.prompts.length).toBe(0);
    // The Stop hook: append, then lastLogged (the player half's uuid).
    w.files.set(logJsonl, logText);
    w.files.set(stateJson, JSON.stringify({ turn: 2, lastLogged: "player-2" }));
    await clock.advance(600);
    expect(w.prompts.length).toBe(1);
    expect(w.logs).toEqual([]);
  });

  test("lastLogged moving with nothing appended ends quietly", async ($, on) => {
    const clock = mock.clock(on, afterLog);
    const w = world(on, storyFiles({ [stateJson]: JSON.stringify({ lastLogged: "player-2" }) }));
    await $.turn.complete({ ...finished, answer: "A reply the hook did not log." });
    await clock.advance(10);
    w.files.set(stateJson, JSON.stringify({ lastLogged: "player-3" }));
    await clock.advance(1000);
    expect(w.prompts.length).toBe(0);
    expect(w.logs).toEqual([]);
    expect(JSON.parse(w.files.get(stateJson) ?? "{}").notesTurn).toBeUndefined();
  });

  test("a turn never logged leaves one line in hook-errors.log", async ($, on) => {
    const clock = mock.clock(on, afterLog);
    const w = world(on, storyFiles({ [stateJson]: JSON.stringify({ lastLogged: "player-2" }) }));
    await $.turn.complete({ ...finished, answer: "A reply that never reaches the log." });
    await clock.advance(25_000);
    expect(w.prompts.length).toBe(0);
    expect(w.logs).toEqual([
      "notes not updated (turn not logged within 20s; see .rp/hook-errors.log)",
    ]);
    expect(w.files.get(`${story}/.rp/hook-errors.log`)).toBe(
      `2026-10-06T00:00:20.000Z notes: turn not logged log=${logJsonl} exists=true lines=4->4 last=storyteller logged="She bars the door behind you." answer="A reply that never reaches the log." lastLogged=player-2->player-2\n`,
    );
  });

  test("a copilot prompt or a slash command is skipped without waiting", async ($, on) => {
    const clock = mock.clock(on, afterLog);
    const w = world(on, storyFiles({ [logJsonl]: jsonl(halves.slice(0, 2)) }));
    for (const text of ["(( make Mira warmer ))", "/storyteller:recap"]) {
      await $.turn.start({ text, turnId: "t1" });
      await $.turn.complete({ ...finished, answer: "Never logged." });
    }
    await clock.advance(25_000);
    expect(w.logs).toEqual([]);
    expect(w.files.has(`${story}/.rp/hook-errors.log`)).toBe(false);
  });

  test("tallies names with no lore or card and suggests them at two runs", async ($, on) => {
    const clock = mock.clock(on);
    mock.env(on, { RP_LIBRARY: library });
    const names =
      "\n## Names\n\n- Brother Anselm\n- Mira\n- the Lamp Hall\n- Varrow\n- Tallow Stair\n";
    const w = world(
      on,
      storyFiles({
        [`${story}/story.md`]:
          "---\ntitle: The Hollow Crown\npersona: corwin\nuses:\n  - characters/edda\n  - lore/varrow-city\n  - lore/old-gods/ysolde\n---\n",
        [`${story}/characters/mira.md`]: "---\nname: Mira Tessaly\n---\n",
        [`${story}/lore/lamp-hall.md`]:
          "---\ntitle: The Lamp Hall\nkeys: [lamp hall]\n---\nText.\n",
        [`${library}/characters/edda.md`]: "---\nname: Edda Vane\n---\n",
        [`${library}/lore/varrow-city/varrow.md`]: "---\ntitle: Varrow\nkeys:\n  - harbour\n---\n",
        [`${library}/lore/old-gods/ysolde.md`]: "---\ntitle: Ysolde\n---\n",
        [stateJson]: JSON.stringify({ turn: 2, suggested: ["Old"], keyedHashes: { a: "1" } }),
      }),
      { isAnswered: true, text: `${reply}${names}`, usage },
    );
    await $.turn.complete(finished);
    await clock.advance(1000);

    const sent = w.prompts[0]?.prompt ?? "";
    expect(sent).toContain(
      "<known_names>\nCorwin\nedda\nEdda Vane\nharbour\nlamp hall\nmira\nMira Tessaly\nThe Lamp Hall\nVarrow\nYsolde\n</known_names>",
    );
    // The names never reach scene.md.
    expect(w.files.get(sceneMd)).not.toContain("Anselm");
    expect(w.files.get(sceneMd)).toContain("- The door is barred.\n");
    let state = JSON.parse(w.files.get(stateJson) ?? "{}");
    expect(state.nameTally).toEqual({ "Brother Anselm": 1, "Tallow Stair": 1 });
    expect(state.suggest).toEqual([]);

    await $.turn.complete(finished);
    await clock.advance(1000);
    state = JSON.parse(w.files.get(stateJson) ?? "{}");
    expect(state.nameTally).toEqual({ "Brother Anselm": 2, "Tallow Stair": 2 });
    expect(state.suggest).toEqual(["Brother Anselm", "Tallow Stair"]);
    expect(state.suggested).toEqual(["Old"]);
    expect(state.keyedHashes).toEqual({ a: "1" });
    expect(state.notesTurn).toBe(2);
    expect(w.logs).toEqual([]);
  });

  test("a reply without names still updates the notes", async ($, on) => {
    const clock = mock.clock(on);
    mock.env(on, { RP_LIBRARY: library });
    const w = world(on, storyFiles(), {
      isAnswered: true,
      text: `${reply}\n## Names\n\nBrother Anselm, Tallow Stair\n`,
      usage,
    });
    await $.turn.complete(finished);
    await clock.advance(1000);
    expect(w.files.get(sceneMd)).toContain("- The door is barred.");
    expect(w.files.get(sceneMd)).not.toContain("Anselm");
    expect(JSON.parse(w.files.get(stateJson) ?? "{}").nameTally).toBeUndefined();
    expect(w.logs).toEqual([]);
  });

  test("subagent turns and interrupted turns do nothing", async ($, on) => {
    const clock = mock.clock(on);
    const w = world(on, storyFiles());
    await $.turn.complete({ ...finished, agentId: "a1" });
    await $.turn.complete({ ...finished, reason: "aborted", isAborted: true });
    await clock.advance(1000);
    expect(w.prompts.length).toBe(0);
  });
});

describe("notes helpers", () => {
  test("parseNotes needs both sections and tolerates a fence", () => {
    expect(parseNotes(`\`\`\`\n${reply}\`\`\``)?.now).toStartWith("Corwin is inside");
    expect(parseNotes("## Now\n\nOnly now.")).toBeUndefined();
  });

  test("parseNotes stops Notes at ## Names", () => {
    const parsed = parseNotes(`${reply}\n## Names\n\n- Brother Anselm\n`);
    expect(parsed?.notes).toEndWith("- The door is barred.");
  });

  test("parseNames reads `- ` lines under ## Names and nothing else", () => {
    const names = (body: string) => parseNames(`${reply}\n## Names\n\n${body}`);
    expect(names('- Brother Anselm\n* Tallow Stair.\n- "The Salt Market"\n')).toEqual([
      "Brother Anselm",
      "Tallow Stair",
      "The Salt Market",
    ]);
    expect(names("- none\n")).toEqual([]);
    expect(names("Brother Anselm, Tallow Stair\n")).toEqual([]);
    expect(names(`- ${"x".repeat(61)}\n- 42\n- Ok`)).toEqual(["Ok"]);
    expect(names(Array.from({ length: 30 }, (_, i) => `- Name${i}`).join("\n"))).toHaveLength(20);
    expect(parseNames(reply)).toEqual([]);
    expect(parseNames(`\`\`\`\n${reply}\n## Names\n\n- Anselm\n\`\`\``)).toEqual(["Anselm"]);
  });

  test("unknownNames drops known names, their shorter forms and repeats", () => {
    const known = { all: ["Mira Tessaly", "The Lamp Hall", "harbour", "corwin"] };
    expect(
      unknownNames(
        [
          "Mira",
          "MIRA TESSALY",
          "Lamp Hall",
          "the harbour",
          "Corwin's",
          "Tessaly Mira",
          "Anselm",
          "anselm",
          "Hall Lamp",
        ],
        known,
      ),
    ).toEqual(["Tessaly Mira", "Anselm", "Hall Lamp"]);
  });

  test("tallyNames counts once per run, suggests at two, never removes", () => {
    const first = tallyNames({}, ["Anselm", "anselm", "Tallow Stair"]);
    expect(first).toEqual({ nameTally: { Anselm: 1, "Tallow Stair": 1 }, suggest: [] });
    const second = tallyNames(first, ["ANSELM"]);
    expect(second).toEqual({ nameTally: { Anselm: 2, "Tallow Stair": 1 }, suggest: ["Anselm"] });
    const third = tallyNames(second, ["anselm", "Tallow Stair"]);
    expect(third).toEqual({
      nameTally: { Anselm: 3, "Tallow Stair": 2 },
      suggest: ["Anselm", "Tallow Stair"],
    });
    // A name already in suggest (any case) is not added twice.
    expect(tallyNames({ nameTally: { Brell: 1 }, suggest: ["brell"] }, ["Brell"]).suggest).toEqual([
      "brell",
    ]);
    // Malformed stored keys are replaced by valid ones.
    expect(tallyNames({ nameTally: [1, 2], suggest: "Brell" }, ["Brell"])).toEqual({
      nameTally: { Brell: 1 },
      suggest: [],
    });
    expect(tallyNames({ nameTally: { Brell: "2", Ok: 1 }, suggest: [3, "Ok"] }, [])).toEqual({
      nameTally: { Ok: 1 },
      suggest: ["Ok"],
    });
  });

  test("withNotes appends missing sections and keeps others", () => {
    const text = "---\nnumber: 2\n---\n\n## Summary\n\nDone.\n";
    const out = withNotes(text, { now: "Now text.", notes: "### Threads\n\n- open: x" });
    expect(out).toBe(
      "---\nnumber: 2\n---\n\n## Summary\n\nDone.\n\n## Now\n\nNow text.\n\n## Notes\n\n### Threads\n\n- open: x\n",
    );
  });

  test("parseLogTurns reads one half per line and skips a torn last line", () => {
    const turns = parseLogTurns(`${logText}{"n":3,"speaker":"pla`);
    expect(turns.map((t) => [t.n, t.speaker])).toEqual([
      [1, "player"],
      [1, "storyteller"],
      [2, "player"],
      [2, "storyteller"],
    ]);
    expect(turns[2]).toEqual({
      n: 2,
      speaker: "player",
      name: "Corwin Hale",
      register: "narrator",
      at: "2026-10-05T20:00:00.000Z",
      uuid: "player-2",
      text: "I step inside.",
    });
  });

  test("renderTurns heads each half for the notes model; lastExchanges keeps whole exchanges", () => {
    const turns = parseLogTurns(logText);
    expect(renderTurns(lastExchanges(turns, 1))).toBe(
      "### 2 · Player\n\nI step inside.\n\n### 2 · Vex\n\nShe bars the door behind you.",
    );
    expect(lastExchanges(turns, 5)).toHaveLength(4);
  });
});
