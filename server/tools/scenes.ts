import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { writeFrontmatterFile } from "../../src/frontmatter.ts";
import { findCharacter } from "../../src/story.ts";
import { load, regenerate, requireOpenScene, ToolError } from "../context.ts";
import { editScene, readWidgetBlock, setSection, slugify } from "../edit.ts";
import { defineTool } from "../registry.ts";
import { knownCharacters, toStem } from "./read.ts";

// Scene boundaries. Both open and close happen only after the player said yes
// through the dialog; the descriptions say so because the server cannot know.

export const openScene = defineTool({
  name: "open_scene",
  description:
    "Open the next scene, after the previous one is closed and the player agreed. Anything not given (place, time, mood, who is present, the player's character) carries over from the last scene, and so do its widgets, in order.",
  input: {
    title: z.string().min(1).describe("Short scene title, e.g. The Tallow Stair"),
    location: z.string().optional(),
    time: z.string().optional(),
    mood: z.string().optional(),
    present: z.array(z.string()).optional().describe("Card stems of everyone in the scene"),
    persona: z.string().optional().describe("Card stem of the character the player plays"),
  },
  run: async (ctx, { title, location, time, mood, present, persona }) => {
    const story = await load(ctx);
    const previous = story.scene;
    if (previous?.status === "open") {
      throw new ToolError(
        `Scene ${previous.number} ("${previous.title}") is still open. Close it with close_scene first.`,
      );
    }
    const number = Math.max(0, ...story.scenes.map((s) => s.number)) + 1;
    const slug = slugify(title) || "scene";
    const dir = `${story.dir}/scenes/${String(number).padStart(3, "0")}-${slug}`;
    // As written on disk, so a hand-edited entry carries over untouched.
    const block = previous ? await readWidgetBlock(previous.path) : {};
    const carry = Object.keys(block);
    const data = withoutUndefined({
      number,
      title: title.trim(),
      status: "open",
      location: location ?? previous?.location,
      time: time ?? previous?.time,
      mood: mood ?? previous?.mood,
      present: present?.map((p) => toStem(story, p)) ?? previous?.present ?? [],
      persona:
        persona === undefined ? (previous?.persona ?? story.persona) : toStem(story, persona),
      widgets: carry.length ? block : undefined,
    });
    await mkdir(dir, { recursive: true });
    await writeFrontmatterFile(`${dir}/scene.md`, data, "## Now\n\n## Notes");
    await Bun.write(`${dir}/log.jsonl`, "");
    await regenerate(ctx);
    const carried = carry.length ? ` Carried widgets: ${carry.join(", ")}.` : "";
    return `Opened scene ${number}, "${title.trim()}": ${dir}/scene.md.${carried}`;
  },
});

export const closeScene = defineTool({
  name: "close_scene",
  description:
    "Close the current scene with its summary, only after the player said yes through the dialog. Write the summary from the notes and log: what happened, what changed, what is left open.",
  input: { summary: z.string().min(1).describe("A few paragraphs of prose") },
  run: async (ctx, { summary }) => {
    const story = await load(ctx);
    const scene = requireOpenScene(story);
    await editScene(
      scene.path,
      { status: "closed" },
      { body: (body) => setSection(body, "Summary", summary) },
    );
    await regenerate(ctx);
    return `Closed scene ${scene.number}, "${scene.title}". Open the next with open_scene.`;
  },
});

export const setPersona = defineTool({
  name: "set_persona",
  description:
    "Change which character the player plays in the current scene. Use it only at a scene boundary, out of character, when the player asks.",
  input: { stem: z.string().min(1).describe("Card stem or name") },
  run: async (ctx, { stem }) => {
    const story = await load(ctx);
    const scene = requireOpenScene(story);
    const card = findCharacter(story, stem);
    if (!card) throw new ToolError(`No character "${stem}". ${knownCharacters(story)}`);
    await editScene(scene.path, { persona: card.stem });
    await regenerate(ctx);
    return `The player now plays ${card.name} (${card.stem}) in scene ${scene.number}.`;
  },
});

export const sceneTools = [openScene, closeScene, setPersona];

function withoutUndefined<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
