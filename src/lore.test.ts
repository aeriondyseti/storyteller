import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "./frontmatter.ts";
import { appendHistoryInText, parseLoreFields, setKnownInText, splitLoreBody } from "./lore.ts";

const entry = [
  "---",
  "title: The Lamplighters",
  "keys: [Lamplighters, lamp hall]   # hand comment",
  "known: false",
  "truth: rumor",
  "---",
  "",
  "They light the city.",
  "",
  "## Secret",
  "",
  "They set the fires.",
  "",
].join("\n");

describe("parseLoreFields", () => {
  test("a bare `truth: false` reads as the false truth, not a bad value", () => {
    const data = parseFrontmatter("---\ntruth: false\n---\n").data;
    expect(parseLoreFields(data, "x").truth).toBe("false");
    expect(() => parseLoreFields({ truth: true }, "x")).toThrow("truth should be one of");
  });
});

describe("setKnownInText", () => {
  test("rewrites only the known line", () => {
    expect(setKnownInText(entry, true)).toBe(entry.replace("known: false", "known: true"));
    expect(setKnownInText(entry, "secret")).toBe(entry.replace("known: false", "known: secret"));
    expect(parseLoreFields(parseFrontmatter(setKnownInText(entry, "secret")).data, "x").known).toBe(
      "secret",
    );
  });

  test("adds the line at the end of the frontmatter when there is none", () => {
    const without = entry.replace("known: false\n", "");
    expect(setKnownInText(without, true)).toBe(
      without.replace("truth: rumor\n", "truth: rumor\nknown: true\n"),
    );
  });

  test("keeps Windows line endings", () => {
    const crlf = entry.replace("known: false\n", "").replaceAll("\n", "\r\n");
    const result = setKnownInText(crlf, true);
    expect(result).toBe(crlf.replace("truth: rumor\r\n", "truth: rumor\r\nknown: true\r\n"));
  });

  test("an empty frontmatter or none at all", () => {
    expect(setKnownInText("---\n---\nBody.\n", true)).toBe("---\nknown: true\n---\nBody.\n");
    expect(setKnownInText("Body.\n", true)).toBe("---\nknown: true\n---\n\nBody.\n");
  });

  test("ignores a nested known key", () => {
    const nested = "---\ntitle: X\nmeta:\n  known: no\n---\n\nBody.\n";
    expect(setKnownInText(nested, true)).toBe(
      "---\ntitle: X\nmeta:\n  known: no\nknown: true\n---\n\nBody.\n",
    );
  });
});

describe("appendHistoryInText", () => {
  const line = "- Scene 4: the Lamp Hall burned.";

  test("creates the section at the end of the file", () => {
    expect(appendHistoryInText(entry, line)).toBe(`${entry}\n## History\n\n${line}\n`);
    expect(splitLoreBody(parseFrontmatter(appendHistoryInText(entry, line)).body)).toEqual({
      body: "They light the city.",
      secret: "They set the fires.",
      history: line,
    });
  });

  test("adds the newest line last, before a following section", () => {
    const text = "Public.\n\n## History\n\n- Scene 1: a.\n\n## Secret\n\nS.\n";
    expect(appendHistoryInText(text, line)).toBe(
      `Public.\n\n## History\n\n- Scene 1: a.\n${line}\n\n## Secret\n\nS.\n`,
    );
  });

  test("fills an empty section and ends a file that had no final newline", () => {
    expect(appendHistoryInText("Public.\n\n## history\n", line)).toBe(
      `Public.\n\n## history\n\n${line}\n`,
    );
    expect(appendHistoryInText("Public.\n\n## History\n\n- Scene 1: a.", line)).toBe(
      `Public.\n\n## History\n\n- Scene 1: a.\n${line}\n`,
    );
  });

  test("keeps Windows line endings", () => {
    const crlf = "Public.\r\n\r\n## History\r\n\r\n- Scene 1: a.\r\n";
    expect(appendHistoryInText(crlf, line)).toBe(`${crlf}${line}\r\n`);
  });
});
