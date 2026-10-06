import type { EngineInterface, Register, RenderInput } from "claude-code";
import { atom, read } from "claude-code";
import type { StageSnapshot } from "../types";
import {
  type Block,
  colorFor,
  emphasisRuns,
  quietPhrase,
  quietTool,
  quoteSpans,
  replyBlocks,
  spinnerWord,
} from "./text.ts";

// How the Storyteller reads on screen (spec 10): tool rows as one dim line in
// voice, the spinner in its name, and reply blocks labelled and styled. Each
// hook passes to the engine's drawing (`next(e)`) until the story has been
// read, and wherever it has nothing better to draw.

const FALLBACK_NAME = "The Storyteller";

// Written by scene.tsx; spelled again here because a state reference never
// crosses an import in a hooks module.
const stage = atom({ plugin: "storyteller", key: "stage" } as const, null);
const voicing = atom({ plugin: "storyteller", key: "voicing" } as const, null);

export const registerVoice: Register = (on) => {
  // The quiet line. A ToolUse row carries no ctrl+o flag (only ToolGroup
  // does), so these rows stay quiet in the expanded transcript too; an
  // errored call always shows the engine's own row.
  on("ui.render", { component: "ToolUse", props: { tool: quietTool } }, async ($, e, next) => {
    if (e.props.isErrored) return next(e);
    const { Text } = $.ui.resolve(e);
    const name = (await read($, stage))?.storyteller ?? FALLBACK_NAME;
    const phrase = quietPhrase(e.props.tool, e.props.input, e.props.output);
    return (
      <Text dimColor italic>
        {`${name} ${phrase}${e.props.isRunning ? "…" : "."}`}
      </Text>
    );
  });

  // The result block under a quiet row would undo the quiet.
  on("ui.render", { component: "ToolResult", props: { tool: quietTool } }, ($, e, next) => {
    if (e.props.isErrored) return next(e);
    const { Box } = $.ui.resolve(e);
    return <Box />;
  });

  on("ui.render", { component: "ToolGroup" }, async ($, e, next) => {
    const calls = e.props.calls;
    const isQuiet = calls.every((c) => quietTool.test(c.tool) && !c.isErrored);
    if (e.props.isExpanded || !isQuiet) return next(e);
    const { Text } = $.ui.resolve(e);
    const name = (await read($, stage))?.storyteller ?? FALLBACK_NAME;
    const phrases = [...new Set(calls.map((c) => quietPhrase(c.tool, c.input, c.output)))];
    return (
      <Text dimColor italic>
        {`${name} ${phrases.join(", ")}${e.props.isActive ? "…" : "."}`}
      </Text>
    );
  });

  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    const snapshot = await read($, stage);
    if (!snapshot) return next(e);
    const word = spinnerWord(snapshot.storyteller, e.props.mode, await read($, voicing));
    return next({ ...e, props: { ...e.props, word } });
  });

  // Markdown and Text are bounded at 10000 characters; a longer block keeps
  // the engine's drawing.
  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const snapshot = await read($, stage);
    if (!snapshot || e.props.text.length > 9_000) return next(e);
    return drawReply($, e, snapshot);
  });
};

// One text block of a reply: the Storyteller's name in its colour at the
// start of a reply; asides in (( )) dim; a lone italic phrase as a
// scene-setting rule; quoted lines tinted for the one character a paragraph
// names; everything else drawn as the engine draws markdown.
function drawReply(
  $: EngineInterface,
  e: RenderInput<"AssistantMessage">,
  snapshot: StageSnapshot,
) {
  const { Box, Text } = $.ui.resolve(e);
  const blocks = replyBlocks(e.props.text, snapshot.speakers);
  const columns = e.viewport?.columns ?? 80;
  return (
    <Box flexDirection="column">
      {e.props.isFirstOfReply ? (
        <Text bold color={colorFor(snapshot.storyteller)}>
          {snapshot.storyteller}
        </Text>
      ) : null}
      <Box flexDirection="column" gap={1}>
        {blocks.map((block) => drawBlock($, e, block, columns))}
      </Box>
    </Box>
  );
}

function drawBlock(
  $: EngineInterface,
  e: RenderInput<"AssistantMessage">,
  block: Block,
  columns: number,
) {
  const { Text, Markdown } = $.ui.resolve(e);
  switch (block.kind) {
    case "prose":
      return <Markdown text={block.text} />;
    case "ooc":
      return <Markdown text={block.text} dimColor />;
    case "setting": {
      const rule = "─".repeat(Math.max(3, Math.min(40, columns - block.text.length - 8)));
      return (
        <Text wrap="wrap">
          <Text dimColor>{"── "}</Text>
          <Text italic>{block.text}</Text>
          <Text dimColor>{` ${rule}`}</Text>
        </Text>
      );
    }
    case "dialogue": {
      const color = colorFor(block.speaker.stem);
      return (
        <Text wrap="wrap">
          {quoteSpans(block.text).flatMap((span) =>
            emphasisRuns(span.text).map((run) => (
              <Text
                {...(span.quoted ? { color } : {})}
                {...(run.italic ? { italic: true } : {})}
                {...(run.bold ? { bold: true } : {})}
              >
                {run.text}
              </Text>
            )),
          )}
        </Text>
      );
    }
  }
}
