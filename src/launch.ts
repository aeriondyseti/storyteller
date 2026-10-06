import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type Config, loadConfig, pluginName } from "./config.ts";
import { type Generated, generate, pluginDir, repoRoot } from "./generate.ts";
import { posixPath } from "./paths.ts";
import type { Story } from "./story.ts";

// Builds and runs the `claude` command line for a story session (spec 11).
// claudeArgs is pure so the whole command line is testable; launch() does the
// file checks and the spawn.

export { generate, pluginDir, repoRoot };

export const worldServerFile = posixPath(path.join(repoRoot, "server", "world.ts"));

// Built-in tools the model keeps (spec 8): read-only access to the story and
// library, the dialog, and Skill, which loads the plugin's procedures
// (plugin/skills) when their moment comes. Everything that writes goes
// through the world server.
export const modelTools = ["Read", "Glob", "Grep", "AskUserQuestion", "Skill"];

// Sent on the player's behalf when a blank story opens, so the Storyteller
// speaks first (spec 3.1, 16).
export const blankStartPrompt = "[register: copilot] [new story] Begin.";

// Settings layers a story session reads; "user" is left out (spec 10).
export const storySettingSources = ["project", "local"];

export type LaunchOptions = {
  // Start a fresh session instead of continuing the last one (spec 3.5).
  new?: boolean;
  // Wins over config.narratorModel for this session.
  model?: string | undefined;
  // Passed through to claude untouched, after our own flags.
  extra?: string[];
  // Absolute path of the world server; undefined leaves the server out.
  worldServer?: string | undefined;
  // Library override handed to the server as RP_LIBRARY.
  library?: string | undefined;
  // Whether Claude Code already has a session for this story folder.
  // `--continue` with none to continue is an error, not a fresh start.
  hasSession?: boolean | undefined;
};

export function claudeArgs(
  story: Story,
  generated: Generated,
  config: Config,
  options: LaunchOptions,
): string[] {
  const args: string[] = [];
  // A blank story has nothing to continue: it always opens fresh with the
  // opening prompt, and the interview picks up from whatever is on disk.
  const fresh = options.new || isBlank(story) || options.hasSession === false;
  // A positional prompt goes first: --tools and --mcp-config take a variable
  // number of values and would swallow it if it came after them.
  if (isBlank(story)) args.push(blankStartPrompt);
  args.push("--system-prompt-file", generated.promptFile, "--tools", modelTools.join(","));
  if (options.worldServer) {
    args.push("--mcp-config", JSON.stringify(mcpConfig(story, config, options)));
  }
  // Keeps the player's own MCP servers out of the story, server or not.
  args.push("--strict-mcp-config");
  // Quieting (spec 10): the player's user layer (~/.claude: settings, plugins,
  // skills, agents, settings hooks) stays out of a story session. The project
  // layer stays: skills and agents under ~/.storyteller/.claude and the
  // story's own .claude. --restricted would drop both layers, so it is not used.
  args.push("--setting-sources", storySettingSources.join(","));
  args.push("--settings", JSON.stringify(sessionSettings(config)));
  args.push("--plugin-dir", pluginDir, "--name", story.title);
  const model = options.model ?? config.narratorModel;
  if (model) args.push("--model", model);
  args.push("--effort", config.narratorEffort);
  if (!fresh) args.push("--continue");
  return [...args, ...(options.extra ?? [])];
}

// A story with no persona and no scene is still being talked into being.
export function isBlank(story: Story): boolean {
  return !story.persona && story.scenes.length === 0;
}

// Claude Code keeps a story's sessions under ~/.claude/projects/<folder>, where
// <folder> is the absolute path with every character that is not a letter or
// digit turned into a dash (X:\a\.b -> X--a--b).
export function sessionsDir(storyDir: string, configDir = defaultConfigDir()): string {
  return path.join(configDir, "projects", storyDir.replace(/[^A-Za-z0-9]/g, "-"));
}

export async function hasSession(storyDir: string): Promise<boolean> {
  try {
    const names = await readdir(sessionsDir(storyDir));
    return names.some((n) => n.endsWith(".jsonl"));
  } catch {
    return false;
  }
}

function defaultConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
}

function mcpConfig(story: Story, config: Config, options: LaunchOptions) {
  return {
    mcpServers: {
      world: {
        type: "stdio",
        command: "bun",
        args: [options.worldServer],
        env: {
          RP_STORY: story.dir,
          ...(options.library ? { RP_LIBRARY: options.library } : {}),
          RP_CONFIG: JSON.stringify(config),
        },
      },
    },
  };
}

function sessionSettings(config: Config) {
  const statusLineFile = posixPath(path.join(pluginDir, "statusline.ts"));
  return {
    permissions: { allow: ["mcp__world", ...modelTools] },
    // The plugin's hooks are the stage and the lorebook; a player's global
    // disableAllHooks must not switch them off for a story session.
    disableAllHooks: false,
    // Panes dock only in the fullscreen layout; on the main screen the scene
    // pane lands inline above the prompt. The player's own tui setting is not
    // read (the user settings layer stays out), so the session sets it.
    tui: "fullscreen",
    // The story's status line (spec 10) replaces the player's coding one for
    // this session only: --settings outranks their settings.json.
    statusLine: { type: "command", command: `bun "${statusLineFile}"` },
    // The session does not read the player's settings.json, where Claude
    // Code keeps the plugin's options (spec 12a), so the mod gets the values
    // the launcher already resolved. A change made in /config mid-session is
    // written to settings.json and applies from the next launch.
    pluginConfigs: { [`${pluginName}@inline`]: { options: pluginOptions(config) } },
  };
}

// The userConfig shape: every field set, narratorModel "" for the engine default.
function pluginOptions(config: Config): Record<string, unknown> {
  return { ...config, narratorModel: config.narratorModel ?? "" };
}

export async function launch(story: Story, options: LaunchOptions = {}): Promise<number> {
  const config = await loadConfig();
  const generated = await generate(story);
  const worldServer = (await Bun.file(worldServerFile).exists()) ? worldServerFile : undefined;
  if (!worldServer) {
    process.stderr.write(`warning: ${worldServerFile} not found; starting without world tools\n`);
  }
  const library = process.env.RP_LIBRARY;
  const args = claudeArgs(story, generated, config, {
    ...options,
    worldServer,
    library,
    hasSession: await hasSession(story.dir),
  });
  const proc = Bun.spawn(["claude", ...args], {
    cwd: story.dir,
    stdio: ["inherit", "inherit", "inherit"],
    env: {
      ...process.env,
      // Auto memory is the coding assistant's notebook; the story keeps its own files.
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      RP_CONFIG: JSON.stringify(config),
      RP_STORY: story.dir,
    },
  });
  return proc.exited;
}
