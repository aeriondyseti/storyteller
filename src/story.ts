import { readdir } from "node:fs/promises";
import path from "node:path";
import { StoryError } from "./errors.ts";
import { type Document, FrontmatterError, readFrontmatterFile } from "./frontmatter.ts";
import { type LibraryKind, libraryKinds, resolveUses, type Source } from "./library.ts";
import { type LoreFields, parseLoreFields, splitLoreBody } from "./lore.ts";
import { libraryRoot as defaultLibraryRoot, posixPath } from "./paths.ts";
import { loadWidgets, migrateTrackers, type Widget } from "./widgets.ts";

// A story on disk (spec 5.2), loaded into plain data. Every path in here is
// absolute with forward slashes (posixPath), ready to show to the model.
// Character references (story.persona, scene.persona, scene.present) are card
// stems, never display names (spec 16).

export type Storyteller = { name: string; tagline: string | undefined; voice: string | undefined };

// One file from characters/, lore/ or directives/. `ref` is "<kind>/<stem>",
// the same shape story.md's `uses` takes; `source` says whether the file came
// from the story folder or the shared library.
export type Item = { ref: string; stem: string; path: string; source: Source; body: string };

export type Character = Item & { name: string; tags: string[]; portrait: string | undefined };

// `body` is the public text only. The Secret and History sections (spec 20.1)
// are carried apart so nothing renders them by accident; `book` names the
// library book the entry came from, if any.
export type LoreEntry = Item &
  LoreFields & {
    secret: string | undefined;
    history: string | undefined;
    book: string | undefined;
  };

export const directiveModes = ["always", "keyed", "manual"] as const;
export type DirectiveMode = (typeof directiveModes)[number];

export type Directive = Item & { title: string; mode: DirectiveMode; keys: string[]; on: boolean };

export type Sheet = { stem: string; path: string; data: Record<string, unknown>; body: string };

export type RulesSystem = { path: string; body: string };

export type SceneStatus = "open" | "closed";

export type Scene = {
  number: number;
  slug: string;
  title: string;
  status: SceneStatus;
  location: string | undefined;
  time: string | undefined;
  mood: string | undefined;
  present: string[];
  persona: string | undefined;
  // In file order, which is draw order (spec 19.3).
  widgets: Record<string, Widget>;
  // What was wrong with widgets on disk; those load as text so the story opens.
  widgetWarnings: string[];
  body: string;
  dir: string;
  path: string;
  logPath: string;
};

export type Story = {
  dir: string;
  path: string;
  title: string;
  storyteller: Storyteller;
  notes: string;
  persona: string | undefined;
  uses: string[];
  lines: string[];
  veils: string[];
  system: RulesSystem | undefined;
  characters: Character[];
  lore: LoreEntry[];
  directives: Directive[];
  sheets: Sheet[];
  scenes: Scene[];
  scene: Scene | undefined;
};

export type LoadOptions = { libraryRoot?: string | undefined };

export async function loadStory(dir: string, options: LoadOptions = {}): Promise<Story> {
  const root = posixPath(dir);
  const storyFile = `${root}/story.md`;
  if (!(await Bun.file(storyFile).exists())) throw new StoryError(`No story.md in ${root}`);
  const { data, body } = await readDoc(storyFile);

  const title = str(data.title);
  if (!title) throw new StoryError(`story.md needs a title: ${storyFile}`);
  const uses = strList(data.uses);

  const docs = await loadItemDocs(root, uses, options.libraryRoot ?? defaultLibraryRoot());
  const scenes = await loadScenes(root);

  return {
    dir: root,
    path: storyFile,
    title,
    storyteller: readStoryteller(data.storyteller),
    notes: body,
    persona: str(data.persona),
    uses,
    lines: strList(data.lines),
    veils: strList(data.veils),
    system: await loadSystem(root, data.system),
    characters: docs.characters.map(toCharacter),
    lore: docs.lore
      .map(toLore)
      .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title)),
    directives: docs.directives.map(toDirective),
    sheets: await loadSheets(root),
    scenes,
    scene: currentScene(scenes),
  };
}

// The latest open scene; if every scene is closed, the latest one.
export function currentScene(scenes: Scene[]): Scene | undefined {
  const latestFirst = [...scenes].sort((a, b) => b.number - a.number);
  return latestFirst.find((s) => s.status === "open") ?? latestFirst[0];
}

export function findCharacter(story: Story, nameOrStem: string): Character | undefined {
  const wanted = nameOrStem.trim().toLowerCase();
  return (
    story.characters.find((c) => c.stem.toLowerCase() === wanted) ??
    story.characters.find((c) => c.name.toLowerCase() === wanted)
  );
}

// The stem of the character the player plays: the scene's persona (persona
// changes happen at scene boundaries, spec 5.4), else the story's.
export function personaOf(
  story: Story,
  scene: Scene | undefined = story.scene,
): string | undefined {
  return scene?.persona ?? story.persona;
}

// Every character the Storyteller plays: all cards except the persona's.
export function castOf(story: Story, scene: Scene | undefined = story.scene): Character[] {
  const persona = personaOf(story, scene);
  return story.characters.filter((c) => c.stem !== persona);
}

export function sheetFor(story: Story, stem: string): Sheet | undefined {
  return story.sheets.find((s) => s.stem === stem);
}

// The text under a "## <heading>" line, up to the next "## " heading. Used for
// a scene body's Now, Notes and Summary sections.
export function section(markdown: string, heading: string): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const wanted = heading.trim().toLowerCase();
  const start = lines.findIndex(
    (l) => /^##\s/.test(l) && l.slice(2).trim().toLowerCase() === wanted,
  );
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

