# Design brief: SillyTavern as a Claude Code session

Status: **signed off 2026-10-05** as the rationale and platform choice. The
behaviour was then specified in an interview; see `spec.md`, which supersedes
the phases and the on-disk layout sketched here where they differ.

## Concept

Turn a Claude Code TUI session into a roleplay and collaborative-storytelling
client. Claude Code already provides the hard parts of a chat client: a
streaming transcript, a prompt box, resumable sessions, compaction, slash
commands, a plugin system, and a model with tools. We supply the parts that
make it SillyTavern rather than a coding assistant:

- **Character cards, personas, and lorebooks** on disk, in a format a human can
  edit and a model can read.
- **A storyteller system prompt** that fully replaces the coding identity.
- **A world store** the model reads and writes through tools instead of file
  editors, so the model stays in the fiction.
- **Lorebook activation**: keyword-triggered lore injected per turn, the
  SillyTavern "World Info" behaviour.
- **Long-story memory**: scene summaries, recall, and story-aware compaction.
- **A TUI layer**: a scene pane with portraits and trackers, a "Vex is
  writing…" spinner, speaker-coloured dialogue, ambient sound.

One `rp` launcher starts a story. Everything else is a Claude Code plugin.

## The Storyteller

The model is never a puppet embodying one character. It is a **Storyteller**
(user-nameable, "Vex" by default): an agent with agentic control over the
story and the world. It works in two registers, and it is the same agent in
both:

- **Copilot register** (out of character): a world-building partner. "Let's
  build the Iron Pact" ends with new lore files, characters, and a scene-zero
  on disk, written through world tools in conversation. Also where the player
  steers pacing, asks for a recap, or edits a character's voice.
- **Narrator register** (in character): runs the world, plays every NPC,
  manages pacing and continuity, and curates the experience around the prose
  (scene state, trackers, later imagery and sound).

The register switch is a convention the player controls: a prompt opening with
`((` or `/ooc` is copilot; everything else is narration. The Storyteller can
also step out on its own when something needs a decision from the player.

Direct one-character chat (the SillyTavern default) is not a goal. A Storyteller
playing a single NPC in a two-person scene covers that case well enough.

### Vocabulary

- **Story**: a self-contained narrative with a consistent setting. A directory.
- **Scene**: a coherent arc or beat within a story. A file with state and a
  running summary. Opened and closed explicitly, with a summary at close.
- **Session**: one Claude Code session. No ceremony; resume continues it.
- **Turn**: one player prompt and one Storyteller reply.
- **Player**: the human, exactly one per story. **Storyteller**: the agent
  identity. Both are actors that can **play** Characters.
- **Character**: a person in the world, PC or NPC. Durable truths (voice,
  appearance, backstory) live on the card; state (location, mood, injuries,
  who is playing them right now) lives on the scene.
- **Persona**: the Character the Player is playing, so a player character is a
  Character plus a plays-edge, not a separate thing.
- **Impersonate**: for one turn, the Storyteller plays the Player's character,
  or the Player plays an NPC. A turn-scoped override of the plays-edge.
- **Lore**: worldbuilding facts with activation keys, the lorebook.
- **Directive**: a named, composable prompt piece (style, tone, rules). Static
  or keyed. Deferred past v0.1 but the file format should leave room for it.

## What Claude Code gives us, and which surface we use for what

Four layers, each mapped to a stable Claude Code surface. The essential play
loop (layers 1 to 3) runs on documented, stable features. The mods layer (4) is
polish on an early-access API and can fail without breaking play.

| Layer | Job | Claude Code surface | Stability |
|---|---|---|---|
| 1. Launcher + prompt | Start a story session with the right identity and tools | `claude --system-prompt-file`, `--tools`, `--name`, `--resume`, `--plugin-dir`, story-dir `CLAUDE.md` | Stable |
| 2. World (data + verbs) | Characters, lore, scene state, trackers, recall, dice | One stdio **MCP server** bundled in the plugin (`.mcp.json`); **skills** for user-facing verbs (`/new-story`, `/import-card`, `/recap`) | Stable |
| 3. Rules (per-turn automation) | Lorebook activation, autosave, summary on compaction, guards | Settings **hooks**: `UserPromptSubmit`, `Stop`, `PreCompact`, `SessionStart`, `PreToolUse` | Stable |
| 4. Stage (TUI) | Scene pane, portraits, spinner text, dialogue styling, sound, prompt composition | **Mods** (function hooks): `ui.render` on `Pane`, `Spinner`, `AssistantMessage`, `AbovePrompt`; `prompt.compose`; `session.compact`; `$.audio` | Early access |

Why this split: a newcomer can learn one layer at a time, each layer is testable
on its own (the MCP server under `bun test` with no Claude Code at all), and
the mods API moving between releases costs us a pane, never the game.

### Things worth knowing that shaped the design

- `--system-prompt-file` **replaces** the whole default prompt, so the coding
  identity is gone, not papered over. `--append-system-prompt-file` keeps it.
