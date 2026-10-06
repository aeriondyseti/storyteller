// Reads the latest exchange out of a Claude Code transcript (the JSONL file at
// the hook input's transcript_path). Shape, as observed in Claude Code 2.x
// transcripts:
//
// - Every line is a JSON object with a `type`. Only "user" and "assistant"
//   lines carry an exchange; "attachment" (where hook additionalContext
//   lands), "queue-operation" and the rest are skipped. A "system" line with
//   subtype "stop_hook_summary" or "turn_duration" is written once a turn's
//   Stop hooks have run, so it marks the exchange before it as ended.
// - The file is written asynchronously: when a hook fires, the turn's last
//   lines may not be on disk yet.
// - An assistant message is split across lines, one content block per line
//   (thinking, text, tool_use), each with its own `uuid`.
// - A "user" line is the player's prompt only when its content is a string or
//   an array of text blocks. Tool results arrive as user lines holding
//   tool_result blocks; skill bodies and other injections carry isMeta;
//   background-task notices carry promptSource "system"; compaction writes a
//   user line with isCompactSummary; an interruption writes
//   "[Request interrupted by user]"; slash commands write
//   "<command-name>...". None of those are prompts.
// - Lines with isSidechain belong to subagents and are skipped.
// - Lines carry an ISO `timestamp`.

// replyUuid and replyAt are the last assistant line that held reply text;
// they are empty while there is no reply text. `ended` is set once the
// transcript shows the turn's Stop hooks ran.
export type Exchange = {
  ended?: true;
  promptUuid: string;
  promptAt: string | undefined;
  prompt: string;
  replyUuid: string;
  replyAt: string | undefined;
  reply: string;
};

type Line = Record<string, unknown>;

const notPromptPrefixes = [
  "[Request interrupted",
  "<command-",
  "<local-command-",
  "<task-notification",
  "<bash-",
];

// Every exchange in the transcript, oldest first: each prompt with the text
// of every assistant line after it, up to the next prompt, joined with blank
// lines.
export function allExchanges(jsonl: string): Exchange[] {
  const result: Exchange[] = [];
  const seen = new Set<string>();
  let current: { exchange: Exchange; texts: string[] } | undefined;
  for (const line of parseLines(jsonl)) {
    if (line.isSidechain === true) continue;
    const prompt = promptText(line);
    if (prompt !== undefined) {
      if (typeof line.uuid !== "string") continue;
      current = {
        exchange: {
          promptUuid: line.uuid,
          promptAt: timestampOf(line),
          prompt,
          replyUuid: "",
          replyAt: undefined,
          reply: "",
        },
        texts: [],
      };
      result.push(current.exchange);
      continue;
    }
    if (current && isTurnEnd(line)) current.exchange.ended = true;
    if (!current || line.type !== "assistant") continue;
    if (typeof line.uuid === "string") {
      if (seen.has(line.uuid)) continue;
      seen.add(line.uuid);
    }
    for (const block of contentBlocks(line)) {
      if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        current.texts.push(block.text.trim());
        current.exchange.reply = current.texts.join("\n\n");
        current.exchange.replyUuid = typeof line.uuid === "string" ? line.uuid : "";
        current.exchange.replyAt = timestampOf(line);
      }
    }
  }
  return result;
}

// The last prompt and its reply so far. Undefined when the transcript holds no
// prompt yet.
export function latestExchange(jsonl: string): Exchange | undefined {
  return allExchanges(jsonl).at(-1);
}

// The exchanges after the one whose prompt is `lastLogged`, oldest first, so
// a Stop that missed a turn (the transcript lagged) catches up on the next.
// When `lastLogged` is unset or not in this transcript (a new session), only
// the latest exchange: older ones belong to a record we cannot see.
export function exchangesSince(jsonl: string, lastLogged: string | undefined): Exchange[] {
  const all = allExchanges(jsonl);
  const at = lastLogged === undefined ? -1 : all.findIndex((e) => e.promptUuid === lastLogged);
  return at === -1 ? all.slice(-1) : all.slice(at + 1);
}

function isTurnEnd(line: Line): boolean {
  return (
    line.type === "system" &&
    (line.subtype === "stop_hook_summary" || line.subtype === "turn_duration")
  );
}

function timestampOf(line: Line): string | undefined {
  return typeof line.timestamp === "string" ? line.timestamp : undefined;
}

function promptText(line: Line): string | undefined {
  if (line.type !== "user" || line.isMeta === true || line.isCompactSummary === true) {
    return undefined;
  }
  if (line.promptSource === "system") return undefined;
  const message = asRecord(line.message);
  let text: string;
  if (typeof message.content === "string") {
    text = message.content;
  } else {
    const blocks = contentBlocks(line);
    if (blocks.length === 0 || blocks.some((b) => b.type === "tool_result")) return undefined;
    text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => String(b.text))
      .join("\n\n");
  }
  text = text.trim();
  if (!text || notPromptPrefixes.some((p) => text.startsWith(p))) return undefined;
  return text;
}

function contentBlocks(line: Line): Line[] {
  const content = asRecord(line.message).content;
  return Array.isArray(content) ? content.map(asRecord) : [];
}

function parseLines(jsonl: string): Line[] {
  const lines: Line[] = [];
  for (const raw of jsonl.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    try {
      lines.push(asRecord(JSON.parse(raw)));
    } catch {
      // A torn final line (the file is still being written) is skipped.
    }
  }
  return lines;
}

function asRecord(value: unknown): Line {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Line)
    : {};
}
