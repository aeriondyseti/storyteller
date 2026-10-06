import type { Register } from "claude-code";
import { registerCodex } from "./stage/codex.tsx";
import { registerCommands } from "./stage/commands.ts";
import { registerDirectives } from "./stage/directives.tsx";
import { registerQuiet } from "./stage/quiet.ts";
import { registerScene } from "./stage/scene.tsx";
import { registerVoice } from "./stage/voice.tsx";

// The stage (spec 10): the scene pane and what keeps it
// current (stage/scene.tsx); the quiet line, spinner and reply styling
// (stage/voice.tsx); quieting of coding reminders (stage/quiet.ts) and of the
// slash command menu (stage/commands.ts); and the directives pane
// (stage/directives.tsx, spec 12); the codex pane and the glossary data its
// links draw from (stage/codex.tsx, spec 20.13). The status line is a settings
// command, plugin/statusline.ts, wired by the launcher.
// Every drawing hook falls back to the engine's own when it has nothing better,
// and the engine skips a hook that throws and draws its own.
export const registerStage: Register = (on, options) => {
  registerScene(on, options);
  registerVoice(on, options);
  registerQuiet(on, options);
  registerCommands(on, options);
  registerDirectives(on, options);
  registerCodex(on, options);
};
