import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { posixPath } from "../paths.ts";

// Paths to the on-disk fixtures, shared by every module's tests.

export const fixtures = posixPath(path.join(import.meta.dir, "fixtures"));
export const fixtureLibrary = `${fixtures}/library`;
export const saltmereDir = `${fixtures}/stories/saltmere`;
export const blankDir = `${fixtures}/stories/blank`;

export async function tempDir(prefix = "rp-test-"): Promise<string> {
  return posixPath(await mkdtemp(path.join(os.tmpdir(), prefix)));
}

// A writable copy of a fixture story, for tests that change files.
export async function copyStory(dir: string): Promise<string> {
  const target = `${await tempDir()}/${path.basename(dir)}`;
  await cp(dir, target, { recursive: true });
  return target;
}
