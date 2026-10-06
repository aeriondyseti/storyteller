import os from "node:os";
import path from "node:path";

// Where things live on this machine (spec 5.1), and the one path format we hand
// to the model: absolute with forward slashes, which its Read tool accepts on
// every platform.

export function rpHome(): string {
  return path.join(os.homedir(), ".claude-roleplay");
}

export function storiesRoot(): string {
  return process.env.RP_STORIES ?? path.join(rpHome(), "stories");
}

export function libraryRoot(): string {
  return process.env.RP_LIBRARY ?? path.join(rpHome(), "library");
}

// Skills a player adds for every story: Claude Code reads a story folder's
// ancestors' .claude/skills, and the stories home is one of them.
export function homeSkillsDir(): string {
  return path.join(rpHome(), ".claude", "skills");
}

export function posixPath(file: string): string {
  return path.resolve(file).replaceAll("\\", "/");
}
