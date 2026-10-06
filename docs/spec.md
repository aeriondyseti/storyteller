# Spec: what the system does and how it acts

Status: **draft for review**, 2026-10-05. Written from the interview that followed
the design brief. The brief (`design-brief.md`) holds the rationale and the
platform choice; this document is the behaviour. Where they differ, this wins.

## 1. In one paragraph

You type `rp the-hollow-crown`. Claude Code opens in that story's folder, but
it is not a coding assistant: it is Vex, a Storyteller who knows the story's
people, places, rules and history, runs the world, voices everyone but your
character, and keeps the record straight on disk while you play. You write what
your character does; Vex narrates what happens. You open with `((` to step out
and talk to Vex as a collaborator about the story itself. A pane beside the
transcript shows where you are, who is present, and what is going on. When the
story grows past what the model can hold, nothing of consequence is lost: every
turn is logged, notes are kept continuously in the background, and Vex can
recall any earlier moment by meaning. The next day, `rp the-hollow-crown`
picks up where you left off.

## 2. Concepts

The brief's vocabulary stands (Story, Scene, Session, Turn, Player, Storyteller,
Character, plays, Persona, Impersonate, Lore, Directive). Additions:

- **Register**: which of two modes a message is in. *Narrator* is the default.
  *Copilot* is out of character, opened by a `((` prefix.
- **Library**: a shared folder of characters, lore and directives that any
  story can reference. One per machine.
- **Log**: the verbatim turn record of a scene, on disk. The canonical record.
- **Notes**: a structured, continuously updated digest of a scene (threads,
  who knows what, continuity, what is going on now). Maintained by a background
  Haiku job, never by the narrating model mid-turn.
- **Tracker**: a named value with a note (a wound, a debt, a countdown). Vex
  invents and retires them as the fiction needs.
- **Sheet**: optional character stats for a story that declares a rules-light
  system.

## 3. A story, start to finish

### 3.1 First launch of a new story

`rp new saltmere` creates `~/.storyteller/stories/saltmere/` with a bare
`story.md` (title only) and opens the session. Vex, seeing an empty story,
loads the `storyteller-interview` skill and speaks first, in copilot register:

> (( New story. Tell me what you have, as much or as little as you like: a
> genre, a mood, a character, an image, a film you want it to feel like. I will
> ask about whatever I still need before we open scene one. ))

