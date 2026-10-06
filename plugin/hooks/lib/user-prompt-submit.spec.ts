import { describe, expect, test } from "bun:test";
import { fakeEmbedder } from "../../../server/index/fake-embedder.ts";
import { StoryIndex } from "../../../server/index/index.ts";
import type { Turn } from "../../../src/log.ts";
import { loadStory } from "../../../src/story.ts";
import {
  blankDir,
  copyStory,
  fixtureLibrary,
  saltmereDir,
  tempDir,
} from "../../../src/testing/fixtures.ts";
import { type HookState, readState, writeState } from "./state.ts";
import {
  buildPromptContext,
  newSuggestions,
  semanticQueries,
  userPromptSubmit,
} from "./user-prompt-submit.ts";

const fresh: HookState = { turn: 0, injections: [], lastLogged: undefined };
const load = (dir: string) => loadStory(dir, { libraryRoot: fixtureLibrary });
const half = (n: number, speaker: Turn["speaker"], text: string): Turn => ({
  n,
  speaker,
  name: speaker === "player" ? "Corwin Hale" : "Vex",
  register: "narrator",
  at: "",
  uuid: "",
  text,
});

describe("buildPromptContext", () => {
  test("register tag, then the state header, then activated entries", async () => {
    const story = await load(saltmereDir);
    const { context, state } = buildPromptContext(story, "I listen for the bells.", [], fresh);
    const lines = context.split("\n");
    expect(lines[0]).toBe("[register: narrator]");
    expect(lines[1]).toBe(
      "[scene 3: The Tallow Stair · The Tallow Stair, Saltmere · an hour before dawn · present: Mira Vane, Edda]",
    );
    expect(context).toContain(
      "Lore in play:\n\n### The tide-bells\n\nThirteen bells hang in the drowned belfry. They ring before deaths.",
    );
    expect(context).not.toContain("Directives in play:");
    expect(state).toMatchObject({ turn: 1, lastLogged: undefined });
    expect(state.injections.map((i) => [i.ref, i.turn])).toEqual([["lore/tide-bells", 1]]);
  });

  test("matches keys in the recent turns as well as the prompt", async () => {
    const story = await load(saltmereDir);
    const recent = [half(1, "player", "A kiss?"), half(1, "storyteller", "No.")];
    const { context } = buildPromptContext(story, "(( go on ))", recent, fresh);
    expect(context.split("\n")[0]).toBe("[register: copilot]");
    expect(context).toContain("Directives in play:\n\n### Slow burn\n\nLet attraction build");
  });

  test("does not repeat an entry within the cooldown", async () => {
    const story = await load(saltmereDir);
    const first = buildPromptContext(story, "The bells.", [], { ...fresh, turn: 1 });
    const state: HookState = { ...first.state, lastLogged: "x" };
    const result = buildPromptContext(story, "The bells again.", [], state);
    expect(result.context).not.toContain("Lore in play:");
    expect(result.state).toMatchObject({ turn: 3, lastLogged: "x" });
    expect(result.state.injections).toEqual(first.state.injections);
    expect(result.state.activation?.cut).toEqual([
      { ref: "lore/tide-bells", reason: "in context (turn 2)" },
    ]);
  });

  test("a sample turn: key, scene state, recursion, an updated entry, discovery tags", async () => {
    const dir = await copyStory(saltmereDir);
    await Bun.write(
      `${dir}/lore/the-stair.md`,
      "---\ntitle: The Tallow Stair\nkeys: [Tallow Stair]\n---\n\nNinety-one greasy steps from the fish docks.\n",
    );
    await Bun.write(
      `${dir}/lore/belfry.md`,
      "---\ntitle: The drowned belfry\nkeys: [belfry]\n---\n\nHalf under water at high tide; boats tie up to the louvres.\n\n## Secret\n\nThe thirteenth bell was never cast.\n",
    );
    const story = await load(dir);
    const state: HookState = {
      ...fresh,
      turn: 4,
      injections: [{ ref: "lore/the-pact", turn: 3, hash: "before-the-edit", chars: 80 }],
    };
    const { context, state: next } = buildPromptContext(
      story,
      "I ring the bells and ask Mira about the pact.",
      [],
      state,
    );
    expect(context.split("\n").slice(2).join("\n")).toBe(
      [
        "",
        "Lore in play:",
        "",
        "### The tide-bells",
        "",
        "Thirteen bells hang in the drowned belfry. They ring before deaths.",
        "",
        "### The Pact (Saltmere version) (updated)",
        "",
        "In Saltmere, the pact was sealed with a bell, not blood.",
        "",
        "### The Tallow Stair (unknown to Corwin Hale)",
        "",
        "Ninety-one greasy steps from the fish docks.",
        "",
        "### The drowned belfry (unknown to Corwin Hale)",
        "",
        "Half under water at high tide; boats tie up to the louvres.",
        "",
        "Secret (unknown to Corwin Hale):",
        "The thirteenth bell was never cast.",
      ].join("\n"),
    );
    expect(next.activation).toEqual({
      turn: 5,
      fired: [
        { ref: "lore/tide-bells", why: 'key "bells"' },
        { ref: "lore/the-pact", why: 'key "pact", updated' },
        { ref: "lore/the-stair", why: 'scene "Tallow Stair"' },
        { ref: "lore/belfry", why: 'recursion via lore/tide-bells ("belfry")' },
      ],
      cut: [],
    });
    expect(next.injections.map((i) => [i.ref, i.turn])).toEqual([
      ["lore/the-pact", 3],
      ["lore/tide-bells", 5],
      ["lore/the-pact", 5],
      ["lore/the-stair", 5],
      ["lore/belfry", 5],
    ]);
  });

  test("a blank story gets the tag and the no-scene header only", async () => {
    const story = await load(blankDir);
    const { context } = buildPromptContext(
      story,
      "[register: copilot] [new story] Begin.",
      [],
      fresh,
    );
    expect(context).toBe("[register: copilot]\n[scene: none open yet]");
  });
});

