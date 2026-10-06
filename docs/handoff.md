# Handoff

Start here if you are a new session picking up this project. Read this file,
then `CLAUDE.md`, then the parts of `docs/spec.md` the task touches. Written
2026-10-06.

## What this is

A roleplay and collaborative-storytelling client that runs inside the Claude
Code terminal UI. The model plays **Vex, the Storyteller**: it narrates, runs
the world, voices every character except the player's, and keeps the record on
disk through tools. One player per story. Out-of-character talk opens with
`((`. It is built entirely from Claude Code extension points: a plugin with an
MCP server, settings hooks, a mod (function hooks that draw panes and the
status line), skills and commands, plus a small launcher.

## Read these

| File | What it holds |
|---|---|
| `CLAUDE.md` | Layout, conventions, vocabulary, how parallel workers operate |
| `docs/spec.md` | The authority on behaviour. §19 widgets, §20 lorebooks, §18 "Later" is the backlog |
| `docs/design-brief.md` | Why Claude Code and not a custom TUI; the escape criterion for that choice |
| `docs/prior-art.md` | Feature research, ranked: table stakes, UX, differentiators |
| `docs/eval-scenarios.md` | Hand-run checks for the Storyteller prompt |
| `README.md` | Player quickstart |

## Built and working

- **Launcher** `bun run rp`: no argument opens a story picker (last played
  first); `rp <story>` continues that story's session or starts one; `rp new
  <name>` runs a blank-start interview; `rp install` scaffolds the home.
- **Story on disk** under `~/.storyteller/stories/<story>/`: `story.md`,
  `characters/`, `lore/`, `directives/`, `scenes/NNN-slug/{scene.md,log.jsonl}`,
  `.rp/` machine state. Shared library in `~/.storyteller/library/`.
- **World MCP server** (`server/`): cards, lore, directives, scenes (open,
  close, rename, state), widgets, dice, recall over an embedding index.
- **Hooks** (`plugin/hooks/`): register tag, lore and directive activation and
  directive deltas per turn; log append on Stop with catch-up for missed turns;
  context rebuild after compaction.
- **Mod** (`plugin/mod/`): scene pane (framed Now / Present / Widgets, two-column
  widgets, named widget panes), `/storyteller:directives` pane, quiet tool
  lines, Vex's label and spinner, dim out-of-character text, scene-setting
  rules, coding-reminder quieting, the Haiku notes job that keeps each scene's
  `## Now` and `## Notes` current.
- **Status line** (`plugin/statusline.ts`): two-line default, configurable in
  `~/.storyteller/statusline.json`; usage-coloured meters.
- **Skills**: interview, scene close, invent-and-record, `/storyteller:recap`.
- **Lorebooks slice 1** (spec §20): full entry schema, library books,
  character and place scope, the activation pipeline with recursion, weighted
  groups, chance, context-aware cooldown and a two-part budget.
- **Lorebooks slice 2** (§20.11, gaps in §16): injected lore carries Secret,
  History and heading tags (`(updated)`, `(rumour)`/`(false)`, `(unknown to
  …)`); `reveal_lore`, `append_lore_history` (library entries are copied into
  the story first); the notes job lists unrecorded names, the hook passes
  each recurring one to Vex once. Always-on lore travels with the turn; the
  bible holds no lore text (§20.12).
- **Lorebooks slice 3** (§20.13): `/storyteller:codex` pane (index with
  search, then one entry; known entries and met characters only), glossary
  links in narration prose (`https://codex.invalid/<id>`, mouse in
  fullscreen) and scene-pane name buttons, `lore.budget_percent` status
  source. Status sources are named in full words (`session.context_percent`,
  `usage.five_hour_percent`, `usage.weekly_percent`).

## Next

1. **Live check of slice 3**: link presses, pane keyboard, scene-pane button
   alignment (the test kit cannot cover these).
2. **`/storyteller:pane <name>`**: bring a pane forward by name (top of §18).
3. The rest of §18 and the differentiators in `docs/prior-art.md`; the player
   has picked none of those yet.

Code names are spelled out in full, no abbreviations (the player's rule);
compact display labels are fine.

The player's own stories have not been migrated to the new lore fields (they
load fine with defaults, but `known` defaults to false, so every entry reads
`(unknown to …)` until migrated or revealed). The command, if they ask:
`bun scripts/migrate-lore.ts ~/.storyteller/stories/* ~/.storyteller/library`.

## How work is done here

- **The player decides; the coordinator coordinates.** The main session
  specifies, delegates implementation to subagent workers, merges, and reports.
- **New features are specified by interview first.** Ask in rounds (the
  question tool) until the player is satisfied, then write a numbered spec
  section, then build in slices. Small UI tweaks go straight to a worker, often
  after an ASCII mockup the player approves.
- **Workers** are spawned with worktree isolation; their first command is
  `git fetch origin && git reset --hard origin/dev && git checkout -B
  w/<slice>`, because isolation branches from `origin/main`. Each gets a
  self-contained brief naming the files it owns and the ones it must not touch,
  so parallel workers never collide. They commit and push their branch; they
  never merge.
- **Merging** happens in the main checkout on `dev`: merge, then run all three
  checks (below), push `dev`, delete the branch and worktree.
- **Ask before merging anything under `plugin/mod/`** if the player may be in
  a story session: Claude Code hot-reloads the plugin folder and a mid-scene
  reload reopens panes inline and can cut off a notes job. Hooks, server and
  `src/` changes are safe to merge any time.
- **`main` is the published branch.** Work on `dev`; merging to `main` is the
  player's call.
- Ideas the player wants kept go into spec §18 "Later", top of list first.

## Checks

```
bun run verify                 # typecheck, biome, bun tests
bun scripts/test-mod.ts        # the mod's tests, via `claude plugin test`
claude plugin validate plugin  # manifest, hooks and mod contract
```

Opt-in, real model calls: `bun scripts/smoke.ts` (one narrator turn, checks for
coding-assistant leakage) and `bun scripts/session-surface.ts` (lists the
commands, skills and tools a story session exposes).

## Things that will bite you

- **The mod API is early access.** The declaration file the `plugin-authoring`
  skill writes is the authority; grep it, never read it whole.
- **Names starting `claude-` are reserved for plugins**, so the plugin is
  `storyteller`. Mod-registered commands cannot contain a colon; ours are
  plugin command files (`plugin/commands/`) so Claude Code prefixes them
  `storyteller:`. Built-in command names (`/recap`, `/statusline`) cannot be
  shadowed.
- **Story sessions leave the player's user settings out**
  (`--setting-sources project,local`), so any user preference that matters in
  a story must be passed by the launcher (`tui: fullscreen` is one).
- **The transcript is written asynchronously**; the Stop hook reads
  `last_assistant_message` and retries. The notes job waits for the log.
- **The system prompt is a per-conversation snapshot.** Mid-session changes to
  the bible reach Vex as per-turn deltas from the hook, never by editing the
  prompt. Injected context stays in history until compaction.
- **`claude -p` never runs the status line or Stop hooks**; status-line and
  logging behaviour needs a real interactive session to verify.
- **Windows**: `$.audio` is silent on Windows terminals. Bash commands from a
  coordinator session are refused if they look like they leave the session's
  own checkout; split them into plain commands.
- **Panes dock** only in the fullscreen layout on wide terminals; opened
  unasked from 144 columns.

## The player

Plays on Windows Terminal. Prefers interview rounds before specs, ASCII
mockups before UI work, short status updates, and being asked before merges
while in a session. Their test story is `testing-grounds` ("Build Failed
Successfully"), a game-dev spoof.
