import { describe, expect, test } from "bun:test";
import {
  contextPercent,
  resolveSource,
  type StatusInput,
  type StoryFacts,
  sourceTable,
  statusSources,
} from "./status-sources.ts";
import { fixtures } from "./testing/fixtures.ts";

// A real payload from Claude Code 2.1.290 after one reply on a Max plan,
// paths and ids replaced.
const captured: StatusInput = await Bun.file(`${fixtures}/statusline-input.json`).json();

// The same session's first payload, before any reply: no rate_limits yet and
// a null percentage.
const first: StatusInput = {
  model: { id: "claude-opus-5-5", display_name: "Opus 5.5" },
  context_window: { used_percentage: null, total_input_tokens: 0, context_window_size: 1000000 },
};

const facts: StoryFacts = {
  storyTitle: "The Hollow Crown",
  sceneNumber: 1,
  sceneTitle: "Arrival",
  persona: "Corwin Hale",
  register: "copilot",
  notesAgo: 2,
  log: "pending",
};

describe("Claude Code sources", () => {
  test("from a captured payload", () => {
    expect(resolveSource("session.context_pct", captured, {})).toBe(4);
    expect(resolveSource("session.model", captured, {})).toBe("Opus 5.5");
    expect(resolveSource("session.model_effort", captured, {})).toBe("Opus 5.5 (high)");
    expect(resolveSource("usage.session_pct", captured, {})).toBe(14);
    expect(resolveSource("usage.weekly_pct", captured, {})).toBe(36);
  });

  test("absent before the first reply, and on plans without rate limits", () => {
    expect(resolveSource("session.context_pct", first, {})).toBeUndefined();
    expect(resolveSource("usage.session_pct", first, {})).toBeUndefined();
    expect(resolveSource("usage.weekly_pct", {}, {})).toBeUndefined();
    expect(resolveSource("session.model", {}, {})).toBeUndefined();
  });

  test("model and effort: the model alone without an effort, the id without a name", () => {
    expect(resolveSource("session.model_effort", first, {})).toBe("Opus 5.5");
    expect(
      resolveSource(
        "session.model_effort",
        { model: { id: "claude-opus-5-5" }, effort: { level: "medium" } },
        {},
      ),
    ).toBe("claude-opus-5-5 (medium)");
    expect(
      resolveSource("session.model_effort", { effort: { level: "high" } }, {}),
    ).toBeUndefined();
  });

  test("context percent falls back to the token counts", () => {
    expect(contextPercent({ context_window: { used_percentage: 33.6 } })).toBe(34);
    expect(
      contextPercent({
        context_window: { total_input_tokens: 50_000, context_window_size: 200_000 },
      }),
    ).toBe(25);
  });
});

describe("story and state sources", () => {
  test("every one", () => {
    const value = (name: string) => resolveSource(name, {}, facts);
    expect(value("story.title")).toBe("The Hollow Crown");
    expect(value("scene")).toBe("Scene 1: Arrival");
    expect(value("scene.number")).toBe(1);
    expect(value("scene.title")).toBe("Arrival");
    expect(value("persona.name")).toBe("Corwin Hale");
    expect(value("turn.register")).toBe("copilot");
    expect(value("notes.age")).toBe(2);
    expect(value("log.ok")).toBe("…");
    expect(value("narrator")).toBe("Vex (copilot)");
  });

  test("unknowns: register defaults to narrator, notes that never ran say never", () => {
    expect(resolveSource("turn.register", {}, {})).toBe("narrator");
    expect(resolveSource("narrator", {}, {})).toBe("Vex (narrator)");
    expect(resolveSource("narrator", {}, { storyteller: "Mara" })).toBe("Mara (narrator)");
    expect(resolveSource("notes.age", {}, { notesAgo: null })).toBe("never");
    expect(resolveSource("notes.age", {}, {})).toBeUndefined();
    expect(resolveSource("scene", {}, {})).toBeUndefined();
    expect(resolveSource("log.ok", {}, {})).toBeUndefined();
    expect(resolveSource("nope", {}, facts)).toBeUndefined();
  });
});

test("the catalog table lists every source once", () => {
  const table = sourceTable();
  for (const s of statusSources) expect(table).toContain(`| \`${s.name}\` |`);
  expect(new Set(statusSources.map((s) => s.name)).size).toBe(statusSources.length);
});
