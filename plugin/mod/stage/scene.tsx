import type { EngineInterface, Register, RenderChildren, RenderInput } from "claude-code";
import { atom, read, update } from "claude-code";
import type { StageSnapshot } from "../types";
import { CODEX_PANE, paneAt } from "./codex-index.ts";
import { glossaryOf, linkLine } from "./glossary.ts";
import {
  BLANK,
  besidePortrait,
  FRAME,
  frameBottom,
  framed,
  frameInner,
  frameTop,
  groupLines,
  type Line,
  namedPanes,
  PORTRAIT,
  type PresentRow,
  paneChanges,
  paneWidgets,
  planPane,
  presentLines,
  type Run,
  WIDGET_PANE_PREFIX,
  widgetGroups,
} from "./layout.ts";
import { cardRead, colorFor, findSpeaker } from "./text.ts";

// The scene pane (spec 10), read-only: title and number; a Now frame with
// where, when, mood and the notes' "now"; who is on stage, with portraits where the terminal draws
// images; widgets (spec 19.4). Widgets naming a pane of their own are drawn
// there instead, in a pane opened when the first appears and closed when the
// last is retired. Also what keeps it current: the story is read through
// plugin/scene.ts (the mod has no Node and no YAML parser; the Bun script
// reuses src/story.ts, so pane and hooks never disagree), again after every
// turn, every world tool call, and whenever the notes job rewrites scene.md.

export const PANE = "scene";
const TITLE = "Scene";

// State declared in ../types. The engine reads each hooks file on its own
// (a `$` or a state reference never crosses an import), so voice.tsx spells
// the atoms it reads again; same plugin and key, same value.
const stage = atom({ plugin: "storyteller", key: "stage" } as const, null);
const paneAsked = atom({ plugin: "storyteller", key: "paneAsked" } as const, false);
const voicing = atom({ plugin: "storyteller", key: "voicing" } as const, null);
const closedPanes = atom({ plugin: "storyteller", key: "closedPanes" } as const, []);
// Written by codex.tsx: names in Now and Present that open the codex.
const codex = atom({ plugin: "storyteller", key: "codex" } as const, null);
const codexPane = atom({ plugin: "storyteller", key: "codexPane" } as const, {
  entry: null,
  search: "",
});
const widgetPane = new RegExp(`^${WIDGET_PANE_PREFIX}`);

export const registerScene: Register = (on, options) => {
  on("session.start", async ($, e, next) => {
    const started = await next(e);
    void refresh($);
    watchScene($);
    // Unasked, the engine seats a pane only on a wide terminal, and the Pane
    // hook closes it again if it lands inline instead of docked: spec 10 says
    // it opens on start "when the layout docks a pane".
    if (options.paneOnStart && e.isInteractive) void $.ui.open({ id: PANE, title: TITLE });
    return started;
  });

  // /storyteller:scene is plugin/commands/scene.md, answered here before its
  // text reaches the model (stage/commands.ts says why not register()).
  on("command.run", { command: "storyteller:scene" }, async ($) => {
    await update($, paneAsked, () => true);
    void refresh($);
    await $.ui.open({ id: PANE, title: TITLE });
    return {};
  });

  on("turn.complete", async ($, e, next) => {
    const done = await next(e);
    void refresh($);
    return done;
  });

  // prompt.submit and tool.call gate the turn: should the stage's part fail,
  // `.catch` lets the prompt or the call go on untouched.
  on("prompt.submit", async ($, e, next) => {
    await update($, voicing, () => null);
    return next(e);
  }).catch((_$, e, next) => next(e));

  // A card read for a character on stage means the Storyteller is about to
  // speak as them: the spinner names them (spec 10).
  on("tool.call", async ($, e, next) => {
    const card = cardRead(e.tool, e);
    if (card) {
      const who = findSpeaker((await read($, stage))?.speakers ?? [], card);
      if (who) await update($, voicing, () => who.name);
    }
    const result = await next(e);
    if (e.tool.startsWith("mcp__world__")) void refresh($);
    return result;
  }).catch((_$, e, next) => next(e));

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    if (e.props.placement === "inline" && !(await read($, paneAsked))) {
      $.clock.after(0, () => void $.ui.close({ id: PANE }).catch(() => {}));
      const { Text } = $.ui.resolve(e);
      return <Text dimColor>/storyteller:scene shows the scene pane</Text>;
    }
    return drawPane($, e);
  });

  on("ui.render", { component: "Pane", requestId: widgetPane }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e);
    const widgets = paneWidgets((await read($, stage))?.scene?.widgets ?? [], e.requestId ?? "");
    if (widgets.length === 0) return <Text dimColor>Nothing here now.</Text>;
    // The pane's own frame holds these: groups get their headings, no box.
    const columns = e.props.bodyColumns || 40;
    return (
      <Box flexDirection="column">
        {groupLines(widgetGroups(widgets, columns), columns).map((l) => drawLine($, e, l))}
      </Box>
    );
  });

  // A widget pane the person closes stays closed while its widgets last;
  // otherwise the next read of the story would open it again.
  on("ui.close", { id: widgetPane, origin: { kind: "person" } }, async ($, e, next) => {
    await update($, closedPanes, (ids) => [...new Set([...(ids ?? []), e.id])]);
    return next(e);
  }).catch((_$, e, next) => next(e));
};

