#!/usr/bin/env bun
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { StoryError } from "../src/errors.ts";
import { describeHome, scaffoldHome } from "../src/install.ts";
import { type LaunchOptions, launch, repoRoot } from "../src/launch.ts";
import { storiesRoot } from "../src/paths.ts";
import { listStories, listText } from "../src/picker.ts";
import { askLine, pick } from "../src/picker-tty.ts";
import { renderBible } from "../src/render.ts";
import { loadStory } from "../src/story.ts";

// The `rp` command (spec 11). Everything it does is in src/; this file only
// reads the command line.

const usage = `rp: play a story in Claude Code

  rp                pick a story from a list and play it (or start a new one)
  rp <story> [--new] [--model <m>] [-- <claude args>]
                    continue the last session for a story, or start one with --new
  rp install        create the stories and library folders (safe to run again)
  rp new <name>     create a blank story and open it; the Storyteller interviews you
  rp list           your stories, last played first (plain text)
  rp prompt <story> print the rendered story bible
  rp help           this text

<story> is a folder, or a name under ${storiesRoot()}
(set RP_STORIES to use another folder; RP_LIBRARY does the same for the library).
`;

const blankTemplate = path.join(repoRoot, "templates", "blank", "story.md");

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
      return picker();
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(usage);
      return 0;
    case "install":
      return install();
    case "new":
      return create(rest[0]);
    case "list":
      return list();
    case "prompt":
      process.stdout.write(renderBible(await load(rest[0])));
      return 0;
    default:
      return play(argv);
  }
}

async function play(args: string[]): Promise<number> {
  let name: string | undefined;
  const options: LaunchOptions = { extra: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--") {
      options.extra = args.slice(i + 1);
      break;
    }
    if (arg === "--new") options.new = true;
    else if (arg === "--model") {
      options.model = args[++i];
      if (!options.model) throw new StoryError("--model needs a model name");
    } else if (arg.startsWith("-")) throw new StoryError(`Unknown option ${arg}\n\n${usage}`);
    else if (name) throw new StoryError(`One story at a time (got ${name} and ${arg})`);
    else name = arg;
  }
  const story = await load(name);
  process.stdout.write(`${story.storyteller.name} is at the table. Story: ${story.title}\n`);
  return launch(story, options);
}

async function install(): Promise<number> {
  process.stdout.write(describeHome(await scaffoldHome()));
  return 0;
}

async function create(name: string | undefined): Promise<number> {
  if (!name) throw new StoryError("rp new needs a name, e.g. rp new saltmere");
  if (name !== path.basename(name) || name.startsWith(".")) {
    throw new StoryError(`A story name is a plain folder name, not a path: ${name}`);
  }
  // A first story on this machine sets up the home around it; only what was
  // missing is mentioned.
  const made = (await scaffoldHome()).filter((f) => f.created);
  if (made.length) process.stdout.write(describeHome(made));
  const target = path.join(storiesRoot(), name);
  if (await exists(target)) throw new StoryError(`${target} already exists`);
  await mkdir(target, { recursive: true });
  await copyFile(blankTemplate, path.join(target, "story.md"));
  process.stdout.write(`Created ${target}\n`);
  const story = await loadStory(target, { libraryRoot: process.env.RP_LIBRARY });
  return launch(story, { new: true });
}

async function list(): Promise<number> {
  const rows = await listStories();
  if (rows.length === 0) {
    process.stdout.write(`No stories in ${storiesRoot()}. Start one with: rp new <name>\n`);
  } else {
    process.stdout.write(listText(rows));
  }
  return 0;
}

// `rp` alone (spec 11): pick a story and play it as `rp <story>` would, or
// name a new one and go through `rp new`.
async function picker(): Promise<number> {
  const rows = await listStories();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    await list();
    process.stderr.write("rp: not a terminal, so no picker; pass a story name: rp <story>\n");
    return 1;
  }
  const choice = rows.length === 0 ? { kind: "new" as const } : await pick(rows);
  if (choice.kind === "quit") return 0;
  if (choice.kind === "story") return play([choice.row.dir]);
  if (rows.length === 0) process.stdout.write(`No stories in ${storiesRoot()} yet.\n`);
  const name = await askLine("New story folder name (Enter to cancel): ");
  return name ? create(name) : 0;
}

// A folder path, or a name under the stories folder.
async function load(name: string | undefined) {
  if (!name) throw new StoryError(`Which story?\n\n${usage}`);
  const candidate = path.join(storiesRoot(), name);
  const dir = (await isDir(name)) ? name : (await isDir(candidate)) ? candidate : undefined;
  if (!dir) throw new StoryError(`No story at ${path.resolve(name)} or ${candidate}`);
  return loadStory(dir, { libraryRoot: process.env.RP_LIBRARY });
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

async function isDir(p: string): Promise<boolean> {
  return stat(p).then(
    (s) => s.isDirectory(),
    () => false,
  );
}

try {
  process.exit(await main(process.argv.slice(2)));
} catch (error) {
  if (error instanceof StoryError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
