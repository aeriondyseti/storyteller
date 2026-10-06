import { describe, expect, test } from "bun:test";
import { readLog } from "../../../src/log.ts";
import { loadStory } from "../../../src/story.ts";
import { blankDir, copyStory, fixtureLibrary, saltmereDir } from "../../../src/testing/fixtures.ts";
import { buildPreviously, rebuildAfterCompaction, sessionStart } from "./session-start.ts";
import { readState, writeState } from "./state.ts";

const options = { libraryRoot: fixtureLibrary };

describe("buildPreviously", () => {
  test("heading, state header, Now, Notes, then the last turns", async () => {
    const story = await loadStory(saltmereDir, options);
    const turns = await readLog(story.scene?.logPath ?? "");
    const text = buildPreviously(story, turns) ?? "";
    expect(text.startsWith("Previously, from the record:\n\n[scene 3: The Tallow Stair")).toBe(
      true,
    );
    expect(text).toContain(
      "## Now\n\nThe tide is coming in. Mira waits on the stair with a lantern.",
    );
    expect(text).toContain("## Notes\n\n- Mira suspects Corwin of carrying the map.");
    expect(text).toContain(
      "## Last turns\n\nPlayer: I climb the stair.\n\nVex: *The Tallow Stair, an hour before dawn.*",
    );
    expect(text.endsWith('Player: "You waited."\n\nVex: "Someone had to."')).toBe(true);
  });

  test("nothing for a story with no scene", async () => {
    expect(buildPreviously(await loadStory(blankDir, options), [])).toBeUndefined();
  });
});

const pactInjection = { ref: "lore/the-pact", turn: 8, hash: "h", chars: 60 };

describe("rebuildAfterCompaction", () => {
  const config = { loreBudget: 0.1, loreScanDepth: 3 };
  const fresh = { turn: 9, injections: [pactInjection], lastLogged: undefined };

  test("re-injects lore the scene state names and always-on lore scoped to it", async () => {
    const dir = await copyStory(saltmereDir);
    await Bun.write(
      `${dir}/lore/the-stair.md`,
      "---\ntitle: The Tallow Stair\nkeys: [Tallow Stair]\n---\n\nSteep and greasy.\n",
    );
    await Bun.write(
      `${dir}/lore/miras-oath.md`,
      "---\ntitle: Mira's oath\nalways: true\nscope: character:mira\n---\n\nShe swore on the bells.\n\n## Secret\n\nShe lied.\n",
    );
    const story = await loadStory(dir, options);
    const { state, lore } = rebuildAfterCompaction(story, fresh, config);
    expect(lore).toBe(
      [
        "",
        "Lore in play:",
        "",
        "### The tide-bells",
        "",
        "Thirteen bells hang in the drowned belfry. They ring before deaths.",
        "",
        "### The Tallow Stair",
        "",
        "Steep and greasy.",
        "",
        "### Mira's oath",
        "",
        "She swore on the bells.",
      ].join("\n"),
    );
    // Ranked by priority (the bells have 5), and the Secret never goes in.
    expect(state.injections.map((i) => [i.ref, i.turn])).toEqual([
      ["lore/tide-bells", 9],
      ["lore/the-stair", 9],
      ["lore/miras-oath", 9],
    ]);
    expect(state.activation?.fired.map((f) => f.why)).toEqual([
      'recursion via lore/miras-oath ("bells")',
      'scene "Tallow Stair"',
      "always (character:mira)",
    ]);
  });

  test("stays within the budget", async () => {
    const story = await loadStory(saltmereDir, options);
    const tight = rebuildAfterCompaction(story, fresh, { ...config, loreBudget: 0 });
    expect(tight.lore).toBe("");
    expect(tight.state.injections).toEqual([]);
  });
});

describe("sessionStart", () => {
  test("injects the record after a compaction and clears the activation record", async () => {
    const dir = await copyStory(saltmereDir);
    await writeState(dir, {
      turn: 9,
      injections: [pactInjection],
      lastLogged: "u1",
      inForce: { "directives/stale": "0" },
      keyedHashes: {},
      sessionId: "s1",
    });
    const out = JSON.parse(
      (await sessionStart({ cwd: dir, session_id: "s1", source: "compact" }, options)) ?? "{}",
    );
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toContain("Previously, from the record:");
    const state = await readState(dir);
    expect(state).toMatchObject({ turn: 9, injections: [], lastLogged: "u1", sessionId: "s1" });
    // The bible was just re-read: the directive record is the current set.
    expect(Object.keys(state.inForce ?? {})).toEqual(["directives/noir", "directives/boundaries"]);
    expect(Object.keys(state.keyedHashes ?? {})).toEqual(["directives/slow-burn"]);
  });

  test("injects on resume, keeping the activation record", async () => {
    const dir = await copyStory(saltmereDir);
    await writeState(dir, { turn: 9, injections: [pactInjection], lastLogged: "u1" });
    expect(await sessionStart({ cwd: dir, source: "resume" }, options)).toContain("Previously");
    expect((await readState(dir)).injections).toEqual([pactInjection]);
  });

  test("nothing on startup or clear", async () => {
    expect(await sessionStart({ cwd: saltmereDir, source: "startup" }, options)).toBeUndefined();
    expect(await sessionStart({ cwd: saltmereDir, source: "clear" }, options)).toBeUndefined();
  });
});