The interview is **freeform**. You pitch; Vex asks only about what is missing
before play can start. Minimum before scene one: premise and tone, your
character, at least one other character or a place to meet them, and any lines
and veils you want set. Vex proposes rather than quizzes ("Two directions I
can see…"). As things are agreed, Vex writes them: `story.md`, cards, lore, a
scene-zero file. Vex says what it wrote in one line each, in copilot register.
Play begins when you say so, or when Vex asks "ready to open?" through a dialog
and you pick yes. Vex then narrates the opening.

### 3.2 A narrator turn

You write in the prompt box as your character:

> I set the map on the table between us and don't say anything.

Before the model sees it, a hook tags the register (narrator), activates lore
whose keys or meaning match the recent turns, and attaches a one-line scene
state header. Vex may consult the world (read a card, recall an earlier
promise, check a lore entry) and may change it (advance the time, note a
tracker, add a character it just invented). The transcript shows that work as
**one dim line per turn, in voice**: "Vex consults the archive." Then the
prose arrives, labelled with Vex's name, dialogue tinted per speaker, a styled
rule where time or place changes. Vex never writes your character's words,
decisions or feelings, and never ends on "what do you do?"; the opening it
leaves is the question.

After the reply, a hook appends both halves of the turn to the scene log and
starts the background notes job. The pane updates. The status line shows the
register, who you are playing, and memory health.

### 3.3 Stepping out

> (( less dread, more banter. and mira is too helpful ))

Copilot register. Vex answers inside `(( ))`, rendered visibly different (dim
or boxed), as a collaborator with opinions. It may act on what you said at
once: tune or write a directive, edit Mira's card. It tells you what it changed
in a line. The next in-character message returns to narration without comment.

### 3.4 Scene boundaries

Vex senses a beat closing, loads the `scene-close` skill, and **proposes**
through a dialog with choices:
"Close the scene here?" with options like *yes, close it*, *one more beat*,
*not yet*. On yes, Vex writes the closing summary, carries forward state and
open trackers, opens the next scene file with its state, and narrates the
transition. Persona changes happen here too, out of character.

Dialogs are used for forks (two or three directions, which scene next, add a
line?). Simple questions stay in prose.

### 3.5 Day two

`rp the-hollow-crown` **continues the last session** for that story. If the
session was compacted or is gone, the context is rebuilt from disk: the story
bible in the system prompt, the current scene's notes, and the last stretch of
the log verbatim. Vex opens with a short in-register "previously" only when
context was rebuilt; otherwise it just waits for you. `rp <story> --new` forces
a fresh session.

### 3.6 When the window fills

Compaction is expected, not feared. Because notes are maintained every turn,
compaction never summarizes from scratch: the rebuilt context is the current
notes plus the last turns verbatim, assembled by us, not by the engine's coding
summarizer. What must survive, near-verbatim: open threads and promises; what
each character knows, suspects and feels toward your character; continuity
details (injuries, possessions, exact places, time, minor names). Memorable
lines survive in the log and are reachable by recall, not pinned in context.

## 4. The Storyteller's contract

What Vex is and does, regardless of story. Rendered into the base system prompt.

- **Identity.** Vex is the Storyteller: narrator of the fiction and curator of
  the experience. Never an assistant, never a single character. Name, tagline
  and voice come from `story.md`.
- **Full agency, in the open.** Vex may change the world on disk without asking:
  scene state, trackers, new characters and lore it invents mid-scene, notes. It
  may not change the player's character card, the standing rules, lines or
  veils, or close a scene without a yes. Everything it changes is visible in
  the pane or files.
- **The player's character is the player's.** Never narrate their actions,
  dialogue, decisions or inner state. Impersonation is a later, explicit act.
- **Characters have their own minds.** They act on their wants and knowledge,
  say no, lie, leave, surprise. Consequences persist.
- **Continuity before invention.** When unsure of a fact, read or recall before
  inventing. When inventing, record it.
- **Pacing.** Vary beat length. Default 150 to 400 words; one line when one
  line is right. Introduce complications when things stall. End on an opening.
- **Prose, not formatting.** Dialogue in quotes with clear speakers. Italics
  sparingly. No headers, lists, tables or bold in narration. A short line of
  scene-setting on any change of time or place.
- **Register discipline.** `((` opens copilot; Vex answers in `(( ))`. One
  reply may hold both registers when each part is marked: prose for the
  fiction, `(( ))` around anything out of character, in separate paragraphs.
  Vex may step out on its own only to ask something the fiction cannot answer
  or to report a change, and asks through a dialog when there are choices.
- **Procedures are skills.** The long procedures live in `plugin/skills/`, and
  the system prompt keeps one line per procedure saying when to load it:
  `storyteller-interview` (3.1), `scene-close` (3.4), `invent-and-record`
  (what to write when inventing a person, place, rule or quantity: card and
  lore shapes, stems, trackers), and `recap`, the one the player can type
  (`/storyteller:recap`: a short past-tense recap from notes and log, ending on what is
  unresolved). The three procedures are `user-invocable: false`; every skill's
  `allowed-tools` is Read, Glob, Grep, AskUserQuestion and `mcp__world__*`.
- **Boundaries are absolute.** Lines are never crossed; veils are kept off
  page. Vex may propose adding one when a scene approaches an edge, by dialog.
- **Mechanics when declared.** If the story declares a system, Vex applies it
  and rolls through the tool; otherwise outcomes follow fiction and character.
- **Never mention the machinery** inside narration: tools, files, prompts,
  models, Claude Code. Work happens silently; the quiet line is the UI's, not
  Vex's.
- **Never summarize the player's message back to them.**

## 5. The world on disk

### 5.1 Roots

- Stories: `~/.storyteller/stories/<story>/` (override: `RP_STORIES`).
- Library: `~/.storyteller/library/` with `characters/`, `lore/`,
  `directives/` (override: `RP_LIBRARY`).
- Skills for every story: `~/.storyteller/.claude/skills/`, which Claude
  Code reads as a project ancestor of any story under the stories home.
- `rp install` creates these folders when missing and never writes content;
  `rp new` runs it first. It prints each folder and whether it was created.
- Configuration: Claude Code's own `settings.json`, see section 12a. There is
  no `~/.storyteller/config.json`.

A story folder is self-describing and portable. Nothing about a story lives
anywhere else except the Claude Code session transcripts, which are
disposable.

### 5.2 A story folder

```
<story>/
  story.md                 title, storyteller {name, tagline, voice}, persona,
                           uses: [library refs], lines: [], veils: [],
                           system: optional rules file; body: premise + notes
  characters/<stem>.md     name, tags, portrait; body: appearance, personality,
                           voice, backstory, example dialogue (free sections)
  lore/<stem>.md           title, keys: [], always: bool, priority: n; body
  directives/<stem>.md     title, mode: always|keyed|manual, keys: [], on: bool;
                           body: the instruction
  system.md                optional: rules-light system summary + how to resolve
  sheets/<stem>.md         optional: a character's stats under that system
  scenes/NNN-<slug>/
    scene.md               number, title, status, location, time, mood,
                           present: [], persona, widgets: {name: {type,
                           value, ...fields, note, color, pane, group}} (19);
                           body: ## Now (2-3 sentences), ## Notes (threads,
                           who knows what, continuity), ## Summary (at close)
    log.jsonl              verbatim turns, one JSON object per half-turn (7.1);
                           written by the Stop hook, read only by code
  assets/                  portraits, later imagery
  .rp/                     generated and machine state, gitignored:
    system-prompt.md       rendered at launch and after any bible change
    CLAUDE.md -> ../CLAUDE.md is generated too (index + current scene pointer)
    index.sqlite           embeddings over lore, log entries, notes, summaries
    state.json             activation history, counters
```

All human-facing files are markdown with YAML frontmatter. The log is the
exception: nobody edits it by hand, the in-game transcript is where it is
read, and code wants its fields, so it is JSONL. Free-form bodies on
purpose: Vex and the player write them conversationally, and the model reads
them verbatim.

### 5.3 Library references

`story.md` lists `uses: [characters/mira, directives/noir, lore/the-pact]`.
Each resolves to `~/.storyteller/library/<ref>.md` and is read live, so a
library edit reaches every story that uses it. A file with the same relative
path inside the story **overrides** the library copy entirely. ("Extends" by
appending is a later refinement.) Vex may copy a library item into the story
when asked to make it diverge.

### 5.4 Who plays whom

Each scene's frontmatter names the `persona` (the character the player plays).
Every other character present is played by the Storyteller. Changing persona
is a scene-boundary act. Impersonation (one-turn swaps) is designed for here
and built later.

## 6. Context assembly

Single player means we spend context freely: target roughly a quarter of the
window for standing material, and keep the machinery that makes compaction
cheap.

**System prompt** (rendered to `.rp/system-prompt.md`; the engine snapshots it
per conversation and re-reads it after compaction):

1. The Storyteller's contract (static, cached).
2. Story bible: story notes, lines and veils, system summary if any, the
   persona's card and sheet, every cast card in full, always-on lore in full,
   always-on directives, and an index (title, keys, path) of keyed lore and
   directives.
3. Closed scenes: their summaries, oldest first, trimmed from the oldest when
   over budget.
4. Current scene: state, notes and "now".

Anything that changes per turn travels in the turn, not the prompt:

**Per-turn injection** (the `UserPromptSubmit` hook, as additional context):
register tag; scene state header (one line); activated lore and keyed
directives (by key match over the last three turns and by semantic match over
the index, deduplicated against what was injected in the last N turns, within a
budget); and, when the context was just rebuilt, the "previously" block.

**Bible snapshot and deltas.** The system prompt is a per-conversation
snapshot: the engine reads it once at launch and resends it verbatim until
compaction, which is what keeps the prompt cache warm, so nothing ever edits it
per turn. A change to the bible after the snapshot (a directive toggled,
edited, added or deleted through the pane, `set_directive` or
`upsert_directive`) reaches the model as a per-turn delta from the
`UserPromptSubmit` hook instead, and only on the turn after the change:

    Directives changed since the bible was written:
    Now in force: A, B, C.

    ### <title> (<mode>)

    <body of each directive newly on or edited>

    Switched off: X, Y.

The hook keeps a hash per directive in force (title, mode, keys, body) in
`.rp/state.json` (`inForce`) and compares it with the files each turn. On the
first turn of a session (the hook's `session_id` differs from the stored
`sessionId`) and on `SessionStart` after a compaction, the bible was just
rendered from the same files, so the record is reset to the current set and
nothing is injected. Keyed directives already travel by key; an edited keyed
body differs from the hash in its last injection record, so the new text goes
in on the next key match, marked `(updated)` (20.3). Compaction and relaunch refresh the
snapshot. The same pattern is how edited cards or always-on lore could reach
the model mid-session later (not built).

**On demand** (tools Vex calls): cards, lore, recall, scene history.

## 7. Memory machinery

1. **Log append.** The `Stop` hook appends the player prompt and Vex's reply to
   the scene's `log.jsonl`, one line per half-turn. Nothing depends on the
   session surviving. Each line:

   ```json
   {"n":14,"speaker":"player","name":"Corwin Hale","register":"narrator","at":"2026-10-05T20:00:00.000Z","uuid":"<transcript uuid>","text":"I set the map down."}
   ```

   `n` numbers the exchange; the player half and the Storyteller half share
   it. `speaker` is `player` or `storyteller`. `name` is the persona's display
   name (`Player` when the persona has no card) or the Storyteller's name.
   `register` is the player half's (`copilot` when the prompt opens with `((`
   or carries `[register: copilot]`, else `narrator`), copied to the
   Storyteller half. `uuid` is the transcript line the text came from: the
   prompt, or the last assistant line holding reply text (empty when the
   reply came from the hook input, below). Claude Code writes the transcript
   asynchronously, so at Stop the turn's last lines may not be on disk yet:
   the hook rereads it (up to 3 s, every 250 ms) until the latest reply ends
   with the input's `last_assistant_message`; when the wait runs out, the
   latest exchange takes that text (unless the transcript shows that exchange
   already ended, meaning the prompt itself has not landed). Each Stop logs
   every exchange after the `lastLogged` prompt, in order, so a turn one Stop
   missed is caught up by the next. The launcher's
   `[new story]` opening cue is not logged; its exchange has only the
   Storyteller half. No header line: `open_scene` creates an empty file, and
   the first append creates the folder and file if missing. A torn last line
   is skipped on read. `src/log.ts` is the only reader and writer (the mod's
   notes job, which cannot import it, restates the read). To read one by
   hand: `jq -r 'select(.speaker=="storyteller") | "\(.n) \(.text)"' log.jsonl`.
