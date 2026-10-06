import { describe, expect, test } from "bun:test";
import { type Config, defaultConfig } from "./config.ts";
import { generatedPaths } from "./generate.ts";
import { blankStartPrompt, claudeArgs, type LaunchOptions, pluginDir } from "./launch.ts";
import { loadStory, type Story } from "./story.ts";
import { blankDir, fixtureLibrary, saltmereDir } from "./testing/fixtures.ts";

const server = "/repo/server/world.ts";
const load = (dir: string) => loadStory(dir, { libraryRoot: fixtureLibrary });

function args(story: Story, options: LaunchOptions = {}, config: Config = defaultConfig) {
  return claudeArgs(story, generatedPaths(story), config, { worldServer: server, ...options });
}

// The value following a flag, or undefined when the flag is absent.
function flag(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

function json(argv: string[], name: string) {
  const value = flag(argv, name);
  if (value === undefined) throw new Error(`${name} missing`);
  return JSON.parse(value);
}

describe("claudeArgs", () => {
  test("core session flags for an ongoing story", async () => {
    const story = await load(saltmereDir);
    const argv = args(story);
    expect(flag(argv, "--system-prompt-file")).toBe(generatedPaths(story).promptFile);
    expect(flag(argv, "--tools")).toBe("Read,Glob,Grep,AskUserQuestion,Skill");
    expect(flag(argv, "--plugin-dir")).toBe(pluginDir);
    expect(flag(argv, "--name")).toBe("Saltmere");
    expect(flag(argv, "--effort")).toBe("high");
    expect(argv).toContain("--strict-mcp-config");
    expect(argv).toContain("--continue");
    expect(argv).not.toContain("--model");
    expect(argv).not.toContain(blankStartPrompt);
  });

  test("world server config carries the story, config and optional library", async () => {
    const story = await load(saltmereDir);
    const config: Config = { ...defaultConfig, notesEvery: 3 };
    const world = json(args(story, {}, config), "--mcp-config").mcpServers.world;
    expect(world).toEqual({
      type: "stdio",
      command: "bun",
      args: [server],
      env: { RP_STORY: story.dir, RP_CONFIG: JSON.stringify(config) },
    });
    expect(JSON.parse(world.env.RP_CONFIG).notesEvery).toBe(3);

    const withLibrary = json(args(story, { library: "/lib" }), "--mcp-config");
    expect(withLibrary.mcpServers.world.env.RP_LIBRARY).toBe("/lib");
  });

  test("no world server: no --mcp-config, but still strict", async () => {
    const argv = args(await load(saltmereDir), { worldServer: undefined });
    expect(argv).not.toContain("--mcp-config");
    expect(argv).toContain("--strict-mcp-config");
  });

  test("settings pre-allow the world tools and the kept built-ins, hooks on, story status line", async () => {
    const settings = json(args(await load(saltmereDir)), "--settings");
    expect(settings).toEqual({
      permissions: { allow: ["mcp__world", "Read", "Glob", "Grep", "AskUserQuestion", "Skill"] },
      disableAllHooks: false,
      tui: "fullscreen",
      statusLine: {
        type: "command",
        command: `bun "${pluginDir.replaceAll("\\", "/")}/statusline.ts"`,
      },
      pluginConfigs: {
        "storyteller@inline": { options: { ...defaultConfig, narratorModel: "" } },
      },
    });
  });

  test("the player's user settings layer stays out; the project layer stays", async () => {
    const argv = args(await load(saltmereDir));
    expect(flag(argv, "--setting-sources")).toBe("project,local");
    // --restricted would also drop the stories home's and the story's skills.
    expect(argv).not.toContain("--restricted");
  });

  test("the mod's options come from the resolved config, since settings.json is not read", async () => {
    const config: Config = { ...defaultConfig, notesEvery: 3, narratorModel: "opus" };
    const settings = json(args(await load(saltmereDir), {}, config), "--settings");
    expect(settings.pluginConfigs["storyteller@inline"].options).toEqual(config);
  });

  test("model: command line beats config, config beats nothing", async () => {
    const story = await load(saltmereDir);
    const config: Config = { ...defaultConfig, narratorModel: "sonnet", narratorEffort: "max" };
    expect(flag(args(story, {}, config), "--model")).toBe("sonnet");
    expect(flag(args(story, { model: "opus" }, config), "--model")).toBe("opus");
    expect(flag(args(story, {}, config), "--effort")).toBe("max");
  });

  test("--new starts fresh; extra args pass through last, in order", async () => {
    const argv = args(await load(saltmereDir), { new: true, extra: ["--verbose", "--debug"] });
    expect(argv).not.toContain("--continue");
    expect(argv.slice(-2)).toEqual(["--verbose", "--debug"]);
  });

  test("blank story, new session: opening prompt first", async () => {
    const argv = args(await load(blankDir), { new: true });
    expect(argv[0]).toBe(blankStartPrompt);
    expect(argv.filter((a) => a === blankStartPrompt)).toHaveLength(1);
  });

  test("blank story always opens fresh with the opening prompt, even without --new", async () => {
    const argv = args(await load(blankDir));
    expect(argv[0]).toBe(blankStartPrompt);
    expect(argv).not.toContain("--continue");
  });

  test("a story with a persona but no scene is not blank", async () => {
    const story: Story = { ...(await load(blankDir)), persona: "corwin" };
    expect(args(story, { new: true })).not.toContain(blankStartPrompt);
  });
});