describe("userPromptSubmit", () => {
  test("outputs additionalContext and records the activation", async () => {
    const dir = await copyStory(saltmereDir);
    const out = await userPromptSubmit(
      { cwd: dir, prompt: "I ask about the pact." },
      { libraryRoot: fixtureLibrary },
    );
    const parsed = JSON.parse(out ?? "{}");
    expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "### The Pact (Saltmere version)",
    );
    const state = await readState(dir);
    expect(state).toMatchObject({ turn: 1, lastLogged: undefined });
    // The pact's text names a bell, which wakes the tide-bells.
    expect(state.injections.map((i) => i.ref)).toEqual(["lore/tide-bells", "lore/the-pact"]);
  });

  test("activates by meaning when the story has an index", async () => {
    const dir = await copyStory(saltmereDir);
    // No key of the tide-bells entry ("bell", "bells", "tide-bell") is named.
    const prompt = {
      cwd: dir,
      prompt: "Thirteen hang in the drowned belfry. They ring before deaths.",
    };
    const embedder = fakeEmbedder();
    const keywordOnly = await userPromptSubmit(prompt, { libraryRoot: fixtureLibrary, embedder });
    expect(keywordOnly).not.toContain("### The tide-bells");

    const index = StoryIndex.open(dir, embedder);
    await index.indexStory(await load(dir));
    index.close();
    const out = await userPromptSubmit(prompt, { libraryRoot: fixtureLibrary, embedder });
    expect(out).toContain("### The tide-bells");
  });

  test("semanticQueries: the prompt, then the last exchange", () => {
    const recent = [
      half(1, "player", "old"),
      half(1, "storyteller", "older"),
      half(2, "storyteller", "The door opens."),
    ];
    expect(semanticQueries("I wait.", recent)).toEqual(["I wait.", "The door opens."]);
    const both = [...recent, half(3, "player", "I knock."), half(3, "storyteller", "No one.")];
    expect(semanticQueries("I wait.", both)).toEqual(["I wait.", "I knock.\n\nNo one."]);
    expect(semanticQueries("I wait.", [])).toEqual(["I wait."]);
  });

  test("stays silent outside a story folder", async () => {
    expect(await userPromptSubmit({ cwd: await tempDir(), prompt: "hi" })).toBeUndefined();
  });
});

