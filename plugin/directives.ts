#!/usr/bin/env bun
import { readFrontmatterFile, writeFrontmatterFile } from "../src/frontmatter.ts";
import { generate } from "../src/generate.ts";
import { posixPath } from "../src/paths.ts";
import { type Directive, directiveModes, loadStory, type Story } from "../src/story.ts";
import { isStoryDir } from "./hooks/lib/io.ts";
import type { DirectiveList, DirectiveReply, DirectiveRow, DirectiveWrite } from "./mod/types";

// The Bun half of the directives pane (spec 12). The mod has no Node and no
// YAML parser, so every read and write of a directive file happens here:
//
//   bun plugin/directives.ts list          prints a DirectiveList (null outside a story)
//   bun plugin/directives.ts write         reads a DirectiveWrite on stdin, prints a DirectiveReply
//   bun plugin/directives.ts open <stem>   opens the directive's file in the player's editor
//
// Writes follow the world server's rule (server/tools/canon.ts): they land in
// the story folder, and changing a library directive first copies it into the
// story, where it overrides the library's (spec 5.3). After a write the
// prompt file is regenerated so the bible is never stale.

export function listOf(story: Story): DirectiveList {
  return { dir: story.dir, directives: story.directives.map(rowOf) };
}

function rowOf(d: Directive): DirectiveRow {
  return {
    stem: d.stem,
    title: d.title,
    mode: d.mode,
    keys: d.keys,
    on: d.on,
    body: d.body,
    source: d.source,
    path: d.path,
  };
}

export class DirectiveError extends Error {}

export async function applyWrite(
  dir: string,
  write: DirectiveWrite,
  libraryRoot?: string,
): Promise<DirectiveReply> {
  const story = await loadStory(dir, { libraryRoot });
  const message = await writeOne(story, write);
  const after = await loadStory(dir, { libraryRoot });
  await generate(after);
  return { message, error: null, list: listOf(after) };
}

async function writeOne(story: Story, write: DirectiveWrite): Promise<string> {
  if (write.op === "create") {
    const title = write.title.trim();
    if (!title) throw new DirectiveError("A directive needs a title.");
    if (!write.body.trim()) throw new DirectiveError("A directive needs an instruction.");
    const stem = freeStem(story, slugify(title) || "directive");
    await writeFrontmatterFile(
      fileOf(story, stem),
      fields({ title, mode: write.mode, keys: write.keys, on: write.on }),
      write.body,
    );
    return `Created ${title} (${stem}).`;
  }

  const directive = story.directives.find((d) => d.stem === write.stem);
  if (!directive) throw new DirectiveError(`No directive "${write.stem}".`);

  if (write.op === "delete") {
    if (directive.source === "library") {
      throw new DirectiveError(
        `${directive.title} comes from the library; switch it off or edit it to override it here.`,
      );
    }
    await Bun.file(directive.path).delete();
    const restored = story.uses.includes(directive.ref)
      ? " The library's copy is in force again."
      : "";
    return `Deleted ${directive.title}.${restored}`;
  }

  const copied = await ownCopy(story, directive);
  const file = fileOf(story, directive.stem);
  const doc = await readFrontmatterFile(file);
  if (write.op === "toggle") {
    await writeFrontmatterFile(file, { ...doc.data, on: write.on }, doc.body);
    return `${directive.title} is now ${write.on ? "on" : "off"}.${copied}`;
  }

  if (write.title !== undefined && !write.title.trim()) {
    throw new DirectiveError("A directive needs a title.");
  }
  if (write.body !== undefined && !write.body.trim()) {
    throw new DirectiveError("A directive needs an instruction.");
  }
  if (write.mode !== undefined && !directiveModes.includes(write.mode)) {
    throw new DirectiveError(`mode should be one of ${directiveModes.join(", ")}.`);
  }
  const data = { ...doc.data, ...fields(write) };
  if (write.keys !== undefined && write.keys.length === 0) delete data.keys;
  await writeFrontmatterFile(file, data, write.body ?? doc.body);
  return `Saved ${write.title?.trim() || directive.title}.${copied}`;
}

// A library directive gets a story copy before its first change, so nothing
// of it is lost and other stories keep the library's version.
async function ownCopy(story: Story, directive: Directive): Promise<string> {
  if (directive.source !== "library") return "";
  const lib = await readFrontmatterFile(directive.path);
  await writeFrontmatterFile(fileOf(story, directive.stem), lib.data, lib.body);
  return " The story now has its own copy, overriding the library's.";
}

