import { describe, expect, test } from "bun:test";
import { directiveDeltas, directiveRecord } from "./directive-deltas.ts";
import type { Directive } from "./story.ts";

const directive = (stem: string, title: string, fields: Partial<Directive> = {}): Directive => ({
  ref: `directives/${stem}`,
  stem,
  path: `directives/${stem}.md`,
  source: "story",
  title,
  mode: "always",
  keys: [],
  on: true,
  body: `${title} body.\n`,
  ...fields,
});

const noir = directive("noir", "Noir");
const boundaries = directive("boundaries", "Boundaries");
const fade = directive("fade", "Fade to black", { mode: "manual", on: false });
const slowBurn = directive("slow-burn", "Slow burn", { mode: "keyed", keys: ["kiss"] });
const start = [boundaries, noir, fade, slowBurn];
const recorded = directiveRecord(start);

describe("directiveDeltas", () => {
  test("first turn: records the set and says nothing", () => {
    const result = directiveDeltas(start, undefined);
    expect(result.block).toBe("");
    expect(result.changedKeyed).toEqual([]);
    expect(Object.keys(result.record.inForce)).toEqual([
      "directives/boundaries",
      "directives/noir",
    ]);
    expect(Object.keys(result.record.keyed)).toEqual(["directives/slow-burn"]);
  });

  test("unchanged: nothing", () => {
    const result = directiveDeltas(start, recorded);
    expect(result.block).toBe("");
    expect(result.record).toEqual(recorded);
  });

  test("toggle on: the full set, then the new directive in full", () => {
    const now = [boundaries, noir, { ...fade, on: true }, slowBurn];
    const result = directiveDeltas(now, recorded);
    expect(result.block).toBe(
      [
        "Directives changed since the bible was written:",
        "Now in force: Boundaries, Noir, Fade to black.",
        "",
        "### Fade to black (manual)",
        "",
        "Fade to black body.",
      ].join("\n"),
    );
    expect(result.record.inForce["directives/fade"]).toBeDefined();
    expect(directiveDeltas(now, result.record).block).toBe("");
  });

  test("toggle off: the remaining set and what went off", () => {
    const result = directiveDeltas([boundaries, { ...noir, on: false }, fade, slowBurn], recorded);
    expect(result.block).toBe(
      [
        "Directives changed since the bible was written:",
        "Now in force: Boundaries.",
        "Switched off: Noir.",
      ].join("\n"),
    );
  });

  test("a deleted directive is named by its ref; an empty set says none", () => {
    const result = directiveDeltas([], directiveRecord([noir]));
    expect(result.block).toBe(
      [
        "Directives changed since the bible was written:",
        "Now in force: none.",
        "Switched off: directives/noir.",
      ].join("\n"),
    );
  });

  test("body edit: the edited directive in full; switched off follows it", () => {
    const edited = { ...noir, body: "Long sentences now." };
    const result = directiveDeltas([boundaries, edited], directiveRecord([boundaries, noir, fade]));
    expect(result.block).toBe(
      "Directives changed since the bible was written:\nNow in force: Boundaries, Noir.\n\n### Noir (always)\n\nLong sentences now.",
    );
    const off = directiveDeltas(
      [{ ...boundaries, on: false }, edited],
      directiveRecord([boundaries, noir]),
    );
    expect(off.block).toBe(
      [
        "Directives changed since the bible was written:",
        "Now in force: Noir.",
        "",
        "### Noir (always)",
        "",
        "Long sentences now.",
        "",
        "Switched off: Boundaries.",
      ].join("\n"),
    );
  });

  test("keyed body edit: no block, the ref is reported for the cooldown", () => {
    const edited = { ...slowBurn, body: "Faster now." };
    const result = directiveDeltas([boundaries, noir, fade, edited], recorded);
    expect(result.block).toBe("");
    expect(result.changedKeyed).toEqual(["directives/slow-burn"]);
    expect(directiveDeltas([boundaries, noir, fade, edited], result.record).changedKeyed).toEqual(
      [],
    );
  });

  test("a mode change moves a directive out of force", () => {
    const keyedNoir = { ...noir, mode: "keyed" as const, keys: ["rain"] };
    const result = directiveDeltas([boundaries, keyedNoir], directiveRecord([boundaries, noir]));
    expect(result.block).toContain("Switched off: Noir.");
    expect(result.changedKeyed).toEqual(["directives/noir"]);
  });

  test("compaction reset: the record after a reset is the current set", () => {
    const now = [boundaries, { ...noir, on: false }, { ...fade, on: true }, slowBurn];
    // SessionStart(compact) writes directiveRecord(now); the next turn is quiet.
    expect(directiveDeltas(now, directiveRecord(now)).block).toBe("");
  });
});