- `--tools "..."` is an allowlist of built-in tools. We can hide `Edit`,
  `Write`, `Bash`, and friends entirely and give the model only our MCP tools
  plus `Read`. No diffs in the transcript, no "shall I run tests".
- `UserPromptSubmit` hooks return `additionalContext`, which is exactly the
  lorebook injection point. `Stop` fires after every reply, which is the
  autosave point. `PreCompact` is where a scene summary gets written before
  the engine forgets.
- A `CLAUDE.md` in the story directory loads automatically. That gives every
  story a free standing-instructions layer with zero machinery.
- Mods can `$.tool.register` tools too, with no extra process. We still choose
  MCP for the world store (see decision 2).
- The mod `prompt.compose` event can drop or replace the engine's prompt
  sections per request. It overlaps with `--system-prompt-file`; we use the
  flag as the baseline and `prompt.compose` only for dynamic sections (who is
  on stage, current scene state) once the mods layer exists.
- The terminal surface draws real images through the kitty graphics protocol
  (kitty, Ghostty), falling back to alt text elsewhere. Portraits are feasible.
- `$.audio.play` and `$.audio.speak` exist: ambience and optional narration.

## The story on disk

Plain files, one directory per story, git-friendly, human-editable. This is
the whole persistence model. No database in v0.1.

