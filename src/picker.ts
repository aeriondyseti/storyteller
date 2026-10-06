import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { sessionsDir } from "./launch.ts";
import { storiesRoot } from "./paths.ts";
import { loadStory } from "./story.ts";

// The story picker `rp` opens with no argument (spec 11): the data, the frame
// and the keys, all pure but listStories. The raw-mode loop that drives them
// is src/picker-tty.ts.

export type StoryRow = {
  // The folder name, which `rp <name>` takes.
  name: string;
  dir: string;
  title: string;
  // "Scene 3: The Gate", "no scene yet", or why the story would not load.
  scene: string;
  // The newest Claude Code transcript for the folder; undefined if never played.
  played: number | undefined;
  // Sort key: played, else story.md's modification time.
  touched: number;
};

export type ListOptions = { root?: string; configDir?: string; libraryRoot?: string };

// Every folder under the stories root with a story.md, last played first.
export async function listStories(options: ListOptions = {}): Promise<StoryRow[]> {
  const root = options.root ?? storiesRoot();
  const rows: StoryRow[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const storyFile = await stat(path.join(dir, "story.md")).catch(() => undefined);
    if (!storyFile?.isFile()) continue;
    const played = await lastPlayed(dir, options.configDir);
    rows.push({
      name: entry.name,
      dir,
      ...(await describe(dir, entry.name, options.libraryRoot)),
      played,
      touched: played ?? storyFile.mtimeMs,
    });
  }
  return rows.sort((a, b) => b.touched - a.touched || a.name.localeCompare(b.name));
}

// A story that does not load still gets a row, so the player sees why.
async function describe(dir: string, name: string, libraryRoot: string | undefined) {
  try {
    const story = await loadStory(dir, { libraryRoot: libraryRoot ?? process.env.RP_LIBRARY });
    const scene = story.scene
      ? `Scene ${story.scene.number}: ${story.scene.title}`
      : "no scene yet";
    return { title: story.title, scene };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { title: name, scene: `does not load: ${reason}` };
  }
}

