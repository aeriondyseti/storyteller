import { readdir } from "node:fs/promises";
import { StoryError } from "./errors.ts";
import {
  type Frontmatter,
  FrontmatterError,
  parseFrontmatter,
  serializeFrontmatter,
} from "./frontmatter.ts";
import { loreDefaults, parseLoreFields } from "./lore.ts";
import { posixPath } from "./paths.ts";

// The one-time lore migration (spec 20.8): every entry in a story's lore/ or
// a library's lore/ (books included) rewritten with every field explicit, in
// spec order, values already set left as they are, keys the spec does not
// know kept after them, the body untouched. Running it twice changes nothing.
//
// `known` is true in a story that has been played (any non-empty log), since
// whatever its lore says has likely come up; false in a fresh story and in
// the library. `also`, `group` and `scan` have no value meaning "none", so
// they are written only when already set.

export type MigratedFile = {
  file: string;
  status: "rewritten" | "unchanged" | "invalid";
  message?: string;
};

export type Migration = {
  dir: string;
  kind: "story" | "library";
  known: boolean;
  files: MigratedFile[];
};

const fieldOrder = [
  "title",
  "keys",
  "also",
  "unless",
  "always",
  "priority",
  "scope",
  "cooldown",
  "chance",
  "group",
  "weight",
  "recurse",
  "scan",
  "known",
  "truth",
];

export async function migrateLore(dir: string): Promise<Migration> {
  const root = posixPath(dir);
  const isStory = await Bun.file(`${root}/story.md`).exists();
  const lore = !isStory && root.endsWith("/lore") ? root : `${root}/lore`;
  const known = isStory && (await hasBeenPlayed(root));
  const files = isStory
    ? await markdown(lore)
    : [...(await markdown(lore)), ...(await bookFiles(lore))];
  const results: MigratedFile[] = [];
  for (const file of files) results.push(await migrateFile(file, known));
  return { dir: root, kind: isStory ? "story" : "library", known, files: results };
}

export function explicitFields(data: Frontmatter, stem: string, known: boolean): Frontmatter {
  const defaults: Frontmatter = { title: stem, keys: [], unless: [], ...loreDefaults, known };
  const out: Frontmatter = {};
  for (const field of fieldOrder) {
    const value = data[field] ?? defaults[field];
    if (value !== undefined) out[field] = value;
  }
  for (const [key, value] of Object.entries(data)) if (!(key in out)) out[key] = value;
  return out;
}

async function migrateFile(file: string, known: boolean): Promise<MigratedFile> {
  const text = await Bun.file(file).text();
  const stem = file.slice(file.lastIndexOf("/") + 1, -".md".length);
  let doc: { data: Frontmatter; body: string };
  try {
    doc = parseFrontmatter(text);
    parseLoreFields(doc.data, stem);
  } catch (error) {
    // A file the loader would refuse is reported, never rewritten.
    if (error instanceof StoryError || error instanceof FrontmatterError) {
      return { file, status: "invalid", message: error.message };
    }
    throw error;
  }
  const next = writeEntry(explicitFields(doc.data, stem, known), doc.body);
  if (next === text) return { file, status: "unchanged" };
  await Bun.write(file, next);
  return { file, status: "rewritten" };
}

// People edit these files, so lists stay on one line (`keys: [a, b]`) the way
// they were written. Anything this simple emitter would not read back the
// same goes through the general serializer instead.
export function writeEntry(data: Frontmatter, body: string): string {
  const lines = Object.entries(data).map(([key, value]) => {
    const flow = flowValue(value);
    return flow === undefined
      ? (Bun.YAML.stringify({ [key]: value }, null, 2) ?? "").replace(/[ \t]+$/gm, "")
      : `${key}: ${flow}`;
  });
  const text = `---\n${lines.join("\n")}\n---\n${body.trim() ? `\n${body.trim()}\n` : ""}`;
  const reread = parseFrontmatter(text);
  const same = Bun.deepEquals(reread.data, data) && reread.body === body.trim();
  return same ? text : serializeFrontmatter(data, body);
}

function flowValue(value: unknown): string | undefined {
  if (typeof value === "string") return scalar(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.map(flowValue);
    if (items.some((i) => i === undefined)) return undefined;
    return `[${items.join(", ")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => [scalar(k), flowValue(v)]);
    if (entries.some(([, v]) => v === undefined)) return undefined;
    return `{ ${entries.map(([k, v]) => `${k}: ${v}`).join(", ")} }`;
  }
  return undefined;
}

// Plain when YAML would read it back as the same string, else double-quoted.
function scalar(text: string): string {
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '’._():/-]*$/u.test(text) || text.endsWith(" ")) {
    return JSON.stringify(text);
  }
  try {
    const reread = Bun.YAML.parse(`v: ${text}`) as { v?: unknown } | null;
    if (reread?.v === text) return text;
  } catch {}
  return JSON.stringify(text);
}

async function hasBeenPlayed(storyDir: string): Promise<boolean> {
  for (const scene of await entries(`${storyDir}/scenes`)) {
    if (!scene.isDirectory()) continue;
    const log = Bun.file(`${storyDir}/scenes/${scene.name}/log.jsonl`);
    if ((await log.exists()) && (await log.text()).trim() !== "") return true;
  }
  return false;
}

async function markdown(folder: string): Promise<string[]> {
  return (await entries(folder))
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => `${folder}/${e.name}`)
    .sort();
}

async function bookFiles(lore: string): Promise<string[]> {
  const books = (await entries(lore)).filter((e) => e.isDirectory()).map((e) => e.name);
  return (await Promise.all(books.sort().map((b) => markdown(`${lore}/${b}`)))).flat();
}

async function entries(folder: string) {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
}
