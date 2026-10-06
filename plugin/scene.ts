#!/usr/bin/env bun
import { posixPath } from "../src/paths.ts";
import { castOf, findCharacter, loadStory, personaOf, type Story, section } from "../src/story.ts";
import { toPlainWidget } from "../src/widgets.ts";
import { isStoryDir } from "./hooks/lib/io.ts";
import type { StageSnapshot } from "./mod/types";

// The Bun half of the scene pane (spec 10). The mod runs with no Node and no
// YAML parser, so it asks this script for the story as JSON instead of parsing
// story files itself: `bun plugin/scene.ts` in a story folder (or with
// RP_STORY set) prints a StageSnapshot, or `null` outside a story.

export async function snapshot(story: Story): Promise<StageSnapshot> {
  const scene = story.scene;
  const persona = personaOf(story);
  const present = scene
    ? await Promise.all(
        scene.present
          .filter((stem) => stem !== persona)
          .map(async (stem) => {
            const card = findCharacter(story, stem);
            return {
              stem,
              name: card?.name ?? stem,
              tags: card?.tags ?? [],
              portrait: card?.portrait ? await portraitFile(story.dir, card.portrait) : null,
            };
          }),
      )
    : [];
  return {
    storyteller: story.storyteller.name,
    persona: persona ? (findCharacter(story, persona)?.name ?? persona) : null,
    scene: scene
      ? {
          number: scene.number,
          title: scene.title,
          location: scene.location ?? null,
          time: scene.time ?? null,
          mood: scene.mood ?? null,
          now: section(scene.body, "Now") ?? null,
          path: scene.path,
          present,
          // PlainWidget is the shape the mod's StageWidget mirrors.
          widgets: Object.entries(scene.widgets).map(([name, w]) => toPlainWidget(name, w)),
        }
      : null,
    // Who may be speaking in a reply: the characters on stage, or before any
    // scene opens, every card but the player's.
    speakers: scene
      ? present.map(({ stem, name }) => ({ stem, name }))
      : castOf(story).map(({ stem, name }) => ({ stem, name })),
  };
}

// `portrait` names a file under assets/ (spec 16); written with or without
// the folder. Only an existing PNG is offered: the terminal's Image element
// reads PNG files and nothing else.
async function portraitFile(dir: string, portrait: string): Promise<string | null> {
  const file = `${dir}/assets/${portrait.replace(/^assets\//, "")}`;
  if (!file.toLowerCase().endsWith(".png")) return null;
  return (await Bun.file(file).exists()) ? file : null;
}

if (import.meta.main) {
  const dir = posixPath(process.env.RP_STORY ?? process.cwd());
  const out = (await isStoryDir(dir))
    ? await snapshot(await loadStory(dir, { libraryRoot: process.env.RP_LIBRARY }))
    : null;
  process.stdout.write(`${JSON.stringify(out)}\n`);
}
