import { readdir } from "node:fs/promises";
import path from "node:path";
import { StoryError } from "./errors.ts";
import { posixPath } from "./paths.ts";

// Library references (spec 5.3, 20.1). story.md lists `uses: [characters/mira, ...]`;
// each ref names `<library>/<ref>.md`, unless the story has a file at the same
// relative path, which then replaces the library copy entirely.
//
// Lore also comes in books, folders of entries under `<library>/lore/<book>/`:
// `lore/<book>` takes the whole book, `lore/<book>/<stem>` one entry. A book
// entry's ref is still `lore/<stem>`, so a story entry with the same stem
// overrides it, and of two library entries with the same stem the first
// listed wins.

export const libraryKinds = ["characters", "lore", "directives"] as const;
export type LibraryKind = (typeof libraryKinds)[number];

export type Source = "story" | "library";

export type ResolvedRef = {
  ref: string;
  kind: LibraryKind;
  stem: string;
  path: string;
  source: Source;
  // The library book a lore entry came from; absent for single files.
  book?: string;
};

export function parseRef(ref: string): { kind: LibraryKind; stem: string; book?: string } {
  const [kind, first, second, ...rest] = ref.replace(/\.md$/, "").split("/");
  const known = libraryKinds.find((k) => k === kind);
  if (known === "lore" && first && second && rest.length === 0) {
    return { kind: known, book: first, stem: second };
  }
  if (!known || !first || second !== undefined) {
    throw new StoryError(
      `uses: "${ref}" should look like characters/<name>, lore/<name>, lore/<book>/<name> or directives/<name>`,
    );
  }
  return { kind: known, stem: first };
}

export async function resolveRef(
  ref: string,
  storyDir: string,
  library: string,
): Promise<ResolvedRef> {
  const { kind, stem, book } = parseRef(ref);
  if (book) {
    const file = path.join(library, kind, book, `${stem}.md`);
    if (await Bun.file(file).exists()) {
      return { ref: `${kind}/${stem}`, kind, stem, path: posixPath(file), source: "library", book };
    }
    throw new StoryError(`uses: "${ref}" not found in the library (${posixPath(file)})`);
  }
  const relative = `${kind}/${stem}.md`;
  const local = path.join(storyDir, relative);
  if (await Bun.file(local).exists()) {
    return { ref: `${kind}/${stem}`, kind, stem, path: posixPath(local), source: "story" };
  }
  const shared = path.join(library, relative);
  if (await Bun.file(shared).exists()) {
    return { ref: `${kind}/${stem}`, kind, stem, path: posixPath(shared), source: "library" };
  }
  throw new StoryError(
    `uses: "${ref}" not found in the library (${posixPath(shared)}) or the story (${posixPath(local)})`,
  );
}

// One `uses` ref: one item, or every entry of a lore book. A single file named
// like a book wins, so refs written before books keep their meaning.
export async function resolveUse(
  ref: string,
  storyDir: string,
  library: string,
): Promise<ResolvedRef[]> {
  const { kind, stem, book } = parseRef(ref);
  const singleFile = path.join(library, kind, `${stem}.md`);
  if (kind === "lore" && !book && !(await Bun.file(singleFile).exists())) {
    const folder = path.join(library, kind, stem);
    const files = await bookFiles(folder);
    if (files) {
      return files.map((file) => {
        const entry = path.basename(file, ".md");
        return {
          ref: `${kind}/${entry}`,
          kind,
          stem: entry,
          path: posixPath(path.join(folder, file)),
          source: "library" as const,
          book: stem,
        };
      });
    }
  }
  return [await resolveRef(ref, storyDir, library)];
}

export async function resolveUses(
  uses: string[],
  storyDir: string,
  library: string,
): Promise<ResolvedRef[]> {
  return (await Promise.all(uses.map((ref) => resolveUse(ref, storyDir, library)))).flat();
}

// The entries of a book folder, sorted; undefined when there is no folder.
async function bookFiles(folder: string): Promise<string[] | undefined> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
  } catch {
    return undefined;
  }
}