// Opens a pane for each `pane:` name the widgets carry and closes the ones no
// widget names any more. $.ui.panes() is the engine's record, so this holds
// across a module reload, when the module's own variables start over.
async function syncPanes($: EngineInterface, snapshot: StageSnapshot | null): Promise<void> {
  const wanted = namedPanes(snapshot?.scene?.widgets ?? []);
  const open = (await $.ui.panes()).map((p) => p.id);
  const closed = (await read($, closedPanes)) ?? [];
  const changes = paneChanges(wanted, open, closed);
  for (const pane of changes.open) await $.ui.open(pane);
  for (const id of changes.close) await $.ui.close({ id });
  // A pane whose widgets are gone may open again when they come back.
  const stillWanted = closed.filter((id) => wanted.some((p) => p.id === id));
  if (stillWanted.length !== closed.length) await update($, closedPanes, () => stillWanted);
}

async function refresh($: EngineInterface): Promise<void> {
  try {
    const { exitCode, stdout, stderr } = await $.process.run(["bun", `${$.plugin.root}/scene.ts`], {
      timeoutMs: 15_000,
    });
    if (exitCode !== 0) {
      $.ui.log(`stage: scene.ts exited ${exitCode}: ${stderr.slice(0, 300)}`, { to: "debug" });
      return;
    }
    // Nothing printed is nothing to show, not an error worth a line.
    if (!stdout?.trim()) return;
    const snapshot: StageSnapshot | null = JSON.parse(stdout);
    await update($, stage, () => snapshot);
    await syncPanes($, snapshot);
  } catch (error) {
    $.ui.log(`stage: could not read the story: ${String(error)}`, { to: "debug" });
  }
}

// The notes job rewrites scene.md in the background after a turn; a cheap
// mtime check brings its "now" into the pane without waiting for a turn.
function watchScene($: EngineInterface): void {
  let seen = 0;
  $.clock.every(4_000, () => {
    void (async () => {
      const path = (await read($, stage))?.scene?.path;
      if (!path) return;
      const { mtimeMs } = await $.fs.stat(path);
      if (seen !== 0 && mtimeMs !== seen) await refresh($);
      seen = mtimeMs;
    })().catch(() => {});
  });
}

// Opens the codex pane at a codex id (stage/codex.tsx draws it), from the
// person's press, so it seats at any width. Spelled here, not imported: the
// engine follows `$` into no function of another file.
async function openCodex($: EngineInterface, id: string): Promise<void> {
  const data = await read($, codex);
  await update($, codexPane, () => paneAt(data, id));
  await $.ui.open(CODEX_PANE);
  // A pane already open keeps its scroll: bring the entry's top into view.
  void $.ui.scroll({ to: { key: "back" }, in: CODEX_PANE.id, block: "start" }).catch(() => {});
}

