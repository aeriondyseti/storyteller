import { formatScope, type LoreAlso, type LoreScope } from "./lore.ts";
import type { Directive, LoreEntry, Story } from "./story.ts";

// Lore activation (spec 20.2): which keyed lore entries and keyed directives
// travel with this turn, and why. Pure: the prompt hook reads the log, the
// scene and the index, and passes them in; the random source is passed in too,
// so chance and group draws are reproducible in tests.
//
//   1. Scan    the prompt, the last `scanDepth` logged exchanges (an entry's
//              `scan` overrides the depth), and the scene state: location,
//              time and the present characters' names.
//   2. Match   primary keys (whole words), then `also` and `unless`; meaning
//              matches from the index at or above the threshold; scope. An
//              always-on entry with a character or place scope is not in the
//              bible (which cannot follow the scene); it matches whenever its
//              scope holds.
//   3. Recurse the public text of matched entries wakes other entries' keys,
//              up to three levels; an entry with `recurse: false` wakes none.
//   4. Filter  an entry still in context (injected within its `cooldown`
//              turns, same content) is skipped; an edited one goes in at once,
//              marked updated. Then `chance` is rolled.
//   5. Choose  one entry per `group`, drawn by `weight`; rank (directives,
//              then priority) and fit the two-part budget (spec 20.4).
//
// Always-on lore with story scope is in the bible and never a candidate, nor
// are manual directives or keyed ones switched off. Keyed directives match by
// key and meaning only and share the cooldown and budget.

export type Injection = { ref: string; turn: number; hash: string; chars: number };

export type Activated = {
  kind: "lore" | "directive";
  ref: string;
  title: string;
  body: string;
  // Injected before with different content: the newer text wins.
  updated: boolean;
  why: string;
  chars: number;
};

export type Cut = { ref: string; reason: string };

// What the turn decided, kept in state.json for anyone asking why.
export type ActivationReport = {
  turn: number;
  fired: { ref: string; why: string }[];
  cut: Cut[];
};

export type SemanticScore = { ref: string; score: number };

export type SceneState = {
  location: string | undefined;
  time: string | undefined;
  present: { stem: string; name: string }[];
};

// The current scene as activation scans it. Present characters keep their
// stem (for `character:` scope) and display name (for keys).
export function sceneStateOf(story: Pick<Story, "scene" | "characters">): SceneState | undefined {
  const scene = story.scene;
  if (!scene) return undefined;
  return {
    location: scene.location,
    time: scene.time,
    present: scene.present.map((stem) => ({
      stem,
      name: story.characters.find((c) => c.stem === stem)?.name ?? stem,
    })),
  };
}

// Logged exchanges to read so every entry's scan depth is covered.
export function scanDepthNeeded(story: Pick<Story, "lore">, depth: number): number {
  return Math.max(depth, ...story.lore.map((l) => l.scan ?? 0));
}

export type ActivationInput = {
  turn: number;
  prompt: string;
  // Logged exchanges' text, oldest first.
  recent: readonly string[];
  scene: SceneState | undefined;
  // Every injection since the last compaction.
  injections: readonly Injection[];
  semantic?: readonly SemanticScore[] | undefined;
  semanticThreshold?: number | undefined;
  scanDepth?: number | undefined;
  // Characters lore may hold in the context window (loreBudgetChars).
  budget?: number | undefined;
  random?: (() => number) | undefined;
};

export type ActivationResult = {
  entries: Activated[];
  injections: Injection[];
  report: ActivationReport;
};

export const defaultScanDepth = 3;
export const defaultDirectiveCooldown = 6;
export const maxRecursion = 3;
// Cosine score (all-MiniLM-L6-v2) for a meaning match. Strict on purpose: a
// wrong entry in the turn costs more than a missed one, which recall and
// search_lore can still find.
export const defaultSemanticThreshold = 0.45;

// The hook never sees the model's window, so the budget assumes the common
// one: 200k tokens at about four characters a token. A larger window only
// makes the budget cautious.
export const assumedWindowTokens = 200_000;
export const charsPerToken = 4;

export function loreBudgetChars(share: number): number {
  return Math.round(share * assumedWindowTokens * charsPerToken);
}

export const defaultLoreBudget = loreBudgetChars(0.1);

type Candidate = {
  kind: "lore" | "directive";
  ref: string;
  title: string;
  body: string;
  keys: string[];
  also: LoreAlso | undefined;
  unless: string[];
  scope: LoreScope;
  alwaysInScope: boolean;
  cooldown: number;
  chance: number;
  group: string | undefined;
  weight: number;
  recurse: boolean;
  scan: number | undefined;
  priority: number;
};

type Match = {
  candidate: Candidate;
  why: string;
  depth: number;
  byKey: boolean;
  score: number;
  updated: boolean;
};

