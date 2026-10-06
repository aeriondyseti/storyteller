---
name: invent-and-record
description: Record something you invented so it stays canon. Use in the same turn you introduce a named person, a place, a faction or custom, a rule of the world, or a running quantity (a debt, a countdown, supplies) that the record does not already hold. Covers checking the record first, which world tool to use, card and lore shapes, stems, and widgets.
user-invocable: false
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__world__*
---

# Inventing and recording

## Check first

Invent only when the record is silent. Before naming someone or stating a
fact, look: `list_characters`, `get_character`, `search_lore`, `recall`, or
read the file. If something close exists, use or extend it instead of making
a second one.

## What goes where

| You invented | Tool | Notes |
|---|---|---|
| A named person who could come up again | `upsert_character` | Even a minor one: a name in the fiction is a promise |
| A place, faction, custom, history, rule of the world | `upsert_lore` | Keys are the words that should bring it to mind |
| Something that changes over time (a countdown, a wound, a clock, what was found) | `set_widget` | Pick a type from the table below. A few words for the name ("Days to the Crown Vote"); the note is one or two short sentences (three at most); the value carries the number. Widgets are glanced at in a side pane |
| Someone now in the scene | `set_scene_state` | `present` takes card stems |

Write in the same turn as the narration that introduces it, and never mention
the writing in the narration.

## Widgets

| type | fields | when |
|---|---|---|
| `text` | value: a few words | A state in words that changes: the weather, a disguise, where the ship is |
| `counter` | value: a number | A number with no ceiling: days to a vote, crowns owed, flasks of oil |
| `meter` | value, max: numbers | A number out of a known maximum, drawn as a bar: health, fuel, a hull |
| `clock` | value, of: whole numbers | Something that happens when it fills, drawn as segments (4, 6 or 8): suspicion, a ritual, pursuit closing in |
| `list` | value: short items | Things gathered or learned, one per line: powers found, clues, allies |
| `tags` | value: one or two words each | Conditions that come and go, on one line: wounded, hunted, broke |

On an update, give only what changed; the rest is kept. `color` (a hex) is
optional and paints the row, never the note. `pane` puts a widget on its own
tab; `group` draws a heading over widgets that belong together. File order is
draw order. Retire a widget with `remove_widget` when it is settled.

## Stems

A stem is the file name: lowercase, words joined by dashes, no extension
(`nell-voss`, `the-lamplighters`). In scene state and scene notes, refer to
people by stem, never by display name. Pick the stem from the name the
fiction uses most.

## A card

`name` is the display name; `tags` are a few short words (trade, place,
allegiance). The body is free sections, short for a minor figure, fuller for
anyone who will matter:

```
## Appearance
Two or three concrete details someone would notice first.

## Personality
What they want, what they fear, how they treat strangers.

## Voice
How they talk: rhythm, words they use, what they avoid.

## Backstory
Only what bears on the story.

## Toward <the player's character>
What they know of, and feel toward, the player's character.
```

## A lore entry

`title`, `keys` (names and words that should activate it), `priority` (higher
wins when space is short; 5 is ordinary). Leave `always` off unless the fact
must be in view every turn. The body is plain prose written as truth about
the world, with the exact numbers and names used in the fiction, so a later
scene cannot contradict them.

## Never

- Never change the player's own card or the story file this way; those change
  only when the player asks in copilot register.
- Never record a lie as fact: if a character lied, the truth goes in lore and
  the lie in the scene notes.
