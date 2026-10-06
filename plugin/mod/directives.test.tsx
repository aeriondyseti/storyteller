import type { On } from "claude-code";
import { describe, type Engine, expect, mock, test } from "claude-code/testing";
import type { DirectiveList, DirectiveReply, DirectiveRow, DirectiveWrite } from "./types";

// The directives pane (stage/directives.tsx) through the engine's test kit.
// The kit has no processes, so plugin/directives.ts is played here: the
// test's process.run hook keeps the list, applies each write the pane sends,
// and records every argv. State lives in a map, as the host keeps it.

const plugin = "storyteller";
const surfaces = ["terminal", "desktop"] as const;
const dir = "/stories/hollow";

function fixture(): DirectiveRow[] {
  return [
    {
      stem: "noir",
      title: "Noir",
      mode: "always",
      keys: [],
      on: true,
      body: "Short sentences. Rain. Everyone wants something.",
      source: "library",
      path: "/library/directives/noir.md",
    },
    {
      stem: "slow-burn",
      title: "Slow burn",
      mode: "keyed",
      keys: ["kiss", "romance"],
      on: true,
      body: "Let attraction build over many scenes; no rushing.",
      source: "story",
      path: `${dir}/directives/slow-burn.md`,
    },
    {
      stem: "fade",
      title: "Fade to black",
      mode: "manual",
      keys: [],
      on: false,
      body: "Cut away from intimate scenes.",
      source: "story",
      path: `${dir}/directives/fade.md`,
    },
  ];
}

type World = {
  rows: DirectiveRow[];
  runs: string[][];
  writes: DirectiveWrite[];
  fills: string[];
  closed: string[];
};

