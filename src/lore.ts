import { StoryError } from "./errors.ts";

// A lore entry's frontmatter and body sections (spec 20.1). The loader, the
// upsert_lore tool and the migration script all read fields through here, so
// a value means the same thing wherever it is written.

export type LoreScope =
  | { kind: "story" }
  | { kind: "character"; stem: string }
  | { kind: "place"; text: string };

// Secondary keys: `any` needs one of them in the scan text as well as a
// primary key, `all` needs every one.
export type LoreAlso = { mode: "any" | "all"; keys: string[] };

export const loreTruths = ["fact", "rumor", "false"] as const;
export type LoreTruth = (typeof loreTruths)[number];

// `secret` once the Secret section has been revealed too (spec 20.5).
export type LoreKnown = boolean | "secret";

export type LoreFields = {
  title: string;
  keys: string[];
  also: LoreAlso | undefined;
  unless: string[];
  always: boolean;
  priority: number;
  scope: LoreScope;
  cooldown: number;
  chance: number;
  group: string | undefined;
  weight: number;
  recurse: boolean;
  // Turns of log to scan; undefined uses the config's loreScanDepth.
  scan: number | undefined;
  known: LoreKnown;
  truth: LoreTruth;
};

export const loreDefaults = {
  always: false,
  priority: 0,
  scope: "story",
  cooldown: 6,
  chance: 100,
  weight: 1,
  recurse: true,
  known: false,
  truth: "fact",
} as const;

// The public text goes to the model with the turn; the Secret and History
// sections are kept apart so nothing outside the loader can leak them before
// the discovery slice decides who sees what.
export type LoreBody = { body: string; secret: string | undefined; history: string | undefined };

const privateSections = ["secret", "history"];

export function splitLoreBody(markdown: string): LoreBody {
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  const found: Record<string, string[]> = {};
  let current: string[] = kept;
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      const name = line.slice(2).trim().toLowerCase();
      if (privateSections.includes(name)) {
        found[name] = [];
        current = found[name];
        continue;
      }
      current = kept;
    }
    current.push(line);
  }
  const text = (part: string[] | undefined) => part?.join("\n").trim() || undefined;
  return { body: kept.join("\n").trim(), secret: text(found.secret), history: text(found.history) };
}

// The Secret and History sections of `markdown` as written, for a write that
// replaces the public text but must not lose them.
export function privateTail(markdown: string): string {
  const { secret, history } = splitLoreBody(markdown);
  return [secret && `## Secret\n\n${secret}`, history && `## History\n\n${history}`]
    .filter(Boolean)
    .join("\n\n");
}

export function parseScope(value: string): LoreScope {
  const text = value.trim();
  if (text === "story") return { kind: "story" };
  const match = /^(character|place):(.+)$/.exec(text);
  const rest = match?.[2]?.trim();
  if (match?.[1] === "character" && rest && /^[a-z0-9][a-z0-9-]*$/.test(rest)) {
    return { kind: "character", stem: rest };
  }
  if (match?.[1] === "place" && rest) return { kind: "place", text: rest };
  throw new StoryError(
    `scope "${value}" should be story, character:<card stem> or place:<text in the location>`,
  );
}

export function formatScope(scope: LoreScope): string {
  if (scope.kind === "story") return "story";
  return scope.kind === "character" ? `character:${scope.stem}` : `place:${scope.text}`;
}

// Throws StoryError naming the field; the caller adds the file.
export function parseLoreFields(data: Record<string, unknown>, fallbackTitle: string): LoreFields {
  return {
    title: str(data.title) ?? fallbackTitle,
    keys: strList(data.keys),
    also: parseAlso(data.also),
    unless: strList(data.unless),
    always: bool(data, "always", loreDefaults.always),
    priority: num(data, "priority", loreDefaults.priority),
    scope: data.scope === undefined ? { kind: "story" } : parseScope(String(data.scope)),
    cooldown: wholeNumber(data, "cooldown", loreDefaults.cooldown, 0),
    chance: inRange(num(data, "chance", loreDefaults.chance), "chance", 0, 100),
    group: str(data.group),
    weight: positive(num(data, "weight", loreDefaults.weight), "weight"),
    recurse: bool(data, "recurse", loreDefaults.recurse),
    scan: data.scan === undefined ? undefined : wholeNumber(data, "scan", 0, 0),
    known: parseKnown(data.known),
    truth: parseTruth(data.truth),
  };
}

function parseAlso(value: unknown): LoreAlso | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    const [mode, keys] = entries[0] ?? [];
    if (entries.length === 1 && (mode === "any" || mode === "all")) {
      const list = strList(keys);
      return list.length ? { mode, keys: list } : undefined;
    }
  }
  throw new StoryError("also should be { any: [words] } or { all: [words] }");
}

function parseKnown(value: unknown): LoreKnown {
  if (value === undefined) return loreDefaults.known;
  if (typeof value === "boolean" || value === "secret") return value;
  throw new StoryError(`known should be true, false or secret, not ${JSON.stringify(value)}`);
}

function parseTruth(value: unknown): LoreTruth {
  if (value === undefined) return loreDefaults.truth;
  const truth = loreTruths.find((t) => t === value);
  if (!truth) throw new StoryError(`truth should be one of ${loreTruths.join(", ")}`);
  return truth;
}

function bool(data: Record<string, unknown>, field: string, fallback: boolean): boolean {
  const value = data[field];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  throw new StoryError(`${field} should be true or false`);
}

function num(data: Record<string, unknown>, field: string, fallback: number): number {
  const value = data[field];
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new StoryError(`${field} should be a number`);
}

function wholeNumber(
  data: Record<string, unknown>,
  field: string,
  fallback: number,
  min: number,
): number {
  const value = num(data, field, fallback);
  if (!Number.isInteger(value) || value < min) {
    throw new StoryError(`${field} should be a whole number, ${min} or more`);
  }
  return value;
}

function inRange(value: number, field: string, min: number, max: number): number {
  if (value < min || value > max) throw new StoryError(`${field} should be ${min} to ${max}`);
  return value;
}

function positive(value: number, field: string): number {
  if (value <= 0) throw new StoryError(`${field} should be more than 0`);
  return value;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const one = str(value);
  return one ? [one] : [];
}
