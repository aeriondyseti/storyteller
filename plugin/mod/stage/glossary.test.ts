import { describe, expect, test } from "claude-code/testing";
import {
  CODEX_ORIGIN,
  codexHref,
  codexIdOf,
  findNames,
  glossaryOf,
  linkLine,
  linkNames,
} from "./glossary.ts";

const names = [
  { name: "Mira", id: "character/mira" },
  { name: "Mira Tessaly", id: "character/mira" },
  { name: "Tallow Stair", id: "lore/tallow-stair" },
  { name: "the Stair", id: "lore/tallow-stair" },
  { name: "Crown Vote", id: "lore/crown-vote" },
  { name: "Saint Ash", id: "lore/saint-ash" },
];
const glossary = glossaryOf(names);

const href = (id: string) => `${CODEX_ORIGIN}${id}`;

function link(text: string, linked = new Set<string>()) {
  return linkNames(text, glossary, linked);
}

describe("codex hrefs", () => {
  test("an id round-trips through its link; other links are not the codex's", () => {
    expect(codexHref("lore/tallow-stair")).toBe("https://codex.invalid/lore/tallow-stair");
    expect(codexIdOf(codexHref("lore/odd name"))).toBe("lore/odd name");
    expect(codexIdOf("https://example.com/lore/x")).toBeNull();
    expect(codexIdOf(CODEX_ORIGIN)).toBeNull();
  });
});

describe("glossary links in prose", () => {
  test("the longest name wins, whole words, any case", () => {
    const out = link("mira tessaly climbs the tallow stair.");
    expect(out.text).toBe(
      `[mira tessaly](${href("character/mira")}) climbs the [tallow stair](${href("lore/tallow-stair")}).`,
    );
    expect(out.hrefs).toEqual([href("character/mira"), href("lore/tallow-stair")]);
  });

  test("only the first mention of each entry links, across blocks too", () => {
    const linked = new Set<string>();
    const first = link("Mira waits. Mira Tessaly waits longer.", linked);
    expect(first.text).toBe(`[Mira](${href("character/mira")}) waits. Mira Tessaly waits longer.`);
    const second = link("Mira again, by the Tallow Stair.", linked);
    expect(second.text).toBe(`Mira again, by the [Tallow Stair](${href("lore/tallow-stair")}).`);
    expect(second.hrefs).toEqual([href("lore/tallow-stair")]);
  });

  test("a name inside a longer word is not a mention", () => {
    expect(link("Miranda and Admiral Mirage.").text).toBe("Miranda and Admiral Mirage.");
    // A later stand-alone mention still links.
    expect(link("Miranda met Mira.").text).toBe(`Miranda met [Mira](${href("character/mira")}).`);
  });

  test("possessives and punctuation end a word", () => {
    expect(link("Mira's lamp").text).toBe(`[Mira](${href("character/mira")})'s lamp`);
  });

  test("existing links, code spans, fences and URLs are left alone", () => {
    const text = [
      "[Mira](https://example.com/mira) and `Crown Vote`",
      "```\nSaint Ash\n```",
      "see https://x.test/Tallow-Stair or <https://x.test/Mira>",
      "then the Crown Vote.",
    ].join("\n");
    const out = link(text);
    expect(out.hrefs).toEqual([href("lore/crown-vote")]);
    expect(out.text).toContain("[Mira](https://example.com/mira)");
    expect(out.text).toContain("`Crown Vote`");
    expect(out.text).toContain("```\nSaint Ash\n```");
    expect(out.text).toContain("then the [Crown Vote](https://codex.invalid/lore/crown-vote).");
  });

  test("a name broken over a line still matches; brackets in a name are escaped", () => {
    const odd = glossaryOf([{ name: "The [Old] Way", id: "lore/old-way" }]);
    const out = linkNames("Walk The [Old]\nWay home.", odd, new Set());
    expect(out.text).toBe(`Walk [The \\[Old\\]\nWay](${href("lore/old-way")}) home.`);
  });

  test("no names: text untouched", () => {
    const empty = glossaryOf([]);
    expect(linkNames("Mira.", empty, new Set())).toEqual({ text: "Mira.", hrefs: [] });
  });
});

describe("glossary names in pane lines", () => {
  test("a run splits around its first mention, which carries the id", () => {
    const linked = new Set<string>();
    const line = linkLine(
      [{ text: "Where ", dim: true }, { text: "The Tallow Stair, by Mira's door" }],
      glossary,
      linked,
    );
    expect(line).toEqual([
      { text: "Where ", dim: true },
      { text: "The " },
      { text: "Tallow Stair", link: "lore/tallow-stair" },
      { text: ", by " },
      { text: "Mira", link: "character/mira" },
      { text: "'s door" },
    ]);
    // Later lines keep the first-mention rule.
    expect(linkLine([{ text: "Mira sleeps.", dim: true }], glossary, linked)).toEqual([
      { text: "Mira sleeps.", dim: true },
    ]);
  });

  test("findNames reports offsets", () => {
    expect(findNames("at the Stair", glossary, new Set())).toEqual([
      { start: 3, end: 12, id: "lore/tallow-stair" },
    ]);
  });
});
