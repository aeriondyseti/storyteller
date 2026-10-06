import type { CodexEntry, CodexPane, CodexSnapshot } from "../types";

type CodexCharacter = CodexSnapshot["characters"][number];

// The codex pane's index and lookups (spec 20.13), pure so they are tested
// without drawing: which titles show for a search, grouped as the pane draws
// them, and which entry or character an id names.

export const CHARACTERS = "Characters";

// How every opener opens the pane: a dialog that takes the keys, Escape closes.
// The command, a glossary link and a name button each open it themselves,
// because the engine follows `$` into no function of another file.
export const CODEX_PANE = {
  id: "codex",
  title: "Codex",
  focus: true,
  closeOnEscape: true,
  rows: 30,
} as const;

export type IndexItem = { id: string; title: string };
export type IndexGroup = { heading: string; items: IndexItem[] };

// The title as the player's character understands the entry: a rumour says
// so; a false belief is shown as it is believed.
export function displayTitle(entry: CodexEntry): string {
  return entry.label ? `${entry.label}: ${entry.title}` : entry.title;
}

function matches(query: string, ...texts: readonly string[]): boolean {
  return texts.some((t) => t.toLowerCase().includes(query));
}

// Books in the snapshot's order, then Characters; a search keeps the titles
// whose title or one of whose keys holds it (any case), and a group left
// empty is dropped. An empty search keeps every title.
export function indexGroups(snapshot: CodexSnapshot, search: string): IndexGroup[] {
  const query = search.trim().toLowerCase();
  const groups: IndexGroup[] = snapshot.books.map((book) => ({
    heading: book.name,
    items: book.entries
      .filter((e) => !query || matches(query, e.title, ...e.keys))
      .map((e) => ({ id: e.id, title: displayTitle(e) })),
  }));
  groups.push({
    heading: CHARACTERS,
    items: snapshot.characters
      .filter((c) => !query || matches(query, c.name))
      .map((c) => ({ id: c.id, title: c.name })),
  });
  return groups.filter((g) => g.items.length > 0);
}

export type CodexView =
  | { kind: "entry"; entry: CodexEntry; book: string }
  | { kind: "character"; character: CodexCharacter };

// The pane's state when opened at `id`: that entry or character when the
// codex knows it, else the index; the search starts empty.
export function paneAt(snapshot: CodexSnapshot | null, id: string | null): CodexPane {
  return { entry: id && viewOf(snapshot, id) ? id : null, search: "" };
}

// What an id names in this snapshot; undefined when it names nothing known,
// and the pane then shows the index.
export function viewOf(snapshot: CodexSnapshot | null, id: string | null): CodexView | undefined {
  if (!snapshot || !id) return undefined;
  for (const book of snapshot.books) {
    const entry = book.entries.find((e) => e.id === id);
    if (entry) return { kind: "entry", entry, book: book.name };
  }
  const character = snapshot.characters.find((c) => c.id === id);
  return character ? { kind: "character", character } : undefined;
}