describe("lore suggestions (spec 20.11)", () => {
  const options = { libraryRoot: fixtureLibrary };
  const line =
    "Names that keep coming up with no lore or card: Old Tom, Gull Rock. Record them if they matter.";

  test("newSuggestions: not yet suggested, no entry title or key, no card; any case", async () => {
    const story = await load(saltmereDir);
    const suggest = [
      "Old Tom",
      "mira vane",
      "SALTMERE",
      "Tide-Bell",
      "Gull Rock",
      "old tom",
      "Ada",
    ];
    expect(newSuggestions(story, suggest, ["ada"])).toEqual(["Old Tom", "Gull Rock"]);
    expect(newSuggestions(story, [], [])).toEqual([]);
  });

  test("delivered once, after the lore, and remembered in suggested", async () => {
    const story = await load(saltmereDir);
    const state: HookState = { ...fresh, suggest: ["Old Tom", "Gull Rock"], suggested: ["Ada"] };
    const first = buildPromptContext(story, "I wait.", [], state);
    expect(first.context.endsWith(`\n\n${line}`)).toBe(true);
    expect(first.state.suggested).toEqual(["Ada", "Old Tom", "Gull Rock"]);
    const second = buildPromptContext(story, "I wait.", [], first.state);
    expect(second.context).not.toContain("Names that keep coming up");
    expect(second.state.suggested).toEqual(["Ada", "Old Tom", "Gull Rock"]);
  });

  test("the hook reads suggest from state.json and never writes it back", async () => {
    const dir = await copyStory(saltmereDir);
    await Bun.write(
      `${dir}/.rp/state.json`,
      JSON.stringify({
        suggest: ["Old Tom", "Gull Rock"],
        nameTally: { "Old Tom": 2 },
        notesTurn: 4,
      }),
    );
    const out = await userPromptSubmit({ cwd: dir, prompt: "I wait." }, options);
    expect(JSON.parse(out ?? "{}").hookSpecificOutput.additionalContext).toContain(line);
    const saved = JSON.parse(await Bun.file(`${dir}/.rp/state.json`).text());
    expect(saved).toMatchObject({
      suggest: ["Old Tom", "Gull Rock"],
      suggested: ["Old Tom", "Gull Rock"],
      nameTally: { "Old Tom": 2 },
      notesTurn: 4,
    });
    const again = await userPromptSubmit({ cwd: dir, prompt: "I wait." }, options);
    expect(again).not.toContain("Names that keep coming up");
  });

  test("writeState keeps the mod's newer suggest over the copy it read", async () => {
    const dir = await tempDir();
    const state = { ...(await readState(dir)), suggest: ["Stale"] };
    await Bun.write(`${dir}/.rp/state.json`, JSON.stringify({ suggest: ["Fresh"] }));
    await writeState(dir, state);
    expect((await readState(dir)).suggest).toEqual(["Fresh"]);
  });
});

describe("directive deltas", () => {
  const options = { libraryRoot: fixtureLibrary };
  const fadeOn =
    "---\ntitle: Fade to black\nmode: manual\non: true\n---\n\nCut away from intimate scenes.\n";
  const submit = async (dir: string, session: string, prompt = "I wait.") => {
    const out = await userPromptSubmit({ cwd: dir, session_id: session, prompt }, options);
    return String(JSON.parse(out ?? "{}").hookSpecificOutput.additionalContext);
  };

  test("first turn records the set; a toggle on is injected once, after the header", async () => {
    const dir = await copyStory(saltmereDir);
    expect(await submit(dir, "s1")).not.toContain("Directives changed");
    const state = await readState(dir);
    expect(state.sessionId).toBe("s1");
    expect(Object.keys(state.inForce ?? {})).toEqual(["directives/noir", "directives/boundaries"]);
    expect(Object.keys(state.keyedHashes ?? {})).toEqual(["directives/slow-burn"]);

    await Bun.write(`${dir}/directives/fade.md`, fadeOn);
    const lines = (await submit(dir, "s1")).split("\n");
    expect(lines[0]).toBe("[register: narrator]");
    expect(lines[1]?.startsWith("[scene 3:")).toBe(true);
    expect(lines.slice(2).join("\n")).toBe(
      [
        "",
        "Directives changed since the bible was written:",
        "Now in force: Fade to black, Noir, Boundaries.",
        "",
        "### Fade to black (manual)",
        "",
        "Cut away from intimate scenes.",
      ].join("\n"),
    );
    expect(await submit(dir, "s1")).not.toContain("Directives changed");
  });

  test("a new session starts the record over without a block", async () => {
    const dir = await copyStory(saltmereDir);
    await submit(dir, "s1");
    await Bun.write(`${dir}/directives/fade.md`, fadeOn);
    expect(await submit(dir, "s2")).not.toContain("Directives changed");
    expect((await readState(dir)).sessionId).toBe("s2");
  });

  test("an edited keyed directive skips its cooldown once", async () => {
    const dir = await copyStory(saltmereDir);
    expect(await submit(dir, "s1", "A kiss?")).toContain("Let attraction build");
    expect(await submit(dir, "s1", "Another kiss?")).not.toContain("Directives in play:");
    await Bun.write(
      `${dir}/directives/slow-burn.md`,
      "---\ntitle: Slow burn\nmode: keyed\nkeys: [kiss, romance]\n---\n\nLet it simmer.\n",
    );
    const edited = await submit(dir, "s1", "A third kiss?");
    expect(edited).toContain("Directives in play:\n\n### Slow burn (updated)\n\nLet it simmer.");
    expect(edited).not.toContain("Directives changed");
    expect(await submit(dir, "s1", "And a fourth kiss?")).not.toContain("Directives in play:");
  });
});
