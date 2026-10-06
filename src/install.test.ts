import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describeHome, homeRoots, scaffoldHome } from "./install.ts";

let temp: string | undefined;
afterEach(async () => {
  if (temp) await rm(temp, { recursive: true, force: true });
  temp = undefined;
});

async function roots() {
  temp = await mkdtemp(path.join(os.tmpdir(), "rp-install-"));
  return {
    stories: path.join(temp, "stories"),
    library: path.join(temp, "library"),
    skills: path.join(temp, ".claude", "skills"),
  };
}

describe("rp install", () => {
  test("creates the stories, library and skills folders, empty", async () => {
    const r = await roots();
    const folders = await scaffoldHome(r);
    expect(folders.map((f) => path.relative(temp ?? "", f.path).replaceAll("\\", "/"))).toEqual([
      "stories",
      "library/characters",
      "library/lore",
      "library/directives",
      ".claude/skills",
    ]);
    expect(folders.every((f) => f.created)).toBe(true);
    expect(await readdir(r.stories)).toEqual([]);
    expect(await readdir(r.skills)).toEqual([]);
  });

  test("a second run creates nothing and reports what exists", async () => {
    const r = await roots();
    await mkdir(r.stories, { recursive: true });
    const first = await scaffoldHome(r);
    expect(first[0]?.created).toBe(false);
    const second = await scaffoldHome(r);
    expect(second.every((f) => !f.created)).toBe(true);
    expect(describeHome(second)).toContain(`exists   ${r.stories}`);
  });

  test("the roots follow RP_STORIES and RP_LIBRARY", () => {
    const saved = { stories: process.env.RP_STORIES, library: process.env.RP_LIBRARY };
    process.env.RP_STORIES = "/s";
    process.env.RP_LIBRARY = "/l";
    try {
      expect(homeRoots()).toMatchObject({ stories: "/s", library: "/l" });
    } finally {
      for (const [name, value] of [
        ["RP_STORIES", saved.stories],
        ["RP_LIBRARY", saved.library],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
