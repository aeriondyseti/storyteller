import { describe, expect, test } from "bun:test";
import { cp, mkdir, utimes } from "node:fs/promises";
import path from "node:path";
import { sessionsDir } from "./launch.ts";
import {
  fit,
  listStories,
  listText,
  pickerKey,
  relativeTime,
  renderPicker,
  type StoryRow,
  splitKeys,
} from "./picker.ts";
import { blankDir, fixtureLibrary, saltmereDir, tempDir } from "./testing/fixtures.ts";

const now = Date.UTC(2026, 9, 6, 12);
const hour = 3_600_000;
const day = 24 * hour;

// ESC spelled out first: biome refuses control characters in a regex.
const strip = (s: string) => s.replaceAll("\x1b", "ESC").replaceAll(/ESC\[[\d;?]*[a-zA-Z]/g, "");

const rows: StoryRow[] = [
  {
    name: "build-failed",
    dir: "/s/build-failed",
    title: "Build Failed Successfully",
    scene: "Scene 1: Spawn Point",
    played: now - 2 * hour,
    touched: now - 2 * hour,
  },
  {
    name: "Saltmere",
    dir: "/s/Saltmere",
    title: "Saltmere",
    scene: "Scene 4: The Drowned Bell",
    played: now - day - hour,
    touched: now - day - hour,
  },
  {
    name: "new-thing",
    dir: "/s/new-thing",
    title: "Untitled",
    scene: "no scene yet",
    played: undefined,
    touched: now - 3 * day,
  },
];

describe("listStories", () => {
  test("every folder with a story.md, last played first, story.md time as the fallback", async () => {
    const root = await tempDir();
    const config = await tempDir();
    await cp(saltmereDir, `${root}/saltmere`, { recursive: true });
    await cp(blankDir, `${root}/blank`, { recursive: true });
    await cp(blankDir, `${root}/older`, { recursive: true });
    await mkdir(`${root}/not-a-story`);
    await Bun.write(`${root}/stray.md`, "hello");
    const seconds = (t: number) => t / 1000;
    // blank was edited an hour ago and never played; older long ago.
    await utimes(`${root}/blank/story.md`, seconds(now - hour), seconds(now - hour));
    await utimes(`${root}/older/story.md`, seconds(now - 9 * day), seconds(now - 9 * day));
    // saltmere was played two days ago, in the newer of two sessions.
    const sessions = sessionsDir(path.join(root, "saltmere"), config);
    await mkdir(sessions, { recursive: true });
    await Bun.write(`${sessions}/a.jsonl`, "{}\n");
    await Bun.write(`${sessions}/b.jsonl`, "{}\n");
    await utimes(`${sessions}/a.jsonl`, seconds(now - 5 * day), seconds(now - 5 * day));
    await utimes(`${sessions}/b.jsonl`, seconds(now - 2 * day), seconds(now - 2 * day));

    const listed = await listStories({ root, configDir: config, libraryRoot: fixtureLibrary });
    expect(listed.map((r) => r.name)).toEqual(["blank", "saltmere", "older"]);
    const [blank, saltmere] = listed;
    expect(blank?.title).toBe("Untitled");
    expect(blank?.scene).toBe("no scene yet");
    expect(blank?.played).toBeUndefined();
    expect(saltmere?.title).toBe("Saltmere");
    expect(saltmere?.scene).toMatch(/^Scene \d+: .+/);
    expect(saltmere?.played).toBe(now - 2 * day);
  });

  test("a story that does not load still gets a row saying why", async () => {
    const root = await tempDir();
    await mkdir(`${root}/broken`);
    await Bun.write(`${root}/broken/story.md`, "---\nstoryteller: Vex\n---\n");
    const [row] = await listStories({ root, configDir: await tempDir() });
    expect(row?.title).toBe("broken");
    expect(row?.scene).toStartWith("does not load: story.md needs a title");
  });

  test("no stories root is no stories", async () => {
    expect(await listStories({ root: `${await tempDir()}/none` })).toEqual([]);
  });
});

describe("relativeTime", () => {
  test.each([
    [undefined, "never"],
    [now - 10_000, "just now"],
    [now - 5 * 60_000, "5 min ago"],
    [now - 2 * hour, "2 h ago"],
    [now - day - hour, "yesterday"],
    [now - 3 * day, "3 days ago"],
    [now - 20 * day, "2 weeks ago"],
    [now - 90 * day, "3 months ago"],
    [now - 800 * day, "2 years ago"],
  ])("%p reads %p", (then, text) => {
    expect(relativeTime(then, now)).toBe(text);
  });
});

describe("renderPicker", () => {
  test("title bold, folder dim when it differs, scene, last played, then the new-story row", () => {
    const frame = renderPicker(rows, 0, 100, { now });
    expect(strip(frame).split("\n")).toEqual([
      "Pick a story",
      "",
      "❯ Build Failed Successfully  build-failed   Scene 1: Spawn Point          2 h ago",
      "  Saltmere                                  Scene 4: The Drowned Bell   yesterday",
      "  Untitled  new-thing                       no scene yet                    never",
      "  + new story",
      "",
      "↑↓ or j k move · Enter play · Esc or q quit",
    ]);
    expect(frame).toContain("\x1b[36m\x1b[1mBuild Failed Successfully\x1b[22m\x1b[39m");
    expect(frame).toContain("\x1b[2m  build-failed");
    expect(frame).toContain("\x1b[1mSaltmere\x1b[22m");
  });

  test("the new-story row selected", () => {
    const lines = strip(renderPicker(rows, 3, 100, { now })).split("\n");
    expect(lines[2]).toStartWith("  Build");
    expect(lines[5]).toBe("❯ + new story");
  });

  test("a narrow terminal cuts the scene first, then the name; no line wraps", () => {
    for (const width of [70, 50, 30, 20]) {
      for (const line of strip(renderPicker(rows, 0, width, { now })).split("\n")) {
        expect(Bun.stringWidth(line)).toBeLessThan(width);
      }
    }
    const at70 = strip(renderPicker(rows, 0, 70, { now })).split("\n");
    expect(at70[2]).toContain("Build Failed Successfully  build-failed");
    expect(at70[2]).toContain("…");
    expect(at70[2]).toEndWith("2 h ago");
  });

  test("more stories than the terminal is tall scroll with the selection", () => {
    const base = rows[2];
    if (!base) throw new Error("fixture rows");
    const many = Array.from({ length: 20 }, (_, i) => ({ ...base, name: `s${i}`, title: `S${i}` }));
    const frame = (selected: number) =>
      strip(renderPicker(many, selected, 80, { now, height: 10 })).split("\n");
    const top = frame(0);
    expect(top).toHaveLength(10);
    expect(top[0]).toBe("Pick a story  1-6 of 21");
    expect(top[2]).toStartWith("❯ S0 ");
    const middle = frame(10);
    expect(middle[0]).toBe("Pick a story  8-13 of 21");
    expect(middle[5]).toStartWith("❯ S10 ");
    const end = frame(20);
    expect(end[0]).toBe("Pick a story  16-21 of 21");
    expect(end[7]).toBe("❯ + new story");
  });

  test("no stories: only the new-story row", () => {
    expect(strip(renderPicker([], 0, 80, { now })).split("\n")[2]).toBe("❯ + new story");
  });
});

describe("fit", () => {
  test("pads, or cuts with an ellipsis, to the exact width", () => {
    expect(fit("abc", 5)).toBe("abc  ");
    expect(fit("abcdef", 4)).toBe("abc…");
    expect(Bun.stringWidth(fit("語語語語", 5))).toBe(5);
  });
});

describe("pickerKey", () => {
  test("arrows and j k move within the stories and the new-story row", () => {
    expect(pickerKey(0, 3, "\x1b[B")).toEqual({ selected: 1 });
    expect(pickerKey(1, 3, "j")).toEqual({ selected: 2 });
    expect(pickerKey(3, 3, "j")).toEqual({ selected: 3 });
    expect(pickerKey(2, 3, "\x1b[A")).toEqual({ selected: 1 });
    expect(pickerKey(1, 3, "\x1bOA")).toEqual({ selected: 0 });
    expect(pickerKey(0, 3, "k")).toEqual({ selected: 0 });
    expect(pickerKey(1, 3, "G")).toEqual({ selected: 3 });
    expect(pickerKey(2, 3, "\x1b[H")).toEqual({ selected: 0 });
  });

  test("Enter launches a story or asks for a new one; Esc, q and Ctrl+C quit", () => {
    expect(pickerKey(1, 3, "\r")).toEqual({ selected: 1, action: "launch" });
    expect(pickerKey(3, 3, "\r")).toEqual({ selected: 3, action: "new" });
    for (const key of ["\x1b", "q", "\x03"]) {
      expect(pickerKey(1, 3, key).action).toBe("quit");
    }
    expect(pickerKey(1, 3, "x")).toEqual({ selected: 1 });
  });
});

describe("splitKeys", () => {
  test("escape sequences are one key, a lone ESC is Esc", () => {
    expect(splitKeys("\x1b[A\x1b[Bj\r")).toEqual(["\x1b[A", "\x1b[B", "j", "\r"]);
    expect(splitKeys("\x1b")).toEqual(["\x1b"]);
    expect(splitKeys("\x1bOA\x1b[1~")).toEqual(["\x1bOA", "\x1b[1~"]);
    expect(splitKeys("q😀")).toEqual(["q", "😀"]);
  });
});

describe("listText", () => {
  test("plain aligned columns: folder, title, scene, last played", () => {
    expect(listText(rows, now)).toBe(
      [
        "build-failed  Build Failed Successfully  Scene 1: Spawn Point       2 h ago",
        "Saltmere      Saltmere                   Scene 4: The Drowned Bell  yesterday",
        "new-thing     Untitled                   no scene yet               never",
        "",
      ].join("\n"),
    );
  });
});
