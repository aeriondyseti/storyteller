import { parseRef } from "./library.ts";
import { type Character, type LoreEntry, personaOf, type Story, section } from "./story.ts";

// What the codex pane shows (spec 20.13): the lore the player's character
// knows, as that character understands it, and the characters they have met.
// Plain JSON, mirrored by CodexSnapshot in plugin/mod/types, which the mod
// reads from plugin/codex.ts. Nothing here may carry an unknown entry or an
// unrevealed Secret: the snapshot is the player's view.

export type CodexEntry = {
  id: string;
  title: string;
  keys: string[];
  // A rumour says so; a false belief is shown unlabelled, as the character
  // believes it, so the codex does not spoil it.
  label: "" | "Rumour";
  text: string;
  secret?: string;
  history: string[];
};

export type CodexBook = { name: string; entries: CodexEntry[] };

export type CodexCharacter = { id: string; name: string; tags: string[]; appearance: string };

export type CodexName = { name: string; id: string };

export type CodexSnapshot = {
  books: CodexBook[];
  characters: CodexCharacter[];
  names: CodexName[];
};

// The book a library entry read from a single file (`uses: [lore/x]` with
// `library/lore/x.md`) is shown under; such entries belong to no folder.
export const looseLibraryBook = "Library";

export function isKnown(entry: Pick<LoreEntry, "known">): boolean {
  return entry.known !== false;
}

export function codexEntry(entry: LoreEntry): CodexEntry {
  const secret = entry.known === "secret" ? entry.secret?.trim() : undefined;
  return {
    id: `lore/${entry.stem}`,
    title: entry.title,
    keys: entry.keys,
    label: entry.truth === "rumor" ? "Rumour" : "",
    text: entry.body,
    ...(secret ? { secret } : {}),
    history: historyLines(entry.history),
  };
}

// History as written, one development per line, oldest first, without the
// list marker Vex writes (`- Scene 3: ...`).
export function historyLines(history: string | undefined): string[] {
  return (history ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^-\s+/, ""))
    .filter(Boolean);
}

// The known entries by book: the story's own book first (named for the story),
// then library books in the order story.md's `uses` lists them. The loader has
// already let a story entry replace a library one with the same stem.
export function codexBooks(story: Pick<Story, "title" | "uses" | "lore">): CodexBook[] {
  const books = new Map<string, { position: number; entries: CodexEntry[] }>();
  for (const entry of story.lore.filter(isKnown)) {
    const name = bookName(story.title, entry);
    const position = entry.source === "story" ? -1 : usesPosition(story.uses, entry);
    const book = books.get(name) ?? { position, entries: [] };
    book.position = Math.min(book.position, position);
    book.entries.push(codexEntry(entry));
    books.set(name, book);
  }
  return [...books.entries()]
    .sort(([, a], [, b]) => a.position - b.position)
    .map(([name, book]) => ({
      name,
      entries: book.entries.sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

function bookName(storyTitle: string, entry: LoreEntry): string {
  if (entry.source === "story") return storyTitle;
  return entry.book ?? looseLibraryBook;
}

// Where in `uses` the ref that brought this library entry in stands.
function usesPosition(uses: string[], entry: LoreEntry): number {
  const position = uses.findIndex((ref) => {
    let parsed: ReturnType<typeof parseRef>;
    try {
      parsed = parseRef(ref);
    } catch {
      return false;
    }
    if (parsed.kind !== "lore") return false;
    if (entry.book === undefined) return !parsed.book && parsed.stem === entry.stem;
    return parsed.book ? parsed.book === entry.book : parsed.stem === entry.book;
  });
  return position === -1 ? uses.length : position;
}

// Characters met: a card whose stem is in any scene's `present`, open or
// closed, other than the character the player plays now. Only the card's
// name, tags and `## Appearance` reach the codex.
export function metCharacters(story: Story): CodexCharacter[] {
  const persona = personaOf(story)?.toLowerCase();
  const met = new Set(
    story.scenes.flatMap((scene) => scene.present.map((stem) => stem.toLowerCase())),
  );
  return story.characters
    .filter((card) => met.has(card.stem.toLowerCase()) && card.stem.toLowerCase() !== persona)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(codexCharacter);
}

function codexCharacter(card: Character): CodexCharacter {
  return {
    id: `character/${card.stem}`,
    name: card.name,
    tags: card.tags,
    appearance: section(card.body, "Appearance") ?? "",
  };
}

// Every name the glossary links: known entries' titles and primary keys, in
// codex order, then met characters' names. Case-insensitive duplicates keep
// the first, so an entry's title wins over a later key or name.
export function glossaryNames(books: CodexBook[], characters: CodexCharacter[]): CodexName[] {
  const candidates = [
    ...books.flatMap((book) =>
      book.entries.flatMap((entry) =>
        [entry.title, ...entry.keys].map((name) => ({ name, id: entry.id })),
      ),
    ),
    ...characters.map(({ name, id }) => ({ name, id })),
  ];
  const seen = new Set<string>();
  const names: CodexName[] = [];
  for (const candidate of candidates) {
    const name = candidate.name.trim();
    const folded = name.toLowerCase();
    if (!name || seen.has(folded)) continue;
    seen.add(folded);
    names.push({ name, id: candidate.id });
  }
  return names;
}

export function codexOf(story: Story): CodexSnapshot {
  const books = codexBooks(story);
  const characters = metCharacters(story);
  return { books, characters, names: glossaryNames(books, characters) };
}
