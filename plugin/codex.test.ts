import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fixtureLibrary, saltmereDir, tempDir } from "../src/testing/fixtures.ts";
import type { CodexSnapshot } from "./mod/types";

async function run(storyDir: string): Promise<unknown> {
  const proc = Bun.spawn(["bun", path.join(import.meta.dir, "codex.ts")], {
    env: { ...process.env, RP_STORY: storyDir, RP_LIBRARY: fixtureLibrary },
    stdout: "pipe",
  });
  return JSON.parse(await new Response(proc.stdout).text());
}

describe("the script", () => {
  test("a story prints its codex", async () => {
    const codex = (await run(saltmereDir)) as CodexSnapshot;
    expect(codex.books[0]?.name).toBe("Saltmere");
    expect(Array.isArray(codex.characters)).toBe(true);
    expect(codex.characters.map((c) => c.id)).not.toContain("character/corwin");
    for (const { id } of codex.names) expect(id).toMatch(/^(lore|character)\//);
  });

  test("outside a story it prints null", async () => {
    expect(await run(await tempDir())).toBeNull();
  });
});
