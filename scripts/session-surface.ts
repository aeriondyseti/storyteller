#!/usr/bin/env bun
// Opt-in: what a story session exposes to the player. Never run by `bun test`.
//
//   bun scripts/session-surface.ts [--json] [--prompt "/simplify"] [--story <dir>]
//                                  [<extra claude args>, e.g. --debug-file x]
//
// Runs `claude -p` from the example story with exactly the argv claudeArgs
// builds (plus --max-turns 1 and a one-line prompt), reads the first
// system/init event and prints its slash commands, skills, tools, MCP servers,
// plugins and agents, sorted, then the reply. Costs one cheap model call. Use
// it to check quieting (spec 10) before and after a launcher change. The
// story's hooks run as in play, so the scene log gains a turn: restore it
// with git afterwards.
//
// slash_commands and skills are what runs when typed, not what the menu
// shows: the menu also leaves out what plugin/mod/stage/commands.ts hides,
// and -p draws no menu. A command the mod registers at session start
// is not in the init event; the stage's own (/storyteller:scene) are plugin
// command files, so they are.

import path from "node:path";
import { loadConfig } from "../src/config.ts";
import { claudeArgs, generate, repoRoot, worldServerFile } from "../src/launch.ts";
import { loadStory } from "../src/story.ts";

// Bun drops a bare `--`, so every argument but ours is passed on to claude.
// --prompt sends something else (a hidden skill typed in full; from Git Bash,
// set MSYS_NO_PATHCONV=1 or "/storyteller:recap" arrives as a Windows path); --story runs
// from another story folder (one under ~/.storyteller/stories sees the
// stories home's .claude as a project ancestor).
let prompt = "Reply with: ok";
let storyDir = path.join(repoRoot, "stories", "the-hollow-crown");
const extra: string[] = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i] ?? "";
  if (arg === "--prompt") prompt = argv[++i] ?? prompt;
  else if (arg === "--story") storyDir = argv[++i] ?? storyDir;
  else if (arg !== "--json" && arg !== "--") extra.push(arg);
}

const story = await loadStory(storyDir);
const config = await loadConfig();
const generated = await generate(story);
const worldServer = (await Bun.file(worldServerFile).exists()) ? worldServerFile : undefined;
// stream-json (which needs --verbose) is the format that carries the init event.
// Extra arguments go last so they can override these (--max-turns 3).
const args = [
  prompt,
  ...claudeArgs(story, generated, config, { new: true, worldServer }),
  "-p",
  "--output-format",
  "stream-json",
  "--verbose",
  "--max-turns",
  "1",
  ...extra,
];

const proc = Bun.spawn(["claude", ...args], {
  cwd: story.dir,
  stdout: "pipe",
  stderr: "pipe",
  env: {
    ...process.env,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    RP_CONFIG: JSON.stringify(config),
    RP_STORY: story.dir,
  },
});
const out = await new Response(proc.stdout).text();
const err = await new Response(proc.stderr).text();
const code = await proc.exited;

const events = out
  .split("\n")
  .filter((line) => line.trim().startsWith("{"))
  .map((line) => JSON.parse(line) as Record<string, unknown>);
const init = events.find((event) => event.type === "system" && event.subtype === "init");
// The last result: a command that queues a prompt ends one turn with
// its own output and the model's reply arrives in a second.
const result = events.findLast((event) => event.type === "result");

if (!init) {
  console.error(`no system/init event (exit ${code})\n${err}\n${out.slice(0, 2000)}`);
  process.exit(1);
}

const fields = ["slash_commands", "skills", "tools", "mcp_servers", "plugins", "agents"];
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(Object.fromEntries(fields.map((f) => [f, init[f]])), null, 2));
} else {
  for (const field of fields) {
    const names = list(init[field]).sort();
    console.log(`${field} (${names.length}):`);
    for (const name of names) console.log(`  ${name}`);
  }
}
console.log(
  `\nprompt: ${prompt}\nreply: ${String(result?.result ?? result?.subtype ?? "(none)")}\nexit ${code}`,
);

// Entries are names, or objects like { name, status } or { name, path }.
function list(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [JSON.stringify(value)];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && "name" in item) {
      const { name, path: _path, source: _source, ...rest } = item as Record<string, unknown>;
      const detail = Object.entries(rest)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" ");
      return detail ? `${String(name)} (${detail})` : String(name);
    }
    return JSON.stringify(item);
  });
}
