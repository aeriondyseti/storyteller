import { createInterface } from "node:readline/promises";
import { pickerKey, renderPicker, type StoryRow, splitKeys } from "./picker.ts";

// The picker's terminal loop: raw keys in, frames out (src/picker.ts does the
// rest). Whatever happens, the terminal is left as it was found: cooked mode,
// cursor shown, stdin released for the claude session that follows.

export type Choice = { kind: "story"; row: StoryRow } | { kind: "new" } | { kind: "quit" };

const hideCursor = "\x1b[?25l";
const showCursor = "\x1b[?25h";

export async function pick(rows: StoryRow[]): Promise<Choice> {
  const stdin = process.stdin;
  const out = process.stdout;
  let selected = 0;
  let drawn = 0;
  const draw = () => {
    const frame = renderPicker(rows, selected, out.columns || 80, { height: out.rows || 24 });
    // Back to the top of the previous frame, clear down, draw.
    const up = drawn > 1 ? `\x1b[${drawn - 1}A` : "";
    out.write(`${up}\r\x1b[J${frame}`);
    drawn = frame.split("\n").length;
  };

  const restore = () => {
    if (stdin.isTTY) stdin.setRawMode(false);
    out.write(showCursor);
  };
  // A crash or a kill mid-pick still gives the terminal back.
  process.once("exit", restore);

  try {
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    out.write(hideCursor);
    draw();
    const action = await new Promise<"launch" | "new" | "quit">((resolve) => {
      const onData = (chunk: string) => {
        for (const key of splitKeys(chunk)) {
          const step = pickerKey(selected, rows.length, key);
          selected = step.selected;
          if (step.action) {
            stdin.off("data", onData);
            resolve(step.action);
            return;
          }
        }
        draw();
      };
      stdin.on("data", onData);
      stdin.resume();
    });
    draw();
    out.write("\n");
    if (action === "quit") return { kind: "quit" };
    const row = rows[selected];
    return action === "launch" && row ? { kind: "story", row } : { kind: "new" };
  } finally {
    stdin.pause();
    restore();
    process.off("exit", restore);
  }
}

// One line in cooked mode; Enter on nothing (or Ctrl+C, Ctrl+D) gives "".
export async function askLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const closed = new Promise<string>((resolve) => rl.once("close", () => resolve("")));
  rl.once("SIGINT", () => rl.close());
  try {
    return (await Promise.race([rl.question(question), closed])).trim();
  } finally {
    rl.close();
    process.stdin.pause();
  }
}
