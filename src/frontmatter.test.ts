import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FrontmatterError,
  parseFrontmatter,
  readFrontmatterFile,
  serializeFrontmatter,
  writeFrontmatterFile,
} from "./frontmatter.ts";

describe("parseFrontmatter", () => {
  test("splits data from body", () => {
    const doc = parseFrontmatter("---\ntitle: Saltmere\nkeys: [a, b]\n---\n\nThe body.\n");
    expect(doc).toEqual({ data: { title: "Saltmere", keys: ["a", "b"] }, body: "The body." });
  });

  test("text without frontmatter is all body", () => {
    expect(parseFrontmatter("just prose\n")).toEqual({ data: {}, body: "just prose" });
  });

  test("handles CRLF and an empty block", () => {
    expect(parseFrontmatter("---\r\ntitle: X\r\n---\r\nbody")).toEqual({
      data: { title: "X" },
      body: "body",
    });
    expect(parseFrontmatter("---\n---\nbody")).toEqual({ data: {}, body: "body" });
  });

  test("rejects YAML that is not a mapping", () => {
    expect(() => parseFrontmatter("---\n- a\n- b\n---\n")).toThrow(FrontmatterError);
    expect(() => parseFrontmatter("---\ntitle: [unclosed\n---\n")).toThrow(FrontmatterError);
  });
});

describe("serializeFrontmatter", () => {
  test("round-trips nested data, multi-line strings and the body", () => {
    const data = {
      number: 2,
      title: "The Drowned Bell: part two",
      present: ["mira", "corwin"],
      trackers: { wound: { value: "deep", note: "left arm\nstill bleeding  " } },
      closed: false,
      empty: [],
    };
    const body = "## Now\n\nRain.\n\n## Notes\n\n- a thread";
    const text = serializeFrontmatter(data, body);
    expect(text).not.toMatch(/[ \t]$/m);
    expect(parseFrontmatter(text)).toEqual({ data, body });
    expect(serializeFrontmatter(parseFrontmatter(text).data, body)).toBe(text);
  });

  test("no data writes just the body", () => {
    expect(serializeFrontmatter({}, "hello")).toBe("hello\n");
  });

  test("file helpers write and read back", async () => {
    const file = path.join(await mkdtemp(path.join(os.tmpdir(), "rp-fm-")), "x.md");
    await writeFrontmatterFile(file, { title: "T" }, "Body");
    expect(await readFrontmatterFile(file)).toEqual({ data: { title: "T" }, body: "Body" });
  });
});
