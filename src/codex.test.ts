import { describe, expect, test } from "bun:test";
import { codexOf, historyLines } from "./codex.ts";
import { loadStory } from "./story.ts";
import { tempDir } from "./testing/fixtures.ts";

// A story written for these tests: a story book, two library books listed in
// `uses` in the opposite of alphabetical order, a single library file, and
// three scenes whose casts differ.
async function writeStory(): Promise<{ dir: string; library: string }> {
  const root = await tempDir();
  const dir = `${root}/story`;
  const library = `${root}/library`;
  const files: Record<string, string> = {
    [`${dir}/story.md`]: `---
title: Saltmere
persona: corwin
uses: [lore/varrow-city, lore/harbour-town/ferry, lore/old-gods, characters/mira]
---
`,
    // Known fact with History and an unrevealed Secret.
    [`${dir}/lore/tide-bells.md`]: `---
title: The Tide-Bells
keys: [bells, tide-bell]
known: true
truth: fact
---
Bells under the water ring at the turn of the tide.

## Secret

The bells are rung by the drowned.

## History

- Scene 1: the bells rang at noon.
- Scene 3: the bells fell silent.
`,
    // A rumour, Secret revealed.
    [`${dir}/lore/the-pact.md`]: `---
title: The Pact
keys: [pact, Bells]
known: secret
truth: rumor
---
The town struck a bargain with the sea.

## Secret

There was no bargain; the mayor lied.
`,
    // A false belief, known: shown unlabelled.
    [`${dir}/lore/safe-harbour.md`]: `---
title: Safe Harbour
keys: [harbour]
known: true
truth: false
---
No ship has ever sunk in Saltmere harbour.

## Secret

Dozens have.
`,
    // Unknown: never in the codex.
    [`${dir}/lore/the-deep.md`]: `---
title: The Deep
keys: [deep]
known: false
---
Something lives below the bells.
`,
    // Overrides the library's lamplighters by stem.
    [`${dir}/lore/lamplighters.md`]: `---
title: Saltmere Lamplighters
keys: [lamplighters]
known: true
---
The story's own lamplighters.
`,
    [`${library}/lore/varrow-city/lamplighters.md`]: `---
title: Varrow Lamplighters
keys: [lamplighters]
known: true
---
The library's lamplighters.
`,
    [`${library}/lore/varrow-city/curfew.md`]: `---
title: The Curfew
keys: [curfew, the pact]
known: true
---
No one walks after the last bell.
`,
    [`${library}/lore/varrow-city/hidden.md`]: `---
title: Hidden Things
known: false
---
Unknown library lore.
`,
    [`${library}/lore/harbour-town/ferry.md`]: `---
title: The Ferry
keys: [ferry]
known: true
---
A ferry crosses twice a day.
`,
    // Not listed: a sibling of a single-entry ref stays out.
    [`${library}/lore/harbour-town/docks.md`]: `---
title: The Docks
known: true
---
Not used.
`,
    [`${library}/lore/old-gods.md`]: `---
title: The Old Gods
keys: [old gods]
known: true
---
Older than the sea.
`,
    [`${dir}/characters/corwin.md`]: `---
name: Corwin Hale
tags: [smuggler]
---
## Appearance

Tall.
`,
    [`${dir}/characters/edda.md`]: `---
name: Edda
tags: [innkeeper, widow]
---
## Personality

Private to Vex.

## Appearance

Grey braid, flour on her sleeves.

## Secrets

Also private.
`,
    [`${dir}/characters/tobin.md`]: `---
name: Tobin
---
No appearance section.
`,
    [`${dir}/characters/stranger.md`]: `---
name: The Stranger
---
## Appearance

Never met.
`,
    [`${library}/characters/mira.md`]: `---
name: Mira
tags: [lamplighter]
---
## Appearance

Soot on her hands.
`,
    [`${dir}/scenes/001-arrival/scene.md`]: `---
title: Arrival
status: closed
present: [corwin, edda]
---
`,
    [`${dir}/scenes/002-the-bell/scene.md`]: `---
title: The Bell
status: closed
present: [tobin, nobody-with-a-card]
---
`,
    [`${dir}/scenes/003-the-stair/scene.md`]: `---
title: The Stair
present: [corwin, mira]
---
`,
  };
  for (const [file, text] of Object.entries(files)) await Bun.write(file, text);
  return { dir, library };
}

const { dir, library } = await writeStory();
const codex = codexOf(await loadStory(dir, { libraryRoot: library }));
const allEntries = codex.books.flatMap((b) => b.entries);
const entry = (id: string) => allEntries.find((e) => e.id === id);

