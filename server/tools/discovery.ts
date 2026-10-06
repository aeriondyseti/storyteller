import { z } from "zod";
import { parseFrontmatter } from "../../src/frontmatter.ts";
import {
  appendHistoryInText,
  type LoreKnown,
  parseLoreFields,
  setKnownInText,
  splitLoreBody,
} from "../../src/lore.ts";
import type { LoreEntry, Story } from "../../src/story.ts";
import { load, regenerate, ToolError, type WorldContext } from "../context.ts";
import { defineTool } from "../registry.ts";

// Discovery (spec 20.5, 20.11): marking what the player's character has
// learned, and recording how the world changed. Both edit the entry's file as
// text, touching only the `known:` line or the end of the History section,
// so hand-written layout survives. A library entry is copied into the story
// first, as every other write does (spec 5.3): what one story's character has
// learned, or what happened in one story, is not true of the others.

export const revealLore = defineTool({
  name: "reveal_lore",
  description:
    "Mark a lore entry as known to the player's character. Call it in the same turn the fiction reveals it; part: secret when its Secret comes out too. Nothing is revealed on its own.",
  input: {
    stem: z.string().min(1).describe("The entry's file stem"),
    part: z.literal("secret").optional().describe("secret: the Secret section is revealed as well"),
  },
  run: async (ctx, { stem, part }) => {
    const story = await load(ctx);
    const entry = findLore(story, stem);
    const wanted: LoreKnown = part === "secret" ? "secret" : true;
    if (entry.known === "secret" || entry.known === wanted) {
      const what =
        entry.known === "secret"
          ? " (Secret included)"
          : entry.secret
            ? " (its Secret is still hidden)"
            : "";
      return `${entry.title} is already known${what}. Nothing changed.`;
    }
    const file = await editEntry(ctx, story, entry, (text) => setKnownInText(text, wanted), {
      known: wanted,
    });
    const what = wanted === "secret" ? `${entry.title}, Secret included,` : entry.title;
    const noSecret = wanted === "secret" && !entry.secret ? " It has no Secret section." : "";
    return `${what} is now known to the player's character: ${file.path}.${file.note}${noSecret}`;
  },
});

export const appendLoreHistory = defineTool({
  name: "append_lore_history",
  description:
    "Add a dated line to a lore entry's History when the world changes (it burned, they fell, the price rose). Then rewrite its public text with upsert_lore so it reads as the current truth.",
  input: {
    stem: z.string().min(1).describe("The entry's file stem"),
    line: z.string().min(1).describe("What happened, one line: the Lamp Hall burned"),
  },
  run: async (ctx, { stem, line }) => {
    const story = await load(ctx);
    const entry = findLore(story, stem);
    const scene = story.scene;
    if (!scene) throw new ToolError("There is no scene yet, so nothing to date the line by.");
    const text = historyText(line);
    if (!text) throw new ToolError("The line is empty.");
    const entryLine = `- Scene ${scene.number}: ${text}`;
    const file = await editEntry(ctx, story, entry, (t) => appendHistoryInText(t, entryLine), {
      historyEndsWith: entryLine,
    });
    return `Added to ${entry.title}'s History: "${entryLine}" (${file.path}).${file.note}`;
  },
});

export const discoveryTools = [revealLore, appendLoreHistory];

function findLore(story: Story, stem: string): LoreEntry {
  const wanted = stem.trim();
  const entry = story.lore.find((l) => l.stem === wanted);
  if (entry) return entry;
  const known = story.lore.map((l) => l.stem).join(", ") || "none";
  throw new ToolError(`No lore entry "${stem}". Entries: ${known}.`);
}

// One line, without the "- Scene n:" the tool adds itself.
function historyText(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^-\s*/, "")
    .replace(/^scene\s+\d+\s*:\s*/i, "")
    .trim();
}

// Edits the story's copy of the entry (copying a library file byte for byte
// first) and checks the result reads back as intended before writing it.
async function editEntry(
  ctx: WorldContext,
  story: Story,
  entry: LoreEntry,
  edit: (text: string) => string,
  expect: { known?: LoreKnown; historyEndsWith?: string },
): Promise<{ path: string; note: string }> {
  const path = `${story.dir}/lore/${entry.stem}.md`;
  const fromLibrary = entry.source === "library";
  const next = edit(await Bun.file(entry.path).text());
  const doc = parseFrontmatter(next);
  const fields = parseLoreFields(doc.data, entry.stem);
  const history = splitLoreBody(doc.body).history ?? "";
  const ok =
    (expect.known === undefined || fields.known === expect.known) &&
    (expect.historyEndsWith === undefined || history.endsWith(expect.historyEndsWith));
  if (!ok) {
    throw new ToolError(
      `Could not edit ${entry.path} safely; its frontmatter or History is unusual.`,
    );
  }
  await Bun.write(path, next);
  await regenerate(ctx);
  const note = fromLibrary ? " The story now has its own copy, overriding the library's." : "";
  return { path, note };
}
