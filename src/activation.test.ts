import { describe, expect, test } from "bun:test";
import {
  type ActivationInput,
  type ActivationResult,
  activate,
  contentHash,
  loreBudgetChars,
  mentions,
  type SceneState,
  sceneStateOf,
} from "./activation.ts";
import { parseLoreFields, splitLoreBody } from "./lore.ts";
import { type Directive, type LoreEntry, loadStory } from "./story.ts";
import { fixtureLibrary, saltmereDir } from "./testing/fixtures.ts";

function lore(stem: string, data: Record<string, unknown> = {}, body = `${stem} body`): LoreEntry {
  return {
    ref: `lore/${stem}`,
    stem,
    path: `/s/lore/${stem}.md`,
    source: "story",
    book: undefined,
    // Known by default here, so costs are just heading and text.
    ...parseLoreFields({ title: stem, known: true, ...data }, stem),
    ...splitLoreBody(body),
  };
}

// The hash activation records for a lore entry: its details included.
const hashOf = (l: LoreEntry) => contentHash({ ...l, details: l });

function directive(stem: string, keys: string[], extra: Partial<Directive> = {}): Directive {
  return {
    ref: `directives/${stem}`,
    stem,
    path: `/s/directives/${stem}.md`,
    source: "story",
    body: `${stem} body`,
    title: stem,
    mode: "keyed",
    keys,
    on: true,
    ...extra,
  };
}

const input = (over: Partial<ActivationInput> = {}): ActivationInput => ({
  turn: 1,
  prompt: "",
  recent: [],
  scene: undefined,
  injections: [],
  ...over,
});

const refs = (r: ActivationResult) => r.entries.map((e) => e.ref);
const why = (r: ActivationResult, ref: string) => r.report.fired.find((f) => f.ref === ref)?.why;
const cutFor = (r: ActivationResult, ref: string) =>
  r.report.cut.find((c) => c.ref === ref)?.reason;
const only = (...lore: LoreEntry[]) => ({ lore, directives: [] });
const never = () => {
  throw new Error("random was not supposed to be drawn");
};
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

const lampHall: SceneState = {
  location: "The Lamp Hall, Varrow",
  time: "second dusk",
  present: [
    { stem: "mira", name: "Mira Vane" },
    { stem: "corwin", name: "Corwin Hale" },
  ],
};

describe("mentions", () => {
  test("matches case-insensitively on word boundaries", () => {
    expect(mentions("The BELL rang.", "bell")).toBe(true);
    expect(mentions("A bellows wheezed.", "bell")).toBe(false);
    expect(mentions("rebell", "bell")).toBe(false);
  });

  test("matches multi-word keys across any whitespace", () => {
    expect(mentions("before the crown\n  vote", "Crown Vote")).toBe(true);
    expect(mentions("crown, vote", "Crown Vote")).toBe(false);
  });

  test("handles keys with punctuation and non-ASCII letters", () => {
    expect(mentions("the tide-bell tolls", "tide-bell")).toBe(true);
    expect(mentions("Café du port", "café")).toBe(true);
    expect(mentions("cafés", "café")).toBe(false);
    expect(mentions("cost (in crowns)", "(in crowns)")).toBe(true);
  });

  test("an empty key never matches", () => {
    expect(mentions("anything", "  ")).toBe(false);
  });
});

