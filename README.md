# storyteller

Roleplay and collaborative storytelling inside the Claude Code TUI. A
Storyteller (Vex, by default) narrates, plays the cast and keeps the world
straight; the story lives as plain Markdown files you can read and edit.

What the system does and how it behaves is in [`docs/spec.md`](docs/spec.md).

## Requirements

- [Bun](https://bun.sh) 1.3 or newer
- [Claude Code](https://claude.com/claude-code) on your `PATH` as `claude`,
  signed in

## Install

```sh
bun install
bun link        # puts `rp` on your PATH
rp install      # creates ~/.storyteller/{stories,library,.claude/skills}
```

Or skip the link and run it from the repo with `bun run rp <args>`.
`rp install` only creates missing folders and never writes content, so it is
safe to run again; it prints each folder and whether it existed. `rp new`
does the same on its way.

## Play

```sh
rp                   # pick a story from a list, or start a new one
rp new saltmere      # a blank story; the Storyteller interviews you, then opens scene one
rp saltmere          # later: continue the last session for that story
rp saltmere --new    # start a fresh session (the story itself carries over)
rp list              # your stories as plain text, last played first
rp prompt saltmere   # print the story bible the Storyteller sees
```

`rp` on its own lists your stories, the last played first, each with its
current scene and when you last played it. Move with the arrow keys or
`j`/`k`, press Enter to play (the same as `rp <story>`), Esc or `q` to quit.
The last row, `+ new story`, asks for a folder name and goes on as
`rp new <name>`; with no stories yet, `rp` asks for one straight away. To
switch stories, leave the session and run `rp` again.

`rp <story>` also takes a folder path, so you can try the bundled example
without copying it: `rp stories/the-hollow-crown`.

Other options: `--model <m>` for one session, and anything after `--` goes
straight to `claude`, e.g. `rp saltmere -- --verbose`.

Talk in character by default. Prefix a message with `((` to step out and talk
to the Storyteller about the story itself.

Our commands all start with `storyteller:`. Type `/storyteller:recap` for a
short recap of the story so far and what is still unresolved,
`/storyteller:scene` for the scene pane, and `/storyteller:directives` to
switch, edit, add or delete directives.

## Where things live

- Stories: `~/.storyteller/stories/<name>/`, one folder per story. Set
  `RP_STORIES` to use another folder.
- Shared characters, lore and directives: `~/.storyteller/library/`
  (`characters/`, `lore/`, `directives/`). Set `RP_LIBRARY` to use another
  folder.
- Your own skills for every story: `~/.storyteller/.claude/skills/`
  (empty to begin with). Claude Code reads it because the stories folder sits
  inside it; a story's own `.claude/skills/` works too.
- Each story folder holds `story.md`, `characters/`, `lore/`, `directives/`
  and `scenes/`. The layout is in [spec section 5](docs/spec.md#5-the-world-on-disk).

## Configure

Inside a session, open `/config` and find the storyteller plugin settings: notes
frequency and model, narrator model and effort, embeddings, the scene pane,
and the context budget. They are stored in your Claude Code `settings.json`
and apply from the next launch. `--model` on the command line wins for one
session.

The status line under the prompt is always on. By default it shows two
lines: the model with its effort, the Storyteller with the register, your
character, the story and the scene
(`Model: Opus 5.5 (medium) | Narrator: Vex (copilot) | Persona: asset1 | Story: Build Failed Successfully | Scene: Scene 1: Spawn Point`);
then context used, plan usage (five-hour and weekly, on Pro and Max plans),
turns since the notes were updated and whether the log saved. Labels are
dark and values bold; each bar is green under 60%, yellow to 80% and red
above. To lay out your own, edit
`~/.storyteller/statusline.json` by hand and check it with
`bun plugin/statusline.ts --check`. The format, the default layout as a file
and the list of sources are in [spec section 19.5](docs/spec.md#195-status-line-widgets).

## Development

```sh
bun run verify            # typecheck, lint, tests
bun scripts/smoke.ts      # opt-in: one real model call against the example story
```