type Fields = { title?: string; mode?: string; keys?: string[]; on?: boolean };

// Only what was given; keys trimmed and an empty list left for the caller.
function fields(f: Fields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.title !== undefined) out.title = f.title.trim();
  if (f.mode !== undefined) out.mode = f.mode;
  if (f.keys !== undefined) {
    const keys = f.keys.map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) out.keys = keys;
  }
  if (f.on !== undefined) out.on = f.on;
  return out;
}

function fileOf(story: Story, stem: string): string {
  return `${story.dir}/directives/${stem}.md`;
}

function freeStem(story: Story, base: string): string {
  const taken = new Set(story.directives.map((d) => d.stem));
  let stem = base;
  for (let n = 2; taken.has(stem); n++) stem = `${base}-${n}`;
  return stem;
}

// The same shape the world server gives stems: lowercase, digits, dashes.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

// Opening a file in the player's editor. VISUAL or EDITOR first, then VS
// Code, then the platform's opener. A terminal editor is passed over: it
// would start with no terminal of its own, unseen behind the session.
const terminalEditors = new Set([
  "vi",
  "vim",
  "nvim",
  "nano",
  "emacs",
  "micro",
  "hx",
  "helix",
  "ed",
]);

export type Env = Record<string, string | undefined>;

export function openerFor(
  file: string,
  env: Env,
  platform: string,
  which: (cmd: string) => string | null,
): string[] {
  for (const name of ["VISUAL", "EDITOR"]) {
    const words = (env[name] ?? "").trim().split(/\s+/).filter(Boolean);
    const [cmd, ...args] = words;
    if (!cmd) continue;
    const base = (cmd.split(/[\\/]/).pop() ?? cmd).replace(/\.(exe|cmd|bat)$/i, "");
    if (terminalEditors.has(base.toLowerCase())) continue;
    // `code --wait` and its kin would only hold the launch open.
    return wrap([cmd, ...args.filter((a) => a !== "--wait" && a !== "-w"), file], platform, which);
  }
  if (which("code")) return wrap(["code", file], platform, which);
  if (platform === "win32") return ["cmd", "/c", "start", "", file];
  if (platform === "darwin") return ["open", file];
  return ["xdg-open", file];
}

// On Windows `code` and most editor shims are .cmd files, which only cmd
// runs; cmd is handed the name as written (not a quoted full path, which
// cmd /c would mangle) and finds it on PATH itself.
function wrap(argv: string[], platform: string, which: (cmd: string) => string | null): string[] {
  if (platform !== "win32") return argv;
  const [cmd = "", ...rest] = argv;
  const found = which(cmd);
  if (found && /\.exe$/i.test(found)) return [found, ...rest];
  return ["cmd", "/c", cmd, ...rest];
}

export async function openFile(
  story: Story,
  stem: string,
): Promise<{ message: string; path: string; argv: string[] }> {
  const directive = story.directives.find((d) => d.stem === stem);
  if (!directive) throw new DirectiveError(`No directive "${stem}".`);
  const argv = openerFor(directive.path, process.env, process.platform, (c) => Bun.which(c));
  // Detached with nothing piped, so the editor outlives this script and the
  // mod's process.run returns as soon as it has started.
  const child = Bun.spawn(argv, { stdio: ["ignore", "ignore", "ignore"], detached: true });
  child.unref();
  const note = directive.source === "library" ? " (library file: edits reach every story)" : "";
  return { message: `Opened ${directive.path}${note}`, path: directive.path, argv };
}

function out(value: DirectiveList | DirectiveReply | null): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function failed(error: string): DirectiveReply {
  return { message: null, error, list: null };
}

if (import.meta.main) {
  const dir = posixPath(process.env.RP_STORY ?? process.cwd());
  const library = process.env.RP_LIBRARY;
  const [command, arg] = process.argv.slice(2);
  try {
    if (!(await isStoryDir(dir))) {
      out(command === "list" ? null : failed("Not in a story folder."));
    } else if (command === "list") {
      out(listOf(await loadStory(dir, { libraryRoot: library })));
    } else if (command === "write") {
      const write: DirectiveWrite = JSON.parse(await Bun.stdin.text());
      out(await applyWrite(dir, write, library));
    } else if (command === "open" && arg) {
      const { message } = await openFile(await loadStory(dir, { libraryRoot: library }), arg);
      out({ message, error: null, list: null });
    } else {
      out(failed("Usage: directives.ts list | write | open <stem>"));
    }
  } catch (error) {
    out(failed(error instanceof Error ? error.message : String(error)));
  }
}
