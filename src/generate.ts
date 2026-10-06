import path from "node:path";
import { renderClaudeMd, renderSystemPrompt } from "./render.ts";
import type { Story } from "./story.ts";

// The two files the launcher, hooks and world server regenerate into a story
// folder whenever the bible changes. Spec 5.2 (.rp/) and 6.

export const repoRoot = path.resolve(import.meta.dir, "..");
export const pluginDir = path.join(repoRoot, "plugin");
export const basePromptFile = path.join(pluginDir, "prompts", "storyteller.md");

export type Generated = { promptFile: string; claudeMdFile: string };

export function generatedPaths(story: Pick<Story, "dir">): Generated {
  return {
    promptFile: path.join(story.dir, ".rp", "system-prompt.md"),
    claudeMdFile: path.join(story.dir, "CLAUDE.md"),
  };
}

export async function generate(story: Story): Promise<Generated> {
  const base = await Bun.file(basePromptFile).text();
  const files = generatedPaths(story);
  await Bun.write(files.promptFile, renderSystemPrompt(base, story));
  await Bun.write(files.claudeMdFile, renderClaudeMd(story));
  return files;
}