async function lastPlayed(dir: string, configDir: string | undefined): Promise<number | undefined> {
  const folder = configDir === undefined ? sessionsDir(dir) : sessionsDir(dir, configDir);
  let newest: number | undefined;
  for (const name of await readdir(folder).catch(() => [])) {
    if (!name.endsWith(".jsonl")) continue;
    const info = await stat(path.join(folder, name)).catch(() => undefined);
    if (info && (newest === undefined || info.mtimeMs > newest)) newest = info.mtimeMs;
  }
  return newest;
}

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export function relativeTime(then: number | undefined, now: number): string {
  if (then === undefined) return "never";
  const ago = Math.max(0, now - then);
  if (ago < minute) return "just now";
  if (ago < hour) return `${Math.floor(ago / minute)} min ago`;
  if (ago < day) return `${Math.floor(ago / hour)} h ago`;
  const days = Math.floor(ago / day);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;

export const newStoryLabel = "+ new story";
const help = "↑↓ or j k move · Enter play · Esc or q quit";

export type FrameOptions = { now?: number; height?: number };

// The whole frame: a heading, one line per story, the new-story row and the
// key help. `selected` indexes rows, with rows.length meaning the new-story
// row. No line is wider than `width` - 1 and the frame is no taller than
// `height`, so nothing wraps or scrolls and a redraw can move up by the line
// count; more stories than fit scroll with the selection.
export function renderPicker(
  rows: StoryRow[],
  selected: number,
  width: number,
  { now = Date.now(), height = Number.POSITIVE_INFINITY }: FrameOptions = {},
): string {
  const room = Math.max(16, width - 1);
  const cells = rows.map((r) => ({
    name: r.name.toLowerCase() === r.title.toLowerCase() ? r.title : `${r.title}  ${r.name}`,
    scene: r.scene,
    when: relativeTime(r.played, now),
  }));
  const gap = 3;
  const whenWidth = Math.max(0, ...cells.map((c) => Bun.stringWidth(c.when)));
  // The pointer (2), then the name column, scene column and time, separated
  // by gaps. When it does not fit, the scene gives way first, then the name;
  // on a very narrow terminal the scene column goes altogether.
  let nameWidth = Math.max(0, ...cells.map((c) => Bun.stringWidth(c.name)));
  let sceneWidth = Math.max(0, ...cells.map((c) => Bun.stringWidth(c.scene)));
  const over = () => 2 + nameWidth + (sceneWidth ? gap + sceneWidth : 0) + gap + whenWidth - room;
  if (over() > 0) sceneWidth = Math.max(10, sceneWidth - over());
  if (over() > 0) nameWidth = Math.max(10, nameWidth - over());
  if (over() > 0) sceneWidth = 0;
  if (over() > 0) nameWidth = Math.max(1, nameWidth - over());

  // Heading, blank, items, blank, help: four lines around the items.
  const total = rows.length + 1;
  const visible = Math.min(total, Math.max(3, height - 4));
  const start = Math.max(0, Math.min(selected - Math.floor(visible / 2), total - visible));
  const range = visible < total ? dim(`  ${start + 1}-${start + visible} of ${total}`) : "";
  const lines = [bold("Pick a story") + range, ""];
  rows.forEach((row, i) => {
    const cell = cells[i];
    if (!cell || i < start || i >= start + visible) return;
    const on = i === selected;
    const name = fit(cell.name, nameWidth);
    // Title bold (cyan when selected); the folder name after it dim.
    const titleWidth = Math.min(Bun.stringWidth(row.title), nameWidth);
    const title = name.slice(0, sliceAt(name, titleWidth));
    const folder = name.slice(title.length);
    const line = [
      on ? cyan("❯ ") : "  ",
      on ? cyan(bold(title)) : bold(title),
      dim(folder),
      sceneWidth ? " ".repeat(gap) + fit(cell.scene, sceneWidth) : "",
      " ".repeat(gap),
      dim(cell.when.padStart(whenWidth)),
    ].join("");
    lines.push(line);
  });
  const onNew = selected === rows.length;
  if (start + visible === total)
    lines.push(`${onNew ? cyan("❯ ") : "  "}${onNew ? cyan(bold(newStoryLabel)) : newStoryLabel}`);
  lines.push("", dim(fit(help, room).trimEnd()));
  return lines.join("\n");
}

// Text cut or padded to exactly `width` columns, with … where it was cut.
export function fit(text: string, width: number): string {
  const w = Bun.stringWidth(text);
  if (w <= width) return text + " ".repeat(width - w);
  const cut = text.slice(0, sliceAt(text, width - 1));
  return `${cut}…${" ".repeat(Math.max(0, width - 1 - Bun.stringWidth(cut)))}`;
}

// The longest prefix of `text`, in UTF-16 units, at most `width` columns wide.
function sliceAt(text: string, width: number): number {
  let end = 0;
  let used = 0;
  for (const ch of text) {
    const w = Bun.stringWidth(ch);
    if (used + w > width) break;
    used += w;
    end += ch.length;
  }
  return end;
}

export type PickerAction = "launch" | "new" | "quit";
export type PickerStep = { selected: number; action?: PickerAction };

// One key: where the selection moves, and whether the picker is done. `count`
// is the number of stories; the new-story row sits after them.
export function pickerKey(selected: number, count: number, key: string): PickerStep {
  const last = count;
  switch (key) {
    case "\x1b[A":
    case "\x1bOA":
    case "k":
      return { selected: Math.max(0, selected - 1) };
    case "\x1b[B":
    case "\x1bOB":
    case "j":
      return { selected: Math.min(last, selected + 1) };
    case "\x1b[H":
    case "\x1bOH":
    case "\x1b[1~":
    case "g":
      return { selected: 0 };
    case "\x1b[F":
    case "\x1bOF":
    case "\x1b[4~":
    case "G":
      return { selected: last };
    case "\r":
    case "\n":
      return { selected, action: selected === last ? "new" : "launch" };
    case "\x1b":
    case "q":
    case "\x03":
      return { selected, action: "quit" };
    default:
      return { selected };
  }
}

// A chunk read in raw mode can hold several keys (a fast typist, a pasted
// run); each escape sequence is one key, and a lone ESC is Esc.
export function splitKeys(chunk: string): string[] {
  const keys: string[] = [];
  let i = 0;
  while (i < chunk.length) {
    if (chunk[i] === "\x1b" && (chunk[i + 1] === "[" || chunk[i + 1] === "O")) {
      let end = i + 2;
      // CSI parameters run until a final byte in @ to ~; SS3 is one letter.
      if (chunk[i + 1] === "[") {
        while (end < chunk.length && !/[@-~]/.test(chunk[end] ?? "")) end++;
      }
      keys.push(chunk.slice(i, end + 1));
      i = end + 1;
    } else {
      // A whole code point, so a pasted emoji is one key, not two halves.
      const ch = String.fromCodePoint(chunk.codePointAt(i) ?? 0);
      keys.push(ch);
      i += ch.length;
    }
  }
  return keys;
}

// `rp list` and the non-terminal fallback: plain, aligned, no colour.
export function listText(rows: StoryRow[], now = Date.now()): string {
  const cells = rows.map((r) => [r.name, r.title, r.scene, relativeTime(r.played, now)]);
  const widths = [0, 1, 2].map((c) =>
    Math.max(...cells.map((row) => Bun.stringWidth(row[c] ?? ""))),
  );
  return cells
    .map((row) =>
      row
        .map((cell, c) =>
          c < 3 ? cell + " ".repeat((widths[c] ?? 0) - Bun.stringWidth(cell)) : cell,
        )
        .join("  "),
    )
    .map((line) => `${line}\n`)
    .join("");
}
