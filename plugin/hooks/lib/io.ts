import { appendFile, mkdir } from "node:fs/promises";
import { posixPath } from "../../../src/paths.ts";

// Plumbing shared by every hook entry file. Claude Code sends the hook a JSON
// object on stdin (session_id, transcript_path, cwd, hook_event_name, plus the
// event's own fields) and reads JSON from stdout when the exit code is 0.
// A hook of ours must never break a turn, so any failure means: print nothing,
// exit 0, and leave a line in the story's .rp/hook-errors.log for whoever is
// debugging.

export type HookInput = {
  cwd: string;
  session_id?: string | undefined;
  transcript_path?: string | undefined;
  prompt?: string | undefined;
  source?: string | undefined;
  // Stop only: the turn's final assistant text, which Claude Code has in
  // memory even when the transcript file has not caught up yet.
  last_assistant_message?: string | undefined;
};

export type Handler = (input: HookInput) => Promise<string | undefined>;

export async function handle(raw: string, handler: Handler): Promise<string> {
  let cwd: string | undefined;
  try {
    const input = parseInput(raw);
    cwd = input.cwd;
    return (await handler(input)) ?? "";
  } catch (error) {
    if (cwd) await logError(cwd, error).catch(() => {});
    return "";
  }
}

export async function runHook(handler: Handler): Promise<void> {
  const out = await handle(await Bun.stdin.text().catch(() => ""), handler);
  if (out) process.stdout.write(out);
  process.exit(0);
}

export async function isStoryDir(dir: string): Promise<boolean> {
  return Bun.file(`${posixPath(dir)}/story.md`).exists();
}

export function additionalContext(hookEventName: string, text: string): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: text } });
}

function parseInput(raw: string): HookInput {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== "object" || data === null) throw new Error("hook input is not an object");
  const fields = data as Record<string, unknown>;
  const str = (key: string) => (typeof fields[key] === "string" ? fields[key] : undefined);
  const cwd = str("cwd");
  if (!cwd) throw new Error("hook input has no cwd");
  return {
    cwd,
    session_id: str("session_id"),
    transcript_path: str("transcript_path"),
    prompt: str("prompt"),
    source: str("source"),
    last_assistant_message: str("last_assistant_message"),
  };
}

async function logError(cwd: string, error: unknown): Promise<void> {
  if (!(await isStoryDir(cwd))) return;
  const dir = `${posixPath(cwd)}/.rp`;
  await mkdir(dir, { recursive: true });
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await appendFile(`${dir}/hook-errors.log`, `${new Date().toISOString()} ${message}\n`);
}