function world(on: On): World {
  const w: World = { rows: fixture(), runs: [], writes: [], fills: [], closed: [] };
  on("process.run", (_$, e) => {
    w.runs.push([...e.argv]);
    const reply = answer(w, e.argv.slice(2), e.init?.stdin);
    return {
      value: {
        exitCode: 0,
        stdout: JSON.stringify(reply),
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  on("prompt.fill", (_$, e) => {
    w.fills.push(e.text);
    return { isFilled: true };
  });
  on("ui.close", (_$, e) => {
    w.closed.push(e.id);
    return { value: undefined };
  });
  on("ui.focus", () => ({}));
  on("ui.log", () => ({ value: undefined }));
  return w;
}

function listOf(w: World): DirectiveList {
  return { dir, directives: w.rows };
}

// What plugin/directives.ts would print for these arguments.
function answer(
  w: World,
  args: string[],
  stdin: string | undefined,
): DirectiveList | DirectiveReply {
  const [command, stem] = args;
  if (command === "list") return listOf(w);
  if (command === "open") {
    return {
      message: `Opened ${w.rows.find((d) => d.stem === stem)?.path}`,
      error: null,
      list: null,
    };
  }
  const write: DirectiveWrite = JSON.parse(stdin ?? "{}");
  w.writes.push(write);
  if (write.op === "toggle") {
    w.rows = w.rows.map((d) => (d.stem === write.stem ? { ...d, on: write.on } : d));
    return {
      message: `${write.stem} is now ${write.on ? "on" : "off"}.`,
      error: null,
      list: listOf(w),
    };
  }
  if (write.op === "update") {
    w.rows = w.rows.map((d) =>
      d.stem === write.stem
        ? {
            ...d,
            ...(write.title ? { title: write.title } : {}),
            ...(write.body ? { body: write.body } : {}),
            ...(write.keys ? { keys: write.keys } : {}),
          }
        : d,
    );
    return { message: `Saved ${write.title}.`, error: null, list: listOf(w) };
  }
  if (write.op === "delete") {
    w.rows = w.rows.filter((d) => d.stem !== write.stem);
    return { message: `Deleted ${write.stem}.`, error: null, list: listOf(w) };
  }
  return { message: `Created ${write.title}.`, error: null, list: listOf(w) };
}

// Drawn first with nothing read, then filled by the pane's own refresh, as
// /directives does before it opens the pane.
async function mount($: Engine, surface: (typeof surfaces)[number]) {
  const ui = await $.ui.mount({
    plugin,
    surface,
    component: "Pane",
    requestId: "directives",
    props: {
      title: "Directives",
      isFocused: true,
      bodyColumns: 80,
      placement: "dock" as const,
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
    viewport: { columns: 160, rows: 40, isFullscreen: true },
  });
  await ui.press({ key: "refresh" });
  return ui;
}

describe("directives pane", () => {
  test("lists each directive with its toggle, mode, keys and source", async ($, on) => {
    world(on);
    for (const surface of surfaces) {
      const ui = await mount($, surface);
      expect((await ui.find({ key: "toggle:noir" }))?.text.trim()).toBe("[on]");
      expect((await ui.find({ key: "toggle:fade" }))?.text.trim()).toBe("[off]");
      expect((await ui.find({ key: "toggle:noir" }))?.props.hotkey).toBe("1");
      expect((await ui.find({ key: "toggle:fade" }))?.props.hotkey).toBe("3");
      expect(await ui.find({ text: /always · \(library\)/ })).toBeDefined();
      expect(await ui.find({ text: /keyed · kiss, romance/ })).toBeDefined();
      expect(await ui.find({ text: "Fade to black" })).toBeDefined();
      // A library directive has no delete, and the pane says why.
      expect(await ui.find({ key: "delete:noir" })).toBeUndefined();
      expect(await ui.find({ key: "delete:fade" })).toBeDefined();
      expect(await ui.find({ text: /cannot be deleted here/ })).toBeDefined();
      expect(await ui.find({ key: "new" })).toBeDefined();
      await ui.unmount();
    }
  });

  test("a toggle writes through the script and redraws", async ($, on) => {
    const w = world(on);
    for (const surface of surfaces) {
      w.rows = fixture();
      const ui = await mount($, surface);
      await ui.press({ key: "toggle:fade" });
      expect(w.writes.at(-1)).toEqual({ op: "toggle", stem: "fade", on: true });
      const run = w.runs.at(-1) ?? [];
      expect(run[0]).toBe("bun");
      expect(run[1]?.endsWith("/directives.ts")).toBe(true);
      expect(run[2]).toBe("write");
      expect((await ui.find({ key: "toggle:fade" }))?.text.trim()).toBe("[on]");
      expect(await ui.find({ text: "fade is now on." })).toBeDefined();
      await ui.unmount();
    }
  });

  test("the editor saves title, keys, mode and body", async ($, on) => {
    const w = world(on);
    for (const surface of surfaces) {
      w.rows = fixture();
      const ui = await mount($, surface);
      await ui.press({ key: "edit:slow-burn" });
      expect((await ui.find({ key: "title" }))?.text).toBe("Slow burn");
      expect((await ui.find({ key: "keys" }))?.text).toBe("kiss, romance");
      // While a field takes typing, the digits switch nothing.
      expect((await ui.find({ key: "toggle:noir" }))?.props.hotkey).toBeUndefined();
      await ui.input({ key: "title", text: "Slower burn" });
      await ui.input({ key: "keys", text: "kiss, longing", kind: "change" });
      await ui.select({ key: "mode", value: "always" });
      await ui.input({ key: "body", text: "Take it slow.", kind: "change" });
      await ui.press({ key: "save" });
      expect(w.writes.at(-1)).toEqual({
        op: "update",
        stem: "slow-burn",
        title: "Slower burn",
        mode: "always",
        keys: ["kiss", "longing"],
        body: "Take it slow.",
      });
      // Back to the list, the row redrawn, a dim confirmation under it.
      expect(await ui.find({ key: "title" })).toBeUndefined();
      expect(await ui.find({ text: "Slower burn" })).toBeDefined();
      expect(await ui.find({ text: "Saved Slower burn." })).toBeDefined();
      await ui.unmount();
    }
  });

  test("a long body is left alone; … ask Vex fills the prompt", async ($, on) => {
    const w = world(on);
    w.rows = w.rows.map((d) =>
      d.stem === "noir" ? { ...d, body: "Line one.\nLine two.\nLine three." } : d,
    );
    const ui = await mount($, "terminal");
    await ui.press({ key: "edit:noir" });
    expect(await ui.find({ key: "body" })).toBeUndefined();
    expect(await ui.find({ text: /3 lines, too long to edit here/ })).toBeDefined();
    expect(await ui.find({ text: /library: saving gives the story its own copy/ })).toBeDefined();
    await ui.press({ key: "save" });
    expect(w.writes.at(-1)).toEqual({
      op: "update",
      stem: "noir",
      title: "Noir",
      mode: "always",
      keys: [],
    });
    await ui.press({ key: "edit:noir" });
    await ui.press({ key: "ask" });
    expect(w.fills).toEqual(['((edit the directive "Noir": ']);
    expect(w.closed).toEqual(["directives"]);
    await ui.unmount();
  });

  test("new directive opens an empty editor, manual and on", async ($, on) => {
    const w = world(on);
    const ui = await mount($, "desktop");
    await ui.press({ key: "new" });
    expect(await ui.find({ text: "New directive" })).toBeDefined();
    await ui.input({ key: "title", text: "Weather" });
    await ui.input({ key: "body", text: "Mention the weather." });
    expect(w.writes.at(-1)).toEqual({
      op: "create",
      title: "Weather",
      mode: "manual",
      keys: [],
      on: true,
      body: "Mention the weather.",
    });
    await ui.unmount();
  });

  test("delete asks first; no keeps it, yes deletes it", async ($, on) => {
    const w = world(on);
    for (const surface of surfaces) {
      w.rows = fixture();
      w.writes = [];
      const ui = await mount($, surface);
      await ui.press({ key: "delete:fade" });
      expect(await ui.find({ text: "really delete?" })).toBeDefined();
      await ui.press({ key: "no:fade" });
      expect(await ui.find({ text: "really delete?" })).toBeUndefined();
      expect(w.writes).toEqual([]);
      await ui.press({ key: "delete:fade" });
      await ui.press({ key: "yes:fade" });
      expect(w.writes).toEqual([{ op: "delete", stem: "fade" }]);
      expect(await ui.find({ key: "toggle:fade" })).toBeUndefined();
      expect(await ui.find({ text: "Deleted fade." })).toBeDefined();
      await ui.unmount();
    }
  });

  test("open hands the stem to the script; refresh re-reads", async ($, on) => {
    const w = world(on);
    const ui = await mount($, "terminal");
    await ui.press({ key: "open:noir" });
    expect(w.runs.at(-1)?.slice(2)).toEqual(["open", "noir"]);
    expect(await ui.find({ text: "Opened /library/directives/noir.md" })).toBeDefined();
    w.rows = [...w.rows, { ...fade(), stem: "added", title: "Added outside" }];
    await ui.press({ key: "refresh" });
    expect(w.runs.at(-1)?.slice(2)).toEqual(["list"]);
    expect(await ui.find({ text: "Added outside" })).toBeDefined();
    await ui.unmount();
  });
});

describe("/storyteller:directives", () => {
  test("reads the list, opens a dialog pane, and re-reads when a file changes", async ($, on) => {
    const w = world(on);
    const clock = mock.clock(on);
    const opened: unknown[] = [];
    on("ui.open", (_$, e) => {
      opened.push({ ...e });
      return { value: { isPlaced: true } };
    });
    on("ui.panes", () => ({
      value: [
        { id: "directives", title: "Directives", isShown: true, isFocused: true, isPlaced: true },
      ],
    }));
    let mtime = 1;
    on("fs.stat", (_$, e) => ({
      value: {
        kind: "file",
        size: 1,
        mtimeMs: e.path.endsWith("fade.md") ? mtime : 1,
        isLink: false,
      },
    }));
    await $.command.run({
      command: "storyteller:directives",
      args: "",
      origin: { kind: "composer" },
      presentation: { isFullscreen: true, columns: 160 },
    });
    expect(w.runs.map((r) => r[2])).toEqual(["list"]);
    expect(opened).toEqual([
      expect.objectContaining({ id: "directives", focus: true, closeOnEscape: true }),
    ]);
    await clock.advance(4_000);
    await clock.advance(4_000);
    expect(w.runs.length).toBe(1);
    mtime = 2;
    await clock.advance(4_000);
    expect(w.runs.map((r) => r[2])).toEqual(["list", "list"]);
  });
});

function fade(): DirectiveRow {
  const row = fixture().find((d) => d.stem === "fade");
  if (!row) throw new Error("fixture has no fade");
  return row;
}
