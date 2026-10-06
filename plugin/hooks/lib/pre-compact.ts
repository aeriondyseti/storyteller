import { generate } from "../../../src/generate.ts";
import { type LoadOptions, loadStory } from "../../../src/story.ts";
import { type HookInput, isStoryDir } from "./io.ts";

// PreCompact (spec 7.4): the engine re-reads the system prompt file after a
// compaction, so make sure it is current. The synchronous notes refresh joins
// this once the notes job exists (it lives in the mod layer).
export async function preCompact(input: HookInput, options: LoadOptions = {}): Promise<undefined> {
  if (!(await isStoryDir(input.cwd))) return undefined;
  await generate(await loadStory(input.cwd, options));
  return undefined;
}
