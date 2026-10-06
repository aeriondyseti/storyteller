import type { EngineInterface, Register, RenderInput } from "claude-code";
import { atom, read, update } from "claude-code";
import type { CodexPane, CodexSnapshot } from "../types";
import { CODEX_PANE, displayTitle, indexGroups, paneAt, viewOf } from "./codex-index.ts";

// The codex (spec 20.6, 20.13): `/storyteller:codex` opens a read-only pane
// over what the player's character knows: an index of known entries by book,
// then the met characters, with a search field; choosing a title shows that
// entry. Glossary links in replies (voice.tsx) and name buttons in the scene
// pane (scene.tsx) open it at an entry themselves: they set codexPane and
// open the pane, an open answering a press that seats at any width. The data
// comes from plugin/codex.ts, which applies the knowledge rules; this file
// only draws. The snapshot is kept in state, read at session start and after
// every turn, so the glossary links draw from it without a process per reply.

const PANE = CODEX_PANE.id;

const index: CodexPane = { entry: null, search: "" };

const codex = atom({ plugin: "storyteller", key: "codex" } as const, null);
const pane = atom({ plugin: "storyteller", key: "codexPane" } as const, index);

export const registerCodex: Register = (on) => {
  // Read at the start and after every turn (a turn may reveal an entry or
  // meet a character), so the glossary links stay current with the pane
  // closed. Matched, because scene.tsx holds the module's unmatched hook on
  // both events and the engine takes one.
  on("session.start", { isInteractive: true }, async ($, e, next) => {
    const started = await next(e);
    void refresh($);
    return started;
  });
  on("turn.complete", { reason: ["answer", "aborted"] }, async ($, e, next) => {
    const done = await next(e);
    void refresh($);
    return done;
  });

  // /storyteller:codex is plugin/commands/codex.md, answered here before its
  // text reaches the model (stage/commands.ts says why not register()). An id
  // after it (`lore/<stem>`, `character/<stem>`) opens that entry; one the
  // codex does not know shows the index.
  on("command.run", { command: "storyteller:codex" }, async ($, e) => {
    await refresh($);
    const data = await read($, codex);
    const opened = paneAt(data, e.args.trim() || null);
    await update($, pane, () => opened);
    await $.ui.open(CODEX_PANE);
    // A pane already open keeps its scroll: bring the top into view.
    if (opened.entry)
      void $.ui.scroll({ to: { key: "back" }, in: PANE, block: "start" }).catch(() => {});
    return {};
  });

  on("ui.render", { component: "Pane", requestId: PANE }, drawPane);
};

async function refresh($: EngineInterface): Promise<void> {
  try {
    const { exitCode, stdout, stderr } = await $.process.run(["bun", `${$.plugin.root}/codex.ts`], {
      timeoutMs: 15_000,
    });
    if (exitCode !== 0) {
      $.ui.log(`stage: codex.ts exited ${exitCode}: ${stderr.slice(0, 300)}`, { to: "debug" });
      return;
    }
    if (!stdout?.trim()) return;
    const snapshot: CodexSnapshot | null = JSON.parse(stdout);
    await update($, codex, () => snapshot);
  } catch (error) {
    $.ui.log(`stage: could not read the codex: ${String(error)}`, { to: "debug" });
  }
}

async function show($: EngineInterface, id: string): Promise<void> {
  await update($, pane, (p) => ({ ...p, entry: id }));
  void $.ui.scroll({ to: { key: "back" }, in: PANE, block: "start" }).catch(() => {});
}

// Back to the index, the focus on the title the player left from.
async function back($: EngineInterface, from: string): Promise<void> {
  await update($, pane, (p) => ({ ...p, entry: null }));
  void $.ui.focus({ requestId: PANE, key: `entry:${from}` }).catch(() => {});
}

// ---- drawing

async function drawPane($: EngineInterface, e: RenderInput<"Pane">) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const snapshot = await read($, codex);
  const state = (await read($, pane)) ?? index;
  if (!snapshot) {
    return (
      <Box flexDirection="row" gap={2}>
        <Text dimColor>No story codex to show here.</Text>
        <Button key="refresh" plain dimColor onPress={() => refresh($)}>
          refresh
        </Button>
      </Box>
    );
  }
  const view = viewOf(snapshot, state.entry);
  if (view && state.entry) return drawView($, e, view, state.entry);
  return drawIndex($, e, snapshot, state.search);
}

function drawIndex(
  $: EngineInterface,
  e: RenderInput<"Pane">,
  snapshot: CodexSnapshot,
  search: string,
) {
  const ui = $.ui.resolve(e);
  const { Box, Text, Button } = ui;
  const groups = indexGroups(snapshot, search);
  const empty = snapshot.books.every((b) => b.entries.length === 0) && !snapshot.characters.length;
  return (
    <Box flexDirection="column">
      {/* Mobile draws no text fields: there the index is browsed whole. */}
      {"Input" in ui ? (
        <ui.Input
          key="search"
          label="search "
          value={search}
          placeholder="a title or key"
          submitLabel="open"
          autoFocus
          onInput={(v) => update($, pane, (p) => ({ ...p, search: v }))}
          onSubmit={(v) => {
            const first = indexGroups(snapshot, v)[0]?.items[0];
            if (first) void show($, first.id);
          }}
        />
      ) : null}
      {empty ? (
        <Text dimColor>Nothing in the codex yet: what your character learns appears here.</Text>
      ) : groups.length === 0 ? (
        <Text dimColor>{`Nothing matches "${search.trim()}".`}</Text>
      ) : null}
      {groups.map((group) => (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{group.heading}</Text>
          {group.items.map((item) => (
            <Button key={`entry:${item.id}`} plain onPress={() => show($, item.id)}>
              {item.title}
            </Button>
          ))}
        </Box>
      ))}
    </Box>
  );
}

function drawView(
  $: EngineInterface,
  e: RenderInput<"Pane">,
  view: NonNullable<ReturnType<typeof viewOf>>,
  id: string,
) {
  const { Box, Text, Button, Markdown } = $.ui.resolve(e);
  const top = (
    <Button key="back" plain dimColor onPress={() => back($, id)}>
      ← back
    </Button>
  );
  if (view.kind === "character") {
    const { character } = view;
    return (
      <Box flexDirection="column">
        {top}
        <Box flexDirection="column" marginTop={1}>
          <Text bold wrap="wrap">
            {character.name}
          </Text>
          {character.tags.length > 0 ? (
            <Text dimColor wrap="wrap">
              {character.tags.join(", ")}
            </Text>
          ) : null}
        </Box>
        {character.appearance.trim() ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Appearance</Text>
            <Markdown text={character.appearance.trim()} />
          </Box>
        ) : null}
      </Box>
    );
  }
  const { entry, book } = view;
  return (
    <Box flexDirection="column">
      {top}
      <Box flexDirection="column" marginTop={1}>
        <Text bold wrap="wrap">
          {displayTitle(entry)}
        </Text>
        <Text dimColor wrap="wrap">
          {book}
        </Text>
      </Box>
      {entry.text.trim() ? (
        <Box marginTop={1}>
          <Markdown text={entry.text.trim()} />
        </Box>
      ) : null}
      {entry.secret?.trim() ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Secret</Text>
          <Markdown text={entry.secret.trim()} />
        </Box>
      ) : null}
      {entry.history.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>History</Text>
          {entry.history.map((line) => (
            <Text wrap="wrap">{`- ${line.replace(/^-\s*/, "")}`}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
