#!/usr/bin/env bun
// Opt-in smoke test against a real model. Never run by `bun test`.
//
//   bun scripts/smoke.ts [--model <m>]
//
// Renders the example story, runs `claude -p` with the same flags a session
// gets (minus --continue), sends eval scenario 11 (docs/eval-scenarios.md,
// sensory versus reaction) and checks the reply with plain heuristics. A
// grader model would judge better; this is the quick tripwire. Costs one call.

import path from "node:path";
import { loadConfig } from "../src/config.ts";
import { claudeArgs, generate, repoRoot, worldServerFile } from "../src/launch.ts";
import { loadStory } from "../src/story.ts";

const prompt = "[register: narrator] I step between Mira and the Lamplighter's hook.";

const modelAt = process.argv.indexOf("--model");
const model = modelAt === -1 ? undefined : process.argv[modelAt + 1];

const story = await loadStory(path.join(repoRoot, "stories", "the-hollow-crown"));
const config = await loadConfig();
const generated = await generate(story);
const worldServer = (await Bun.file(worldServerFile).exists()) ? worldServerFile : undefined;
const args = [
  prompt,
  ...claudeArgs(story, generated, config, { new: true, model, worldServer }),
  "-p",
  "--output-format",
  "text",
];

console.log(`world server: ${worldServer ?? "missing, running without world tools"}`);
console.log(`prompt: ${prompt}\n`);

const proc = Bun.spawn(["claude", ...args], {
  cwd: story.dir,
  stdout: "pipe",
  stderr: "inherit",
  env: {
    ...process.env,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    RP_CONFIG: JSON.stringify(config),
    RP_STORY: story.dir,
  },
});
const reply = (await new Response(proc.stdout).text()).trim();
const code = await proc.exited;
console.log(`--- reply (exit ${code}) ---\n${reply}\n--- end ---\n`);

type Check = { name: string; bad: RegExp[] };

const checks: Check[] = [
  {
    name: "no coding-assistant leakage (files, tools, code, I'll)",
    bad: [
      /\b(files?|tools?|code|codebase|repository|director(y|ies)|function|tracker|widget|system prompt)\b/i,
      /\bI'll\b/,
      /\bI will (now|read|check|look)\b/i,
    ],
  },
  { name: "prose only: no markdown headers", bad: [/^#{1,6}\s/m] },
  {
    name: "sensory, not reaction: no inner response narrated for the player",
    bad: [
      /\byou (wince|winced|stagger|staggered|flinch|flinched|grit|gritted|gasp|gasped|recoil|recoiled|feel|felt|decide|decided|realize|realise|think|thought|wonder|wondered|brace|braced)\b/i,
      /\b(anger|rage|fear|pain|relief) (floods|flooded|surges|surged|washes|washed) (through )?you\b/i,
      /\byour (heart|stomach|breath) (sinks|sank|lurches|lurched|races|raced|catches|caught)\b/i,
    ],
  },
];

let failed = reply === "" || code !== 0;
if (failed) console.log("FAIL  claude returned a reply");
// Characters may say "I'll" or talk about files; the leakage checks are about
// the narrator's own voice, so quoted dialogue is blanked before matching.
const narration = reply.replace(/["“][^"”]*["”]/g, '""');
for (const check of checks) {
  const hit = check.bad.map((re) => narration.match(re)?.[0]).find(Boolean);
  if (hit) failed = true;
  console.log(`${hit ? "FAIL" : "PASS"}  ${check.name}${hit ? ` (found "${hit}")` : ""}`);
}

const lastParagraph =
  reply
    .split(/\n\s*\n/)
    .at(-1)
    ?.trim() ?? "";
const endsOnQuestion = lastParagraph.endsWith("?") && !/["“”]/.test(lastParagraph);
if (endsOnQuestion) failed = true;
console.log(`${endsOnQuestion ? "FAIL" : "PASS"}  ends on the world acting, not a question`);

process.exit(failed ? 1 : 0);
