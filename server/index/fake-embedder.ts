import type { Embedder } from "./embedder.ts";

// A deterministic stand-in for tests: each word hashes to a few dimensions, so
// texts that share words point the same way and recall-style tests can assert
// "the passage about bells comes back for a query about bells" without
// downloading a model. No semantics beyond shared words.

export const fakeDims = 64;

export function fakeEmbedder(): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: "fake-bag-of-words",
    dims: fakeDims,
    calls,
    embed: async (texts) => {
      calls.push(texts);
      return texts.map(bagOfWords);
    },
  };
}

function bagOfWords(text: string): Float32Array {
  const v = new Float32Array(fakeDims);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []) {
    const h = Bun.hash.crc32(word);
    v[h % fakeDims] = (v[h % fakeDims] ?? 0) + 1;
    v[(h >>> 8) % fakeDims] = (v[(h >>> 8) % fakeDims] ?? 0) + 0.5;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}