type ItemDoc = Document & {
  ref: string;
  stem: string;
  path: string;
  source: Source;
  book?: string | undefined;
};

// Story-local files of each kind, plus library refs from `uses` that the story
// does not override with a file of its own.
async function loadItemDocs(
  root: string,
  uses: string[],
  library: string,
): Promise<Record<LibraryKind, ItemDoc[]>> {
  const result: Record<LibraryKind, ItemDoc[]> = { characters: [], lore: [], directives: [] };
  for (const kind of libraryKinds) {
    for (const file of await markdownFiles(`${root}/${kind}`)) {
      const stem = path.basename(file, ".md");
      result[kind].push({
        ref: `${kind}/${stem}`,
        stem,
        path: file,
        source: "story",
        ...(await readDoc(file)),
      });
    }
  }
  for (const ref of await resolveUses(uses, root, library)) {
    if (ref.source === "story") continue;
    if (result[ref.kind].some((d) => d.ref === ref.ref)) continue;
    result[ref.kind].push({ ...ref, ...(await readDoc(ref.path)) });
  }
  return result;
}

function toCharacter(doc: ItemDoc): Character {
  return {
    ...itemOf(doc),
    name: str(doc.data.name) ?? doc.stem,
    tags: strList(doc.data.tags),
    portrait: str(doc.data.portrait),
  };
}

function toLore(doc: ItemDoc): LoreEntry {
  let fields: LoreFields;
  try {
    fields = parseLoreFields(doc.data, doc.stem);
  } catch (error) {
    if (error instanceof StoryError) throw new StoryError(`${doc.path}: ${error.message}`);
    throw error;
  }
  return { ...itemOf(doc), ...fields, ...splitLoreBody(doc.body), book: doc.book };
}

// `on` defaults to true, except for manual directives, which are off until
// toggled on.
function toDirective(doc: ItemDoc): Directive {
  const raw = str(doc.data.mode) ?? "always";
  const mode = directiveModes.find((m) => m === raw);
  if (!mode) {
    throw new StoryError(
      `${doc.path}: mode "${raw}" should be one of ${directiveModes.join(", ")}`,
    );
  }
  return {
    ...itemOf(doc),
    title: str(doc.data.title) ?? doc.stem,
    mode,
    keys: strList(doc.data.keys),
    on: typeof doc.data.on === "boolean" ? doc.data.on : mode !== "manual",
  };
}

function itemOf(doc: ItemDoc): Item {
  return { ref: doc.ref, stem: doc.stem, path: doc.path, source: doc.source, body: doc.body };
}

async function loadSystem(root: string, named: unknown): Promise<RulesSystem | undefined> {
  const relative = str(named);
  const file = posixPath(path.join(root, relative ?? "system.md"));
  if (!(await Bun.file(file).exists())) {
    if (relative)
      throw new StoryError(`story.md names system: ${relative}, but ${file} does not exist`);
    return undefined;
  }
  return { path: file, body: (await readDoc(file)).body };
}

async function loadSheets(root: string): Promise<Sheet[]> {
  const sheets: Sheet[] = [];
  for (const file of await markdownFiles(`${root}/sheets`)) {
    sheets.push({ stem: path.basename(file, ".md"), path: file, ...(await readDoc(file)) });
  }
  return sheets;
}

async function loadScenes(root: string): Promise<Scene[]> {
  const scenes: Scene[] = [];
  for (const folder of await subfolders(`${root}/scenes`)) {
    const match = /^(\d+)-?(.*)$/.exec(folder);
    if (!match) continue;
    const dir = `${root}/scenes/${folder}`;
    const file = `${dir}/scene.md`;
    if (!(await Bun.file(file).exists())) continue;
    const { data, body } = await readDoc(file);
    const slug = match[2] ?? "";
    const { widgets, warnings } = readWidgets(data);
    scenes.push({
      number: typeof data.number === "number" ? data.number : Number.parseInt(match[1] ?? "0", 10),
      slug,
      title: str(data.title) ?? (slug || folder),
      status: data.status === "closed" ? "closed" : "open",
      location: str(data.location),
      time: str(data.time),
      mood: str(data.mood),
      present: strList(data.present),
      persona: str(data.persona),
      widgets,
      widgetWarnings: warnings,
      body,
      dir,
      path: file,
      logPath: `${dir}/log.jsonl`,
    });
  }
  return scenes.sort((a, b) => a.number - b.number);
}

function readStoryteller(value: unknown): Storyteller {
  const data = isRecord(value) ? value : {};
  return { name: str(data.name) ?? "Vex", tagline: str(data.tagline), voice: str(data.voice) };
}

// `widgets:` first, then any `trackers:` block from before widgets existed
// (spec 19.3); the server rewrites the latter as widgets on its next write.
export function readWidgets(data: Record<string, unknown>) {
  const loaded = loadWidgets(data.widgets);
  for (const [name, widget] of Object.entries(migrateTrackers(data.trackers))) {
    if (!(name in loaded.widgets)) loaded.widgets[name] = widget;
  }
  return loaded;
}

async function readDoc(file: string): Promise<Document> {
  try {
    return await readFrontmatterFile(file);
  } catch (error) {
    if (error instanceof FrontmatterError) throw new StoryError(`${file}: ${error.message}`);
    throw error;
  }
}

async function markdownFiles(folder: string): Promise<string[]> {
  const entries = await listDir(folder);
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => `${folder}/${e.name}`)
    .sort();
}

async function subfolders(folder: string): Promise<string[]> {
  const entries = await listDir(folder);
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function listDir(folder: string) {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const one = str(value);
  return one ? [one] : [];
}