describe("activate: matching", () => {
  test("selects keyed lore from the fixture story and records the injections", async () => {
    const story = await loadStory(saltmereDir, { libraryRoot: fixtureLibrary });
    const result = activate(
      story,
      input({ turn: 4, prompt: "I ask about the bells and the pact." }),
    );
    // Saltmere is always on (priority 10) and travels with every turn.
    expect(refs(result)).toEqual(["lore/saltmere", "lore/tide-bells", "lore/the-pact"]);
    const bells = story.lore.find((l) => l.stem === "tide-bells") as LoreEntry;
    expect(result.injections[1]).toEqual({
      ref: "lore/tide-bells",
      turn: 4,
      hash: hashOf(bells),
      chars: `### ${bells.title}\n\n${bells.body}`.length,
    });
    expect(result.report).toEqual({
      turn: 4,
      fired: [
        { ref: "lore/saltmere", why: "always" },
        { ref: "lore/tide-bells", why: 'key "bells"' },
        { ref: "lore/the-pact", why: 'key "pact"' },
      ],
      cut: [],
    });
  });

  test("never selects manual directives or switched-off keyed ones", () => {
    const story = {
      lore: [],
      directives: [
        directive("fade", ["saltmere"], { mode: "manual", on: true }),
        directive("off", ["saltmere"], { on: false }),
      ],
    };
    expect(activate(story, input({ prompt: "Saltmere" })).entries).toEqual([]);
  });

  test("ranks directives first, then lore by priority", () => {
    const story = {
      lore: [lore("low", { keys: ["x"], priority: 1 }), lore("high", { keys: ["x"], priority: 9 })],
      directives: [directive("d", ["x"])],
    };
    const result = activate(story, input({ prompt: "x" }));
    expect(refs(result)).toEqual(["directives/d", "lore/high", "lore/low"]);
    expect(result.entries[0]).toEqual({
      kind: "directive",
      ref: "directives/d",
      title: "d",
      body: "d body",
      updated: false,
      why: 'key "x"',
      chars: 7,
      details: undefined,
    });
  });

  test("scans the last loreScanDepth exchanges; an entry's scan overrides it", () => {
    const story = only(
      lore("default", { keys: ["anchor"] }),
      lore("deep", { keys: ["anchor"], scan: 4 }),
      lore("prompt-only", { keys: ["rope"], scan: 0 }),
    );
    const recent = ["the anchor drops", "two", "three", "four rope"];
    const result = activate(story, input({ recent, scanDepth: 3 }));
    expect(refs(result)).toEqual(["lore/deep"]);
    const prompted = activate(story, input({ recent: ["rope"], prompt: "the rope" }));
    expect(refs(prompted)).toEqual(["lore/prompt-only"]);
    expect(refs(activate(story, input({ recent: ["rope"] })))).toEqual([]);
  });

  test("scans the scene state: location, time and present names", () => {
    const story = only(
      lore("hall", { keys: ["Lamp Hall"] }),
      lore("dusk", { keys: ["second dusk"] }),
      lore("mira", { keys: ["Mira"] }),
      lore("elsewhere", { keys: ["Saltmarket"] }),
    );
    const result = activate(story, input({ scene: lampHall }));
    expect(refs(result).sort()).toEqual(["lore/dusk", "lore/hall", "lore/mira"]);
    expect(why(result, "lore/hall")).toBe('scene "Lamp Hall"');
    expect(why(result, "lore/mira")).toBe('scene "Mira"');
  });

  test("also: any or all of the secondary keys must appear with a primary key", () => {
    const story = only(
      lore("any", { keys: ["Lamplighters"], also: { any: ["patrol", "curfew"] } }),
      lore("all", { keys: ["Lamplighters"], also: { all: ["patrol", "curfew"] } }),
    );
    expect(refs(activate(story, input({ prompt: "The Lamplighters." })))).toEqual([]);
    expect(refs(activate(story, input({ prompt: "A Lamplighters patrol." })))).toEqual([
      "lore/any",
    ]);
    expect(
      refs(activate(story, input({ prompt: "A Lamplighters patrol.", recent: ["curfew"] }))),
    ).toEqual(["lore/all", "lore/any"]);
  });

  test("unless blocks a match, and the cut says why", () => {
    const story = only(lore("watch", { keys: ["watch"], unless: ["Feast of Wicks"] }));
    expect(refs(activate(story, input({ prompt: "The watch." })))).toEqual(["lore/watch"]);
    const blocked = activate(story, input({ prompt: "The watch, on the Feast of Wicks." }));
    expect(refs(blocked)).toEqual([]);
    expect(cutFor(blocked, "lore/watch")).toBe('unless "Feast of Wicks"');
  });

  test("scope: a character must be present, a place must be in the location", () => {
    const story = only(
      lore("miras-debt", { keys: ["debt"], scope: "character:mira" }),
      lore("eddas-debt", { keys: ["debt"], scope: "character:edda" }),
      lore("hall-rules", { keys: ["debt"], scope: "place:lamp hall" }),
      lore("dock-rules", { keys: ["debt"], scope: "place:fish docks" }),
    );
    expect(refs(activate(story, input({ prompt: "debt", scene: lampHall })))).toEqual([
      "lore/hall-rules",
      "lore/miras-debt",
    ]);
    expect(refs(activate(story, input({ prompt: "debt" })))).toEqual([]);
  });

  test("always-on lore scoped to a character or place travels with the turn while in scope", () => {
    const story = only(
      lore("mira-secret", { always: true, scope: "character:mira" }),
      lore("dock-smell", { always: true, scope: "place:fish docks" }),
    );
    const result = activate(story, input({ scene: lampHall }));
    expect(refs(result)).toEqual(["lore/mira-secret"]);
    expect(why(result, "lore/mira-secret")).toBe("always (character:mira)");
  });

  test("story-wide always-on lore travels with every turn, scene or none (spec 20.12)", () => {
    const story = only(lore("saltmere", { always: true }), lore("bells", { keys: ["bells"] }));
    const quiet = activate(story, input());
    expect(refs(quiet)).toEqual(["lore/saltmere"]);
    expect(why(quiet, "lore/saltmere")).toBe("always");
    const keyed = activate(story, input({ prompt: "bells", scene: lampHall }));
    expect(refs(keyed)).toEqual(["lore/bells", "lore/saltmere"]);
    expect(why(keyed, "lore/saltmere")).toBe("always");
  });

  test("a key match on an always-on entry reports the key", () => {
    const story = only(lore("saltmere", { keys: ["saltmere"], always: true }));
    expect(why(activate(story, input({ prompt: "Saltmere" })), "lore/saltmere")).toBe(
      'key "saltmere"',
    );
  });
});

