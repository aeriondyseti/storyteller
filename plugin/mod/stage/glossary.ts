import type { Line } from "./layout.ts";

// Glossary links (spec 20.13): names of known lore entries and met characters
// become links to the codex. Pure text work, no `$`, so it is tested on its
// own. A link target must be `https:` for the terminal to draw it as a link
// at all; `.invalid` is a domain that can never resolve, so a link the mod
// does not answer (a ctrl-click) opens nothing real.

export const CODEX_ORIGIN = "https://codex.invalid/";

export function codexHref(id: string): string {
  return CODEX_ORIGIN + id.split("/").map(encodeURIComponent).join("/");
}

// The codex id a link points at, or null for any other link.
export function codexIdOf(href: string): string | null {
  if (!href.startsWith(CODEX_ORIGIN)) return null;
  try {
    const id = decodeURIComponent(href.slice(CODEX_ORIGIN.length));
    return id || null;
  } catch {
    return null;
  }
}

// The names compiled once per glossary: one alternation, longest name first,
// so at any position the longest name that fits wins.
export type Glossary = { pattern: RegExp | null; ids: Map<string, string> };

const compiled = new WeakMap<readonly GlossaryName[], Glossary>();

export type GlossaryName = { name: string; id: string };

export function glossaryOf(names: readonly GlossaryName[]): Glossary {
  const known = compiled.get(names);
  if (known) return known;
  const ids = new Map<string, string>();
  for (const { name, id } of names) {
    const key = name.trim().replace(/\s+/g, " ").toLowerCase();
    // The first listing of a name wins, as codex.ts orders them.
    if (key && !ids.has(key)) ids.set(key, id);
  }
  const alternatives = [...ids.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  const glossary: Glossary = {
    pattern: alternatives.length > 0 ? new RegExp(alternatives.join("|"), "giu") : null,
    ids,
  };
  compiled.set(names, glossary);
  return glossary;
}

const wordChar = /[\p{L}\p{N}_]/u;

function isWordAt(text: string, index: number): boolean {
  const char = text[index];
  return char !== undefined && wordChar.test(char);
}

export type NameMatch = { start: number; end: number; id: string };

// Whole-word matches in `text`, left to right, each id once: an id already in
// `linked` is skipped (its first mention was earlier) and every id matched
// here is added to it.
export function findNames(text: string, glossary: Glossary, linked: Set<string>): NameMatch[] {
  const { pattern } = glossary;
  if (!pattern) return [];
  const found: NameMatch[] = [];
  pattern.lastIndex = 0;
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    if (isWordAt(text, start - 1) || isWordAt(text, end)) {
      // Inside a longer word: try again one character on, where a shorter
      // name may still stand on its own.
      pattern.lastIndex = start + 1;
      continue;
    }
    const id = glossary.ids.get(m[0].replace(/\s+/g, " ").toLowerCase());
    if (!id || linked.has(id)) continue;
    linked.add(id);
    found.push({ start, end, id });
  }
  return found;
}

// Stretches of markdown no link may be written into: code spans and fences,
// links and images already there, autolinks and bare URLs.
const guarded = /(`+)[\s\S]*?\1|!?\[[^\]]*\]\([^)]*\)|<[^>\s]+>|https?:\/\/\S+/g;

function escapeLabel(text: string): string {
  return text.replace(/[[\]\\]/g, "\\$&");
}

// A prose block with the first mention of each name written as a markdown
// link to the codex, and the links written, for the Markdown's
// `pressableLinks`. `linked` carries first mentions across the blocks of
// one reply.
export function linkNames(
  text: string,
  glossary: Glossary,
  linked: Set<string>,
): { text: string; hrefs: string[] } {
  if (!glossary.pattern) return { text, hrefs: [] };
  const hrefs: string[] = [];
  let out = "";
  let from = 0;
  const free = (to: number) => {
    const part = text.slice(from, to);
    let at = 0;
    for (const match of findNames(part, glossary, linked)) {
      const href = codexHref(match.id);
      hrefs.push(href);
      out += `${part.slice(at, match.start)}[${escapeLabel(part.slice(match.start, match.end))}](${href})`;
      at = match.end;
    }
    out += part.slice(at);
  };
  guarded.lastIndex = 0;
  for (let m = guarded.exec(text); m !== null; m = guarded.exec(text)) {
    free(m.index);
    out += m[0];
    from = m.index + m[0].length;
  }
  free(text.length);
  return { text: out, hrefs };
}

// A pane line with the first mention of each name split into a run of its
// own carrying `link` (the codex id), for the scene pane to draw as a button.
export function linkLine(line: Line, glossary: Glossary, linked: Set<string>): Line {
  return line.flatMap((run) => {
    if (run.link) return [run];
    const matches = findNames(run.text, glossary, linked);
    if (matches.length === 0) return [run];
    const pieces: Line = [];
    let at = 0;
    for (const { start, end, id } of matches) {
      if (start > at) pieces.push({ ...run, text: run.text.slice(at, start) });
      pieces.push({ ...run, text: run.text.slice(start, end), link: id });
      at = end;
    }
    if (at < run.text.length) pieces.push({ ...run, text: run.text.slice(at) });
    return pieces;
  });
}
