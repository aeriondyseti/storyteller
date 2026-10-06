import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hasSession, sessionsDir } from "./launch.ts";
import { posixPath } from "./paths.ts";
import { tempDir } from "./testing/fixtures.ts";

describe("sessionsDir", () => {
  test("encodes the story path the way Claude Code names project folders", () => {
    const dir = sessionsDir(
      "X:\\Development\\storyteller\\.claude\\stories\\the-hollow-crown",
      "C:/cfg",
    );
    expect(posixPath(dir)).toBe(
      "C:/cfg/projects/X--Development-storyteller--claude-stories-the-hollow-crown",
    );
  });
});

describe("hasSession", () => {
  test("false when the project folder is missing", async () => {
    expect(await hasSession(path.join(await tempDir(), "nowhere"))).toBe(false);
  });

  test("true once a transcript exists", async () => {
    const configDir = await tempDir();
    const storyDir = path.join(await tempDir(), "story");
    process.env.CLAUDE_CONFIG_DIR = configDir;
    try {
      const folder = sessionsDir(storyDir);
      await mkdir(folder, { recursive: true });
      expect(await hasSession(storyDir)).toBe(false);
      await writeFile(path.join(folder, "abc.jsonl"), "{}\n");
      expect(await hasSession(storyDir)).toBe(true);
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });
});