export function activate(
  story: Pick<Story, "lore" | "directives">,
  input: ActivationInput,
): ActivationResult {
  const random = input.random ?? Math.random;
  const depth = input.scanDepth ?? defaultScanDepth;
  const threshold = input.semanticThreshold ?? defaultSemanticThreshold;
  const cut: Cut[] = [];
  const scene = input.scene;
  const sceneFields = scene
    ? [scene.location, scene.time, ...scene.present.map((p) => p.name)].filter(
        (f): f is string => !!f,
      )
    : [];
  const scanText = (c: Candidate) => {
    const n = c.scan ?? depth;
    return [...(n > 0 ? input.recent.slice(-n) : []), input.prompt].join("\n\n");
  };
  const scores = new Map<string, number>();
  for (const { ref, score } of input.semantic ?? []) {
    if (score >= threshold) scores.set(ref, Math.max(score, scores.get(ref) ?? score));
  }

  const candidates = [
    ...story.directives.filter((d) => d.mode === "keyed" && d.on).map(directiveCandidate),
    ...story.lore.filter((l) => !l.always || l.scope.kind !== "story").map(loreCandidate),
  ];

  // Steps 1 and 2: direct matches.
  const matched = new Map<string, Match>();
  for (const c of candidates) {
    if (!inScope(c.scope, scene)) continue;
    const text = scanText(c);
    const seen = [text, ...sceneFields];
    const blocker = c.unless.find((w) => seen.some((t) => mentions(t, w)));
    const textKey = c.keys.find((k) => mentions(text, k));
    const sceneKey = textKey
      ? undefined
      : c.keys.find((k) => sceneFields.some((f) => mentions(f, k)));
    const key = textKey ?? sceneKey;
    const byKey = key !== undefined && alsoHolds(c.also, seen);
    const score = scores.get(c.ref) ?? 0;
    if (!byKey && score === 0 && !c.alwaysInScope) continue;
    if (blocker) {
      cut.push({ ref: c.ref, reason: `unless "${blocker}"` });
      continue;
    }
    const why = byKey
      ? textKey
        ? `key "${textKey}"`
        : `scene "${sceneKey}"`
      : score > 0
        ? `semantic ${score.toFixed(2)}`
        : `always (${formatScope(c.scope)})`;
    matched.set(c.ref, { candidate: c, why, depth: 0, byKey, score, updated: false });
  }

  // Step 3: recursion through the public text of what matched.
  let wave = [...matched.values()];
  for (let level = 1; level <= maxRecursion && wave.length > 0; level++) {
    const sources = wave.filter((m) => m.candidate.recurse && m.candidate.kind === "lore");
    const sourceText = sources.map((m) => `${m.candidate.title}\n${m.candidate.body}`);
    const next: Match[] = [];
    for (const c of candidates) {
      if (c.kind !== "lore" || matched.has(c.ref) || !inScope(c.scope, scene)) continue;
      for (const [i, source] of sources.entries()) {
        const key = c.keys.find((k) => mentions(sourceText[i] ?? "", k));
        if (!key) continue;
        const seen = [scanText(c), ...sceneFields, ...sourceText];
        if (!alsoHolds(c.also, seen)) continue;
        const blocker = c.unless.find((w) => seen.some((t) => mentions(t, w)));
        if (blocker) {
          cut.push({ ref: c.ref, reason: `unless "${blocker}"` });
          break;
        }
        const why = `recursion via ${source.candidate.ref} ("${key}")`;
        const match = { candidate: c, why, depth: level, byKey: true, score: 0, updated: false };
        matched.set(c.ref, match);
        next.push(match);
        break;
      }
    }
    wave = next;
  }

  // Step 4: still in context, then chance.
  const lastInjection = new Map<string, Injection>();
  for (const i of input.injections) {
    const prior = lastInjection.get(i.ref);
    if (!prior || i.turn >= prior.turn) lastInjection.set(i.ref, i);
  }
  const eligible: Match[] = [];
  for (const m of matched.values()) {
    const c = m.candidate;
    const last = lastInjection.get(c.ref);
    const hash = contentHash(c);
    if (last && last.hash === hash && input.turn - last.turn < c.cooldown) {
      cut.push({ ref: c.ref, reason: `in context (turn ${last.turn})` });
      continue;
    }
    if (c.chance < 100 && random() * 100 >= c.chance) {
      cut.push({ ref: c.ref, reason: `chance ${c.chance}%` });
      continue;
    }
    eligible.push({ ...m, updated: last !== undefined && last.hash !== hash });
  }

  // Step 5: one per group, then rank and fit the budget.
  const chosen = eligible.filter((m) => m.candidate.group === undefined);
  const groups = new Map<string, Match[]>();
  for (const m of eligible) {
    const g = m.candidate.group;
    if (g !== undefined) groups.set(g, [...(groups.get(g) ?? []), m]);
  }
  for (const [group, members] of groups) {
    const winner = draw(members, random);
    if (!winner) continue;
    chosen.push(winner);
    for (const m of members) {
      if (m !== winner) {
        cut.push({ ref: m.candidate.ref, reason: `group "${group}" drew ${winner.candidate.ref}` });
      }
    }
  }
  chosen.sort(
    (a, b) =>
      kindRank(a) - kindRank(b) ||
      b.candidate.priority - a.candidate.priority ||
      a.depth - b.depth ||
      Number(b.byKey) - Number(a.byKey) ||
      b.score - a.score ||
      a.candidate.title.localeCompare(b.candidate.title),
  );

  // Greedy in rank order; an entry that does not fit is skipped so a smaller,
  // lower-ranked one can still go in.
  const budget = input.budget ?? defaultLoreBudget;
  const turnCap = Math.floor(budget / 4);
  let inContext = loreInContext(input.injections);
  let used = 0;
  const entries: Activated[] = [];
  for (const m of chosen) {
    const c = m.candidate;
    const chars = c.title.length + c.body.length;
    if (used + chars > turnCap) {
      cut.push({ ref: c.ref, reason: "turn budget" });
      continue;
    }
    if (inContext + chars > budget) {
      cut.push({ ref: c.ref, reason: "context budget" });
      continue;
    }
    used += chars;
    inContext += chars;
    entries.push({
      kind: c.kind,
      ref: c.ref,
      title: c.title,
      body: c.body,
      updated: m.updated,
      why: m.why,
      chars,
    });
  }

  const injections = [
    ...input.injections,
    ...entries.map((e) => ({
      ref: e.ref,
      turn: input.turn,
      hash: contentHash(e),
      chars: e.chars,
    })),
  ];
  const report = {
    turn: input.turn,
    fired: entries.map((e) => ({ ref: e.ref, why: e.updated ? `${e.why}, updated` : e.why })),
    cut,
  };
  return { entries, injections, report };
}

