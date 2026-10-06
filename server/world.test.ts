import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { copyStory, fixtureLibrary, saltmereDir } from "../src/testing/fixtures.ts";
import { tools } from "./world.ts";

describe("world server over stdio", () => {
  test("lists every tool and answers get_character", async () => {
    const storyDir = await copyStory(saltmereDir);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(import.meta.dir, "world.ts")],
      env: { ...process.env, RP_STORY: storyDir, RP_LIBRARY: fixtureLibrary, RP_CONFIG: "{}" },
      stderr: "pipe",
    });
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const listed = await client.listTools();
      expect(listed.tools.map((t) => t.name).sort()).toEqual(tools.map((t) => t.name).sort());
      for (const tool of listed.tools) expect(tool.description?.length).toBeGreaterThan(40);

      const result = await client.callTool({
        name: "get_character",
        arguments: { nameOrStem: "mira" },
      });
      expect(result.isError).toBeFalsy();
      expect(JSON.stringify(result.content)).toContain("Mira");

      const missing = await client.callTool({
        name: "get_character",
        arguments: { nameOrStem: "x" },
      });
      expect(missing.isError).toBe(true);
      expect(JSON.stringify(missing.content)).toContain('No character \\"x\\"');
    } finally {
      await client.close();
    }
  }, 20_000);
});
