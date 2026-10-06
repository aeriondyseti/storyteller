import { describe, expect, test } from "claude-code/testing";
import type { CodexSnapshot } from "../types";
import { displayTitle, indexGroups, viewOf } from "./codex-index.ts";

const snapshot: CodexSnapshot = {
  books: [
    {
      name: "Hollow",
      entries: [
        {
          id: "lore/tallow-stair",
          title: "The Tallow Stair",
          keys: ["stair", "chandlers' row"],
          label: "",
          text: "A crooked stair of chandlers.",
          history: [],
        },
        {
          id: "lore/saint-ash",
          title: "Saint Ash",
          keys: ["ash"],
          label: "Rumour",
          text: "They say she walks at night.",
          history: [],
        },
      ],
    },
    { name: "Common Lore", entries: [] },
    {
      name: "Saltmere",
      entries: [
        {
          id: "lore/crown-vote",
          title: "The Crown Vote",
          keys: ["vote"],
          label: "",
          text: "The Five Houses choose.",
          history: ["Scene 2: the vote was moved up"],
        },
      ],
    },
  ],
  characters: [
    { id: "character/mira", name: "Mira Tessaly", tags: ["chandler"], appearance: "Soot." },
  ],
  names: [],
};

describe("codex index", () => {
  test("books in order, empty ones dropped, then Characters; rumours say so", () => {
    expect(indexGroups(snapshot, "")).toEqual([
      {
        heading: "Hollow",
        items: [
          { id: "lore/tallow-stair", title: "The Tallow Stair" },
          { id: "lore/saint-ash", title: "Rumour: Saint Ash" },
        ],
      },
      { heading: "Saltmere", items: [{ id: "lore/crown-vote", title: "The Crown Vote" }] },
      { heading: "Characters", items: [{ id: "character/mira", title: "Mira Tessaly" }] },
    ]);
  });

  test("search matches titles and keys in any case", () => {
    const ids = (q: string) => indexGroups(snapshot, q).flatMap((g) => g.items.map((i) => i.id));
    expect(ids("CHANDLERS")).toEqual(["lore/tallow-stair"]);
    expect(ids("  vote ")).toEqual(["lore/crown-vote"]);
    expect(ids("tessaly")).toEqual(["character/mira"]);
    expect(ids("the")).toEqual(["lore/tallow-stair", "lore/crown-vote"]);
    expect(indexGroups(snapshot, "nothing like it")).toEqual([]);
  });

  test("a false belief shows as believed: no label", () => {
    const entry = snapshot.books[0]?.entries[0];
    if (!entry) throw new Error("fixture");
    expect(displayTitle(entry)).toBe("The Tallow Stair");
  });

  test("an id names an entry with its book, or a character, or nothing", () => {
    expect(viewOf(snapshot, "lore/crown-vote")).toMatchObject({ kind: "entry", book: "Saltmere" });
    expect(viewOf(snapshot, "character/mira")).toMatchObject({ kind: "character" });
    expect(viewOf(snapshot, "lore/unknown")).toBeUndefined();
    expect(viewOf(null, "lore/crown-vote")).toBeUndefined();
    expect(viewOf(snapshot, null)).toBeUndefined();
  });
});