// Characters of lore the injection record says are in the window.
export function loreInContext(injections: readonly Injection[]): number {
  return injections.reduce((sum, i) => sum + i.chars, 0);
}

export function contentHash(entry: { title: string; body: string }): string {
  return Bun.hash(JSON.stringify([entry.title, entry.body])).toString(16);
}

function directiveCandidate(d: Directive): Candidate {
  // Directives rank above all lore: they carry no priority of their own, they
  // are short, and they govern how everything else is written.
  return {
    kind: "directive",
    ref: d.ref,
    title: d.title,
    body: d.body,
    keys: d.keys,
    also: undefined,
    unless: [],
    scope: { kind: "story" },
    alwaysInScope: false,
    cooldown: defaultDirectiveCooldown,
    chance: 100,
    group: undefined,
    weight: 1,
    recurse: false,
    scan: undefined,
    priority: Number.POSITIVE_INFINITY,
  };
}

function loreCandidate(l: LoreEntry): Candidate {
  return {
    kind: "lore",
    ref: l.ref,
    title: l.title,
    body: l.body,
    keys: l.keys,
    also: l.also,
    unless: l.unless,
    scope: l.scope,
    alwaysInScope: l.always,
    cooldown: l.cooldown,
    chance: l.chance,
    group: l.group,
    weight: l.weight,
    recurse: l.recurse,
    scan: l.scan,
    priority: l.priority,
  };
}

export function inScope(scope: LoreScope, scene: SceneState | undefined): boolean {
  if (scope.kind === "story") return true;
  if (!scene) return false;
  if (scope.kind === "character") return scene.present.some((p) => p.stem === scope.stem);
  return (scene.location ?? "").toLowerCase().includes(scope.text.toLowerCase());
}

function alsoHolds(also: LoreAlso | undefined, texts: readonly string[]): boolean {
  if (!also) return true;
  const found = (k: string) => texts.some((t) => mentions(t, k));
  return also.mode === "any" ? also.keys.some(found) : also.keys.every(found);
}

function draw(members: Match[], random: () => number): Match | undefined {
  const total = members.reduce((sum, m) => sum + m.candidate.weight, 0);
  let roll = random() * total;
  for (const m of members) {
    roll -= m.candidate.weight;
    if (roll < 0) return m;
  }
  return members.at(-1);
}

function kindRank(m: Match): number {
  return m.candidate.kind === "directive" ? 0 : 1;
}

// True when `key` appears in `text` as whole words. Multi-word keys match
// across any run of whitespace, line breaks included.
export function mentions(text: string, key: string): boolean {
  const words = key.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const pattern = words.map(escapeRegExp).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, "iu").test(text);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
