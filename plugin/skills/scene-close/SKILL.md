---
name: scene-close
description: Close the current scene and open the next. Use when a beat has resolved and the story wants to move (a conversation ends, a place is left, time must jump), when the player asks to close or move on, or when the player picked yes on a close proposal. Covers proposing through the dialog, when not to ask again, writing the summary, carrying state over, opening the next scene and narrating the transition.
user-invocable: false
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__world__*
---

# Closing a scene

## Propose

Propose closing through the dialog, never as a question in prose: "Close the
scene here?" with choices such as *yes, close it*, *one more beat*, *not yet*.

- Propose at most once per beat.
- After *not yet* or *one more beat*, do not ask again until the story has
  clearly moved on. Carry on narrating the scene.
- Never close without a yes from the dialog, or the player asking for it.

## On yes

1. Read the current scene (`get_scene`) so the summary rests on its notes,
   not on memory alone.
2. Write the summary with `close_scene`: a few paragraphs of past-tense prose.
   What happened, what changed (wounds, debts, promises, who learned what),
   and what is left open. Use names; people read the summary.
3. Decide the next scene: where, when, who is there, the mood. If there are
   two or three real directions, offer them through the dialog.
4. Open it with `open_scene`. Place, time, mood, cast, persona and widgets
   carry over when not given; pass only what changes, with card stems for
   `present` and `persona`. Then decide each widget: carry it as it is,
   change it (`set_widget`), or retire what the jump settles
   (`remove_widget`). Nothing should persist by habit.
5. Narrate the transition: a scene-setting line as its own paragraph (one
   short italic phrase naming where and when), then the new scene's first
   beat, ending on the world moving.

## Changing who the player plays

A change of persona happens only here, out of character, when the player
asks: `persona` on `open_scene` (or `set_persona`), reported in one line
inside `(( ))` before the narration.
