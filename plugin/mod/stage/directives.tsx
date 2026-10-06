import type { EngineInterface, Register, RenderInput } from "claude-code";
import { atom, read, update } from "claude-code";
import type {
  DirectiveDraft,
  DirectiveList,
  DirectiveMode,
  DirectiveReply,
  DirectiveRow,
  DirectivesPane,
  DirectiveWrite,
} from "../types";

// The directives pane (spec 12): `/storyteller:directives` opens a dialog listing the
// story's directives, each with a toggle, an inline editor, open-in-editor
// and delete. Every read and write goes through plugin/directives.ts, which
// owns the files and the library override rule; this file only draws and
// sends. Opened with focus: Tab and the arrows walk the controls, Esc closes.

export const PANE = "directives";
const TITLE = "Directives";

// Beyond this, or over several lines, a body is not edited in a one-line
// Input (the engine's Input has no multi-line mode): open the file, or ask Vex.
export const INLINE_BODY = 300;

const modes: readonly DirectiveMode[] = ["always", "keyed", "manual"];
const idle: DirectivesPane = { draft: null, confirm: null, notice: null };

const listAtom = atom({ plugin: "storyteller", key: "directives" } as const, null);
const paneAtom = atom({ plugin: "storyteller", key: "directivesPane" } as const, idle);

let watching = false;

export const registerDirectives: Register = (on) => {
  // /storyteller:directives is plugin/commands/directives.md, answered here
  // before its text reaches the model (stage/commands.ts says why).
  on("command.run", { command: "storyteller:directives" }, async ($) => {
    await update($, paneAtom, () => idle);
    await refresh($);
    const count = (await read($, listAtom))?.directives.length ?? 0;
    await $.ui.open({
      id: PANE,
      title: TITLE,
      focus: true,
      closeOnEscape: true,
      rows: Math.min(30, count * 2 + 5),
    });
    if (!watching) {
      watching = true;
      watchFiles($);
    }
    return {};
  });

  on("ui.render", { component: "Pane", requestId: PANE }, drawPane);
};

// ---- talking to plugin/directives.ts

async function script($: EngineInterface, args: string[], stdin?: string): Promise<string | null> {
  const { exitCode, stdout, stderr } = await $.process.run(
    ["bun", `${$.plugin.root}/directives.ts`, ...args],
    { timeoutMs: 15_000, ...(stdin === undefined ? {} : { stdin }) },
  );
  if (exitCode !== 0) {
    $.ui.log(`stage: directives.ts exited ${exitCode}: ${stderr.slice(0, 300)}`, { to: "debug" });
    return null;
  }
  return stdout?.trim() || null;
}

async function refresh($: EngineInterface): Promise<void> {
  try {
    const out = await script($, ["list"]);
    if (!out) return;
    const list: DirectiveList | null = JSON.parse(out);
    await update($, listAtom, () => list);
  } catch (error) {
    $.ui.log(`stage: could not read the directives: ${String(error)}`, { to: "debug" });
  }
}

// Sends one change; the reply carries the list as it now stands.
async function send($: EngineInterface, args: string[], stdin?: string): Promise<boolean> {
  let reply: DirectiveReply;
  try {
    const out = await script($, args, stdin);
    reply = out
      ? JSON.parse(out)
      : { message: null, error: "directives.ts printed nothing", list: null };
  } catch (error) {
    reply = { message: null, error: String(error), list: null };
  }
  const { list } = reply;
  if (list) await update($, listAtom, () => list);
  const text = reply.error ?? reply.message;
  await update($, paneAtom, (p) => ({
    ...p,
    confirm: null,
    notice: text ? { text, isError: reply.error !== null } : null,
  }));
  return reply.error === null;
}

function write($: EngineInterface, change: DirectiveWrite): Promise<boolean> {
  return send($, ["write"], JSON.stringify(change));
}

// Edits made outside (the player's editor, Vex's tools) show up while the
// pane is open: a cheap mtime check of the files listed, as the scene pane does.
function watchFiles($: EngineInterface): void {
  let seen = "";
  $.clock.every(4_000, () => {
    void (async () => {
      if (!(await $.ui.panes()).some((p) => p.id === PANE)) return;
      const list = await read($, listAtom);
      if (!list) return;
      const paths = [`${list.dir}/directives`, ...list.directives.map((d) => d.path)];
      const stamps = await Promise.all(
        paths.map((p) =>
          $.fs.stat(p).then(
            (s) => s.mtimeMs,
            () => -1,
          ),
        ),
      );
      const now = stamps.join(",");
      if (seen && now !== seen) await refresh($);
      seen = now;
    })().catch(() => {});
  });
}

// ---- the editor's working copy

