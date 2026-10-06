import { afterEach, describe, expect, test } from "bun:test";
import os from "node:os";
import { homeSkillsDir, libraryRoot, posixPath, rpHome, storiesRoot } from "./paths.ts";

const saved = { stories: process.env.RP_STORIES, library: process.env.RP_LIBRARY };
afterEach(() => {
  restore("RP_STORIES", saved.stories);
  restore("RP_LIBRARY", saved.library);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("paths", () => {
  test("roots live under ~/.claude-roleplay", () => {
    const home = posixPath(os.homedir());
    delete process.env.RP_STORIES;
    delete process.env.RP_LIBRARY;
    expect(posixPath(rpHome())).toBe(`${home}/.claude-roleplay`);
    expect(posixPath(libraryRoot())).toBe(`${home}/.claude-roleplay/library`);
    expect(posixPath(homeSkillsDir())).toBe(`${home}/.claude-roleplay/.claude/skills`);
    expect(posixPath(storiesRoot())).toBe(`${home}/.claude-roleplay/stories`);
  });

  test("RP_STORIES overrides the stories root", () => {
    process.env.RP_STORIES = "/somewhere/else";
    expect(storiesRoot()).toBe("/somewhere/else");
  });

  test("RP_LIBRARY overrides the library root", () => {
    process.env.RP_LIBRARY = "/my/library";
    expect(libraryRoot()).toBe("/my/library");
  });

  test("posixPath is absolute with forward slashes", () => {
    const p = posixPath("a\\b/c");
    expect(p).not.toContain("\\");
    expect(p.endsWith("a/b/c")).toBe(true);
  });
});
