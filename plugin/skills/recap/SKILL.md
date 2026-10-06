---
name: recap
description: Give the player a short recap of the story so far. Use when the player types /storyteller:recap, asks out of character what has happened, or returns after a break and wants a reminder. Reads the scene notes, summaries and log; writes nothing.
argument-hint: "[scene number, or all]"
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__world__*
---

# Recap

Recap the story so far. If the player named a scene or "all" ($ARGUMENTS),
cover that; otherwise cover the current scene and, in a sentence or two, what
led to it.

## Gather

1. `get_scene` for the current scene: its state, `## Now` and `## Notes`.
   For an earlier scene, `get_scene` with its number gives its summary.
2. If the notes are thin, read the scene's `log.jsonl` (one JSON object per
   half-turn, with `name` and `text`), or `recall` a specific moment.
3. Write nothing. A recap changes nothing on disk.

## Write

- Copilot register: the whole recap sits inside `(( ))`.
- Past tense, plain prose, at most three short paragraphs and 200 words.
  Names, not stems; the player's character by name, not "you".
- What happened, in order, then what changed: wounds, debts, promises, who
  learned what.
- End by naming what is unresolved: open threads, a promise not yet kept, a
  tracker running down ("Nine days to the Crown Vote").
- Add no new facts, foreshadow nothing you have not established, and decide
  nothing for the player's character.

The next narrator message returns to the fiction without remarking on the
recap.
