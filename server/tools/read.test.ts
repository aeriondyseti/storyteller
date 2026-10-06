import { describe, expect, test } from "bun:test";
import { failure, worldFor } from "../testing.ts";
import { getCharacter, getDirectives, getScene, listCharacters, searchLore } from "./read.ts";

describe("read tools", () => {
  test("get_character by stem or name, with sheet", async () => {
    const ctx = await worldFor();
    const text = await getCharacter.call(ctx, { nameOrStem: "Corwin" });
    expect(text).toContain("(corwin), the player's character");
    expect(text).toContain(`${ctx.storyDir}/characters/corwin.md`);
    expect(text).toContain("Sheet:");
    expect(text).toContain("edge: 2");
    expect(text).toContain("Moves: Read the water");
    const edda = await getCharacter.call(ctx, { nameOrStem: "edda" });
    expect(edda).toContain("Tags: innkeeper");
    expect(edda).toContain("Knows everyone's debts.");
  });

  test("get_character names the known stems when missing", async () => {
    const ctx = await worldFor();
    const message = await failure(getCharacter, ctx, { nameOrStem: "Nobody" });
    expect(message).toBe('No character "Nobody". Known: corwin, edda, mira.');
  });

  test("list_characters marks persona, presence and library", async () => {
    const ctx = await worldFor();
    const text = await listCharacters.call(ctx, {});
    expect(text).toContain("corwin: Corwin");
    expect(text).toContain("player's character");
    expect(text).toMatch(/mira: .*present, from library/);
    expect(text).toMatch(/edda: Edda \[innkeeper\] \(present\)/);
  });

  test("search_lore matches keys on word boundaries, then titles and bodies", async () => {
    const ctx = await worldFor();
    const bells = await searchLore.call(ctx, { query: "the bells rang" });
    expect(bells).toStartWith("## The tide-bells (tide-bells)");
    expect(bells).toContain(`${ctx.storyDir}/lore/tide-bells.md`);
    const body = await searchLore.call(ctx, { query: "thirteen" });
    expect(body).toContain("The tide-bells");
    expect(await searchLore.call(ctx, { query: "dragons" })).toStartWith("No lore matches");
    // "bell" is a key, but must not match inside "belfry" as a key hit.
    const belfry = await searchLore.call(ctx, { query: "belfry" });
    expect(belfry).toContain("The tide-bells");
  });

  test("search_lore reports known and truth per hit; Secret and History stay out", async () => {
    const ctx = await worldFor();
    await Bun.write(
      `${ctx.storyDir}/lore/wreckers.md`,
      "---\ntitle: The Wreckers\nkeys: [wreckers]\nknown: secret\ntruth: rumor\n---\n\nThey lure ships.\n\n## Secret\n\nThe mayor leads them.\n\n## History\n\n- Scene 2: a ship broke.\n",
    );
    const wreckers = await searchLore.call(ctx, { query: "wreckers" });
    expect(wreckers).toContain("Known: yes, Secret included · truth: rumor");
    expect(wreckers).toContain("They lure ships.");
    expect(wreckers).not.toContain("mayor");
    expect(wreckers).not.toContain("ship broke");
    expect(await searchLore.call(ctx, { query: "the bells rang" })).toContain(
      "Known: yes · truth: fact",
    );
    await Bun.write(
      `${ctx.storyDir}/lore/eels.md`,
      "---\ntitle: Eels\ntruth: false\n---\n\nEels.\n",
    );
    expect(await searchLore.call(ctx, { query: "eels" })).toContain("Known: no · truth: false");
  });

  test("get_scene: current by default, or by number", async () => {
    const ctx = await worldFor();
    const current = await getScene.call(ctx, {});
    expect(current).toStartWith("Scene 3: The Tallow Stair (open)");
    expect(current).toContain("Widgets:\n  - debt 3 crowns (text) - owed to Edda");
    expect(current).toContain("## Now");
    const two = await getScene.call(ctx, { number: 2 });
    expect(two).toContain("## Summary");
    expect(await failure(getScene, ctx, { number: 9 })).toBe("No scene 9. Scenes: 1, 2, 3.");
  });

  test("get_directives lists mode, state and source", async () => {
    const ctx = await worldFor();
    const text = await getDirectives.call(ctx, {});
    expect(text).toContain("fade: Fade to black · manual · off · story");
    expect(text).toContain("slow-burn: Slow burn · keyed · on · story · keys: kiss, romance");
    expect(text).toContain("noir: Noir · always · on · library");
  });

  test("invalid input is reported, not thrown raw", async () => {
    const ctx = await worldFor();
    expect(await failure(getScene, ctx, { number: "two" })).toStartWith("Invalid input: number");
  });
});