describe("codex books", () => {
  test("the story's book first, then library books in uses order", () => {
    expect(codex.books.map((b) => b.name)).toEqual([
      "Saltmere",
      "varrow-city",
      "harbour-town",
      "Library",
    ]);
  });

  test("only known entries, by title within a book", () => {
    expect(codex.books[0]?.entries.map((e) => e.title)).toEqual([
      "Safe Harbour",
      "Saltmere Lamplighters",
      "The Pact",
      "The Tide-Bells",
    ]);
    expect(codex.books[1]?.entries.map((e) => e.id)).toEqual(["lore/curfew"]);
    expect(codex.books[2]?.entries.map((e) => e.id)).toEqual(["lore/ferry"]);
    expect(codex.books[3]?.entries.map((e) => e.id)).toEqual(["lore/old-gods"]);
    expect(entry("lore/the-deep")).toBeUndefined();
    expect(entry("lore/hidden")).toBeUndefined();
    expect(entry("lore/docks")).toBeUndefined();
  });

  test("a story entry overrides the library's by stem", () => {
    expect(allEntries.filter((e) => e.id === "lore/lamplighters")).toEqual([
      {
        id: "lore/lamplighters",
        title: "Saltmere Lamplighters",
        keys: ["lamplighters"],
        label: "",
        text: "The story's own lamplighters.",
        history: [],
      },
    ]);
  });

  test("labels: a rumour says so, a false belief is unlabelled", () => {
    expect(entry("lore/the-pact")?.label).toBe("Rumour");
    expect(entry("lore/safe-harbour")?.label).toBe("");
    expect(entry("lore/tide-bells")?.label).toBe("");
  });

  test("the Secret only once revealed", () => {
    expect(entry("lore/the-pact")?.secret).toBe("There was no bargain; the mayor lied.");
    expect(entry("lore/tide-bells")).not.toHaveProperty("secret");
    expect(entry("lore/safe-harbour")).not.toHaveProperty("secret");
    expect(JSON.stringify(codex)).not.toContain("rung by the drowned");
    expect(JSON.stringify(codex)).not.toContain("Dozens have");
  });

  test("public text and History in order, without list markers", () => {
    expect(entry("lore/tide-bells")).toEqual({
      id: "lore/tide-bells",
      title: "The Tide-Bells",
      keys: ["bells", "tide-bell"],
      label: "",
      text: "Bells under the water ring at the turn of the tide.",
      history: ["Scene 1: the bells rang at noon.", "Scene 3: the bells fell silent."],
    });
  });
});

describe("codex characters", () => {
  test("cards present in any scene, the persona left out, by name", () => {
    expect(codex.characters.map((c) => c.id)).toEqual([
      "character/edda",
      "character/mira",
      "character/tobin",
    ]);
  });

  test("name, tags and the Appearance section only", () => {
    expect(codex.characters[0]).toEqual({
      id: "character/edda",
      name: "Edda",
      tags: ["innkeeper", "widow"],
      appearance: "Grey braid, flour on her sleeves.",
    });
    expect(codex.characters[2]?.appearance).toBe("");
    expect(JSON.stringify(codex)).not.toContain("Private to Vex");
    expect(JSON.stringify(codex)).not.toContain("Never met");
  });
});

test("glossary names: titles and keys of known entries, met characters, first wins", () => {
  expect(codex.names).toEqual([
    { name: "Safe Harbour", id: "lore/safe-harbour" },
    { name: "harbour", id: "lore/safe-harbour" },
    { name: "Saltmere Lamplighters", id: "lore/lamplighters" },
    { name: "lamplighters", id: "lore/lamplighters" },
    { name: "The Pact", id: "lore/the-pact" },
    { name: "pact", id: "lore/the-pact" },
    // "Bells" here, then the Tide-Bells' "bells" is a duplicate.
    { name: "Bells", id: "lore/the-pact" },
    { name: "The Tide-Bells", id: "lore/tide-bells" },
    { name: "tide-bell", id: "lore/tide-bells" },
    { name: "The Curfew", id: "lore/curfew" },
    { name: "curfew", id: "lore/curfew" },
    // "the pact" is a duplicate of "The Pact".
    { name: "The Ferry", id: "lore/ferry" },
    { name: "ferry", id: "lore/ferry" },
    { name: "The Old Gods", id: "lore/old-gods" },
    { name: "old gods", id: "lore/old-gods" },
    { name: "Edda", id: "character/edda" },
    { name: "Mira", id: "character/mira" },
    { name: "Tobin", id: "character/tobin" },
  ]);
});

test("historyLines: one per line, blanks and markers dropped", () => {
  expect(historyLines(undefined)).toEqual([]);
  expect(historyLines("- Scene 1: a\r\n\n  - Scene 2: b  \nScene 3: c")).toEqual([
    "Scene 1: a",
    "Scene 2: b",
    "Scene 3: c",
  ]);
});