describe("activate: semantic matches", () => {
  const story = {
    lore: [
      lore("tides", { keys: ["tide"] }),
      lore("guild", { keys: ["guild"], unless: ["holiday"] }),
      lore("ferry", { keys: ["ferry"], also: { any: ["oar"] } }),
    ],
    directives: [directive("hush", ["whisper"]), directive("manual", [], { mode: "manual" })],
  };

  test("a score at or above the threshold activates an entry with no key match", () => {
    const result = activate(
      story,
      input({
        prompt: "nothing relevant here",
        semantic: [
          { ref: "lore/guild", score: 0.5 },
          { ref: "lore/tides", score: 0.44 },
          { ref: "directives/manual", score: 0.99 },
        ],
      }),
    );
    expect(refs(result)).toEqual(["lore/guild"]);
    expect(why(result, "lore/guild")).toBe("semantic 0.50");
  });

  test("also does not apply to a meaning match; unless does", () => {
    const semantic = [
      { ref: "lore/ferry", score: 0.8 },
      { ref: "lore/guild", score: 0.8 },
    ];
    expect(refs(activate(story, input({ prompt: "", semantic })))).toEqual([
      "lore/ferry",
      "lore/guild",
    ]);
    expect(refs(activate(story, input({ prompt: "a holiday", semantic })))).toEqual(["lore/ferry"]);
  });

  test("key matches rank above meaning matches; directives above both", () => {
    const result = activate(
      story,
      input({
        prompt: "the tide turns",
        semanticThreshold: 0.3,
        semantic: [
          { ref: "lore/guild", score: 0.9 },
          { ref: "directives/hush", score: 0.31 },
        ],
      }),
    );
    expect(refs(result)).toEqual(["directives/hush", "lore/tides", "lore/guild"]);
  });
});

describe("activate: recursion", () => {
  const chain = (first: Record<string, unknown> = {}) =>
    only(
      lore("a", { keys: ["alpha"], ...first }, "It speaks of the bravo."),
      lore("b", { keys: ["bravo"] }, "And of charlie."),
      lore("c", { keys: ["charlie"] }, "And of delta."),
      lore("d", { keys: ["delta"] }, "And of echo."),
      lore("e", { keys: ["echo"] }, "The end."),
    );

  test("matched text wakes other entries, up to three levels", () => {
    const result = activate(chain(), input({ prompt: "alpha" }));
    expect(refs(result)).toEqual(["lore/a", "lore/b", "lore/c", "lore/d"]);
    expect(why(result, "lore/b")).toBe('recursion via lore/a ("bravo")');
    expect(why(result, "lore/d")).toBe('recursion via lore/c ("delta")');
  });

  test("recurse: false keeps an entry's text from waking others", () => {
    expect(refs(activate(chain({ recurse: false }), input({ prompt: "alpha" })))).toEqual([
      "lore/a",
    ]);
  });

  test("recursion respects scope", () => {
    const story = only(
      lore("a", { keys: ["alpha"] }, "Mentions bravo."),
      lore("b", { keys: ["bravo"], scope: "character:edda" }),
    );
    expect(refs(activate(story, input({ prompt: "alpha", scene: lampHall })))).toEqual(["lore/a"]);
  });
});

