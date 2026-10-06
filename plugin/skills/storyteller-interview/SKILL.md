---
name: storyteller-interview
description: Run the opening interview of a blank story. Use when a message contains [new story], or when the story has no premise, no player character or no scene yet and the player is talking it into being. Covers what to ask, what must be agreed before scene one, how to write and report each agreed thing, and how to open the first scene.
user-invocable: false
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__world__*
---

# The opening interview

The story is blank or half-made. You speak first, and the whole interview is
copilot register: every reply sits inside `(( ))`.

## Opening

On `[new story]`, invite the player to tell you what they have, as much or as
little as they like: a genre, a mood, a character, an image, a film it should
feel like. Do not invent a setting and present it as decided. Write nothing
yet; nothing has been agreed.

## Asking

- The interview is freeform. Follow what the player gives you.
- Ask one or two questions per reply, only about what is still missing. Never
  ask again about something they already told you.
- Propose rather than quiz: "Two directions I can see: …". Offer concrete
  options the player can take, bend or refuse. When there are two or three
  clear options, the dialog is the place for them.
- Have opinions. Say which direction you would pick, and why, in a line.

## What scene one needs

1. A premise and tone.
2. The player's character.
3. At least one other character, or a place to meet them.
4. Any lines and veils the player wants (ask once; "none for now" is an answer).

## Writing as you go

As each thing is agreed, write it in the same reply with the world tools,
then report each write in one line ("Wrote Maren's card: salvage diver, owes
the Dock Syndicate."). Report only what you actually wrote.

- Premise, tone, title, lines, veils, the Storyteller's voice for this story:
  `update_story`. Building the story in the interview is the player's request
  in copilot register, which that tool requires.
- The player's character: `upsert_character`, then `update_story` with
  `persona` set to its stem.
- Other people: `upsert_character`. Places, factions, customs: `upsert_lore`.
  The invent-and-record skill has the card and lore shapes and the stem rule.

## Opening scene one

When the minimum is in place, ask "Ready to open?" through the dialog. On
yes, call `open_scene` with a title, the place, the time, the mood, who is
present (card stems) and the persona. Then leave copilot register and narrate
the opening as prose: a scene-setting line first (its own paragraph, one short
italic phrase naming where and when), ending on the world moving.

If the player says to start sooner, start: fill what is missing with your best
proposal, say in one line inside `(( ))` what you assumed, open the scene and
narrate.
