import { z } from "zod";
import { load } from "../context.ts";
import type { Hit } from "../index/index.ts";
import type { PassageKind } from "../index/passages.ts";
import { freshIndex } from "../index/world-index.ts";
import { defineTool } from "../registry.ts";

// Semantic recall over what has happened (spec 7.3): log turns, scene notes
// and closed-scene summaries. Lore has search_lore.

const scopes = {
  all: ["turn", "notes", "summary"],
  turns: ["turn"],
  notes: ["notes"],
  summaries: ["summary"],
} as const satisfies Record<string, readonly PassageKind[]>;

const maxRecallResults = 6;
// Below this cosine score a passage is noise, not a memory.
export const recallThreshold = 0.2;

export const recall = defineTool({
  name: "recall",
  description:
    "Search the story's past by meaning: logged turns, scene notes and closed-scene summaries. Use it before you state what someone said, promised or did earlier, or when the player refers back to something you no longer have in view. Returns the best passages with scene and turn numbers.",
  input: {
    query: z
      .string()
      .min(1)
      .describe("What to remember, in plain words, e.g. what Mira said about the boots"),
    scope: z
      .enum(["all", "turns", "notes", "summaries"])
      .optional()
      .describe("Limit to one kind of record; all by default"),
  },
  run: async (ctx, { query, scope }) => {
    const story = await load(ctx);
    const index = await freshIndex(ctx, story);
    const hits = (
      await index.search(query, { kinds: scopes[scope ?? "all"], limit: maxRecallResults })
    ).filter((h) => h.score >= recallThreshold);
    if (hits.length === 0) {
      return `Nothing in the record matches "${query}". If it never happened on the page, it is not canon yet.`;
    }
    return hits.map(recallBlock).join("\n\n");
  },
});

export function recallBlock(hit: Hit): string {
  const where =
    hit.kind === "turn"
      ? `Scene ${hit.scene}, turn ${hit.turn}`
      : `Scene ${hit.scene}, ${hit.kind === "notes" ? "notes" : "summary"}`;
  return [`## ${where} · score ${hit.score.toFixed(2)}`, hit.path, "", hit.text.trim()].join("\n");
}
