# CLAUDE.md

Roleplay and collaborative storytelling inside the Claude Code TUI. The model
is **Vex, the Storyteller**: an agent that runs the world, voices every
character but the player's, and keeps the record on disk. Read these first:

- `docs/spec.md`: what the system does and how Vex acts. The authority.
- `docs/design-brief.md`: why Claude Code and not a custom TUI, decisions.
- `docs/handoff.md`: where things stand and how work is done; start here in a new session.

## Layout

```
bin/rp.ts          launcher: generates the prompt, starts claude in a story folder
src/               story on disk, library resolution, prompt rendering (pure, tested)
server/            the `world` MCP server (stdio, Bun) and its store
plugin/            the Claude Code plugin: manifest, prompts/, hooks/, skills/, commands/, mod/
stories/           the example story; players' stories live in ~/.claude-roleplay/
templates/         skeletons `rp new` copies
scripts/           opt-in tools that make real model calls; never run by bun test
docs/              spec, brief, decisions
```

## Conventions

- Bun + TypeScript everywhere. `bun run verify` (typecheck, biome, tests) must be
  green before every commit.
- TS strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  No `as unknown as T`. `import type` for types. No JSDoc; types document.
- Tests next to source: `src/foo.ts` has `src/foo.test.ts`. No real model calls
  in tests; fixtures live under `stories/` or `src/testing/`. Two exceptions
  under `plugin/`, because `claude plugin test plugin` runs every `*.test.ts`
  there: the mod's tests (`plugin/mod/*.test.ts`, kit `claude-code/testing`)
  run under that command and `bun test` skips them (bunfig.toml), and the
  Bun tests of `plugin/hooks/` are named `*.spec.ts`.
- Files kebab-case. Markdown with YAML frontmatter for everything a human edits;
  parse with `Bun.YAML`, no YAML dependency.
- A dependency is installed in the same commit as its first use.
- Simpler without sacrifice. A junior developer should understand a file
  without reading three others. Comments say why, never what.
- Conventional Commits: `feat(server): …`, `fix(hooks): …`, `docs: …`.
  Scopes: core, server, hooks, plugin, launcher, prompt, stories, stage, docs.

## Vocabulary

Pinned in `docs/design-brief.md` and `docs/spec.md` §2. Use it exactly: Story,
Scene, Session, Turn, Player, Storyteller, Character, plays, Persona, Register,
Library, Log, Notes, Tracker, Lore, Directive, Sheet.

## Working in parallel

Workers get their own worktree and branch (`w/<slice>`), own a disjoint set of
paths, and commit there. Integration happens on `dev`. Do not touch paths
outside your slice; if you need a change elsewhere, say so in your report.