2. **Continuous notes.** A mod hook on `turn.complete`, every `notesEvery`
   completed turns (section 12a, default every turn), asks Haiku, through
   `$.model.complete` on the session's own client, to update the scene's
   `## Notes` and `## Now` from the last turns and the previous notes,
   preserving the texture list in 3.6, and writes the result to `scene.md`. It
   then re-embeds the scene's log entries and notes into `index.sqlite` by
   running `bun scripts/reindex.ts <story> --incremental` through
   `$.process.run` (the mod cannot reach the world server's process). No
   separate API key, nothing shells out to `claude -p` (decided 2026-10-05).
   Memory health on the status line is "turns since notes were last updated":
   `.rp/state.json` keeps `notesTurn` (narrator turns counted by the job) and
   `notesUpdatedAt` (the hooks' `turn` when notes were last written). Because this lives in the mod layer, the
   notes job ships with the stage phase's hooks module, and the stable hooks
   keep the log complete in the meantime.
3. **Semantic recall.** Local embeddings (Transformers.js, small model, one-time
   download) in SQLite via sqlite-vec, inside the world server. Indexed: lore
   entries, log entries, notes, scene summaries. `recall(query)` returns the
   best passages with scene and turn numbers. A hosted provider is a config
   switch, later.
4. **Compaction.** Two paths that produce the same result. Stable path:
   `PreCompact` refreshes notes synchronously; `SessionStart(compact)` injects
   notes plus the last turns verbatim. Mod path, once the stage phase lands:
   the `session.compact` hook answers with our rebuilt messages directly, so
   the engine's coding summarizer never runs. The system prompt file is kept
   current by the `Stop` hook, so the post-compaction prompt is fresh.
5. **Scene close.** Vex writes the `## Summary` from notes and log through
   `close_scene`. Summaries are embedded and join the bible.

## 8. Tools: the world server

One stdio MCP server, `world`, bundled in the plugin, pre-allowed, started per
session in the story folder. Same tools in both registers; the contract
governs their use. Built-in tools kept for the model: `Read`, `Glob`, `Grep`
(story folder and library only), `AskUserQuestion` (the dialog) and `Skill`
(loads the plugin's procedures, section 4).

| Group | Tool | Does |
|---|---|---|
| Read | `get_character`, `list_characters` | A card and sheet by name; the cast |
| | `search_lore(query)` | Keys and meaning over lore |
| | `recall(query, scope?)` | Semantic search over logs, notes, summaries |
| | `get_scene(n?)` | A scene's state, notes, summary |
| | `get_directives` | What is in force and what is available |
| State | `set_scene_state({title?, location, time, mood, present})` | Current scene; `title` renames it in frontmatter only, the folder stays |
| | `set_widget(name, {type, value, max?, of?, note?, color?, pane?, group?})`, `remove_widget(name)` | Widgets (19) |
| | `roll(expr)` | Dice, shown in the quiet line |
| Canon | `upsert_character`, `upsert_lore`, `upsert_directive` | Write cards and entries |
| | `set_directive(name, on)` | Toggle a manual or keyed directive |
| | `update_story(notes?, lines?, veils?)` | Copilot only, on request |
| | `update_sheet(character, changes)` | Under a declared system |
| Scenes | `open_scene(title, state)`, `close_scene(summary)` | Boundaries, after a yes |
| | `set_persona(character)` | At a boundary |

Every write re-renders the system prompt file and re-indexes what changed.

## 9. Hooks

Settings hooks shipped in the plugin, all Bun scripts:

- `SessionStart`: on `startup` and `resume`, nothing. On `compact` (and on a
  resume whose context was rebuilt), inject notes plus the last turns; on
  `compact` also reset the directive record (section 6).
- `UserPromptSubmit`: register tag, state header, directive deltas since the
  bible snapshot, lore and directive activation (section 6).
- `Stop`: log append (every unlogged exchange, waiting briefly for a lagging
  transcript, 7.1), system prompt refresh, start the notes job.
- `PreCompact`: synchronous notes refresh.
- `PreToolUse`: allow every `world` tool and the built-ins above; no dialogs.

## 10. The stage

Mods, in the plugin's hooks module. Each degrades to the engine's own drawing
if it fails.

- **Scene pane** (read-only in v0.1): scene title; where, when, mood and "now"
  (two or three sentences from notes) together under Now; who is present, with portraits where the
  terminal draws images; trackers. Opens on session start when the layout docks
  a pane; `/storyteller:scene` opens it otherwise.
- **Directives pane**, opened by `/storyteller:directives` as a dialog (it takes the keys;
  Tab and the arrows walk its controls; Esc closes it). Section 12 says what it
  does. It is the stage's one pane that writes, always through
  `plugin/directives.ts`, never by parsing files in the mod.
- **Status line**, always on: by default two rows, "Model: Opus 5.5
  (medium)", "Narrator: Vex (narrator)", "Persona: Corwin", the story title
  and the scene, then context, plan usage, turns since notes and log saved;
  the player lays out their own by editing `statusline.json` with sources
  from a catalog, section 19.5. This replaces the user's coding status line
  for the session.
- **Quiet line**: tool rows collapse to one dim line per turn, in voice. Phrases
  map from tool groups: consults the archive, notes the time, marks a tracker,
  rolls. Expandable with ctrl+o.
- **Reply label and spinner**: replies carry the Storyteller's name in its
  colour; the spinner says "Vex is writing" or "Mira is thinking" when a card
  is being read.
- **Dialogue tint** per speaker, stable colours; narration in body colour.
  **OOC** text dim or boxed. **Scene-setting** lines drawn as a styled rule.
- **Quieting**: engine reminders aimed at coding are dropped with
  `prompt.attachment`; auto memory is off. The rule for commands, skills and
  agents: a story session ignores the player's user level entirely and keeps
  only our plugin, the stories home tree (`~/.storyteller/.claude/*` and
  `<story>/.claude/*`) and a short list of built-in commands (`clear compact
  config cost doctor effort exit help model quit rename resume rewind
  status`). The launcher's `--setting-sources project,local` does most of it
  (no `~/.claude` settings, plugins, skills, agents or settings hooks load);
  the mod's `stage/commands.ts` hides the engine's remaining built-in
  commands and bundled skills from the menu (`command.describe`) and answers
  one typed in full with an out-of-character note instead of its prompt
  (`skill.prompt`, which also fires when the model calls the Skill tool); the
  same keep-rule trims the engine's `skill_listing` attachment, so the Skill
  tool offers the Storyteller only our skills (named `storyteller:<name>`)
  and project skills. Built-in agent types need nothing, as the Storyteller
  has no Agent tool.
- **Naming**: every command and skill of ours is reached under
  `storyteller:` (`/storyteller:recap`, `/storyteller:scene`,
  `/storyteller:directives`), and a built-in's name is never shadowed: bare
  `/recap` is the engine's (hidden from the menu like any coding built-in).
  The engine's `$.command.register` takes letters, digits, `_` and `-` only
  (a colon is refused), so the stage's two commands are plugin command files,
  `plugin/commands/scene.md` and `directives.md`, which the plugin prefixes;
  a `command.run` hook in the stage answers each before its text reaches the
  model (the text is a fallback for a session where the mod did not load).
  Unlike a registered command, they wait for a running turn to end.

## 11. Launcher

```
rp                                                  pick a story, or start one
rp <story> [--new] [--model m] [-- <claude args>]   continue or start
rp install                                          scaffold the stories home
rp new <name>                                       blank story, opening talk
rp list                                             stories on this machine
rp prompt <story>                                   print the rendered bible
```

**The picker** (`rp` with no argument; decided 2026-10-06). It lists every
folder under the stories root with a `story.md`, last played first: the
newest transcript in the story's Claude Code project folder (the path
encoding of `sessionsDir` in `src/launch.ts`), else `story.md`'s modification
time. A row shows the title in bold, the folder name dim when it differs,
the current scene ("Scene 3: The Gate", or "no scene yet") and when it was
last played ("2 h ago", "yesterday", "never"); a story that fails to load
shows why in place of its scene. Arrow keys or `j`/`k` move (`g`/`G`, Home
and End jump), Enter plays the story exactly as `rp <story>` does, Esc, `q`
or Ctrl+C quit. A last row, `+ new story`, asks for a folder name and runs
`rp new <name>`; with no stories at all `rp` asks for the name straight away.
The picker reads raw keys from stdin (no dependency) and gives the terminal
back in cooked mode with the cursor shown on every way out, so the `claude`
session it starts owns stdin. Longer lists than the terminal is tall scroll
with the selection. When stdin or stdout is not a terminal, `rp` prints the
list as `rp list` does and exits 1, asking for a story name. `rp list` stays
as the plain-text, scriptable form: folder, title, scene and last played,
one story per line. The data, frame and key handling are pure
(`src/picker.ts`); the raw-mode loop is `src/picker-tty.ts`.

Defaults: best available model, extended thinking on, effort high; Haiku for
background jobs; tools allowlist as in section 8; the plugin loaded from the
repo; auto memory disabled; `--setting-sources project,local`, so the
player's `~/.claude` layer (their plugins, skills, agents, hooks and coding
status line) stays out while the stories home's and the story's `.claude`
still load (`--restricted` would drop those too; section 10); permissions
for world tools pre-allowed through `--settings`. Model, effort and the rest
come from the configuration in section 12a; `--model` on the command line wins for one session.

## 12. Directives

Composable instructions on top of the contract: style, pacing, content rules,
genre conventions. `mode: always` is in the bible; `keyed` activates like lore;
`manual` is toggled. Global defaults, including a boundaries directive, live in
the library and are referenced from `story.md`. Managed two ways: by asking Vex
out of character, and in the directives pane (`/storyteller:directives`, section 10).

The pane lists one row per directive: an `[on]`/`[off]` toggle (digits 1-9
press the first nine while no field is being edited), the title, the mode and
keys dim, `(library)` dim when the story uses the library's file, a dim first
line of the body, and `open`, `edit` and `delete`.

- **Toggle** writes `on:` at once.
- **Edit** swaps the row for an inline editor: title, mode (a select), keys (a
  comma list) and the body. The engine's `Input` is one line only, so the body
  is edited in place only while it is a single line of at most 300 characters.
  A longer body is left alone by Save; `open` or `… ask Vex` (which closes the
  pane and puts `((edit the directive "<title>": ` in the prompt) is the way to
  change it. Save writes, redraws and shows a dim one-line confirmation.
- **New directive** opens the same editor empty: mode `manual`, on. The stem is
  made from the title.
- **Delete** asks `really delete? [yes] [no]`. A library directive cannot be
  deleted, only switched off or edited; the pane says so in a dim line.
  Deleting a story file that overrode a library directive brings the library's
  copy back.
- **Open** opens the file in force in the player's editor: `VISUAL` or
  `EDITOR` if set (a terminal editor such as vim is passed over, as it would
  have no terminal), else `code` on PATH, else the platform opener (`cmd /c
  start`, `open`, `xdg-open`). For a library directive that is the library file
  itself, and the confirmation says edits there reach every story.
- **Refresh** re-reads the list. It is also re-read each time the pane opens,
  and every four seconds while the pane is open, if a listed file's mtime (or
  that of the story's `directives/` folder) changed.

Writes follow the world server's rule (`upsert_directive`, `set_directive`): a
change to a library directive first copies it into the story's
`directives/`, where it overrides the library's (5.3), so other stories keep
the library version. After every write the prompt file is regenerated.

## 12a. Configuration

Decided 2026-10-05: anything configurable is a `userConfig` field declared in
`plugin/.claude-plugin/plugin.json`. Claude Code stores the values in the
user's `settings.json` under `pluginConfigs["storyteller"].options` (the
plugin is named `storyteller`: names starting with `claude-` are reserved),
validates and defaults them before the mod loads, draws each as a row in
`/config`, and reloads the mod with the new `options` when one changes. No
second config file, no env-var sprawl.

