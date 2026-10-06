import { describe, expect, test } from "bun:test";
import { cp } from "node:fs/promises";
import { parseFrontmatter } from "./frontmatter.ts";
import { explicitFields, migrateLore, writeEntry } from "./migrate-lore.ts";
import { blankDir, copyStory, fixtureLibrary, saltmereDir, tempDir } from "./testing/fixtures.ts";

describe("explicitFields", () => {
  test("fills every default in spec order, keeps set values and unknown keys", () => {
    const out = explicitFields(
      { keys: ["pact"], note: "hand-written", priority: 3, title: "The Pact", group: "g" },
      "the-pact",
      true,
    );
    expect(Object.entries(out)).toEqual([
      ["title", "The Pact"],
      ["keys", ["pact"]],
      ["unless", []],
      ["always", false],
      ["priority", 3],
      ["scope", "story"],
      ["cooldown", 6],
      ["chance", 100],
      ["group", "g"],
      ["weight", 1],
      ["recurse", true],
      ["known", true],
      ["truth", "fact"],
      ["note", "hand-written"],
    ]);
  });
});

describe("writeEntry", () => {
  test("flow lists and maps; strings quoted only when YAML would misread them", () => {
    const data = {
      title: "Yes",
      keys: ["true", "12", "a, b", "#tag", "plain words"],
      also: { any: ["patrol"] },
      priority: 2,
      note: "line one\nline two",
    };
    const text = writeEntry(data, "Body.");
    expect(text).toContain('keys: ["true", "12", "a, b", "#tag", plain words]');
    expect(text).toContain("also: { any: [patrol] }");
    expect(parseFrontmatter(text)).toEqual({ data, body: "Body." });
  });
});

describe("migrateLore", () => {
  test("a played story: known true, every field explicit, body untouched, idempotent", async () => {
    // The fixture's own entries are already migrated; add one from before.
    const dir = await copyStory(saltmereDir);
    const legacy = `${dir}/lore/old-road.md`;
    await Bun.write(
      legacy,
      '---\ntitle: "The old road: north"\nkeys: [road, Mira\'s path]\nscope: character:mira\nsource: notes\n---\n\nMud.\n\n## Secret\n\nIt is a grave road.\n',
    );
    const first = await migrateLore(dir);
    expect(first.kind).toBe("story");
    expect(first.known).toBe(true);
    expect(first.files.map((f) => [f.file.split("/").pop(), f.status])).toEqual([
      ["old-road.md", "rewritten"],
      ["saltmere.md", "unchanged"],
      ["the-pact.md", "unchanged"],
      ["tide-bells.md", "unchanged"],
    ]);
    expect(await Bun.file(legacy).text()).toBe(
      [
        "---",
        'title: "The old road: north"',
        "keys: [road, Mira's path]",
        "unless: []",
        "always: false",
        "priority: 0",
        "scope: character:mira",
        "cooldown: 6",
        "chance: 100",
        "weight: 1",
        "recurse: true",
        "known: true",
        "truth: fact",
        "source: notes",
        "---",
        "",
        "Mud.",
        "",
        "## Secret",
        "",
        "It is a grave road.",
        "",
      ].join("\n"),
    );

    const texts = await Promise.all(first.files.map((f) => Bun.file(f.file).text()));
    const second = await migrateLore(dir);
    expect(second.files.every((f) => f.status === "unchanged")).toBe(true);
    expect(await Promise.all(second.files.map((f) => Bun.file(f.file).text()))).toEqual(texts);
  });

  test("an unplayed story gets known false; a bad entry is reported and left alone", async () => {
    const dir = await copyStory(blankDir);
    await Bun.write(`${dir}/lore/a.md`, "---\ntitle: A\n---\n\nText.\n");
    await Bun.write(`${dir}/lore/bad.md`, "---\nscope: nowhere\n---\n\nText.\n");
    const result = await migrateLore(dir);
    expect(result.known).toBe(false);
    expect(result.files.map((f) => [f.file.split("/").pop(), f.status])).toEqual([
      ["a.md", "rewritten"],
      ["bad.md", "invalid"],
    ]);
    expect(parseFrontmatter(await Bun.file(`${dir}/lore/a.md`).text()).data.known).toBe(false);
    expect(await Bun.file(`${dir}/lore/bad.md`).text()).toBe("---\nscope: nowhere\n---\n\nText.\n");
  });

  test("a library: single files and books, known false", async () => {
    const dir = await tempDir();
    await cp(fixtureLibrary, dir, { recursive: true });
    const result = await migrateLore(dir);
    expect(result.kind).toBe("library");
    expect(result.files.map((f) => f.file.slice(dir.length))).toEqual([
      "/lore/the-pact.md",
      "/lore/harbour-town/ferry.md",
      "/lore/harbour-town/the-pact.md",
    ]);
    const ferry = parseFrontmatter(await Bun.file(`${dir}/lore/harbour-town/ferry.md`).text());
    expect(ferry.data.known).toBe(false);
  });
});
