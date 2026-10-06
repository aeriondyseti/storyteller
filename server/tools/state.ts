import { z } from "zod";
import { findCharacter } from "../../src/story.ts";
import {
  parseWidget,
  renderNamedWidgetLine,
  serializeWidget,
  type Widget,
  widgetKey,
  widgetTypeNames,
  widgetTypes,
} from "../../src/widgets.ts";
import { load, regenerate, requireOpenScene, ToolError } from "../context.ts";
import { formatRoll, roll } from "../dice.ts";
import { editScene } from "../edit.ts";
import { defineTool } from "../registry.ts";
import { toStem } from "./read.ts";

// The current scene's moving parts: where and when, who is here, widgets,
// and dice.

export const setSceneState = defineTool({
  name: "set_scene_state",
  description:
    "Update the current scene's location, time, mood or who is present, or rename it. Use it the moment the fiction moves (a new place, time passing, someone arriving or leaving), alongside your scene-setting line. Give a title only when the player asks for one or the beat has clearly become something else; keep it short, a few words. Renaming changes the scene's title, not its folder.",
  input: {
    title: z
      .string()
      .optional()
      .describe('The scene\'s new title, a few words, e.g. "The Long Wait"'),
    location: z.string().optional(),
    time: z.string().optional(),
    mood: z.string().optional(),
    present: z
      .array(z.string())
      .optional()
      .describe("Everyone in the scene, by card stem, the player's character included"),
  },
  run: async (ctx, { title: rawTitle, location, time, mood, present }) => {
    const story = await load(ctx);
    const scene = requireOpenScene(story);
    if ([rawTitle, location, time, mood, present].every((v) => v === undefined)) {
      throw new ToolError("Nothing to change: give title, location, time, mood or present.");
    }
    const title = rawTitle?.trim();
    if (title === "") throw new ToolError("A scene title cannot be empty.");
    const stems = present?.map((p) => toStem(story, p));
    await editScene(scene.path, { title, location, time, mood, present: stems });
    await regenerate(ctx);
    const changed = Object.entries({ title, location, time, mood, present: stems?.join(", ") })
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${v || "(empty)"}`);
    const unknown = stems?.filter((s) => !findCharacter(story, s)) ?? [];
    const warn = unknown.length ? ` No card yet for: ${unknown.join(", ")}.` : "";
    return `Scene ${scene.number} updated (${changed.join("; ")}).${warn}`;
  },
});

const typeLines = widgetTypeNames
  .map((t) => `- ${t} (${widgetTypes[t].fields}): ${widgetTypes[t].use}.`)
  .join("\n");

export const setWidget = defineTool({
  name: "set_widget",
  description: [
    "Create or update a widget on the current scene: a small piece of story state the player glances at in the side pane, such as a countdown, a wound, a clock filling, what has been found. Use it whenever such a thing changes in the fiction; the name is the key. Pick the type that fits:",
    typeLines,
    "Keep the name to a few words and the note to one or two short sentences (three at most); the value carries the number, the note says what it is and what happens at the edge.",
    "On an update, anything you leave out is kept: type, value, max, of, note, color, pane, group. An empty string clears note, color, pane or group. New widgets are drawn last; file order is draw order.",
    "color is optional, a hex like #c0392b, and applies to the main part of the row (name, bar, segments, items), never the note. pane puts the widget on its own named tab, which opens by itself and closes when its last widget is removed. group draws a dim heading over the widgets that share it.",
  ].join("\n"),
  input: {
    name: z.string().min(1).describe('A few words, e.g. "Days to the Crown Vote"'),
    type: z
      .enum(widgetTypeNames)
      .optional()
      .describe("Required for a new widget; kept from before when omitted"),
    value: z
      .union([z.string(), z.number(), z.array(z.string())])
      .optional()
      .describe(
        "text: words; counter, meter, clock: a number; list, tags: a list of short items. Required for a new widget",
      ),
    max: z.number().optional().describe("meter only: the bar's full value, e.g. 100"),
    of: z.number().int().optional().describe("clock only: the number of segments, e.g. 6"),
    note: z
      .string()
      .optional()
      .describe(
        'One or two short sentences, three at most, e.g. "The Houses vote at the Moot Hall. Every vote bought before then is one Corwin must answer."',
      ),
    color: z
      .string()
      .optional()
      .describe('Hex colour for the main part of the row, e.g. "#c0392b"'),
    pane: z.string().optional().describe("A named tab to draw it on, e.g. Powers"),
    group: z.string().optional().describe("A heading to draw it under, e.g. Body"),
  },
  run: async (ctx, args) => {
    const story = await load(ctx);
    const scene = requireOpenScene(story);
    const key = widgetKey(scene.widgets, args.name) ?? args.name.trim();
    const before = scene.widgets[key];
    const type = args.type ?? before?.type;
    if (!type) {
      throw new ToolError(
        `${key} is a new widget: give it a type, one of ${widgetTypeNames.join(", ")}.`,
      );
    }
    const same = before?.type === type ? before : undefined;
    const parsed = parseWidget(key, {
      type,
      value: args.value ?? same?.value,
      max: args.max ?? (same?.type === "meter" ? same.max : undefined),
      of: args.of ?? (same?.type === "clock" ? same.of : undefined),
      note: args.note ?? before?.note,
      color: args.color ?? before?.color,
      pane: args.pane ?? before?.pane,
      group: args.group ?? before?.group,
    });
    if (!parsed.ok) throw new ToolError(`${parsed.error}.`);
    const widget = parsed.widget;
    await editScene(
      scene.path,
      {},
      { widgets: (block) => ({ ...block, [key]: serializeWidget(widget) }) },
    );
    await regenerate(ctx);
    return `${shown(key, widget)}${before ? ` (was ${shown(key, before)})` : " (new)"}.`;
  },
});

export const removeWidget = defineTool({
  name: "remove_widget",
  description:
    "Retire a widget from the current scene. Use it when the thing it shows is settled or no longer matters, so it stops carrying into later scenes. A named pane closes by itself when its last widget goes.",
  input: { name: z.string().min(1) },
  run: async (ctx, { name }) => {
    const story = await load(ctx);
    const scene = requireOpenScene(story);
    const key = widgetKey(scene.widgets, name);
    if (!key) {
      const names = Object.keys(scene.widgets);
      throw new ToolError(
        `No widget "${name}". ${names.length ? `Widgets: ${names.join(", ")}.` : "There are no widgets."}`,
      );
    }
    await editScene(
      scene.path,
      {},
      {
        widgets: ({ [key]: _removed, ...rest }) => rest,
      },
    );
    await regenerate(ctx);
    return `Removed widget ${key}.`;
  },
});

export const rollDice = defineTool({
  name: "roll",
  description:
    "Roll dice under the story's declared system, e.g. 2d6+1 or 2d20kh1 (keep highest) or 2d20kl1 (keep lowest). Use it for every roll; never invent a result.",
  input: { expr: z.string().min(1).describe("Dice notation") },
  run: async (_ctx, { expr }) => formatRoll(roll(expr)),
});

export const stateTools = [setSceneState, setWidget, removeWidget, rollDice];

function shown(name: string, widget: Widget): string {
  return `${renderNamedWidgetLine(name, widget)} [${widget.type}]`;
}
