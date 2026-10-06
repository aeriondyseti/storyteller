import { describe, expect, test } from "bun:test";
import { readFrontmatterFile, writeFrontmatterFile } from "../src/frontmatter.ts";
import { loadStory } from "../src/story.ts";
import { blankDir, copyStory, fixtureLibrary, saltmereDir } from "../src/testing/fixtures.ts";
import { snapshot } from "./scene.ts";

describe("snapshot", () => {
  test("the open scene, with the persona left off stage", async () => {
    const story = await loadStory(saltmereDir, { libraryRoot: fixtureLibrary });
    const snap = await snapshot(story);
    expect(snap.storyteller).toBe("Vex");
    expect(snap.persona).toBe("Corwin Hale");
    expect(snap.scene).toMatchObject({
      number: 3,
      title: "The Tallow Stair",
      location: "The Tallow Stair, Saltmere",
      time: "an hour before dawn",
      mood: "uneasy",
      now: "The tide is coming in. Mira waits on the stair with a lantern.",
      widgets: [
        {
          name: "debt",
          type: "text",
          value: "3 crowns",
          note: "owed to Edda",
          color: null,
          pane: null,
          group: null,
        },
        {
          name: "tide",
          type: "counter",
          value: 4,
          note: null,
          color: null,
          pane: null,
          group: null,
        },
      ],
    });
    expect(snap.scene?.present.map((p) => p.stem)).toEqual(["mira", "edda"]);
    expect(snap.scene?.present.find((p) => p.stem === "edda")?.tags).toEqual(["innkeeper"]);
    expect(snap.speakers.map((s) => s.stem)).toEqual(["mira", "edda"]);
  });

  test("every widget type crosses as plain JSON, in file order", async () => {
    const dir = await copyStory(saltmereDir);
    const file = `${dir}/scenes/003-the-tallow-stair/scene.md`;
    const old = await readFrontmatterFile(file);
    await writeFrontmatterFile(
      file,
      {
        ...old.data,
        widgets: {
          Health: { type: "meter", value: 88, max: 100, color: "#c0392b" },
          Suspicion: { type: "clock", value: 2, of: 6 },
          Powers: { type: "list", value: ["wheel", "parry"], pane: "Powers" },
          Conditions: { type: "tags", value: ["wounded", "hunted"] },
        },
      },
      old.body,
    );
    const snap = await snapshot(await loadStory(dir, { libraryRoot: fixtureLibrary }));
    expect(snap.scene?.widgets.map((w) => w.name)).toEqual([
      "Health",
      "Suspicion",
      "Powers",
      "Conditions",
    ]);
    expect(snap.scene?.widgets[0]).toMatchObject({ type: "meter", max: 100, color: "#c0392b" });
    expect(snap.scene?.widgets[2]?.pane).toBe("Powers");
  });

  test("a portrait is offered only when its PNG exists", async () => {
    const dir = await copyStory(saltmereDir);
    await Bun.write(`${dir}/characters/edda.md`, "---\nname: Edda\nportrait: edda.png\n---\n");
    await Bun.write(`${dir}/assets/edda.png`, "png");
    const snap = await snapshot(await loadStory(dir, { libraryRoot: fixtureLibrary }));
    const edda = snap.scene?.present.find((p) => p.stem === "edda");
    expect(edda?.portrait).toBe(`${dir}/assets/edda.png`);
    expect(snap.scene?.present.find((p) => p.stem === "mira")?.portrait).toBeNull();
  });

  test("a blank story has no scene", async () => {
    const snap = await snapshot(await loadStory(blankDir, { libraryRoot: fixtureLibrary }));
    expect(snap.scene).toBeNull();
    expect(snap.persona).toBeNull();
  });
});
