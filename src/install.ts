import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { homeSkillsDir, libraryRoot, storiesRoot } from "./paths.ts";

// `rp install` (spec 5.1, 11): the folders a player's stories and library live
// in, created when missing and never filled. Running it again changes nothing.

export type HomeFolder = { path: string; created: boolean };

export type HomeRoots = { stories: string; library: string; skills: string };

export function homeRoots(): HomeRoots {
  return { stories: storiesRoot(), library: libraryRoot(), skills: homeSkillsDir() };
}

export function homeFolders(roots: HomeRoots): string[] {
  return [
    roots.stories,
    ...["characters", "lore", "directives"].map((kind) => path.join(roots.library, kind)),
    roots.skills,
  ];
}

export async function scaffoldHome(roots: HomeRoots = homeRoots()): Promise<HomeFolder[]> {
  const folders: HomeFolder[] = [];
  for (const folder of homeFolders(roots)) {
    const existed = await isDir(folder);
    if (!existed) await mkdir(folder, { recursive: true });
    folders.push({ path: folder, created: !existed });
  }
  return folders;
}

export function describeHome(folders: HomeFolder[]): string {
  return folders.map((f) => `${f.created ? "created" : "exists "}  ${f.path}\n`).join("");
}

async function isDir(p: string): Promise<boolean> {
  return stat(p).then(
    (s) => s.isDirectory(),
    () => false,
  );
}
