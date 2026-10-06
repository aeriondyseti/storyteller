import { describe, expect, test } from "bun:test";
import { readFrontmatterFile } from "../src/frontmatter.ts";
import { loadStory } from "../src/story.ts";
import { copyStory, fixtureLibrary, saltmereDir } from "../src/testing/fixtures.ts";
import { applyWrite, listOf, openerFor } from "./directives.ts";
import type { DirectiveReply, DirectiveWrite } from "./mod/types";

async function fresh() {
  return copyStory(saltmereDir);
}

function list(reply: DirectiveReply) {
  if (!reply.list) throw new Error(reply.error ?? "no list");
  return reply.list.directives;
}

describe("listOf", () => {
  test("story and library directives, with their source and on state", async () => {
    const story = await loadStory(saltmereDir, { libraryRoot: fixtureLibrary });
    const rows = listOf(story).directives;
    expect(rows.map((d) => [d.stem, d.mode, d.on, d.source])).toEqual([
      ["fade", "manual", false, "story"],
      ["slow-burn", "keyed", true, "story"],
      ["noir", "always", true, "library"],
      ["boundaries", "always", true, "library"],
    ]);
    expect(rows.find((d) => d.stem === "slow-burn")?.keys).toEqual(["kiss", "romance"]);
    expect(rows.find((d) => d.stem === "noir")?.path).toBe(`${fixtureLibrary}/directives/noir.md`);
  });
});

describe("applyWrite", () => {
  test("toggle a story directive, and the prompt file follows", async () => {
    const dir = await fresh();
    const reply = await applyWrite(dir, { op: "toggle", stem: "fade", on: true }, fixtureLibrary);
    expect(reply.message).toBe("Fade to black is now on.");
    expect(list(reply).find((d) => d.stem === "fade")?.on).toBe(true);
    const prompt = await Bun.file(`${dir}/.rp/system-prompt.md`).text();
    expect(prompt).toContain("Cut away from intimate scenes.");
  });

  test("toggling a library directive copies it into the story first", async () => {
    const dir = await fresh();
    const reply = await applyWrite(dir, { op: "toggle", stem: "noir", on: false }, fixtureLibrary);
    expect(reply.message).toContain("own copy");
    const noir = list(reply).find((d) => d.stem === "noir");
    expect(noir).toMatchObject({ on: false, source: "story", path: `${dir}/directives/noir.md` });
    const doc = await readFrontmatterFile(`${dir}/directives/noir.md`);
    expect(doc.data).toEqual({ title: "Noir", mode: "always", on: false });
    expect(doc.body).toBe("Short sentences. Rain. Everyone wants something.");
    // The library itself is untouched.
    const lib = await readFrontmatterFile(`${fixtureLibrary}/directives/noir.md`);
    expect(lib.data.on).toBeUndefined();
  });

  test("update changes only the named fields; empty keys remove them", async () => {
    const dir = await fresh();
    const reply = await applyWrite(
      dir,
      { op: "update", stem: "slow-burn", title: "Slower burn", keys: [], mode: "always" },
      fixtureLibrary,
    );
    expect(reply.message).toBe("Saved Slower burn.");
    const doc = await readFrontmatterFile(`${dir}/directives/slow-burn.md`);
    expect(doc.data).toEqual({ title: "Slower burn", mode: "always" });
    expect(doc.body).toBe("Let attraction build over many scenes; no rushing.");

    await applyWrite(
      dir,
      { op: "update", stem: "slow-burn", body: "Take it slow.", keys: [" kiss ", ""] },
      fixtureLibrary,
    );
    const again = await readFrontmatterFile(`${dir}/directives/slow-burn.md`);
    expect(again.data.keys).toEqual(["kiss"]);
    expect(again.body).toBe("Take it slow.");
  });

  test("create picks a free stem from the title", async () => {
    const dir = await fresh();
    const write: DirectiveWrite = {
      op: "create",
      title: "Fade to Black",
      mode: "manual",
      keys: [],
      on: true,
      body: "Cut away.",
    };
    const reply = await applyWrite(dir, write, fixtureLibrary);
    expect(reply.message).toBe("Created Fade to Black (fade-to-black).");
    const second = await applyWrite(dir, write, fixtureLibrary);
    expect(second.message).toBe("Created Fade to Black (fade-to-black-2).");
    const doc = await readFrontmatterFile(`${dir}/directives/fade-to-black.md`);
    expect(doc.data).toEqual({ title: "Fade to Black", mode: "manual", on: true });
    expect(doc.body).toBe("Cut away.");
  });

  test("delete removes a story directive; a library one is refused", async () => {
    const dir = await fresh();
    const reply = await applyWrite(dir, { op: "delete", stem: "fade" }, fixtureLibrary);
    expect(reply.message).toBe("Deleted Fade to black.");
    expect(await Bun.file(`${dir}/directives/fade.md`).exists()).toBe(false);
    expect(list(reply).map((d) => d.stem)).not.toContain("fade");
    await expect(applyWrite(dir, { op: "delete", stem: "noir" }, fixtureLibrary)).rejects.toThrow(
      /comes from the library/,
    );
  });

  test("deleting a story override brings the library copy back", async () => {
    const dir = await fresh();
    await applyWrite(dir, { op: "toggle", stem: "noir", on: false }, fixtureLibrary);
    const reply = await applyWrite(dir, { op: "delete", stem: "noir" }, fixtureLibrary);
    expect(reply.message).toContain("library's copy is in force again");
    expect(list(reply).find((d) => d.stem === "noir")).toMatchObject({
      source: "library",
      on: true,
    });
  });

  test("a missing directive, an empty title or body is an error", async () => {
    const dir = await fresh();
    await expect(
      applyWrite(dir, { op: "toggle", stem: "nope", on: true }, fixtureLibrary),
    ).rejects.toThrow(/No directive "nope"/);
    await expect(
      applyWrite(dir, { op: "update", stem: "fade", title: " " }, fixtureLibrary),
    ).rejects.toThrow(/title/);
    await expect(
      applyWrite(
        dir,
        { op: "create", title: "X", mode: "manual", keys: [], on: true, body: "" },
        fixtureLibrary,
      ),
    ).rejects.toThrow(/instruction/);
  });
});

