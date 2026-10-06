import { describe, expect, test } from "bun:test";
import { readFrontmatterFile } from "../src/frontmatter.ts";
import { tempDir } from "../src/testing/fixtures.ts";
import { checkStem, editFile, setSection, slugify } from "./edit.ts";

describe("setSection", () => {
  test("replaces an existing section and keeps the rest", () => {
    const body = "## Now\n\nold now\n\n## Notes\n\n- a";
    expect(setSection(body, "Now", "new now")).toBe("## Now\n\nnew now\n\n## Notes\n\n- a");
  });

  test("appends a missing section", () => {
    expect(setSection("## Now\n\nx", "Summary", "It ended.")).toBe(
      "## Now\n\nx\n\n## Summary\n\nIt ended.",
    );
    expect(setSection("", "Summary", "It ended.")).toBe("## Summary\n\nIt ended.");
  });
});

describe("stems", () => {
  test("slugify", () => {
    expect(slugify("The Tallow Stair!")).toBe("the-tallow-stair");
    expect(slugify("Café Noël")).toBe("cafe-noel");
  });

  test("checkStem rejects paths and odd names", () => {
    expect(checkStem("old-tom")).toBe("old-tom");
    for (const bad of ["../x", "Mira", "a/b", ""]) expect(() => checkStem(bad)).toThrow();
  });
});

describe("editFile", () => {
  test("merges keys, keeps others in order, null removes", async () => {
    const file = `${await tempDir()}/x.md`;
    await editFile(file, { a: 1, b: 2, c: 3 }, "body");
    await editFile(file, { b: 20, c: null, d: undefined });
    const doc = await readFrontmatterFile(file);
    expect(doc.data).toEqual({ a: 1, b: 20 });
    expect(Object.keys(doc.data)).toEqual(["a", "b"]);
    expect(doc.body).toBe("body");
  });
});