```
stories/
  the-hollow-crown/
    story.md            # frontmatter: title, storyteller (name, tagline,
                        # voice), active persona, active characters;
                        # body: premise + standing rules
    CLAUDE.md           # generated by the launcher from story.md + cards;
                        # the auto-loaded standing instructions
    characters/
      mira.md           # character card: frontmatter (name, tags, voice,
                        # portrait) + sections (appearance, personality,
                        # backstory, example dialogue)
    personas/
      corwin.md         # who the player is playing
    lore/
      iron-pact.md      # lorebook entry: frontmatter `keys: [Iron Pact, the
                        # Pact]`, `always: false`, `priority`; body is the lore
    scenes/
      001-arrival.md    # per-scene: frontmatter state (location, time,
                        # present, mood, trackers) + running summary
    state.json          # current scene number, swipe history, counters
    assets/
      mira.png          # portraits, ambience clips
```

SillyTavern V2 character cards (JSON, or PNG with embedded JSON) import via
`/import-card`, which writes a `characters/<name>.md`. Export back out is a
later phase.

## The turn, end to end

1. Player types in the prompt box.
2. `UserPromptSubmit` hook (a small Bun script) scans the prompt and the last
   few turns for lorebook keys, picks matches by priority within a token
   budget, and returns them as `additionalContext`. Also appends a one-line
   scene state header so the model always knows where and when it is.
3. The Storyteller, under its system prompt, may call world tools before it
   writes. Read tools: `recall(query)` over past scene summaries,
   `get_character`, `search_lore`. State tools: `set_scene_state` (location,
   time, present, mood), `update_tracker`, `roll`. In the copilot register it
   also has write tools: `upsert_character`, `upsert_lore`, `open_scene`,
   `close_scene`. Then it writes the reply. The lorebook hook in step 2 is
   the floor; an agentic narrator reaches for more on its own.
4. `Stop` hook appends the exchange to the current scene file and bumps
   counters. Nothing is lost if the terminal dies.
5. Mods redraw: the scene pane reflects the new state, the spinner said
   "Mira is thinking…" while the model worked, dialogue lines are tinted per
   speaker in the transcript.
6. When context nears the limit, `PreCompact` writes a scene summary to disk,
   and (mods layer) `session.compact` supplies a story-aware summary prompt
   instead of the coding one.

The copilot register is the same loop with the write tools in play; the
`UserPromptSubmit` hook tags a `((` or `/ooc` prompt so the Storyteller knows
which register it is in.

## Plugin layout

```
claude-roleplay/
  bin/rp                      # launcher: picks a story, generates CLAUDE.md,
                              # execs `claude` with flags + --plugin-dir
  plugin/
    .claude-plugin/plugin.json
    .mcp.json                 # world server, stdio, `bun run server/world.ts`
    hooks/hooks.json          # settings hooks (layer 3) + mods module (layer 4)
    hooks/register.tsx        # the mod
    skills/                   # /new-story /import-card /recap /scene /persona
    prompts/storyteller.md    # the system prompt, with a dynamic-boundary
                              # marker for the per-story section
  server/
    world.ts                  # MCP server entry (Bun)
    store/                    # read/write the story directory
    lore.ts                   # keyword activation, shared with the hook
    *.test.ts
  stories/                    # gitignored except an example story
  docs/
```

Runtime is Bun and TypeScript throughout (server, hooks, mod, launcher), one
toolchain for a newcomer to learn.

## Phases

Each phase ends with something playable. Each is one branch.

1. **Playable narration.** Story directory format, `rp` launcher, Storyteller
   system prompt (both registers), generated `CLAUDE.md`, tool allowlist. One
   hand-written story: a persona, two NPC cards, a few lore entries, a
   scene-zero. You can sit down and play, and Vex runs the world.
2. **World server.** MCP server with the read, state, and write tools above.
   `UserPromptSubmit` lorebook activation and register tagging. `Stop`
   autosave. This is also where the copilot register becomes real: building
   the world in conversation writes files.
3. **Verbs.** Skills: `/new-story`, `/import-card` (ST V2), `/scene` (open or
   close a scene with summary), `/persona`, `/recap`, `/ooc`.
4. **Memory.** Scene summaries on `PreCompact`, `recall` tool over past scenes,
   story-aware compaction prompt.
5. **Stage.** Mods: scene pane (state, present characters, trackers),
   spinner and band text, speaker-tinted dialogue, portraits where the
   terminal supports them.
6. **Atmosphere and extras.** Ambience and narration via `$.audio`, image
   generation for scenes, card export, swipe and regenerate.

## Why Claude Code and not a custom TUI

Decided 2026-10-05. The Agent SDK is Claude Code headless: the same engine,
tools, hooks, MCP client, sessions, and compaction, streamed as JSON to a
front end you write. So a custom Ink TUI on the SDK buys layout freedom but
not control over the conversation; editing a past assistant reply needs an
own harness on the raw Messages API.

Modding Claude Code gives us the whole terminal client (editor, streaming
markdown, scrollback, images, panes, dialogs, keybindings, Remote Control and
the desktop app) plus the harness, for free, at the price of living inside its
chrome and an early-access mods API. Layers 1 to 3 are identical under the
SDK, so the choice is bounded to layer 4.

**Escape criterion.** Revisit after the stage phase (phase 5), and only then.
Move the UI to an Ink front end over the Agent SDK if either holds:

1. The chrome blocks the experience: something the stage needs cannot be
   drawn or removed with `ui.render`, and no mod event covers it.
2. Message-level control is the missing feature: editing or deleting past
   replies, or true swipes, turns out to be essential to play, and the
   `/rewind` plus edit-last-prompt pair does not cover it.

Everything but the mods layer carries over. Not a reason to move: taste,
branding, or the mods API changing shape between releases.

## Single player

Decided 2026-10-05: multiplayer is removed from the product, not deferred.
Each player runs their own Claude Code with their own login, and a story
directory belongs to one person. Multi-user accounts and presence
are not part of the design. Consequences: no
accounts, no presence, no shared server; the world MCP server is a per-session
stdio process with no concurrency story to tell.

## Alternatives considered

- **Everything as a mod** (tools via `$.tool.register`, no MCP server). Fewer
  moving parts, but the whole product then rests on an early-access API, and
  the world logic could not be tested without Claude Code. Rejected for the
  core; mods stay the polish layer.
- **A separate TUI app** that embeds the Claude Agent SDK, the obvious
  other way to build this. Rejected: we
  would rebuild what Claude Code already is.
- **SQLite for story state.** Needed only for semantic search and
  concurrency, neither of which v0.1 has. Files first; add a search index
  beside the files when recall by keyword proves insufficient.
- **`--append-system-prompt` instead of a full replacement.** Keeps the coding
  identity underneath the storyteller, which leaks ("I'll create a file").
  Rejected.

## Risks

- **Coding reminders leaking.** Even with a replaced system prompt, Claude
  Code injects reminders and listings into the user turn. Phase 1 includes a
  "does it ever talk like a coding assistant" check; the mod `prompt.attachment`
  hook can silence specific reminders later.
- **Permission prompts breaking immersion.** Every world tool must be
  pre-allowed in the plugin's settings so play never stops for a dialog.
- **Mods API churn.** Contained to layer 4 by design. The declaration file is
  regenerated per build, so a release note is a regen plus a type-check.
- **Compaction losing texture.** Mitigated by scene summaries on disk and the
  `recall` tool. Not fully solvable; long stories will feel it.
- **Windows.** Hooks and the launcher must run under PowerShell and Git Bash
  alike. Bun scripts invoked as `bun run` avoid shell differences.

## Decisions for sign-off

1. **Play mode.** Decided 2026-10-05: narrator mode, with the Storyteller as
   an agent holding agentic control over story and world, in two registers
   (world-building copilot, in-game narrator). See "The Storyteller" above.
   Character mode is not a goal.
2. **World store as an MCP server, not mod tools.** Recommendation: MCP, for
   stability and headless testability. Costs one extra process per session.
3. **Hide the coding tools from the model entirely** (`--tools` allowlist of
   `Read` plus our MCP tools). Recommendation: yes. The model touches story
   files only through tools with story semantics. Means `/import-card` and
   similar skills need their own narrow allowances.
4. **Story state as files, no database in v0.1.** Recommendation: yes.
5. **Bun + TypeScript for everything.** Recommendation: yes, matching the
   previous repo's toolchain so nothing new needs installing.

Approve or amend these and phase 1 starts.
