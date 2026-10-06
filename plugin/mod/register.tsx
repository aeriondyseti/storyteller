import type { Register } from "claude-code";
import { registerNotes } from "./notes.ts";
import { registerStage } from "./stage.tsx";

// The plugin's function-hooks module (a Claude Code "mod"). Two concerns, two
// files: notes.ts keeps the scene notes current in the background (spec 7.2);
// stage.tsx draws the pane, labels and quiet lines (spec 10). This file only
// wires them so each can be owned and tested on its own.
export const register: Register = (on, options) => {
  registerNotes(on, options);
  registerStage(on, options);
};