export function draftOf(d: DirectiveRow): DirectiveDraft {
  return {
    stem: d.stem,
    title: d.title,
    keys: d.keys.join(", "),
    mode: d.mode,
    body: d.body,
    on: d.on,
    source: d.source,
    path: d.path,
  };
}

const blank: DirectiveDraft = {
  stem: null,
  title: "",
  keys: "",
  mode: "manual",
  body: "",
  on: true,
  source: "story",
  path: null,
};

export function bodyFitsInline(body: string): boolean {
  return !body.includes("\n") && body.length <= INLINE_BODY;
}

export function parseKeys(text: string): string[] {
  return text
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

// The one write a Save sends. The body goes along only when it was editable
// here, so a long body is never cut down to what an Input showed.
export function saveOf(draft: DirectiveDraft, original: DirectiveRow | undefined): DirectiveWrite {
  const keys = parseKeys(draft.keys);
  if (draft.stem === null) {
    return {
      op: "create",
      title: draft.title,
      mode: draft.mode,
      keys,
      on: draft.on,
      body: draft.body,
    };
  }
  const change: DirectiveWrite = {
    op: "update",
    stem: draft.stem,
    title: draft.title,
    mode: draft.mode,
    keys,
  };
  return original && !bodyFitsInline(original.body) ? change : { ...change, body: draft.body };
}

async function setDraft($: EngineInterface, fields: Partial<DirectiveDraft>): Promise<void> {
  await update($, paneAtom, (p) => (p.draft ? { ...p, draft: { ...p.draft, ...fields } } : p));
}

async function startEditing($: EngineInterface, draft: DirectiveDraft): Promise<void> {
  await update($, paneAtom, () => ({ draft, confirm: null, notice: null }));
  void $.ui.focus({ requestId: PANE, key: "title" }).catch(() => {});
}

async function save($: EngineInterface): Promise<void> {
  const { draft } = await read($, paneAtom);
  if (!draft) return;
  const original = (await read($, listAtom))?.directives.find((d) => d.stem === draft.stem);
  if (await write($, saveOf(draft, original))) {
    await update($, paneAtom, (p) => ({ ...p, draft: null }));
  }
}

// Read at the press, not from the drawing: two quick presses flip it twice.
async function toggle($: EngineInterface, stem: string): Promise<void> {
  const current = (await read($, listAtom))?.directives.find((d) => d.stem === stem);
  if (current) await write($, { op: "toggle", stem, on: !current.on });
}

// ---- drawing

async function drawPane($: EngineInterface, e: RenderInput<"Pane">) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const list = await read($, listAtom);
  const pane = await read($, paneAtom);
  if (!list) {
    return (
      <Box flexDirection="row" gap={2}>
        <Text dimColor>No story directives to show here.</Text>
        <Button key="refresh" plain dimColor onPress={() => refresh($)}>
          refresh
        </Button>
      </Box>
    );
  }
  const rows = list.directives.map((d, i) =>
    pane.draft?.stem === d.stem
      ? editor($, e, pane.draft)
      : row($, e, d, pane.confirm === d.stem, pane.draft === null && i < 9 ? String(i + 1) : null),
  );
  const hasLibrary = list.directives.some((d) => d.source === "library");
  return (
    <Box flexDirection="column">
      {list.directives.length === 0 ? <Text dimColor>No directives yet.</Text> : null}
      {rows}
      <Box flexDirection="row" gap={2} marginTop={1}>
        {pane.draft?.stem === null ? null : (
          <Button key="new" plain onPress={() => startEditing($, { ...blank })}>
            new directive
          </Button>
        )}
        <Button key="refresh" plain dimColor onPress={() => refresh($)}>
          refresh
        </Button>
      </Box>
      {pane.draft?.stem === null ? editor($, e, pane.draft) : null}
      {hasLibrary ? (
        <Text dimColor wrap="wrap">
          (library) directives cannot be deleted here: switch them off, or edit them to give the
          story its own copy.
        </Text>
      ) : null}
      {pane.notice ? (
        <Text
          wrap="truncate-end"
          {...(pane.notice.isError ? { color: "red" } : { dimColor: true })}
        >
          {pane.notice.text}
        </Text>
      ) : null}
    </Box>
  );
}

