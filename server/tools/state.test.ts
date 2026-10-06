import { describe, expect, test } from "bun:test";
import { readFrontmatterFile, writeFrontmatterFile } from "../../src/frontmatter.ts";
import { generatedPaths } from "../../src/generate.ts";
import { load } from "../context.ts";
import { failure, worldFor } from "../testing.ts";
import { closeScene } from "./scenes.ts";
import { removeWidget, rollDice, setSceneState, setWidget } from "./state.ts";

const scenePath = (dir: string) => `${dir}/scenes/003-the-tallow-stair/scene.md`;

describe("state tools", () => {
  test("set_scene_state writes the current scene and regenerates", async () => {
    const ctx = await worldFor();
    const text = await setSceneState.call(ctx, {
      location: "The Lantern",
      present: ["Edda", "corwin", "stranger"],
    });
    expect(text).toContain("Scene 3 updated");
    expect(text).toContain("No card yet for: stranger.");
    const story = await load(ctx);
    expect(story.scene?.location).toBe("The Lantern");
    expect(story.scene?.time).toBe("an hour before dawn");
    expect(story.scene?.present).toEqual(["edda", "corwin", "stranger"]);
    const prompt = await Bun.file(generatedPaths(story).promptFile).text();
    expect(prompt).toContain("Location: The Lantern");
    expect(await Bun.file(generatedPaths(story).claudeMdFile).exists()).toBe(true);
  });

  test("set_scene_state keeps the body intact", async () => {
    const ctx = await worldFor();
    const before = await readFrontmatterFile(scenePath(ctx.storyDir));
    await setSceneState.call(ctx, { mood: "tense" });
    const after = await readFrontmatterFile(scenePath(ctx.storyDir));
    expect(after.body).toBe(before.body);
    expect(after.data.mood).toBe("tense");
  });

  test("set_scene_state renames the scene in frontmatter only", async () => {
    const ctx = await worldFor();
    const file = scenePath(ctx.storyDir);
    const before = await readFrontmatterFile(file);
    const text = await setSceneState.call(ctx, { title: "  The Long Wait  " });
    expect(text).toBe("Scene 3 updated (title: The Long Wait).");
    const after = await readFrontmatterFile(file);
    expect(after.data).toEqual({ ...before.data, title: "The Long Wait" });
    expect(after.body).toBe(before.body);
    const story = await load(ctx);
    expect(story.scene?.title).toBe("The Long Wait");
    expect(story.scene?.path.replaceAll("\\", "/")).toContain("/003-the-tallow-stair/");
    const prompt = await Bun.file(generatedPaths(story).promptFile).text();
    expect(prompt).toContain("The Long Wait");
  });

  test("set_scene_state refuses an empty title", async () => {
    const ctx = await worldFor();
    const before = await readFrontmatterFile(scenePath(ctx.storyDir));
    expect(await failure(setSceneState, ctx, { title: "  " })).toBe(
      "A scene title cannot be empty.",
    );
    expect(await readFrontmatterFile(scenePath(ctx.storyDir))).toEqual(before);
  });

  test("set_scene_state needs something to change and an open scene", async () => {
    const ctx = await worldFor();
    expect(await failure(setSceneState, ctx, {})).toStartWith("Nothing to change");
    await closeScene.call(ctx, { summary: "Done." });
    expect(await failure(setSceneState, ctx, { mood: "x" })).toContain("is closed");
  });

  test("set_widget creates, updates (keeping what is omitted) and matches case-insensitively", async () => {
    const ctx = await worldFor();
    expect(await setWidget.call(ctx, { name: "DEBT", value: "5 crowns" })).toBe(
      "debt 5 crowns [text] (was debt 3 crowns [text]).",
    );
    expect(
      await setWidget.call(ctx, {
        name: "Health",
        type: "meter",
        value: 88,
        max: 100,
        color: "#c0392b",
        group: "Body",
        note: "A cut on the arm.",
      }),
    ).toBe("Health 88/100 [meter] (new).");
    expect(await setWidget.call(ctx, { name: "health", value: 70 })).toBe(
      "Health 70/100 [meter] (was Health 88/100 [meter]).",
    );
    await setWidget.call(ctx, { name: "Conditions", type: "tags", value: ["wounded"] });
    const widgets = (await load(ctx)).scene?.widgets ?? {};
    expect(Object.keys(widgets)).toEqual(["debt", "tide", "Health", "Conditions"]);
    expect(widgets.debt).toEqual({ type: "text", value: "5 crowns", note: "owed to Edda" });
    expect(widgets.Health).toEqual({
      type: "meter",
      value: 70,
      max: 100,
      note: "A cut on the arm.",
      color: "#c0392b",
      group: "Body",
    });
    const prompt = await Bun.file(generatedPaths(await load(ctx)).promptFile).text();
    expect(prompt).toContain("  Body:\n    - Health 70/100 (meter) - A cut on the arm.");
  });

  test("set_widget: an empty string clears, a type change drops the old fields", async () => {
    const ctx = await worldFor();
    await setWidget.call(ctx, { name: "debt", note: "", pane: "Ledger" });
    expect((await load(ctx)).scene?.widgets.debt).toEqual({
      type: "text",
      value: "3 crowns",
      pane: "Ledger",
    });
    await setWidget.call(ctx, { name: "Fuel", type: "meter", value: 3, max: 4 });
    await setWidget.call(ctx, { name: "Fuel", type: "clock", value: 1, of: 6 });
    const doc = await readFrontmatterFile(scenePath(ctx.storyDir));
    expect((doc.data.widgets as Record<string, unknown>).Fuel).toEqual({
      type: "clock",
      value: 1,
      of: 6,
    });
  });

  test("set_widget refuses with the fix named", async () => {
    const ctx = await worldFor();
    expect(await failure(setWidget, ctx, { name: "Health", type: "meter", value: 88 })).toBe(
      "Health: meter needs max: the value is drawn as a bar out of it.",
    );
    expect(await failure(setWidget, ctx, { name: "Fresh", value: 1 })).toBe(
      "Fresh is a new widget: give it a type, one of text, counter, meter, clock, list, tags.",
    );
    expect(await failure(setWidget, ctx, { name: "tide", value: "high" })).toContain(
      "put words in a text widget",
    );
    expect(
      await failure(setWidget, ctx, { name: "x", type: "text", value: "y", color: "red" }),
    ).toContain("hex colour");
    expect(await failure(setWidget, ctx, { name: "x", type: "dial", value: 1 })).toStartWith(
      "Invalid input: type",
    );
  });

  test("remove_widget", async () => {
    const ctx = await worldFor();
    expect(await removeWidget.call(ctx, { name: "TIDE" })).toBe("Removed widget tide.");
    expect(Object.keys((await load(ctx)).scene?.widgets ?? {})).toEqual(["debt"]);
    expect(await failure(removeWidget, ctx, { name: "tide" })).toBe(
      'No widget "tide". Widgets: debt.',
    );
    await removeWidget.call(ctx, { name: "debt" });
    const doc = await readFrontmatterFile(scenePath(ctx.storyDir));
    expect(doc.data.widgets).toBeUndefined();
    expect(await failure(removeWidget, ctx, { name: "x" })).toBe(
      'No widget "x". There are no widgets.',
    );
  });

  test("a scene still holding trackers is rewritten as widgets on the next write", async () => {
    const ctx = await worldFor();
    const file = scenePath(ctx.storyDir);
    const old = await readFrontmatterFile(file);
    const { widgets: _w, ...rest } = old.data;
    await writeFrontmatterFile(
      file,
      {
        ...rest,
        trackers: { debt: { value: "3 crowns", note: "owed to Edda" }, tide: { value: 4 } },
      },
      old.body,
    );
    await setSceneState.call(ctx, { mood: "tense" });
    const doc = await readFrontmatterFile(file);
    expect(doc.data.trackers).toBeUndefined();
    expect(doc.data.widgets).toEqual({
      debt: { type: "text", value: "3 crowns", note: "owed to Edda" },
      tide: { type: "counter", value: 4 },
    });
    expect(doc.body).toBe(old.body);
  });

  test("set_widget leaves an invalid hand-written entry alone", async () => {
    const ctx = await worldFor();
    const file = scenePath(ctx.storyDir);
    const old = await readFrontmatterFile(file);
    const widgets = { ...(old.data.widgets as object), Fuel: { type: "meter", value: 3 } };
    await writeFrontmatterFile(file, { ...old.data, widgets }, old.body);
    const prompt = async () => Bun.file(generatedPaths(await load(ctx)).promptFile).text();
    await setWidget.call(ctx, { name: "tide", value: 5 });
    expect(await prompt()).toContain("Widget problems:\n  - Fuel: meter needs max");
    const doc = await readFrontmatterFile(file);
    expect((doc.data.widgets as Record<string, unknown>).Fuel).toEqual({ type: "meter", value: 3 });
  });

  test("roll", async () => {
    const ctx = await worldFor();
    expect(await rollDice.call(ctx, { expr: "2d6+1" })).toMatch(
      /^2d6\+1: 2d6 \[\d, \d\] \+ 1 = \d+$/,
    );
    expect(await failure(rollDice, ctx, { expr: "lots" })).toContain("dice notation");
  });
});
