// The status line's source catalog (spec 19.5): every value a status line
// widget can show, by name. Three inputs feed it: the JSON Claude Code hands
// the statusLine command on stdin, the story on disk, and the hooks' record
// in .rp/state.json plus the transcript. plugin/statusline.ts gathers the
// last two into StoryFacts; this file only maps names to values, so it is
// pure and spec 19.5 can print the catalog from the same data.

import type { WidgetType } from "./widgets.ts";

// The fields of Claude Code's status line input we read (code.claude.com/docs
// /en/statusline). `rate_limits` is there only for claude.ai Pro and Max
// subscribers, after the session's first reply, and each window may be
// missing on its own; `used_percentage` may be null early in a session.
export type StatusInput = {
  cwd?: string;
  transcript_path?: string;
  model?: { id?: string; display_name?: string };
  effort?: { level?: string };
  context_window?: {
    used_percentage?: number | null;
    total_input_tokens?: number;
    context_window_size?: number;
  };
  rate_limits?: {
    five_hour?: { used_percentage?: number | null; resets_at?: number };
    seven_day?: { used_percentage?: number | null; resets_at?: number };
  };
};

// ✓ the last finished exchange was logged; … the current one is still going
// (or its Stop hook has not run yet); ✗ an exchange went by unlogged.
export type LogHealth = "logged" | "pending" | "missed";

// What the story and the hooks' record say; every part may be unknown.
export type StoryFacts = {
  storyTitle?: string | undefined;
  // story.md storyteller.name: Vex unless the story renames it.
  storyteller?: string | undefined;
  sceneNumber?: number | undefined;
  sceneTitle?: string | undefined;
  persona?: string | undefined;
  register?: string | undefined;
  // Turns since the notes job last rewrote the notes; null when it never has.
  notesAgo?: number | null | undefined;
  log?: LogHealth | undefined;
};

// A percent is a number from 0 to 100: a meter shows it without a max.
export type SourceKind = "percent" | "number" | "text";

export type SourceValue = string | number | undefined;

export type SourceInfo = {
  name: string;
  kind: SourceKind;
  from: "Claude Code" | "story" | "state";
  description: string;
  resolve: (input: StatusInput, facts: StoryFacts) => SourceValue;
};

// Which widget types read well for each kind of source. A text source has no
// number to draw; a number has no ceiling unless the instance gives a max.
export const kindSuits: Record<SourceKind, WidgetType[]> = {
  percent: ["meter", "counter", "text"],
  number: ["counter", "meter", "clock", "text"],
  text: ["text", "list", "tags"],
};

const logMarks: Record<LogHealth, string> = { logged: "✓", pending: "…", missed: "✗" };

export const statusSources: readonly SourceInfo[] = [
  {
    name: "session.context_pct",
    kind: "percent",
    from: "Claude Code",
    description: "How full the context window is",
    resolve: (input) => contextPercent(input),
  },
  {
    name: "session.model",
    kind: "text",
    from: "Claude Code",
    description: "The model narrating, by its display name",
    resolve: (input) => modelName(input),
  },
  {
    name: "session.model_effort",
    kind: "text",
    from: "Claude Code",
    description: "The model and its effort level: Opus 5.5 (medium); the model alone without one",
    resolve: (input) => {
      const model = modelName(input);
      const effort = input.effort?.level;
      return model && effort ? `${model} (${effort})` : model;
    },
  },
  {
    name: "usage.session_pct",
    kind: "percent",
    from: "Claude Code",
    description: "Plan usage in the current five-hour window (Pro and Max plans)",
    resolve: (input) => percent(input.rate_limits?.five_hour?.used_percentage),
  },
  {
    name: "usage.weekly_pct",
    kind: "percent",
    from: "Claude Code",
    description: "Plan usage this week (Pro and Max plans)",
    resolve: (input) => percent(input.rate_limits?.seven_day?.used_percentage),
  },
  {
    name: "story.title",
    kind: "text",
    from: "story",
    description: "The story's title",
    resolve: (_, facts) => facts.storyTitle,
  },
  {
    name: "scene",
    kind: "text",
    from: "story",
    description: "The current scene's number and title: Scene 1: Arrival",
    resolve: (_, facts) =>
      facts.sceneNumber === undefined
        ? undefined
        : `Scene ${facts.sceneNumber}${facts.sceneTitle ? `: ${facts.sceneTitle}` : ""}`,
  },
  {
    name: "scene.number",
    kind: "number",
    from: "story",
    description: "The current scene's number",
    resolve: (_, facts) => facts.sceneNumber,
  },
  {
    name: "scene.title",
    kind: "text",
    from: "story",
    description: "The current scene's title",
    resolve: (_, facts) => facts.sceneTitle,
  },
  {
    name: "persona.name",
    kind: "text",
    from: "story",
    description: "The character you play",
    resolve: (_, facts) => facts.persona,
  },
  {
    name: "narrator",
    kind: "text",
    from: "state",
    description: "The Storyteller and the last prompt's register: Vex (narrator), Vex (copilot)",
    resolve: (_, facts) => `${facts.storyteller ?? "Vex"} (${facts.register ?? "narrator"})`,
  },
  {
    name: "turn.register",
    kind: "text",
    from: "state",
    description: "narrator or copilot: whether the last prompt was in the story or about it",
    // Before the first prompt, the register the next one has by default.
    resolve: (_, facts) => facts.register ?? "narrator",
  },
  {
    name: "notes.age",
    kind: "number",
    from: "state",
    description: "Turns since the notes were last rewritten (never, if they have not been)",
    resolve: (_, facts) => (facts.notesAgo === null ? "never" : facts.notesAgo),
  },
  {
    name: "log.ok",
    kind: "text",
    from: "state",
    description: "Whether the last exchange reached the scene log: ✓, … while a turn runs, ✗",
    resolve: (_, facts) => (facts.log ? logMarks[facts.log] : undefined),
  },
];

export function findSource(name: string): SourceInfo | undefined {
  return statusSources.find((s) => s.name === name);
}

export function resolveSource(name: string, input: StatusInput, facts: StoryFacts): SourceValue {
  return findSource(name)?.resolve(input, facts);
}

// The catalog as a table, as spec 19.5 holds it (a test compares).
export function sourceTable(): string {
  const rows = statusSources.map(
    (s) => `| \`${s.name}\` | ${s.description} | ${kindSuits[s.kind].join(", ")} |`,
  );
  return ["| source | what it shows | widget types |", "|---|---|---|", ...rows].join("\n");
}

export function contextPercent(input: StatusInput): number | undefined {
  const cw = input.context_window;
  if (!cw) return undefined;
  if (typeof cw.used_percentage === "number") return Math.round(cw.used_percentage);
  if (cw.total_input_tokens && cw.context_window_size) {
    return Math.round((cw.total_input_tokens / cw.context_window_size) * 100);
  }
  return undefined;
}

function modelName(input: StatusInput): string | undefined {
  return input.model?.display_name || input.model?.id || undefined;
}

function percent(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}
