import { describe, expect, test } from "bun:test";
import { StoryError } from "./errors.ts";
import { parseRef, resolveRef, resolveUses } from "./library.ts";
import { fixtureLibrary, saltmereDir } from "./testing/fixtures.ts";

describe("parseRef", () => {
  test("accepts kind/stem, with or without .md", () => {
    expect(parseRef("characters/mira")).toEqual({ kind: "characters", stem: "mira" });
    expect(parseRef("lore/the-pact.md")).toEqual({ kind: "lore", stem: "the-pact" });
  });

  test("accepts lore/<book>/<stem> for one entry of a book", () => {
    expect(parseRef("lore/harbour-town/ferry")).toEqual({
      kind: "lore",
      book: "harbour-town",
      stem: "ferry",
    });
  });

  test("rejects anything else", () => {
    for (const bad of ["mira", "spells/fire", "characters/a/b", "lore/a/b/c", "lore/"]) {
      expect(() => parseRef(bad)).toThrow(StoryError);
    }
  });
});

describe("resolveRef", () => {
  test("a story file overrides the library copy", async () => {
    const ref = await resolveRef("lore/the-pact", saltmereDir, fixtureLibrary);
    expect(ref).toEqual({
      ref: "lore/the-pact",
      kind: "lore",
      stem: "the-pact",
      path: `${saltmereDir}/lore/the-pact.md`,
      source: "story",
    });
  });

  test("falls back to the library", async () => {
    const ref = await resolveRef("characters/mira", saltmereDir, fixtureLibrary);
    expect(ref.source).toBe("library");
    expect(ref.path).toBe(`${fixtureLibrary}/characters/mira.md`);
  });

  test("missing refs throw with both places named", async () => {
    await expect(resolveRef("characters/ghost", saltmereDir, fixtureLibrary)).rejects.toThrow(
      /library .* or the story/,
    );
  });

  test("resolveUses expands a lore book into its entries", async () => {
    const refs = await resolveUses(["lore/harbour-town"], saltmereDir, fixtureLibrary);
    expect(refs).toEqual([
      {
        ref: "lore/ferry",
        kind: "lore",
        stem: "ferry",
        path: `${fixtureLibrary}/lore/harbour-town/ferry.md`,
        source: "library",
        book: "harbour-town",
      },
      {
        ref: "lore/the-pact",
        kind: "lore",
        stem: "the-pact",
        path: `${fixtureLibrary}/lore/harbour-town/the-pact.md`,
        source: "library",
        book: "harbour-town",
      },
    ]);
    await expect(
      resolveRef("lore/harbour-town/ghost", saltmereDir, fixtureLibrary),
    ).rejects.toThrow(/not found in the library/);
  });

  test("resolveUses resolves a list", async () => {
    const refs = await resolveUses(
      ["directives/noir", "characters/edda"],
      saltmereDir,
      fixtureLibrary,
    );
    expect(refs.map((r) => r.source)).toEqual(["library", "story"]);
  });
});
