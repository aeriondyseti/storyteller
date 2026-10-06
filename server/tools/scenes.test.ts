import { describe, expect, test } from "bun:test";
import { section } from "../../src/story.ts";
import { blankDir } from "../../src/testing/fixtures.ts";
import { load } from "../context.ts";
import { failure, worldFor } from "../testing.ts";
import { closeScene, openScene, setPersona } from "./scenes.ts";
import { removeWidget, setWidget } from "./state.ts";

describe("scene tools", () => {
  test("close_scene writes the summary and closes", async () => {
    const ctx = await worldFor();
    const text = await closeScene.call(ctx, { summary: "Mira let him in." });
    expect(text).toContain("Closed scene 3");
    const scene = (await load(ctx)).scenes.find((s) => s.number === 3);
    expect(scene?.status).toBe("closed");
    expect(section(scene?.body ?? "", "Summary")).toBe("Mira let him in.");
    expect(section(scene?.body ?? "", "Now")).toContain("The tide is coming in.");
    expect(await failure(closeScene, ctx, { summary: "again" })).toContain("is closed");
  });

  test("open_scene refuses while a scene is open", async () => {
    const ctx = await worldFor();
    expect(await failure(openScene, ctx, { title: "Next" })).toContain("still open");
  });

  test("open_scene numbers, slugs, creates an empty log and carries state", async () => {
    const ctx = await worldFor();
    await closeScene.call(ctx, { summary: "Done." });
    const text = await openScene.call(ctx, {
      title: "The Lantern's Back Room",
      location: "The Lantern",
    });
    const dir = `${ctx.storyDir}/scenes/004-the-lantern-s-back-room`;
    expect(text).toBe(
      `Opened scene 4, "The Lantern's Back Room": ${dir}/scene.md. Carried widgets: debt, tide.`,
    );
    expect(await Bun.file(`${dir}/log.jsonl`).text()).toBe("");
    const story = await load(ctx);
    const scene = story.scene;
    expect(scene).toMatchObject({
      number: 4,
      status: "open",
      location: "The Lantern",
      time: "an hour before dawn",
      present: ["mira", "edda"],
      persona: "corwin",
    });
    expect(scene?.widgets).toEqual({
      debt: { type: "text", value: "3 crowns", note: "owed to Edda" },
      tide: { type: "counter", value: 4 },
    });
  });

  test("open_scene carries widgets in order, with every field", async () => {
    const ctx = await worldFor();
    await setWidget.call(ctx, {
      name: "Health",
      type: "meter",
      value: 5,
      max: 10,
      color: "#c33",
      pane: "Body",
      group: "Vitals",
    });
    await removeWidget.call(ctx, { name: "debt" });
    await closeScene.call(ctx, { summary: "Done." });
    await openScene.call(ctx, { title: "Next" });
    const widgets = (await load(ctx)).scene?.widgets ?? {};
    expect(Object.keys(widgets)).toEqual(["tide", "Health"]);
    expect(widgets.Health).toEqual({
      type: "meter",
      value: 5,
      max: 10,
      color: "#c33",
      pane: "Body",
      group: "Vitals",
    });
  });

  test("open_scene on a blank story starts at 1 with the story's persona", async () => {
    const ctx = await worldFor(blankDir);
    await openScene.call(ctx, { title: "Arrival", present: ["corwin", "mira"] });
    const scene = (await load(ctx)).scene;
    expect(scene).toMatchObject({
      number: 1,
      slug: "arrival",
      present: ["corwin", "mira"],
      widgets: {},
    });
    expect(scene?.persona).toBeUndefined();
    expect(scene?.body).toBe("## Now\n\n## Notes");
  });

  test("set_persona", async () => {
    const ctx = await worldFor();
    expect(await setPersona.call(ctx, { stem: "Edda" })).toBe(
      "The player now plays Edda (edda) in scene 3.",
    );
    expect((await load(ctx)).scene?.persona).toBe("edda");
    expect(await failure(setPersona, ctx, { stem: "ghost" })).toStartWith('No character "ghost".');
  });
});
