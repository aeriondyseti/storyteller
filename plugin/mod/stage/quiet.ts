import type { Register } from "claude-code";
import { codingAttachments, withoutUserInstructions } from "./text.ts";

// Quieting (spec 10): engine reminders aimed at a coding session are left out
// of the Storyteller's requests. Only the engine's own text is touched; a
// settings hook's additional context (origin `hook`) always goes through.

export const registerQuiet: Register = (on) => {
  on("prompt.attachment", { type: codingAttachments, origin: { kind: "engine" } }, () => ({
    text: null,
  }));

  on("prompt.attachment", { type: "instructions", origin: { kind: "engine" } }, (_$, e, next) =>
    next({ ...e, text: withoutUserInstructions(e.text) }),
  );
};
