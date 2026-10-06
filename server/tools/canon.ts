import { z } from "zod";
import {
  type Frontmatter,
  readFrontmatterFile,
  writeFrontmatterFile,
} from "../../src/frontmatter.ts";
import type { LibraryKind } from "../../src/library.ts";
import { loreTruths, parseLoreFields, privateTail } from "../../src/lore.ts";
import { directiveModes, findCharacter, personaOf, type Story } from "../../src/story.ts";
import { load, regenerate, ToolError, type WorldContext } from "../context.ts";
import { checkStem, editFile } from "../edit.ts";
import { defineTool } from "../registry.ts";
import { knownCharacters, toStem } from "./read.ts";

// Writing canon: cards, lore, directives, the story file and sheets. Writes
// always land in the story folder; writing over a library item creates a
// story-local copy that overrides it (spec 5.3), so other stories are untouched.

export const upsertCharacter = defineTool({
  name: "upsert_character",
  description:
    "Create or rewrite a character card. Use it in the same turn you invent a named person who could come up again, or when someone's established truths change. Do not touch the player's own card unless they asked in copilot register.",
  input: {
    stem: z.string().describe("File stem, lowercase-with-dashes, e.g. mira"),
    name: z.string().min(1),
    tags: z.array(z.string()).optional(),
    portrait: z.string().optional().describe("File name under assets/"),
    body: z
      .string()
      .min(1)
      .describe("The whole card: appearance, personality, voice, backstory, example dialogue"),
  },
  run: async (ctx, { stem, name, tags, portrait, body }) => {
    const s = checkStem(stem);
    const story = await load(ctx);
    const file = await writeItem(ctx, story, "characters", s, { name, tags, portrait }, body);
    const note = s === personaOf(story) ? " This is the player's character." : "";
    return `${file.verb} card ${s} (${name}): ${file.path}.${file.note}${note}`;
  },
});

export const upsertLore = defineTool({
  name: "upsert_lore",
  description:
    "Create or rewrite a lore entry: a place, faction, custom, history or rule of the world. Use it in the same turn you establish a fact that could come up again; keys are the words that should bring it to mind.",
  input: {
    stem: z.string().describe("File stem, lowercase-with-dashes"),
    title: z.string().min(1),
    keys: z.array(z.string()).describe("Words or names that should activate this entry"),
    also: z
      .union([
        z.strictObject({ any: z.array(z.string()).min(1) }),
        z.strictObject({ all: z.array(z.string()).min(1) }),
      ])
      .optional()
      .describe("Secondary keys: {any: [...]} or {all: [...]} must also appear with a key"),
    unless: z.array(z.string()).optional().describe("Words that block the entry when present"),
    always: z.boolean().optional().describe("Keep it in play at all times (use sparingly)"),
    priority: z.number().optional().describe("Higher goes first when the budget is tight"),
    scope: z
      .string()
      .optional()
      .describe("story (default), character:<card stem> (while present) or place:<text>"),
    cooldown: z.number().int().min(0).optional().describe("Turns before it may repeat (6)"),
    chance: z.number().min(0).max(100).optional().describe("Percent chance once matched (100)"),
    group: z.string().optional().describe("Inclusion group: one entry per group fires"),
    weight: z.number().positive().optional().describe("Draw weight inside its group (1)"),
    recurse: z.boolean().optional().describe("Its text may wake other entries (true)"),
    scan: z.number().int().min(0).optional().describe("Logged turns to scan for its keys"),
    known: z.union([z.boolean(), z.literal("secret")]).optional(),
    truth: z.enum(loreTruths).optional(),
    body: z
      .string()
      .min(1)
      .describe(
        "The public text. Existing ## Secret and ## History sections are kept unless the body has its own",
      ),
  },
  run: async (ctx, { stem, body, ...fields }) => {
    const s = checkStem(stem);
    const story = await load(ctx);
    const existing = story.lore.find((l) => l.stem === s);
    const old = existing ? await readFrontmatterFile(existing.path) : { data: {}, body: "" };
    const changes: Frontmatter = { ...fields };
    // Validate the entry as it will be on disk before writing anything.
    parseLoreFields({ ...old.data, ...defined(changes) }, s);
    const tail = privateTail(body) ? "" : privateTail(old.body);
    const fullBody = tail ? `${body.trim()}\n\n${tail}` : body;
    const file = await writeItem(ctx, story, "lore", s, changes, fullBody);
    return `${file.verb} lore ${s} (${fields.title}): ${file.path}.${file.note}`;
  },
});