How each layer reads it:

- **Mod**: `register(on, options)` receives the values directly. A story
  session does not read the user's `settings.json` (section 10, Quieting), so
  the launcher reads it with `src/config.ts` before the session starts and
  hands the resolved values in through `--settings` `pluginConfigs`; a change
  made in `/config` applies from the next launch.
- **Hooks and the world server**: a shared `src/config.ts` declares the same
  fields with defaults, reads `settings.json`, and exports a typed `Config`.
  The launcher resolves the config once and passes it to the server as a
  single `RP_CONFIG` JSON environment variable, so a hook, the server and the
  mod always agree.

Initial fields (name, type, default):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `notesEvery` | number | 1 | Run the background notes job every N completed turns |
| `notesModel` | string | `haiku` | Model for the notes job |
| `narratorModel` | string | engine default | Model the launcher passes with `--model` |
| `narratorEffort` | `low|medium|high|xhigh|max` | `high` | Effort for narration |
| `embeddings` | `local|hosted` | `local` | Embedding provider for recall |
| `paneOnStart` | boolean | true | Open the scene pane when the layout docks one |
| `contextBudget` | number | 0.25 | Share of the window for standing material |
| `loreBudget` | number | 0.1 | Share of the window lore may fill; new lore per turn gets a quarter of it (20.4) |
| `loreScanDepth` | number | 3 | Logged exchanges, besides the new prompt, scanned for lore keys (20.2) |

Adding a configurable means adding a row to this table, the manifest, and
`src/config.ts`, in one commit.

## 13. Mechanics

Optional. `story.md` may name a `system.md` that summarizes a rules-light
system (how to resolve, what the sheets hold). Characters under it have
`sheets/<stem>.md`. Vex applies the rules, rolls through the tool, and keeps
sheets current. Stories without a system are pure narrative; trackers remain
narrative aids either way.

## 14. Out of scope for v1

Multiplayer (removed). Impersonation (designed, built later). Swipes,
regenerate, editing past replies (`/rewind` and edit-last-prompt stand in).
Generated imagery, ambient audio, spoken narration, SillyTavern card import.
Pane controls. Switching stories inside a session: the way to another story
is to leave and pick it with `rp` (section 11). Semantic "extends" for
library overrides.

## 15. Phases, revised

1. **Foundation.** Story and library on disk, launcher, system prompt, world
   server with read, state, canon and scene tools, log append, register tag,
   keyword lore activation, blank-start conversation. Playable end to end,
   including talking a story into being.
2. **Memory.** Notes job, embeddings and index, semantic activation and
   `recall`, compaction rebuild (stable path), day-two "previously".
3. **Directives and mechanics.** Directive files, `/storyteller:directives`,
   `set_directive`, library boundaries; optional system, sheets, `roll`.
4. **Stage.** Pane, status line, quiet line, labels and spinner, tints, OOC
   style, scene rules, `session.compact` override, reminder quieting.
5. **Review.** Play for a while. Apply the escape criterion from the brief.

## 16. Clarifications (2026-10-05, from the first worker round)

- **Register tag.** The `UserPromptSubmit` hook puts `[register: copilot]` or
  `[register: narrator]` as the first line of its additional context. Vex
  trusts the tag and falls back to the `((` prefix only when no tag is present.
  `/ooc` does not exist.
- **Vex speaks first** on a blank story because the launcher sends an opening
  message on the player's behalf as the session's initial prompt:
  `[register: copilot] [new story] Begin.`
- **Scene-setting line shape.** Its own paragraph, a short italic phrase:
  `*The Tallow Stair, an hour before dawn.*` The stage styles exactly that.
- **Character references** in scene frontmatter (`present`, `persona`) and in
  notes use the card's file stem, never the display name.
- **`update_story`** and edits to the player's own card happen only when the
  player asks in copilot register.
- **Blank stories load.** A `story.md` with only a title is a valid story with
  empty collections and no scene.
- **Copilot turns are logged** like any other, so the record is complete, but
  the notes job treats a turn logged with `"register":"copilot"` as talk about
  the story, not an event in it.
