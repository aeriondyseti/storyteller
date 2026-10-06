import type { EngineInterface, Register } from "claude-code";
import { keepSkillEntries } from "./text.ts";

// Quieting (spec 10). The launcher already leaves the player's user layer
// (~/.claude: settings, plugins, skills, agents) out of a story session with
// --setting-sources project,local, so no user-level or third-party command or
// skill loads. What is left that is not ours is the engine's own: built-in
// commands, bundled skills and the built-in plugins' skills, mostly for
// coding. This hides those from the menu, except the short list below.
// Kept as well: what our plugin ships and what the project layer brings
// (~/.storyteller/.claude or the story's own .claude).
// The same rule trims the skill listing the model reads, so the Skill tool
// offers the Storyteller its own procedures (plugin/skills) and project
// skills, never a coding one. Agent types need no hook: the Storyteller has
// no Agent tool.
//
// Naming: everything of ours is reached under `storyteller:`
// (/storyteller:recap), and a built-in's name is never shadowed. Skills get
// the prefix from the plugin. The stage's own commands, /storyteller:scene
// and /storyteller:directives, cannot come from $.command.register: it takes
// letters, digits, _ and - only, no colon (and refuses a built-in's name).
// So each is a plugin command file (plugin/commands/*.md), prefixed by the
// plugin like a skill, and a command.run hook in the stage answers it before
// its text would reach the model; that text is only a fallback for when the
// mod is not loaded.

// Built-in commands a story session keeps in the menu: session housekeeping
// (clear, compact, resume, rename, rewind, exit, quit), settings (config,
// model, effort), and help when something is wrong (help, status, cost,
// doctor). memory is not here: auto memory is off for stories.
export const shownBuiltins: readonly string[] = [
  "clear",
  "compact",
  "config",
  "cost",
  "doctor",
  "effort",
  "exit",
  "help",
  "model",
  "quit",
  "rename",
  "resume",
  "rewind",
  "status",
];

const ours = "storyteller";

// `provider` is the engine's name for who provides a command: "engine" for a
// built-in, "project" for the project layer, a plugin's name otherwise (ours
// arrives as "storyteller@inline" from --plugin-dir).
export function isShown(name: string, provider: string): boolean {
  if (provider === ours || provider.startsWith(`${ours}@`)) return true;
  if (provider === "project") return true;
  return provider === "engine" && shownBuiltins.includes(name);
}

// What the Storyteller reads in place of a hidden skill a player types in full.
export function hiddenSkillText(skill: string): string {
  return `The player typed /${skill}, which is not part of a story session. Say so in one short out-of-character line and carry on with the story.`;
}

export const registerCommands: Register = (on) => {
  // Hidden from the typeahead and /help. A hidden command still runs when
  // typed in full, which is why skills are answered again below.
  on("command.describe", (_$, e, next) =>
    isShown(e.command, e.provider.plugin) ? next(e) : next({ ...e, isHidden: true }),
  );

  // A bundled skill typed in full (/simplify) would hand the Storyteller a
  // coding task. This event names no provider, so the command list tells it.
  // This fires for the Skill tool too, so a coding skill the model names
  // anyway gets the same answer.
  on("skill.prompt", async ($, e, next) => {
    const providers = await skillProviders($);
    return isShown(e.skill, providers(e.skill)) ? next(e) : { text: hiddenSkillText(e.skill) };
  });

  // The listing of skills the Skill tool offers, which spec 10 used to drop
  // whole; now it keeps what isShown keeps.
  on(
    "prompt.attachment",
    { type: "skill_listing", origin: { kind: "engine" } },
    async ($, e, next) => {
      const providers = await skillProviders($);
      const text = keepSkillEntries(e.text, (name) => isShown(name, providers(name)));
      return text === null ? { text: null } : next({ ...e, text });
    },
  );
};

// Who provides each skill, by name. The command list says `user` for a skill
// from a settings folder; with the user layer left out, that folder is the
// project layer. Ours go by their `storyteller:` prefix, because a skill the
// player cannot invoke (user-invocable: false) is not in the command list.
async function skillProviders($: EngineInterface): Promise<(skill: string) => string> {
  const commands = await $.command.list();
  return (skill) => {
    if (skill.startsWith(`${ours}:`)) return ours;
    const command = commands.find((c) => c.name === skill);
    if (command?.source === "user") return "project";
    if (command?.source === "plugin") return command.plugin ?? "plugin";
    return "engine";
  };
}