async function drawPane($: EngineInterface, e: RenderInput<"Pane">) {
  const { Box, Text } = $.ui.resolve(e);
  const snapshot = await read($, stage);
  if (!snapshot?.scene) {
    return (
      <Box flexDirection="column">
        <Text dimColor>{snapshot ? "No scene is open yet." : "Reading the story…"}</Text>
      </Box>
    );
  }
  const columns = e.props.bodyColumns || 40;
  // Docked, the body's own rows; inline the pane grows to its content, so its
  // body says nothing about the room there is and the viewport is the bound.
  const rows =
    (e.props.placement === "dock" ? e.props.scroll?.bodyRows : 0) || e.viewport?.rows || 40;
  const plan = planPane(
    snapshot.scene,
    { columns, rows, portraits: e.surface === "terminal" },
    colorFor(snapshot.storyteller),
    colorFor,
  );
  // Codex names (spec 20.13): in Now the first mention of each, in Present
  // every character the codex lists, drawn as buttons that open it there.
  const names = (await read($, codex))?.names ?? [];
  const glossary = glossaryOf(names);
  const ids = new Set(names.map((n) => n.id));
  const mentioned = new Set<string>();
  const now = plan.now.map((l) => linkLine(l, glossary, mentioned));
  const present = plan.present.map((row) => {
    const id = `character/${row.stem}`;
    return ids.has(id) ? { ...row, link: id } : row;
  });
  const inner = frameInner(columns);
  const line = (runs: Line) => drawLine($, e, runs);
  const inside = (runs: Line) => line(framed(runs, columns));
  // Each section a frame drawn as text lines (layout.ts), so the pane's
  // width math stays exact and a resize just lays the lines out again.
  const section = (title: string, body: RenderChildren[]) =>
    body.length > 0 ? (
      <Box flexDirection="column">
        {line(frameTop(title, columns))}
        {inside(BLANK)}
        {body}
        {inside(BLANK)}
        {line(frameBottom(columns))}
      </Box>
    ) : null;
  return (
    <Box flexDirection="column">
      {plan.header.map(line)}
      {section(
        "Now",
        now.map((runs) => drawLine($, e, framed(runs, columns), "now")),
      )}
      {section(
        "Present",
        present.map((row) => presentRow($, e, row, columns)),
      )}
      {section("Widgets", groupLines(plan.widgets, inner).map(inside))}
    </Box>
  );
}

// A planned line is already wrapped and cut to the pane, so each is one Text
// that truncates rather than wraps: a miscounted cell never adds a row. A
// line holding codex names is a row of Texts and plain Buttons instead, each
// button keyed `<where>:<codex id>`.
function drawLine($: EngineInterface, e: RenderInput<"Pane">, runs: Line, where = "line") {
  const { Box, Text, Button } = $.ui.resolve(e);
  if (runs.some((run) => run.link)) {
    return (
      <Box flexDirection="row">
        {runs.map((run) => {
          const { link } = run;
          return link ? (
            <Button key={`${where}:${link}`} plain onPress={() => openCodex($, link)}>
              {run.text}
            </Button>
          ) : (
            <Text wrap="truncate-end" {...style(run)}>
              {run.text}
            </Text>
          );
        })}
      </Box>
    );
  }
  const [only] = runs;
  if (runs.length === 1 && only) {
    return (
      <Text wrap="truncate-end" {...style(only)}>
        {only.text}
      </Text>
    );
  }
  return (
    <Text wrap="truncate-end">
      {runs.map((run) => (
        <Text {...style(run)}>{run.text}</Text>
      ))}
    </Text>
  );
}

function style(run: Run): {
  color?: string;
  dimColor?: boolean;
  bold?: boolean;
} {
  return {
    ...(run.color ? { color: run.color } : {}),
    ...(run.dim ? { dimColor: true } : {}),
    ...(run.bold ? { bold: true } : {}),
  };
}

// Image is the terminal's element alone, and only a PNG file is offered; the
// terminal draws `alt` where it cannot show pictures (most besides kitty and
// Ghostty). The plan offers a portrait only on a wide pane; elsewhere the
// name stands by itself.
// Inside the Present frame: the frame's left edge, the picture, then the name
// block padded so the right edge lines up with the text rows around it.
function presentRow($: EngineInterface, e: RenderInput<"Pane">, row: PresentRow, columns: number) {
  const inner = frameInner(columns);
  const lines = presentLines(row, inner);
  if (e.surface !== "terminal" || !row.portrait)
    return drawLine($, e, framed(lines[0] ?? [], columns), "present");
  const { Box, Image } = $.ui.resolve(e);
  const rows = Array.from({ length: PORTRAIT.rows }, (_, i) => i);
  const textW = inner - PORTRAIT.columns - 1;
  return (
    <Box flexDirection="row">
      <Box flexDirection="column">
        {rows.map(() => drawLine($, e, [{ text: `${FRAME.v} `, dim: true }]))}
      </Box>
      <Image
        source={{ file: row.portrait, format: "png" }}
        columns={PORTRAIT.columns}
        rows={PORTRAIT.rows}
        alt={`portrait of ${row.name}`}
      />
      <Box flexDirection="column">
        {rows.map((i) => drawLine($, e, besidePortrait(lines[i] ?? [], textW), "present"))}
      </Box>
    </Box>
  );
}
