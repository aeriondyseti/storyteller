import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  copyStory,
  fixtureLibrary,
  fixtures,
  saltmereDir,
  tempDir,
} from "../src/testing/fixtures.ts";
import { check, logHealth } from "./statusline.ts";

const user = (uuid: string, content: string) =>
  JSON.stringify({ type: "user", uuid, message: { role: "user", content } });
const assistant = (uuid: string, text: string) =>
  JSON.stringify({
    type: "assistant",
    uuid,
    message: { role: "assistant", content: [{ type: "text", text }] },
  });
const jsonl = (...lines: string[]) => `${lines.join("\n")}\n`;

describe("logHealth", () => {
  const transcript = jsonl(
    user("u1", "I knock."),
    assistant("a1", "The door opens."),
    user("u2", "I step in."),
    assistant("a2", "Warmth."),
  );

  test("the latest exchange was logged", () => {
    expect(logHealth(transcript, "u2")).toBe("logged");
  });

  test("the previous one was, and this one is still going", () => {
    expect(logHealth(transcript, "u1")).toBe("pending");
  });

  test("an exchange went by unlogged", () => {
    expect(logHealth(transcript, undefined)).toBe("missed");
    expect(logHealth(jsonl(user("u1", "Hi.")), undefined)).toBe("pending");
  });
});

// The script end to end: a story session's state, a transcript, and the
// captured stdin payload pointed at them.
async function run(layout: unknown): Promise<string> {
  const dir = await copyStory(saltmereDir);
  await Bun.write(
    `${dir}/.rp/state.json`,
    JSON.stringify({
      turn: 5,
      lastLogged: "u2",
      notesTurn: 4,
      notesUpdatedAt: 4,
      // 8,000 characters of lore against the default budget of 80,000.
      injections: [
        { ref: "lore/a", turn: 3, hash: "x", chars: 6000 },
        { ref: "lore/b", turn: 4, hash: "y", chars: 2000 },
      ],
    }),
  );
  const home = await tempDir();
  const transcriptPath = `${home}/t.jsonl`;
  await Bun.write(
    transcriptPath,
    jsonl(user("u1", "I knock."), assistant("a1", "Open."), user("u2", "(( skip ahead ))")),
  );
  const statusline = `${home}/statusline.json`;
  if (layout !== undefined) await Bun.write(statusline, JSON.stringify(layout));
  const captured = await Bun.file(`${fixtures}/statusline-input.json`).json();
  const proc = Bun.spawn(["bun", path.join(import.meta.dir, "statusline.ts")], {
    stdin: new Blob([JSON.stringify({ ...captured, cwd: dir, transcript_path: transcriptPath })]),
    env: {
      ...process.env,
      RP_CONFIG: "{}",
      RP_STORY: dir,
      RP_LIBRARY: fixtureLibrary,
      RP_STATUSLINE: statusline,
    },
    stdout: "pipe",
  });
  return new Response(proc.stdout).text();
}

// The colour codes spelled out, and stripped where only the words matter.
const dark = (s: string) => `\x1b[90m${s}\x1b[39m`;
const light = (s: string) => `\x1b[1m${s}\x1b[22m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
// ESC spelled out first: biome refuses control characters in a regex.
const strip = (s: string) => s.replaceAll("\x1b", "ESC").replaceAll(/ESC\[\d+m/g, "");

describe("the script", () => {
  test("with no statusline.json, the default two lines", async () => {
    const out = await run(undefined);
    expect(strip(out)).toMatch(
      /^Model: Opus 5\.5 \(high\) \| Narrator: Vex \(copilot\) \| Persona: Corwin Hale \| Story: Saltmere \| Scene: Scene \d+: .+\nctx ▱+ 4% \| 5h ▰▱+ 14% \| wk ▰+▱+ 36% \| notes: 1 ago \| log: ✓$/,
    );
    expect(out).toStartWith(
      `${dark("Model:")} ${light("Opus 5.5 (high)")}${dark(" | ")}${dark("Narrator:")} ${light("Vex (copilot)")}${dark(" | ")}${dark("Persona:")} ${light("Corwin Hale")}`,
    );
  });

  test("the player's two-line layout, the second line with its own separator", async () => {
    const out = await run({
      lines: [
        [
          { type: "text", source: "turn.register" },
          { type: "text", label: "You", source: "persona.name" },
        ],
        {
          separator: " · ",
          widgets: [
            { type: "meter", label: "ctx", source: "session.context_percent", width: 5 },
            { type: "meter", label: "5h", source: "usage.five_hour_percent", width: 5 },
            { type: "meter", label: "wk", source: "usage.weekly_percent", width: 5 },
            { type: "counter", label: "notes", source: "notes.age", suffix: " ago" },
            { type: "text", label: "log", source: "log.ok" },
          ],
        },
      ],
    });
    const dot = dark(" · ");
    expect(out).toBe(
      [
        [light("copilot"), `${dark("You:")} ${light("Corwin Hale")}`].join(dark(" | ")),
        [
          `${dark("ctx")} ${green("▱▱▱▱▱ 4%")}`,
          `${dark("5h")} ${green("▰▱▱▱▱ 14%")}`,
          `${dark("wk")} ${green("▰▰▱▱▱ 36%")}`,
          `${dark("notes:")} ${light("1 ago")}`,
          `${dark("log:")} ${light("✓")}`,
        ].join(dot),
      ].join("\n"),
    );
  });

  test("lore.budget_percent: the injection record against the lore budget", async () => {
    const out = await run({
      lines: [[{ type: "meter", label: "lore", source: "lore.budget_percent", width: 5 }]],
    });
    expect(out).toBe(`${dark("lore")} ${green("▰▱▱▱▱ 10%")}`);
  });

  test("a broken file: the default and the error, dimmed", async () => {
    const out = await run({ lines: [[{ type: "text", source: "hp" }]] });
    expect(strip(out)).toContain(
      "Narrator: Vex (copilot) | Persona: Corwin Hale | Story: Saltmere | Scene",
    );
    expect(out).toEndWith(
      `${light("✓")} \x1b[2m(statusline.json: line 1, widget 1: unknown source "hp")\x1b[22m`,
    );
  });
});

describe("check", () => {
  test("a valid file previews with sample values", async () => {
    const file = `${await tempDir()}/statusline.json`;
    await Bun.write(file, JSON.stringify({ lines: [[{ type: "text", source: "scene" }]] }));
    const result = await check(file);
    expect(result.ok).toBe(true);
    expect(result.text).toEndWith(light("Scene 1: Spawn Point"));
  });

  test("the preview shows the colours", async () => {
    const file = `${await tempDir()}/statusline.json`;
    const meter = { type: "meter", label: "ctx", source: "session.context_percent", width: 4 };
    const narrator = { type: "text", label: "Narrator", source: "narrator" };
    await Bun.write(
      file,
      JSON.stringify({ lines: [[narrator, meter, { ...meter, color: false }]] }),
    );
    expect((await check(file)).text).toEndWith(
      [
        `${dark("Narrator:")} ${light("Vex (copilot)")}`,
        `${dark("ctx")} ${green("▰▱▱▱ 34%")}`,
        "ctx ▰▱▱▱ 34%",
      ].join(dark(" | ")),
    );
  });

  test("an invalid or missing file says what is wrong", async () => {
    const dir = await tempDir();
    await Bun.write(`${dir}/bad.json`, JSON.stringify({ lines: [[{ type: "dial" }]] }));
    expect((await check(`${dir}/bad.json`)).text).toContain('type "dial" is unknown');
    expect((await check(`${dir}/none.json`)).ok).toBe(false);
  });
});