describe("openerFor", () => {
  const none = () => null;
  const file = "/s/directives/fade.md";

  test("VISUAL, then EDITOR; --wait dropped; a terminal editor passed over", () => {
    expect(openerFor(file, { VISUAL: "subl -w", EDITOR: "code" }, "linux", none)).toEqual([
      "subl",
      file,
    ]);
    expect(openerFor(file, { VISUAL: "nvim", EDITOR: "code --wait" }, "linux", none)).toEqual([
      "code",
      file,
    ]);
  });

  test("code on PATH, else the platform opener", () => {
    const code = (c: string) => (c === "code" ? "/usr/bin/code" : null);
    expect(openerFor(file, {}, "linux", code)).toEqual(["code", file]);
    expect(openerFor(file, { EDITOR: "vim" }, "darwin", none)).toEqual(["open", file]);
    expect(openerFor(file, {}, "linux", none)).toEqual(["xdg-open", file]);
    expect(openerFor(file, {}, "win32", none)).toEqual(["cmd", "/c", "start", "", file]);
  });

  test("on Windows a .cmd shim runs through cmd, an .exe directly", () => {
    const cmdShim = (c: string) => (c === "code" ? "C:/VS Code/bin/code.cmd" : null);
    expect(openerFor(file, {}, "win32", cmdShim)).toEqual(["cmd", "/c", "code", file]);
    const exe = (c: string) => (c === "notepad++" ? "C:/npp/notepad++.exe" : null);
    expect(openerFor(file, { EDITOR: "notepad++" }, "win32", exe)).toEqual([
      "C:/npp/notepad++.exe",
      file,
    ]);
  });
});