export const upsertDirective = defineTool({
  name: "upsert_directive",
  description:
    "Create or rewrite a directive, a standing instruction on style, pacing or content. Use it when the player asks, out of character, for a lasting change to how you tell the story.",
  input: {
    stem: z.string().describe("File stem, lowercase-with-dashes"),
    title: z.string().min(1),
    mode: z
      .enum(directiveModes)
      .describe("always: in force; keyed: when a key comes up; manual: toggled"),
    keys: z.array(z.string()).optional(),
    on: z.boolean().optional(),
    body: z.string().min(1).describe("The instruction itself"),
  },
  run: async (ctx, { stem, title, mode, keys, on, body }) => {
    const s = checkStem(stem);
    const story = await load(ctx);
    const file = await writeItem(ctx, story, "directives", s, { title, mode, keys, on }, body);
    return `${file.verb} directive ${s} (${title}, ${mode}): ${file.path}.${file.note}`;
  },
});

export const setDirective = defineTool({
  name: "set_directive",
  description:
    "Turn a directive on or off by stem. Use it when the player asks to switch one, or when a manual directive fits the scene and they have agreed.",
  input: { stem: z.string().min(1), on: z.boolean() },
  run: async (ctx, { stem, on }) => {
    const story = await load(ctx);
    const directive = story.directives.find((d) => d.stem === stem.trim());
    if (!directive) {
      const known = story.directives.map((d) => d.stem).join(", ") || "none";
      throw new ToolError(`No directive "${stem}". Directives: ${known}.`);
    }
    const file = await writeItem(ctx, story, "directives", directive.stem, { on });
    return `${directive.title} is now ${on ? "on" : "off"}.${file.note}`;
  },
});

export const updateStory = defineTool({
  name: "update_story",
  description:
    "Change story.md: title, the player's character, your own name/tagline/voice, the premise and standing rules (notes), lines or veils. Use it only when the player asks in copilot register, including during the blank-story interview.",
  input: {
    title: z.string().min(1).optional(),
    persona: z.string().optional().describe("Card stem of the player's character"),
    storyteller: z
      .object({
        name: z.string().optional(),
        tagline: z.string().optional(),
        voice: z.string().optional(),
      })
      .optional(),
    notes: z.string().optional().describe("Replaces the whole body: premise, tone, standing rules"),
    lines: z.array(z.string()).optional().describe("Replaces the list"),
    veils: z.array(z.string()).optional().describe("Replaces the list"),
  },
  run: async (ctx, args) => {
    const changed = Object.entries(args)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k);
    if (changed.length === 0) throw new ToolError("Nothing to change.");
    const story = await load(ctx);
    const { data } = await readFrontmatterFile(story.path);
    const old = isRecord(data.storyteller) ? data.storyteller : {};
    const storyteller = args.storyteller ? { ...old, ...defined(args.storyteller) } : undefined;
    const persona = args.persona === undefined ? undefined : toStem(story, args.persona);
    await editFile(
      story.path,
      {
        title: args.title,
        storyteller,
        persona,
        lines: args.lines,
        veils: args.veils,
      },
      args.notes,
    );
    await regenerate(ctx);
    const warn = persona && !findCharacter(story, persona) ? ` No card yet for ${persona}.` : "";
    return `Updated story.md (${changed.join(", ")}).${warn}`;
  },
});

export const updateSheet = defineTool({
  name: "update_sheet",
  description:
    "Rewrite a character's rules sheet under the story's declared system, optionally setting stats. Use it whenever a roll or the fiction changes something the sheet tracks.",
  input: {
    stem: z.string().min(1).describe("Card stem or name of the character"),
    body: z.string().describe("The whole sheet text"),
    stats: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .optional()
      .describe("Stat values merged into the sheet's frontmatter, e.g. {harm: 1}"),
  },
  run: async (ctx, { stem, body, stats }) => {
    const story = await load(ctx);
    const card = findCharacter(story, stem);
    if (!card) throw new ToolError(`No character "${stem}". ${knownCharacters(story)}`);
    const file = `${story.dir}/sheets/${card.stem}.md`;
    await editFile(file, stats ?? {}, body);
    await regenerate(ctx);
    return `Updated sheet for ${card.name}: ${file}.`;
  },
});

export const canonTools = [
  upsertCharacter,
  upsertLore,
  upsertDirective,
  setDirective,
  updateStory,
  updateSheet,
];

// Writes <story>/<kind>/<stem>.md. When the item so far came from the library,
// the story copy starts from the library file so nothing is lost.
async function writeItem(
  ctx: WorldContext,
  story: Story,
  kind: LibraryKind,
  stem: string,
  changes: Frontmatter,
  body?: string,
): Promise<{ path: string; verb: string; note: string }> {
  const path = `${story.dir}/${kind}/${stem}.md`;
  const existing = [...story.characters, ...story.lore, ...story.directives].find(
    (i) => i.ref === `${kind}/${stem}`,
  );
  let note = "";
  if (existing?.source === "library") {
    const lib = await readFrontmatterFile(existing.path);
    await writeFrontmatterFile(path, lib.data, lib.body);
    note = " The story now has its own copy, overriding the library's.";
  }
  await editFile(path, changes, body);
  await regenerate(ctx);
  return { path, verb: existing ? "Updated" : "Created", note };
}

function defined<T>(obj: Record<string, T | undefined>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(obj).filter((e): e is [string, T] => e[1] !== undefined),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
