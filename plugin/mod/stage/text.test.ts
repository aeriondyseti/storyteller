import { describe, expect, test } from "claude-code/testing";
import {
  cardRead,
  colorFor,
  keepSkillEntries,
  quietPhrase,
  quoteSpans,
  replyBlocks,
  speakerOf,
  withoutUserInstructions,
} from "./text.ts";

const speakers = [
  { stem: "mira", name: "Mira Tessaly" },
  { stem: "hesketh", name: "Hesketh Crane" },
];

describe("reply blocks", () => {
  test("a lone italic phrase is a scene-setting line", () => {
    expect(replyBlocks("*The Tallow Stair, an hour before dawn.*", speakers)).toEqual([
      { kind: "setting", text: "The Tallow Stair, an hour before dawn." },
    ]);
  });

  test("an aside may run over several paragraphs", () => {
    const blocks = replyBlocks("The door holds.\n\n(( One thing:\n\nshall I skip? ))", speakers);
    expect(blocks.map((b) => b.kind)).toEqual(["prose", "ooc"]);
  });

  test("plain paragraphs merge into one markdown block", () => {
    expect(replyBlocks("One.\n\nTwo.", speakers)).toEqual([
      { kind: "prose", text: "One.\n\nTwo." },
    ]);
  });

  test("a reply with a code fence is left whole", () => {
    const text = "*Not a rule*\n\n```\nx\n```";
    expect(replyBlocks(text, speakers)).toEqual([{ kind: "prose", text }]);
  });
});

describe("dialogue attribution", () => {
  test("one speaker named outside the quotes owns the line", () => {
    expect(speakerOf('Mira turns a ring. "Four crowns."', speakers)?.stem).toBe("mira");
    expect(speakerOf('"Four crowns," says Hesketh Crane.', speakers)?.stem).toBe("hesketh");
  });

  test("two speakers named, or none, is no tint", () => {
    expect(speakerOf('Mira looks at Hesketh. "Well?"', speakers)).toBeUndefined();
    expect(speakerOf('"Well?" someone says.', speakers)).toBeUndefined();
  });

  test("a name inside the quotes does not count", () => {
    expect(speakerOf('"Mira," he says.', speakers)).toBeUndefined();
  });

  test("curly quotes split too", () => {
    expect(quoteSpans("She said “no” twice.")).toEqual([
      { text: "She said ", quoted: false },
      { text: "“no”", quoted: true },
      { text: " twice.", quoted: false },
    ]);
  });
});

describe("quiet line", () => {
  test("phrases follow the tool", () => {
    expect(quietPhrase("Read", {}, undefined)).toBe("consults the archive");
    expect(quietPhrase("mcp__world__set_widget", {}, undefined)).toBe("updates the board");
    expect(quietPhrase("mcp__world__remove_widget", {}, undefined)).toBe(
      "wipes a mark from the board",
    );
    expect(quietPhrase("mcp__world__set_tracker", {}, undefined)).toBe("consults the archive");
    expect(quietPhrase("mcp__world__set_scene_state", { time: "dusk" }, undefined)).toBe(
      "notes the time",
    );
    expect(quietPhrase("mcp__world__upsert_character", {}, undefined)).toBe("writes a card");
    expect(quietPhrase("Skill", { skill: "storyteller:scene-close" }, undefined)).toBe(
      "considers the craft",
    );
  });

  test("a roll shows its expression and result", () => {
    const output = [{ type: "text", text: "2d6+1 = 9 (4, 4)" }];
    expect(quietPhrase("mcp__world__roll", { expr: "2d6+1" }, output)).toBe(
      "rolls 2d6+1 → 2d6+1 = 9 (4, 4)",
    );
  });

  test("a card read names its character", () => {
    expect(cardRead("Read", { file_path: "X:/s/characters/mira.md" })).toBe("mira");
    expect(cardRead("Read", { file_path: "X:/s/lore/varrow.md" })).toBeUndefined();
    expect(cardRead("mcp__world__get_character", { name: "Mira" })).toBe("Mira");
  });

  test("colours are stable", () => {
    expect(colorFor("mira")).toBe(colorFor("mira"));
  });
});

describe("instructions", () => {
  test("the player's global CLAUDE.md goes; the story's stays", () => {
    const text = [
      "Codebase and user instructions are shown below.",
      "",
      "Contents of C:\\Users\\k\\.claude\\CLAUDE.md (user's private global instructions for all projects):",
      "",
      "# Global notes",
      "",
      "Contents of X:\\stories\\hollow\\CLAUDE.md (project instructions, checked into the codebase):",
      "",
      "# The Hollow Crown",
    ].join("\n");
    const out = withoutUserInstructions(text);
    expect(out).not.toContain("Global notes");
    expect(out).toContain("# The Hollow Crown");
    expect(out).toContain("Codebase and user instructions");
  });

  test("text in another shape passes untouched", () => {
    expect(withoutUserInstructions("anything")).toBe("anything");
  });
});

describe("skill listing", () => {
  const listing = [
    "The following skills are available for use with the Skill tool:",
    "",
    "- storyteller:recap: Give the player a short recap.",
    "- claude-api: Reference for the Claude API.",
    "TRIGGER - read BEFORE opening the target file.",
    "- rp-probe: A project skill.",
    "- simplify: Review the changed code.",
  ].join("\n");

  test("only the kept entries stay, multi-line descriptions whole", () => {
    const out = keepSkillEntries(
      listing,
      (name) => name === "storyteller:recap" || name === "rp-probe",
    );
    expect(out).toBe(
      [
        "The following skills are available for use with the Skill tool:",
        "",
        "- storyteller:recap: Give the player a short recap.",
        "- rp-probe: A project skill.",
      ].join("\n"),
    );
  });

  test("nothing kept drops the listing", () => {
    expect(keepSkillEntries(listing, () => false)).toBeNull();
  });
});