function row(
  $: EngineInterface,
  e: RenderInput<"Pane">,
  d: DirectiveRow,
  confirming: boolean,
  // A digit while only listing; none while the editor is open, so typing in
  // a field never switches a directive.
  hotkey: string | null,
) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const meta = [
    d.mode,
    d.keys.length > 0 ? d.keys.join(", ") : null,
    d.source === "library" ? "(library)" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const actions = confirming ? (
    <Box flexDirection="row" gap={1}>
      <Text color="red">really delete?</Text>
      <Button key={`yes:${d.stem}`} onPress={() => write($, { op: "delete", stem: d.stem })}>
        yes
      </Button>
      <Button
        key={`no:${d.stem}`}
        onPress={() => update($, paneAtom, (p) => ({ ...p, confirm: null }))}
      >
        no
      </Button>
    </Box>
  ) : (
    <Box flexDirection="row" gap={1}>
      <Button key={`open:${d.stem}`} plain dimColor onPress={() => openFile($, d.stem)}>
        open
      </Button>
      <Button key={`edit:${d.stem}`} plain dimColor onPress={() => startEditing($, draftOf(d))}>
        edit
      </Button>
      {d.source === "library" ? null : (
        <Button
          key={`delete:${d.stem}`}
          plain
          dimColor
          onPress={() => update($, paneAtom, (p) => ({ ...p, confirm: d.stem, notice: null }))}
        >
          delete
        </Button>
      )}
    </Box>
  );
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Button
          key={`toggle:${d.stem}`}
          plain
          {...(hotkey ? { hotkey } : {})}
          onPress={() => toggle($, d.stem)}
        >
          {d.on ? "[on] " : "[off]"}
        </Button>
        <Box flexDirection="row" flexGrow={1} flexShrink={1} gap={1}>
          <Text wrap="truncate-end" {...(d.on ? { bold: true } : { dimColor: true })}>
            {d.title}
          </Text>
          <Text dimColor wrap="truncate-end">
            {meta}
          </Text>
        </Box>
        {actions}
      </Box>
      <Text dimColor wrap="truncate-end">
        {`      ${d.body.split("\n")[0] ?? ""}`}
      </Text>
    </Box>
  );
}

function editor($: EngineInterface, e: RenderInput<"Pane">, draft: DirectiveDraft) {
  const ui = $.ui.resolve(e);
  const { Box, Text, Button } = ui;
  // Mobile draws no text fields: there the file and Vex are the way to edit.
  if (!("Input" in ui && "Select" in ui)) {
    return <Text dimColor>Editing needs the terminal or the desktop app.</Text>;
  }
  const { Input, Select } = ui;
  const inline = bodyFitsInline(draft.body);
  const heading =
    draft.stem === null
      ? "New directive"
      : `Editing ${draft.stem}${draft.source === "library" ? " (library: saving gives the story its own copy)" : ""}`;
  const ask = draft.stem === null ? "((new directive: " : `((edit the directive "${draft.title}": `;
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text dimColor>{heading}</Text>
      <Input
        key="title"
        label="title "
        value={draft.title}
        placeholder="what it is called"
        submitLabel="next"
        onInput={(v) => setDraft($, { title: v })}
        onSubmit={(v) => setDraft($, { title: v })}
      />
      <Select
        key="mode"
        label="mode  "
        value={draft.mode}
        options={modes.map((m) => ({ value: m }))}
        onSelect={(v) => {
          const mode = modes.find((m) => m === v);
          if (mode) void setDraft($, { mode });
        }}
      />
      <Input
        key="keys"
        label="keys  "
        value={draft.keys}
        placeholder="comma list, for keyed"
        submitLabel="next"
        onInput={(v) => setDraft($, { keys: v })}
        onSubmit={(v) => setDraft($, { keys: v })}
      />
      {inline ? (
        <Input
          key="body"
          label="body  "
          value={draft.body}
          placeholder="the instruction, one line"
          submitLabel="save"
          onInput={(v) => setDraft($, { body: v })}
          onSubmit={async (v) => {
            await setDraft($, { body: v });
            await save($);
          }}
        />
      ) : (
        <Text dimColor wrap="wrap">
          {`body  ${draft.body.split("\n").length} lines, too long to edit here: open the file, or ask Vex.`}
        </Text>
      )}
      <Box flexDirection="row" gap={1}>
        <Button key="save" variant="primary" onPress={() => save($)}>
          Save
        </Button>
        <Button
          key="cancel"
          onPress={() => update($, paneAtom, (p) => ({ ...p, draft: null, notice: null }))}
        >
          Cancel
        </Button>
        {draft.stem === null ? null : (
          <Button key="editor-open" plain dimColor onPress={() => openFile($, draft.stem ?? "")}>
            open
          </Button>
        )}
        <Button key="ask" plain dimColor onPress={() => askVex($, ask)}>
          … ask Vex
        </Button>
      </Box>
    </Box>
  );
}

function openFile($: EngineInterface, stem: string): Promise<boolean> {
  return send($, ["open", stem]);
}

// Longer prose is better written in conversation: the prompt gets the
// out-of-character opening and the pane steps aside so the player can type.
async function askVex($: EngineInterface, text: string): Promise<void> {
  // Closed first: the prompt box may refuse a fill while something holds the keys.
  await update($, paneAtom, () => idle);
  await $.ui.close({ id: PANE });
  await $.prompt.fill({ text });
}