- **The log is JSONL** (decided 2026-10-05, replacing `log.md`): one object
  per half-turn with `n`, `speaker`, `name`, `register`, `at`, `uuid`, `text`
  (7.1). No markdown view is kept; the transcript is the reading surface.
  Where the model is shown turns (the SessionStart "previously" block, recall
  passages, the notes job's `<turns>`), they are rendered as readable text:
  `Player: …` / `Vex: …`, or `### <n> · Player` headings for the notes job.
  Recall indexes one passage per exchange (both halves), keyed by its `n`.
- **Tracker keys** are readable names ("Days to the Crown Vote"); the name is
  the key.
- **`portrait`** on a card is optional and names a file under `assets/`.
- **`update_story`** also takes `title`, `persona` and `storyteller`, because
  the blank-start interview sets them in conversation. The rule stands: only
  when the player asks, in copilot register.
- **Notes shape** is fixed by `plugin/prompts/notes.md`: `## Now`, `## Notes`,
  `### Threads` (`- open:` / `- resolved:`), `### People` (`#### <stem>` with
  `- knows:`, `- suspects:`, `- feels:`), `### Continuity`. The notes job sends
  its input as `<persona>`, `<cast>`, `<previous_notes>` and `<turns>` blocks.

## 16a. Decisions (2026-10-05, second round)

- **Mixed registers are allowed when marked.** A reply may hold an
  out-of-character `(( ))` aside and in-character prose together, each in its
  own paragraph. What is never allowed is an unmarked switch: fiction inside
  `(( ))`, or out-of-character talk as bare prose. The stage dims `(( ))`
  spans wherever they fall.
- **Procedures became skills** (section 4). `storyteller.md` went from 7,335
  to 6,515 characters; the procedures now load only when their moment comes.
- **`rp install`** scaffolds the home (5.1) idempotently, with no seeded
  content.

## 17. Open questions

- Resolved (2026-10-05): the embedding model is
  `Xenova/all-MiniLM-L6-v2` (384 dimensions, int8 ONNX, ~23 MB) through
  `@huggingface/transformers` 4.x, cached in `~/.storyteller/models/`.
  Confirmed under Bun 1.3.14 on Windows with no native build step
  (onnxruntime-node's blocked postinstall is not needed there); Linux still to
  confirm. Measured on the example story: first run with download ~1.5 s
  model load, cached load ~0.2 s, embedding 11 passages ~130 ms, a query
  2-6 ms; the prompt hook with semantic activation runs in ~0.3 s.
- Learned: all-MiniLM-L6-v2 cosine scores run low. On-topic lore scores
  0.4-0.6 and loose matches 0.15-0.3, so the thresholds are 0.45 for
  semantic activation (strict: a wrong entry costs more than a missed one),
  0.35 for search_lore's meaning hits and 0.2 for recall. Tune with play.
- Learned: `claude plugin test plugin` runs every `*.test.ts` under
  `plugin/`, so Bun tests there are `*.spec.ts`; and the engine hands `$.fs`
  hooks native paths (backslashes on Windows).
- Open: the notes job waits up to 20 s for the `Stop` hook to log the turn
  (turn.complete can fire before a settings hook finishes). No event ties
  the two (turn.complete's `turnId` is the engine's, the hook keys on the
  prompt's transcript uuid), so it accepts `lastLogged` moving, the logged
  reply ending like the answer, or a reply logged after the turn began. A
  copilot or slash-command prompt (from `turn.start`) skips the job; a wait
  that runs out leaves one line in `.rp/hook-errors.log`. If the engine ever
  guarantees the order, the wait can go.
- Open: an empty vec0 table preallocates a chunk, so a fresh `index.sqlite`
  is ~1.6 MB even for a handful of passages. Harmless; noted in case it
  surprises.
- Resolved: the notes job runs in the mod via `$.model.complete`; `claude -p`
  is not used anywhere. (A headless `claude -p --model haiku` does work on the
  session login, so it remains a fallback if the mod API moves.)
- How much of a card to show in the pane when portraits cannot be drawn.

## 18. Later

Ideas the player has asked to keep, not yet scheduled. Top of the list first.

- **`/storyteller:pane <name>`: bring a pane forward.** Next to do. The engine
  switches tabs only by `ctrl+x tab`, then `Tab` onto another tab and `Enter`,
  or a click; a command that opens or focuses a pane by name (scene,
  directives, or any named widget pane) is one keystroke-sequence shorter.
  Takes a prefix of the title; with no argument lists the open panes.
- **Widgets.** Specified in full in section 19; ready to build.

- **Status line editor CLI.** A small command (`rp statusline`) that lets the
  player edit `~/.storyteller/statusline.json` interactively: list the
  catalog, add, remove and reorder widgets per line, preview with sample or
  live values, validate and save. Replaces the dropped skill and tool with
  something that runs outside a story session.
- **Lorebooks.** Specified in full in section 20; ready to build.
- **Comment syntax in story files.** A way for humans to write notes in cards,
  lore, directives and scenes that are stripped before anything reaches the
  model: the renderer, the world tools and the hooks all drop them. Decided
  2026-10-05: HTML comments (`<!-- … -->`) only, since every markdown editor
  already knows them; no line-comment form.
- **Seeding the library.** `rp install` scaffolds an empty home for now; what a
  starter library and starter home-level skills should contain is undecided.
- **Theme and other user preferences** that matter inside a story session now
  that the user settings layer stays out; `tui: fullscreen` was the first.
- **Pane auto-open** missed once on a first launch after an update; watch for
  recurrence.

## 19. Widgets

Specified 2026-10-05 by interview. Ready to build; supersedes the Later entry.

### 19.1 What a widget is

A widget is a **component**: a `type`, a small props schema, and a draw
function with two targets, the pane (boxes, bars, bullets) and the status line
(a short string). Components own neither data nor placement. Two **hosts** hold
instances of them:

- **Panes** hold story state. Vex writes these instances into the scene file
  and the pane draws them. The player configures nothing: new trackers appear
  looking right, in any scene, without code or layout files.
- **The status line** holds session state. The player configures these
  instances in a JSON file; their values come from a fixed catalog of sources.

Trackers are replaced by widgets: a tracker was a widget with no type.

### 19.2 Types

Six types in the first cut. Every widget has a `name` (the key, a few words),
an optional `note` (one to three short sentences), an optional `color` (any
hex), and placement fields `pane` and `group` (19.4).

| type | fields | pane | status line |
|---|---|---|---|
| `text` | `value: string` | `Weather    sleet, turning` | `Weather sleet, turning` |
| `counter` | `value: number` | `Days to vote  9` | `Days to vote 9` |
| `meter` | `value, max: number` | `Health     ▰▰▰▰▰▰▰▰▰▱ 88/100` | `Health 88/100` |
| `clock` | `value, of: number` | `Suspicion  ◆◆◇◇◇◇ 2/6` | `Suspicion 2/6` |
| `list` | `value: string[]` | `Powers     • wheel`, then one `• item` per line under it | `Powers: wheel, parry` |
| `tags` | `value: string[]` | `Conditions wounded · hunted`, wrapping as `· broke` | the same |

In the pane the value always starts in the value column (19.4); a meter is
ten cells, the value left-aligned after it.

Later types, not in the first cut: `sparkline` (a trend from a widget's
recent values, which needs the server to keep history) and `portrait`.

### 19.3 Story widgets: what Vex writes

Scene frontmatter, replacing `trackers`:

```yaml
widgets:
  Health:       { type: meter, value: 88, max: 100, color: "#c0392b", group: Body }
  Suspicion:    { type: clock, value: 2, of: 6, note: "The night clerk heard something." }
  Powers found: { type: list, value: [dialogue wheel, parry], pane: Powers }
  Conditions:   { type: tags, value: [wounded, hunted] }
```

- **Scene only.** Widgets belong to the scene. When Vex opens the next scene
  (the scene-close skill), it decides per widget to carry, change or retire;
  nothing persists by itself.
- **Order and grouping are Vex's.** File order is draw order. `group` draws a
  heading in the pane; `pane` names a tab (19.4). Vex may use either, both
  or neither.
- **Tools.** `set_widget(name, { type, value, …fields, note?, color?, pane?,
  group? })` creates or updates; `remove_widget(name)` retires. The server
  validates per type (a `meter` without `max` is refused with the fix named)
  and re-renders the prompt file. `type` is an enum in the schema and each
  field is described, so the tool is the catalog Vex reads at call time; the
  invent-and-record skill carries a short table of the types and when each
  fits. `set_tracker` and `remove_tracker` are removed.
- **Migration.** A `trackers:` block still on disk loads as widgets: numbers
  become `counter`, everything else `text`. The server rewrites it as
  `widgets:` on the next write to that scene.
- **Brevity** as decided for trackers: name a few words, note one to three
  short sentences, the number in the value.

### 19.4 Panes

- The scene pane's sections (Now, Present, Widgets) are each a dim frame with
  the title, in title case, set into its top edge, and a blank framed row of
  padding inside the top and bottom edges; the scene line and its rule stay
  unframed above them. Now opens with where, when and mood (dim labels,
  values wrapped with a hanging indent), then a blank row, then the "now" prose,
  drawn dim like a widget's note. Without "now" the frame holds just those rows;
  with none of the four it is left out.
- The scene pane's Trackers section becomes **Widgets**, in file order,
  ungrouped widgets first with no heading. Each `group` opens with its name
  upper-case and bold in the body colour, no underline, and on the next line a
  dim rule across the full width; a blank row comes before every group but
  the first. A group's widgets, their wrapped lines and notes included, sit two
  cells in from its heading.
- **Two columns.** Every widget in a section (or a named pane) shares one name
  column: the longest name plus two cells, after the group indent, capped at
  40% of the width; a longer name is cut with an ellipsis. Names are in the body
  colour, never coloured. Every value starts in the column after it: a meter is
  a 10-cell bar (`▰` filled, `▱` empty) then `value/max`; a clock its filled and
  empty segments then `value/of`; a counter or text its value, left-aligned,
  text wrapping inside the value column; a list one `• item` per line, stacked
  in the value column; tags joined with ` · `, wrapping inside the value
  column, a wrapped line opening with `· `. The widget's `color` applies to the
  value only (bar, segments, counts, text, items, tags; the empty part dimmed).
- **Notes** are always dim and uncoloured, start two cells in from the name,
  wrap to the rest of the width and are shown in full (for a list or tags,
  after the last item line). Nothing shrinks to fit the height; the pane
  scrolls.
- **Narrow panes.** When fewer than 16 cells are left beside the name column,
  every widget stacks: the name on its own line, the value on the next lines
  four cells in from the name, the note four cells in as well.
- A named pane draws the same two columns and group headings, unframed and
  without the padding rows.
- **Named panes.** A widget with `pane: Powers` belongs to a tab called
  Powers. The tab opens by itself when the first such widget appears and
  closes when the last one is retired. The scene pane is the default and
  always exists. Tabs are the engine's own: the dock draws titles as tabs when
  more than one pane is open.
- **Read-only** in the first cut. Values change through Vex or the file.

### 19.5 Status line widgets

The status line is always on. With no file it draws the built-in default
(below); the player changes it by editing `~/.storyteller/statusline.json`
by hand (JSON: it is machine-shaped config) and checks the file with
`bun <plugin>/statusline.ts --check`. There is no command or skill for it.
Each instance is a component bound to a **source**:

```json
{
  "lines": [
    [ { "type": "text", "source": "turn.register" },
      { "type": "text", "label": "You", "source": "persona.name" },
      { "type": "text", "source": "scene.title" } ],
    { "separator": " · ",
      "widgets": [
        { "type": "meter", "label": "ctx", "source": "session.context_pct", "max": 100, "width": 10 },
        { "type": "meter", "label": "5h", "source": "usage.session_pct", "max": 100 },
        { "type": "meter", "label": "wk", "source": "usage.weekly_pct", "max": 100 },
        { "type": "counter", "label": "notes", "source": "notes.age", "suffix": " ago" },
        { "type": "text", "label": "log", "source": "log.ok" } ] }
  ]
}
```

- **Lines** are the layout: a list of lines, each a list of instances joined
  with ` | `, or `{ "separator": " · ", "widgets": [...] }` to join that line
  with its own separator text. A line object takes only those two fields.
  Separators are drawn in the label colour. Multi-line output is supported by
  the engine: each printed line is a row.
- **Instance fields.** `type` (one of the six), `source`, optional `label`,
  and only the fields its type takes: `meter` `max` (not needed for a
  percent source), `width` (bar cells, default 10, at most 40),
  `thresholds` and `color` (see Meter colour); `clock`
  `of` (required, 1 to 12); `counter` `suffix`. Any other field, an unknown
  source, or a type that cannot show the source (a meter of a name) is an
  error. Which types suit a source: a percent suits meter, counter, text; a
  number counter, meter (with `max`), clock, text; text suits text, list,
  tags.
- **How each type reads** (`src/statusline-layout.ts`): `text` is the
  value, or `label: value` with a label (`Persona: Corwin Hale`; the colon
  is added); `meter` is `label ▰▰▰▱▱▱▱▱▱▱ 34%`, the percent for a percent
  source out of 100, else `value/max`; `counter` is `label: 2` plus the
  suffix, which a word in place of the number (`notes: never`) does not get;
  `clock` is `label 2/6`; `list` is `label: value`; `tags` the value alone.
- **Label and value colour.** A label (with its colon) is bright black, ANSI
  90; a value is bold in the terminal's default colour, ANSI 1. Bold default
  rather than bright white (97) because it reads on light themes as well as
  dark ones. The value of an instance with no label is bold too. A meter's
  label is bright black; its bar and number take the meter colour.
- **Meter colour.** A meter's bar and the percent or `value/max` after it
  are coloured by how full it is (value / max as a percent): under 60 green,
  60 to 80 yellow (80 included), above 80 red. The codes are the standard
  ANSI ones (32, 33, 31, then reset 0), so the terminal's theme picks the
  shade, and `--check` previews them. The default layout's meters (ctx, 5h,
  wk) follow this rule. A meter instance may set `"thresholds": [60, 80]`,
  two ascending percents from 0 to 100, to move the cut points, and
  `"color": false` to draw that meter, label included, with no colour; any
  other value for either is an error.
- **Absent values.** An instance whose source has no value now is left out of
  its line, and a line left empty is dropped: plan usage on an API key or
  before the first reply, context percent early in a session, no scene yet.
- **Source catalog** (`src/status-sources.ts`, exported as data with a
  description and the types each suits), where each value comes from:

  | source | from |
  |---|---|
  | `session.context_pct` | `context_window.used_percentage` (null early in a session; else `total_input_tokens / context_window_size`) |
  | `session.model` | `model.display_name`, else `model.id` |
  | `session.model_effort` | the model as above and `effort.level` in parentheses: `Opus 5.5 (medium)`; the model alone when there is no effort |
  | `usage.session_pct` | `rate_limits.five_hour.used_percentage` |
  | `usage.weekly_pct` | `rate_limits.seven_day.used_percentage` |
  | `story.title`, `scene.number`, `scene.title`, `persona.name` | the story on disk (the persona by its card's name) |
  | `scene` | `Scene 1: Arrival`, number and title; added for the default line |
  | `narrator` | story.md `storyteller.name` (Vex by default) and `turn.register` in parentheses: `Vex (copilot)` |
  | `turn.register` | the latest prompt in the transcript, by `registerOf`; `narrator` before the first |
  | `notes.age` | `.rp/state.json` `turn` minus `notesUpdatedAt`; `never` when the notes job has not run |
  | `log.ok` | `✓`, `…` while a turn runs, `✗` when an exchange went by unlogged |

  `rate_limits` is in Claude Code's input only for claude.ai Pro and Max
  subscribers, after the session's first reply; each window may be missing on
  its own and is dropped when its `resets_at` passes. Checked against a real
  payload from Claude Code 2.1.290 (`src/testing/fixtures/statusline-input.json`).
  The input also carries `rate_limits.*.resets_at`, `cost.total_cost_usd`
  and `session_name`, for later sources. Later: Fable-specific
  usage by polling Anthropic's usage endpoints with the OAuth token
  (reference: the ccstatusline npm package), `session.cost_usd`, reset times.
- **No story widgets on the status line.** It is meta-only; the story title,
  persona and scene are the only story facts, and they are sources, not
  widgets Vex places.
- **Default with no file** (`defaultLayout` in `src/statusline-layout.ts`),
  two lines (sample values), and the same layout as a file:

  ```
  Model: Opus 5.5 (medium) | Narrator: Vex (copilot) | Persona: asset1 | Story: Build Failed Successfully | Scene: Scene 1: Spawn Point
  ctx ▰▰▰▱▱▱▱▱▱▱ 34% | 5h ▰▱▱▱▱▱▱▱▱▱ 14% | wk ▰▰▰▰▱▱▱▱▱▱ 36% | notes: 2 ago | log: ✓
  ```

  ```json
  {
    "lines": [
      [ { "type": "text", "label": "Model", "source": "session.model_effort" },
        { "type": "text", "label": "Narrator", "source": "narrator" },
        { "type": "text", "label": "Persona", "source": "persona.name" },
        { "type": "text", "label": "Story", "source": "story.title" },
        { "type": "text", "label": "Scene", "source": "scene" } ],
      [ { "type": "meter", "label": "ctx", "source": "session.context_pct", "width": 10 },
        { "type": "meter", "label": "5h", "source": "usage.session_pct" },
        { "type": "meter", "label": "wk", "source": "usage.weekly_pct" },
        { "type": "counter", "label": "notes", "source": "notes.age", "suffix": " ago" },
        { "type": "text", "label": "log", "source": "log.ok" } ]
    ]
  }
  ```

  Every instance in the default has a label. Widgets with no value are left
  out as anywhere (on an API key the second line is
  `ctx … | notes: 2 ago | log: ✓`). No hint: there is nothing to set up.
- **A broken file** (bad JSON, an invalid instance) draws the default and
  appends, dimmed, `(statusline.json: <error>)` to its last line, once; the
  error names the line and widget (`line 1, widget 2: unknown source "hp"`).
  `RP_STATUSLINE` overrides the file's path, for tests.
- **`bun <plugin>/statusline.ts --check [file]`** validates a hand-written
  file (default: the one the status line reads) and previews it with sample
  values; exit 1 when it is invalid. The status line itself shows any error
  on the next message.

What each source shows and which widget types suit it, as `sourceTable()`
prints it (a test keeps this table equal to the code; regenerate with
`bun -e 'import { sourceTable } from "./src/status-sources.ts"; console.log(sourceTable())'`):

| source | what it shows | widget types |
|---|---|---|
| `session.context_pct` | How full the context window is | meter, counter, text |
| `session.model` | The model narrating, by its display name | text, list, tags |
| `session.model_effort` | The model and its effort level: Opus 5.5 (medium); the model alone without one | text, list, tags |
| `usage.session_pct` | Plan usage in the current five-hour window (Pro and Max plans) | meter, counter, text |
| `usage.weekly_pct` | Plan usage this week (Pro and Max plans) | meter, counter, text |
| `story.title` | The story's title | text, list, tags |
| `scene` | The current scene's number and title: Scene 1: Arrival | text, list, tags |
| `scene.number` | The current scene's number | counter, meter, clock, text |
| `scene.title` | The current scene's title | text, list, tags |
| `persona.name` | The character you play | text, list, tags |
| `narrator` | The Storyteller and the last prompt's register: Vex (narrator), Vex (copilot) | text, list, tags |
| `turn.register` | narrator or copilot: whether the last prompt was in the story or about it | text, list, tags |
| `notes.age` | Turns since the notes were last rewritten (never, if they have not been) | counter, meter, clock, text |
| `log.ok` | Whether the last exchange reached the scene log: ✓, … while a turn runs, ✗ | text, list, tags |

### 19.6 Slices

1. **Server:** `set_widget` and `remove_widget` with per-type validation,
   tracker migration, skill table, the renderer's shared type definitions in
   `src/widgets.ts` (types, fields, validation, the string renderer the status
   line uses).
2. **Panes:** the Widgets section, named panes opening and closing by
   themselves, colours, read-only.
3. **Status line:** `statusline.json`, the source catalog, the default
   layout, `--check`.

Later: `sparkline` with server-kept history, `portrait`, inline packing or
columns if one-per-row proves too tall, editing from the pane.

## 20. Lorebooks

Specified 2026-10-06 by interview. Ready to build; supersedes the Later entry.
Research behind it: `docs/prior-art.md`.

### 20.1 Books and entries

A **lore entry** is one markdown file: frontmatter on top, the fact in the
body. A **lorebook** is a set of entries that travel together.

- **The story's book** is its `lore/` folder.
- **Library books** live in `library/lore/<book>/`; a story lists them under
  `uses:` (`uses: [lore/varrow-city]` takes the whole book, `lore/varrow-city/
  lamplighters` one entry). A story entry with the same stem overrides the
  library one.
- **Character entries** are ordinary entries with `scope: character:<stem>`:
  active only while that character is present in the scene. They live in
  whichever book holds them.

Frontmatter, with defaults:

```yaml
title: The Lamplighters          # required
keys: [Lamplighters, lamp hall]  # primary keys
also: { any: [patrol, curfew] }  # secondary: any | all; omitted = none
unless: [Feast of Wicks]         # blocks the entry if any appears
always: false                    # in the bible, every turn
priority: 0                      # higher first when the budget is tight
scope: story                     # story | character:<stem> | place:<text>
cooldown: 6                      # turns before it may be injected again
chance: 100                      # percent, applied after a match
group: city-mood                 # inclusion group; one entry fires per group
weight: 1                        # draw weight inside its group
recurse: true                    # its text may wake other entries
known: false                     # has the player's character learned it
truth: fact                      # fact | rumor | false
```

Body sections: the public text first; `## Secret` (optional) reaches Vex but
never the codex or any pane; `## History` (optional) holds dated developments
Vex appends, `- Scene 3: the Lamp Hall burned.`, newest last. When something
changes, Vex also updates the public text so it reads as the current truth.

### 20.2 Activation, each turn

The prompt-submit hook runs this pipeline and records why each entry fired:

1. **Scan** the new prompt, the last `loreScanDepth` turns (config, default 3;
   an entry may override with `scan: <n>`), and the scene state: location,
   time and the present cast's names.
2. **Match**: primary keys (whole words, case-insensitive, multi-word allowed),
   then `also` / `unless`; semantic matches from the index above the
   threshold; scope filters (`character:` needs that character present,
   `place:` needs the location to contain the text).
3. **Recurse**: the text of matched entries is scanned again for other
   entries' keys, up to three levels, skipping entries with `recurse: false`.
4. **Filter**: entries still in recent context (20.3) are skipped; `chance`
   is rolled.
5. **Choose**: one entry per `group`, drawn by `weight`; then rank by
   priority and fit the budget (20.4).
6. **Inject** as the turn's additional context, and record each injection
   (ref, turn, content hash, characters) in `.rp/state.json`.

### 20.3 The transcript is append-only

Injected lore is stored in the transcript beside the prompt and resent with
every request until compaction. So:

- **Cooldown means "still in context".** An entry is not injected again while
  its last injection is within the last `cooldown` turns. After compaction
  the history is gone: the record is cleared and the rebuild re-injects the
  lore that is active in the current scene.
- **No sticky.** An injected entry stays visible on its own.
- **Edits re-inject.** If an entry's content hash differs from its last
  injection, it is eligible again at once and injected marked `(updated)`,
  so the newer text wins.
- **Corrections, not retractions.** Nothing can be removed from history. When
  a rumour is exposed or a fact reversed, Vex records it (`truth`, History)
  and the next injection says so: `(correction) The Lamp Hall did not burn.`
- **Cache-safe.** All lore travels in the turn, after the cached prefix; the
  system prompt never changes per turn.

### 20.4 Budget

A share of the context window (config `loreBudget`, default 0.1), counted two
ways: new lore this turn may use at most a quarter of it, and the estimated
lore already in context (the injection record since the last compaction) may
not exceed it. When full, lower-priority matches wait, and the record notes
what was cut. The status line gains a `lore.pct` source for the second figure.

### 20.5 Discovery and truth

- Vex always sees every entry, secrets and all.
- An entry becomes known when the fiction reveals it: Vex calls
  `reveal_lore(stem, part?)` in the same turn (`part: secret` reveals the
  secret too, marking `known: secret`). Nothing is revealed automatically.
- `truth: rumor` and `truth: false` let characters believe wrong things; the
  injected text says which it is, so Vex keeps the real version straight.

### 20.6 The codex

A read-only `/storyteller:codex` pane: every known entry by book, title and
public text; rumours prefixed `Rumour:`; History in order; secret sections
only once revealed; unknown entries never listed. No management pane in this
build: entries are edited by Vex or in your editor.

**Glossary links**: names of known entries and of character cards in the
transcript and the scene pane become links (`Markdown` with `onLinkPress`)
that open the codex at that entry or the card.

### 20.7 Tools and suggestions

- `upsert_lore` takes every field above; `reveal_lore(stem, part?)`;
  `append_lore_history(stem, line)`; `search_lore` unchanged in spirit,
  reporting known/truth.
- Vex writes entries freely, as now. **Suggestions** go to Vex, not to the
  player: the notes job lists recurring proper nouns that have no entry or
  card, and the hook passes that list to Vex once, next turn, as a nudge.

### 20.8 Migration

A one-time script rewrites every existing entry with every field explicit:
`known: true` in stories that have a log, `false` in stories that do not;
`cooldown: 6`, `chance: 100`, `truth: fact`, `scope: story`, `recurse: true`,
`weight: 1`. Run per story and on the library; idempotent.

### 20.9 Slices

1. **Data and activation**: the entry schema and loader, library books and
   `uses:`, character and place scope, the full pipeline (secondary keys,
   scene-state scan, recursion, groups with weights, chance, cooldown as
   context window, edit re-injection, corrections), the two-part budget,
   compaction re-injection, the migration script.
2. **Discovery**: `known`, `truth`, Secret and History sections, the new
   tools, injected text marking rumours and corrections, suggestions to Vex.
3. **Codex and glossary**: the codex pane, glossary links, `lore.pct`.

### 20.10 Slice 1 as built (2026-10-06)

Where the text above left room, slice 1 decided this. Code: `src/lore.ts`
(fields), `src/library.ts` (books), `src/activation.ts` (pipeline),
`src/migrate-lore.ts` and `scripts/migrate-lore.ts`.

- **Corrections move to slice 2.** They are text about `truth`, which slice 2
  owns; slice 1 parses and carries `known`, `truth`, Secret and History but
  acts on none of them.
- **Secret and History are split off at load.** An entry's `body` is its
  public text; `## Secret` and `## History` (any case) are held apart. The
  bible, the turn's injection, recursion, the embedding index and
  `search_lore` all see the public text only. Vex can still read the file.
  `upsert_lore` keeps an entry's existing Secret and History unless the new
  body brings its own.
- **Bad values stop the load**, naming the file and field, as a bad directive
  `mode` does. `upsert_lore` checks the entry as it will be on disk before
  writing: `chance` 0 to 100, `weight` above 0, `cooldown` and `scan` whole
  and not negative, `scope` as `story`, `character:<card stem>` or
  `place:<text>`, `also` exactly one of `{any: [...]}` / `{all: [...]}`.
- **Library books.** `lore/<x>` is a single file when `library/lore/<x>.md`
  exists (refs written before books keep their meaning), else the whole book
  `library/lore/<x>/`. A book entry's ref is `lore/<stem>`, so a story entry
  with that stem overrides it; of two library entries with one stem, the
  first listed wins. Entries carry their `book` for the codex.
- **Scene state** is the location, the time and the display names of
  everyone in `present`, the player's character included; `character:`
  scope counts the player's character as present too. A key found only
  there fires as `scene "<key>"`.
- **`also` qualifies key matches** (direct or by recursion); a meaning match
  has no key to qualify and skips it. **`unless` blocks every kind of
  match**, looked for in the scan text, the scene state and, for recursion,
  the waking text.
- **Always-on lore with a character or place scope is not in the bible**,
  which is written once a session and cannot follow the scene. It travels
  with the turn whenever its scope holds (`always (<scope>)`), under the same
  cooldown and budget. The bible's on-demand index lists it with its scope.
- **Recursion** follows the order of 20.2: whatever matched, even an entry
  then skipped as still in context, wakes others. Only lore wakes lore, by
  primary key in its title and public text, up to three levels past the
  direct matches.
- **Cooldown and edits.** An entry is skipped while `turn - last < cooldown`
  and its content hash (title and public text) is unchanged. A changed hash
  makes it eligible at once and marks it `(updated)`, even after its cooldown
  has run out, since the old text is in the window until compaction.
- **Chance** is rolled only below 100; then one entry per group is drawn by
  weight. The random source is a parameter, so tests seed it.
- **Ranking**: keyed directives first (they share the pipeline by key and
  meaning, with cooldown 6, and count in both budgets), then priority, direct
  matches before recursion, key before meaning, score, title. Greedy: an
  entry that does not fit is cut and a smaller one may still go in.
- **Budget in characters.** The hook never sees the model's window, so
  `loreBudget` assumes 200k tokens at 4 characters a token: the default 0.1
  is 80,000 characters in the window and 20,000 new per turn. An entry costs
  its title plus public text. A larger window only makes this cautious.
- **The record** in `.rp/state.json`: `injections`, a list of `{ref, turn,
  hash, chars}` since the last compaction (its `chars` sum is the lore
  estimate, and the context half of the budget keeps the list bounded), and
  `activation`, the last turn's `{turn, fired: [{ref, why}], cut: [{ref,
  reason}]}`. The old `injected` map is dropped on the first write.
- **Compaction**: SessionStart `compact` clears `injections`, runs the
  pipeline on the scene state alone (no prompt, no log), and appends the
  resulting `Lore in play:` block after the Previously block, recorded at the
  current turn.
- **Migration** writes `title`, `keys`, `unless`, `always`, `priority`,
  `scope`, `cooldown`, `chance`, `weight`, `recurse`, `known` and `truth`;
  `also`, `group` and `scan` mean "none" when absent and are written only
  when set. Lists stay on one line. An entry the loader would refuse is
  reported and left alone. For a player's home:
  `bun scripts/migrate-lore.ts ~/.storyteller/stories/* ~/.storyteller/library`.

### 20.11 Slice 2 decisions (2026-10-06, by interview)

- **Injected entries carry everything.** After the public text come
  `Secret (unknown to <player character>):` (or `Secret:` once `known:
  secret`) and `History:` with its lines. Recursion, the embedding index and
  `search_lore` stay on public text. An entry's cost and content hash now
  cover title, public text, Secret, History, `truth` and `known`, so any of
  them changing makes it eligible at once.
- **One edit tag.** There is no `(correction)` tag: every re-injection of a
  changed entry is `(updated)`. A truth change shows in the heading tag (a
  rumour that becomes fact loses `(rumour)`), and the newer text wins.
- **Heading tags.** `### Title (rumour)` followed by the line `People say
  this; it may not be so.`; `### Title (false)` followed by `Characters
  believe this; it is not true. The truth is in Secret.` (or `... it is not
  true.` when there is no Secret). An entry with `known: false` adds
  `(unknown to <player character>)` to the heading. Order: `(updated)`, truth
  tag, unknown tag. With no player character the wording is `the player`.
- **Tools.** `reveal_lore(stem, part?)` sets `known: true`, or `known: secret`
  with `part: "secret"`; revealing an already known entry is a no-op that says
  so. `append_lore_history(stem, line)` adds `- Scene <n>: <line>` (current
  scene number) as the last History line, creating the section. Both keep the
  rest of the file byte for byte. `search_lore` reports `known` and `truth`
  per hit. The Storyteller prompt tells Vex to call `reveal_lore` in the turn
  the fiction reveals something, to append History when the world changes and
  rewrite the public text to read as the current truth.
- **Suggestions.** The notes job also lists proper nouns from the turns it
  reads that have no lore entry (title or key) and no card. The mod tallies
  them in `.rp/state.json` `nameTally` (name -> notes runs that listed it);
  a name listed by two runs joins `suggest` (mod-owned list). The prompt-submit
  hook delivers each name in `suggest` that is not in `suggested` (hook-owned)
  and still has no entry or card, once, as `Names that keep coming up with no
  lore or card: A, B. Record them if they matter.`, then adds them to
  `suggested`. Names compare case-insensitively.
