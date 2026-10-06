import { z } from "zod";
import { renderWidgets } from "../../src/render.ts";
import {
  type Character,
  findCharacter,
  type LoreEntry,
  personaOf,
  type Scene,
  type Story,
  sheetFor,
} from "../../src/story.ts";
import { load, ToolError, type WorldContext } from "../context.ts";
import { freshIndex } from "../index/world-index.ts";
import { defineTool } from "../registry.ts";

// Looking things up before stating them (continuity before invention).

const maxLoreResults = 8;
// Cosine score a lore passage needs to count as a meaning match for search_lore.
export const loreThreshold = 0.35;

export const getCharacter = defineTool({
  name: "get_character",
  description:
    "Read a character's full card (and rules sheet, if any) by name or file stem. Use it before you voice someone or state a fact about them you are not sure of.",
  input: { nameOrStem: z.string().min(1).describe("Display name or card stem, e.g. mira") },
  run: async (ctx, { nameOrStem }) => {
    const story = await load(ctx);
    const card = findCharacter(story, nameOrStem);
    if (!card) throw new ToolError(`No character "${nameOrStem}". ${knownCharacters(story)}`);
    const sheet = sheetFor(story, card.stem);
    const meta = [
      `${card.name} (${card.stem})${card.stem === personaOf(story) ? ", the player's character" : ""}`,
      `Card: ${card.path} (${card.source})`,
      card.tags.length ? `Tags: ${card.tags.join(", ")}` : "",
      card.portrait ? `Portrait: ${card.portrait}` : "",
    ].filter(Boolean);
    const parts = [meta.join("\n"), card.body || "(empty card)"];
    if (sheet) {
      parts.push(
        [`Sheet: ${sheet.path}`, sheetStats(sheet.data), sheet.body].filter(Boolean).join("\n"),
      );
    }
    return parts.join("\n\n");
  },
});

export const listCharacters = defineTool({
  name: "list_characters",
  description:
    "List every character card in the story with stem, name and tags. Use it to find the right stem, or to check whether someone already has a card before inventing them.",
  input: {},
  run: async (ctx) => {
    const story = await load(ctx);
    if (story.characters.length === 0) return "No character cards yet.";
    const persona = personaOf(story);
    const present = new Set(story.scene?.status === "open" ? story.scene.present : []);
    return story.characters.map((c) => characterLine(c, persona, present)).join("\n");
  },
});

export const searchLore = defineTool({
  name: "search_lore",
  description:
    "Search the story's lore by keyword and by meaning: matches entry keys, titles and text, then entries about the same thing in other words. Use it when a place, faction, custom or rule of the world comes up and you need the established facts.",
  input: { query: z.string().min(1).describe("A name, word or phrase, e.g. tide-bells") },
  run: async (ctx, { query }) => {
    const story = await load(ctx);
    const keyword = rankLore(story.lore, query);
    const semantic = await semanticLore(ctx, story, query);
    const hits = [...new Set([...keyword, ...semantic])].slice(0, maxLoreResults);
    if (hits.length === 0) {
      return `No lore matches "${query}". If you invent a fact here, record it with upsert_lore.`;
    }
    return hits.map(loreBlock).join("\n\n");
  },
});

export const getScene = defineTool({
  name: "get_scene",
  description:
    "Read a scene's state, Now, Notes and Summary; the current scene when no number is given. Use it to check where things stand, or to look back at an earlier scene.",
  input: { number: z.number().int().positive().optional().describe("Scene number") },
  run: async (ctx, { number }) => {
    const story = await load(ctx);
    const scene =
      number === undefined ? story.scene : story.scenes.find((s) => s.number === number);
    if (!scene) {
      if (story.scenes.length === 0) throw new ToolError("There are no scenes yet.");
      throw new ToolError(
        `No scene ${number}. Scenes: ${story.scenes.map((s) => s.number).join(", ")}.`,
      );
    }
    return sceneText(story, scene);
  },
});

export const getDirectives = defineTool({
  name: "get_directives",
  description:
    "List every directive (standing style and content instructions) with its mode, whether it is on, and where it comes from. Use it when the player asks what is in force or wants one changed.",
  input: {},
  run: async (ctx) => {
    const story = await load(ctx);
    if (story.directives.length === 0) return "No directives.";
    return story.directives
      .map((d) => {
        const keys = d.mode === "keyed" ? ` · keys: ${d.keys.join(", ") || "(none)"}` : "";
        return `${d.stem}: ${d.title} · ${d.mode} · ${d.on ? "on" : "off"} · ${d.source}${keys}\n  ${d.path}\n  ${d.body.replace(/\s+/g, " ")}`;
      })
      .join("\n");
  },
});

