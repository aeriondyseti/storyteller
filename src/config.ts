import os from "node:os";
import path from "node:path";

// Configuration, spec 12a. The single source of truth is the plugin's
// userConfig, stored by Claude Code in settings.json under
// pluginConfigs["storyteller"].options. The mod receives it as `options`;
// hooks and the world server read it here, or from RP_CONFIG when the
// launcher has already resolved it. Add a field here, in the manifest, and in
// the spec table in one commit.

// Names starting with "claude-" are reserved by Claude Code, so the plugin is
// "storyteller" even though the repo is claude-roleplay.
export const pluginName = "storyteller";

export type Config = {
  notesEvery: number;
  notesModel: string;
  narratorModel: string | undefined;
  narratorEffort: "low" | "medium" | "high" | "xhigh" | "max";
  embeddings: "local" | "hosted";
  paneOnStart: boolean;
  contextBudget: number;
  loreBudget: number;
  loreScanDepth: number;
};

export const defaultConfig: Config = {
  notesEvery: 1,
  notesModel: "haiku",
  narratorModel: undefined,
  narratorEffort: "high",
  embeddings: "local",
  paneOnStart: true,
  contextBudget: 0.25,
  loreBudget: 0.1,
  loreScanDepth: 3,
};

export function settingsFile(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
  return path.join(configDir, "settings.json");
}

// RP_CONFIG wins (the launcher resolved it once for the whole session), then
// settings.json, then defaults. Unknown or malformed values fall back silently:
// a bad setting should never stop a story from opening.
export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  if (env.RP_CONFIG) return withDefaults(parseJson(env.RP_CONFIG));
  return withDefaults(await readPluginOptions(settingsFile()));
}

export async function readPluginOptions(file: string): Promise<Record<string, unknown>> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return {};
  const settings = parseJson(await handle.text());
  const configs = asRecord(settings.pluginConfigs);
  const mine = asRecord(configs[pluginName] ?? configs[`${pluginName}@inline`]);
  return asRecord(mine.options);
}

export function withDefaults(raw: Record<string, unknown>): Config {
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T =>
    all.includes(v as T) ? (v as T) : d;
  return {
    notesEvery: Math.max(1, Math.floor(num(raw.notesEvery, defaultConfig.notesEvery))),
    notesModel: str(raw.notesModel) ?? defaultConfig.notesModel,
    narratorModel: str(raw.narratorModel),
    narratorEffort: oneOf(
      raw.narratorEffort,
      ["low", "medium", "high", "xhigh", "max"] as const,
      defaultConfig.narratorEffort,
    ),
    embeddings: oneOf(raw.embeddings, ["local", "hosted"] as const, defaultConfig.embeddings),
    paneOnStart: typeof raw.paneOnStart === "boolean" ? raw.paneOnStart : defaultConfig.paneOnStart,
    contextBudget: num(raw.contextBudget, defaultConfig.contextBudget),
    loreBudget: Math.min(1, Math.max(0, num(raw.loreBudget, defaultConfig.loreBudget))),
    loreScanDepth: Math.max(0, Math.floor(num(raw.loreScanDepth, defaultConfig.loreScanDepth))),
  };
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