describe("activate: still in context", () => {
  const a = lore("a", { keys: ["x"] });
  const b = lore("b", { keys: ["x"] });
  const injected = (entry: LoreEntry, turn: number, hash = hashOf(entry)) => ({
    ref: entry.ref,
    turn,
    hash,
    chars: 6,
  });

  test("skips an entry injected within its cooldown and lets it back after", () => {
    const injections = [injected(a, 5)];
    const soon = activate(only(a, b), input({ turn: 10, prompt: "x", injections }));
    expect(refs(soon)).toEqual(["lore/b"]);
    expect(cutFor(soon, "lore/a")).toBe("in context (turn 5)");
    expect(soon.injections).toEqual([...injections, { ...injected(b, 10), chars: 13 }]);

    const later = activate(only(a, b), input({ turn: 11, prompt: "x", injections }));
    expect(refs(later)).toEqual(["lore/a", "lore/b"]);
  });

  test("an entry's own cooldown counts", () => {
    const eager = lore("a", { keys: ["x"], cooldown: 0 });
    const injections = [injected(eager, 9)];
    expect(refs(activate(only(eager), input({ turn: 10, prompt: "x", injections })))).toEqual([
      "lore/a",
    ]);
  });

  test("an edited entry goes in at once, marked updated", () => {
    const injections = [injected(a, 9, "old-hash")];
    const result = activate(only(a), input({ turn: 10, prompt: "x", injections }));
    expect(result.entries[0]).toMatchObject({ ref: "lore/a", updated: true });
    expect(why(result, "lore/a")).toBe('key "x", updated');
  });

  test("story-wide always-on lore respects its cooldown and comes back after", () => {
    const town = lore("town", { always: true, cooldown: 3 });
    const injections = [injected(town, 5)];
    const soon = activate(only(town), input({ turn: 7, injections }));
    expect(refs(soon)).toEqual([]);
    expect(cutFor(soon, "lore/town")).toBe("in context (turn 5)");
    const later = activate(only(town), input({ turn: 8, injections }));
    expect(refs(later)).toEqual(["lore/town"]);
    expect(why(later, "lore/town")).toBe("always");
  });

  test("does not mutate the injections it was given", () => {
    const injections = [injected(a, 1)];
    activate(only(a, b), input({ turn: 2, prompt: "x", injections }));
    expect(injections).toHaveLength(1);
  });
});

describe("activate: chance and groups", () => {
  test("chance is rolled after a match; 100 never draws", () => {
    const rare = only(lore("rare", { keys: ["x"], chance: 30 }));
    const missed = activate(rare, input({ prompt: "x", random: sequence(0.5) }));
    expect(refs(missed)).toEqual([]);
    expect(cutFor(missed, "lore/rare")).toBe("chance 30%");
    expect(refs(activate(rare, input({ prompt: "x", random: sequence(0.1) })))).toEqual([
      "lore/rare",
    ]);
    expect(
      refs(activate(only(lore("sure", { keys: ["x"] })), input({ prompt: "x", random: never }))),
    ).toEqual(["lore/sure"]);
  });

  test("one entry per group, drawn by weight", () => {
    const story = only(
      lore("rain", { keys: ["x"], group: "weather", weight: 1 }),
      lore("fog", { keys: ["x"], group: "weather", weight: 2 }),
      lore("frost", { keys: ["x"], group: "weather", weight: 1 }),
      lore("loner", { keys: ["x"] }),
    );
    const drawn = (roll: number) =>
      refs(activate(story, input({ prompt: "x", random: sequence(roll) })));
    expect(drawn(0)).toEqual(["lore/loner", "lore/rain"]);
    expect(drawn(0.3)).toEqual(["lore/fog", "lore/loner"]);
    expect(drawn(0.9)).toEqual(["lore/frost", "lore/loner"]);
    const result = activate(story, input({ prompt: "x", random: sequence(0.3) }));
    expect(cutFor(result, "lore/rain")).toBe('group "weather" drew lore/fog');
  });
});