export const readTools = [getCharacter, listCharacters, searchLore, getScene, getDirectives];

export function knownCharacters(story: Story): string {
  return story.characters.length
    ? `Known: ${story.characters.map((c) => c.stem).join(", ")}.`
    : "There are no character cards yet.";
}

// Scene and story files hold card stems (spec 16); accept a display name too.
export function toStem(story: Story, nameOrStem: string): string {
  return findCharacter(story, nameOrStem)?.stem ?? nameOrStem.trim();
}

function characterLine(c: Character, persona: string | undefined, present: Set<string>): string {
  const marks = [
    c.stem === persona ? "player's character" : "",
    present.has(c.stem) ? "present" : "",
    c.source === "library" ? "from library" : "",
  ].filter(Boolean);
  const tags = c.tags.length ? ` [${c.tags.join(", ")}]` : "";
  const extra = marks.length ? ` (${marks.join(", ")})` : "";
  return `${c.stem}: ${c.name}${tags}${extra}`;
}

function sheetStats(data: Record<string, unknown>): string {
  const entries = Object.entries(data);
  return entries.length ? entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ") : "";
}

// Key matches rank first (a key appearing as a whole word in the query, or the
// query as a whole word in a key), then title matches, then body matches.
export function rankLore(lore: LoreEntry[], query: string): LoreEntry[] {
  const q = query.trim().toLowerCase();
  const score = (l: LoreEntry): number => {
    if (l.keys.some((k) => wordIn(k.toLowerCase(), q) || wordIn(q, k.toLowerCase()))) return 3;
    if (l.title.toLowerCase().includes(q)) return 2;
    if (l.body.toLowerCase().includes(q)) return 1;
    return 0;
  };
  return lore
    .map((l) => ({ l, s: score(l) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.l.priority - a.l.priority)
    .map((x) => x.l);
}

// Lore entries whose embedded text is close to the query, best first. The
// index is optional here: if it cannot be built (no model, hosted provider not
// built yet), search_lore still answers by keyword.
async function semanticLore(ctx: WorldContext, story: Story, query: string): Promise<LoreEntry[]> {
  let refs: string[];
  try {
    const index = await freshIndex(ctx, story);
    const hits = await index.search(query, { kinds: ["lore"], limit: maxLoreResults });
    refs = hits.filter((h) => h.score >= loreThreshold).flatMap((h) => (h.ref ? [h.ref] : []));
  } catch {
    return [];
  }
  return [...new Set(refs)].flatMap((ref) => story.lore.filter((l) => l.ref === ref));
}

function wordIn(needle: string, haystack: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(haystack);
}

function loreBlock(l: LoreEntry): string {
  const flags = [l.always ? "always in play" : "", l.source === "library" ? "library" : ""]
    .filter(Boolean)
    .join(", ");
  // Discovery and truth (spec 20.11); the Secret and History stay in the file.
  const known = l.known === "secret" ? "yes, Secret included" : l.known ? "yes" : "no";
  return [
    `## ${l.title} (${l.stem})${flags ? ` · ${flags}` : ""}`,
    `Keys: ${l.keys.join(", ") || "(none)"} · ${l.path}`,
    `Known: ${known} · truth: ${l.truth}`,
    "",
    l.body,
  ].join("\n");
}

export function sceneText(story: Story, scene: Scene): string {
  const state = [
    `Scene ${scene.number}: ${scene.title} (${scene.status})`,
    `File: ${scene.path}`,
    `Log: ${scene.logPath}`,
    scene.location ? `Location: ${scene.location}` : "",
    scene.time ? `Time: ${scene.time}` : "",
    scene.mood ? `Mood: ${scene.mood}` : "",
    `Present: ${scene.present.join(", ") || "nobody named"}`,
    `Player plays: ${personaOf(story, scene) ?? "not chosen"}`,
    renderWidgets(scene),
  ].filter(Boolean);
  return `${state.join("\n")}\n\n${scene.body || "(no Now or Notes written yet)"}`.trim();
}
