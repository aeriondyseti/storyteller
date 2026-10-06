# plugin/mod

The plugin's function-hooks module (a Claude Code "mod"), named in
`plugin/hooks/hooks.json` under `modules`. `register.tsx` wires two parts:
`notes.ts` (background notes job) and `stage.tsx` (spec 10: scene pane,
directives pane, quiet line, reply label and spinner, quieting of coding
reminders). The scene pane's
layout (wrapping, columns, what gives way on a short pane) is pure code in
`stage/layout.ts`, tested on its own; `stage/scene.tsx` only maps it to elements.
The same holds for widgets (spec 19.4): their rows, and the panes of their own
that widgets with a `pane:` name get (id `widgets-<slug>`), opened and closed
by `scene.tsx` whenever the story is read again.

A mod runs in an environment of its own: no Node, no DOM, and it may import
only its own files and `claude-code`. A `$` or a `$.state` reference never
crosses an import, so each file under `stage/` registers its own hooks and
spells the atoms it uses. The Bun scripts beside the plugin (`../scene.ts`,
`../statusline.ts`) do the work that needs Node, and the mod reaches them
through `$.process.run`.

The API is early access. The declaration file the engine writes is the
authority; `claude plugin validate plugin` is the check.

## Checks

- **Validate**: `claude plugin validate plugin` (from the repo root).
- **Type-check**: `bunx tsc -p plugin/mod`. The types are laid by Claude Code
  into `plugin/.claude-plugin/types/` (gitignored) whenever it loads the plugin
  from this folder, so run one story session first (`bun run rp <story>`), or
  any `claude --plugin-dir plugin` session. The root `tsc` leaves this folder
  out because `claude-code` does not resolve there.
- **Test**: `bun scripts/test-mod.ts`. It runs `claude plugin test` on a staged
  copy of the mod, because `claude plugin test plugin` would also sweep up
  `plugin/hooks`' Bun tests. `bun test` skips this folder (`bunfig.toml`).