describe("activate: budget", () => {
  test("a quarter of the budget per turn, letting a smaller entry fill the gap", () => {
    const story = only(
      lore("big", { keys: ["x"], priority: 9 }, "b".repeat(74)),
      lore("huge", { keys: ["x"], priority: 5 }, "h".repeat(196)),
      lore("small", { keys: ["x"], priority: 1 }, "s".repeat(5)),
    );
    const result = activate(story, input({ prompt: "x", budget: 400 }));
    expect(refs(result)).toEqual(["lore/big", "lore/small"]);
    expect(cutFor(result, "lore/huge")).toBe("turn budget");
    // "### big\n\n" and 74 characters, "### small\n\n" and 5.
    expect(result.injections.map((i) => i.chars)).toEqual([83, 16]);
  });

  test("lore already in context counts against the whole budget", () => {
    const story = only(
      lore("wide", { keys: ["x"], priority: 9 }, "w".repeat(56)),
      lore("thin", { keys: ["x"] }, "t".repeat(16)),
    );
    const injections = [{ ref: "lore/old", turn: 1, hash: "h", chars: 350 }];
    const result = activate(story, input({ turn: 2, prompt: "x", budget: 400, injections }));
    expect(refs(result)).toEqual(["lore/thin"]);
    expect(cutFor(result, "lore/wide")).toBe("context budget");
  });

  test("story-wide always-on lore ranks and fits the budget like any entry", () => {
    const story = only(
      lore("keyed", { keys: ["x"], priority: 9 }, "k".repeat(74)),
      lore("town", { always: true, priority: 1 }, "t".repeat(90)),
    );
    const result = activate(story, input({ prompt: "x", budget: 400 }));
    expect(refs(result)).toEqual(["lore/keyed"]);
    expect(cutFor(result, "lore/town")).toBe("turn budget");
  });

  test("the share of the window becomes characters at 200k tokens, 4 characters each", () => {
    expect(loreBudgetChars(0.1)).toBe(80_000);
  });
});

describe("activate: discovery and truth (spec 20.11)", () => {
  const body = "Public.\n\n## Secret\n\nHidden.\n\n## History\n\n- Scene 1: it began.";
  const lamps = (data: Record<string, unknown> = {}, text = body) =>
    lore("lamps", { title: "Lamps", keys: ["lamps"], ...data }, text);

  test("an entry travels with its Secret, History, truth and known", () => {
    const [entry] = activate(only(lamps({ truth: "rumor" })), input({ prompt: "lamps" })).entries;
    expect(entry?.details).toEqual({
      secret: "Hidden.",
      history: "- Scene 1: it began.",
      truth: "rumor",
      known: true,
    });
  });

  test("the cost is the injected text: tags, Secret and History included", () => {
    const cost = (data: Record<string, unknown>, player?: string) =>
      activate(only(lamps(data)), input({ prompt: "lamps", player })).entries[0]?.chars;
    const text = (heading: string, who: string) =>
      `### ${heading}\n\nPublic.\n\nSecret (unknown to ${who}):\nHidden.\n\nHistory:\n- Scene 1: it began.`;
    expect(cost({})).toBe(text("Lamps", "the player").length);
    expect(cost({ known: false }, "Corwin")).toBe(
      text("Lamps (unknown to Corwin)", "Corwin").length,
    );
  });

  test("a change to any of them makes the entry eligible again, marked updated", () => {
    const before = lamps();
    const injections = [{ ref: before.ref, turn: 9, hash: hashOf(before), chars: 10 }];
    const turn = (entry: LoreEntry) =>
      activate(only(entry), input({ turn: 10, prompt: "lamps", injections }));
    expect(refs(turn(before))).toEqual([]);
    const changed = [
      lamps({ known: "secret" }),
      lamps({ truth: "false" }),
      lamps({}, body.replace("Hidden.", "Hidden deeper.")),
      lamps({}, `${body}\n- Scene 2: it burned.`),
    ];
    for (const entry of changed) {
      expect(turn(entry).entries[0]).toMatchObject({ ref: "lore/lamps", updated: true });
    }
  });

  test("recursion reads the public text only, never the Secret or History", () => {
    const story = only(
      lamps({}, "Public.\n\n## Secret\n\nThe bell knows.\n\n## History\n\n- Scene 1: bell rang."),
      lore("bell", { keys: ["bell"] }),
    );
    expect(refs(activate(story, input({ prompt: "lamps" })))).toEqual(["lore/lamps"]);
  });
});

describe("sceneStateOf", () => {
  test("location, time and present characters by stem and name", async () => {
    const story = await loadStory(saltmereDir, { libraryRoot: fixtureLibrary });
    expect(sceneStateOf(story)).toEqual({
      location: "The Tallow Stair, Saltmere",
      time: "an hour before dawn",
      present: [
        { stem: "mira", name: "Mira Vane" },
        { stem: "edda", name: "Edda" },
      ],
    });
  });
});
