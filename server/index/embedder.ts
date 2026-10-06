import path from "node:path";
import type { Config } from "../../src/config.ts";
import { rpHome } from "../../src/paths.ts";

// Text to vectors (spec 7.3). The local provider runs a small sentence model
// through Transformers.js: all-MiniLM-L6-v2, 384 dimensions, int8-quantized
// ONNX (about 23 MB), mean-pooled and normalized so a dot product is a cosine.
// It was the archived project's choice (its ADR 010) and runs under Bun on
// Windows with no native build step. Transformers.js is imported lazily: tests
// and keyword-only paths never load it.

export type Embedder = {
  model: string;
  dims: number;
  embed: (texts: string[]) => Promise<Float32Array[]>;
};

export const localModel = "Xenova/all-MiniLM-L6-v2";
export const localDims = 384;

export function modelsDir(): string {
  return path.join(rpHome(), "models");
}

// True when the model files are already on disk, so loading it needs no
// network. The per-prompt hook checks this and stays keyword-only otherwise.
export async function isModelCached(dir = modelsDir()): Promise<boolean> {
  const base = path.join(dir, ...localModel.split("/"));
  const files = ["config.json", "tokenizer.json", "onnx/model_quantized.onnx"];
  for (const file of files) {
    if (!(await Bun.file(path.join(base, file)).exists())) return false;
  }
  return true;
}

export type EmbedderOptions = {
  // false: never download; fail if the model is not cached (the hook's mode).
  allowDownload?: boolean;
};

export function embedderFor(config: Pick<Config, "embeddings">, options: EmbedderOptions = {}) {
  if (config.embeddings === "hosted") {
    throw new Error(
      'The "hosted" embeddings provider is not built yet. Set embeddings to "local" in /config.',
    );
  }
  return localEmbedder(options);
}

// One pipeline per process per mode, loaded on the first embed call.
const pipelines = new Map<boolean, Promise<Extractor>>();

const batchSize = 32;

type Extractor = (texts: string[]) => Promise<Float32Array>;

export function localEmbedder(options: EmbedderOptions = {}): Embedder {
  const allowDownload = options.allowDownload ?? true;
  return {
    model: localModel,
    dims: localDims,
    embed: async (texts) => {
      if (texts.length === 0) return [];
      const extract = await loadPipeline(allowDownload);
      const vectors: Float32Array[] = [];
      // Batches bound the padded tensor a whole-story rebuild would allocate.
      for (let start = 0; start < texts.length; start += batchSize) {
        const batch = texts.slice(start, start + batchSize);
        const flat = await extract(batch);
        for (let i = 0; i < batch.length; i++) {
          vectors.push(flat.slice(i * localDims, (i + 1) * localDims));
        }
      }
      return vectors;
    },
  };
}

function loadPipeline(allowDownload: boolean): Promise<Extractor> {
  const loaded = pipelines.get(allowDownload);
  if (loaded) return loaded;
  const loading = (async (): Promise<Extractor> => {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.cacheDir = modelsDir();
    env.allowRemoteModels = allowDownload;
    const extractor = await pipeline("feature-extraction", localModel, { dtype: "q8" });
    return async (texts) => {
      const out = await extractor(texts, { pooling: "mean", normalize: true });
      return Float32Array.from(out.data as Float32Array);
    };
  })();
  // A failed load (no network, missing files) is retried on the next call.
  loading.catch(() => pipelines.delete(allowDownload));
  pipelines.set(allowDownload, loading);
  return loading;
}
