import type { SemanticScore } from "../../src/activation.ts";
import type { Config } from "../../src/config.ts";
import { type Embedder, isModelCached, localEmbedder } from "./embedder.ts";
import { indexExists, StoryIndex } from "./index.ts";

// Meaning scores for semantic activation, for the UserPromptSubmit hook. The
// hook runs on every prompt, so this never builds anything: it opens an index
// that already exists, loads a model that is already cached (no download),
// and answers [] whenever either is missing or anything fails, which leaves
// the turn with keyword activation only.

const candidateLimit = 12;

export type ScoreOptions = {
  config: Pick<Config, "embeddings">;
  // Tests pass a fake; left out, the cached local model.
  embedder?: Embedder | undefined;
};

export async function activationScores(
  storyDir: string,
  queries: string[],
  options: ScoreOptions,
): Promise<SemanticScore[]> {
  if (options.config.embeddings !== "local" && !options.embedder) return [];
  if (!(await indexExists(storyDir))) return [];
  if (!options.embedder && !(await isModelCached())) return [];
  let index: StoryIndex | undefined;
  try {
    index = StoryIndex.open(storyDir, options.embedder ?? localEmbedder({ allowDownload: false }));
    const hits = await index.search(queries, {
      kinds: ["lore", "directive"],
      limit: candidateLimit,
    });
    return hits.flatMap((h) => (h.ref ? [{ ref: h.ref, score: h.score }] : []));
  } catch {
    return [];
  } finally {
    index?.close();
  }
}
