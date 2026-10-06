# Prior art: features worth borrowing

Research, 2026-10-06. Three tracks: roleplay frontends (SillyTavern and its
extensions, NovelAI, AI Dungeon, RisuAI, Character.AI, Backyard), AI game
masters and tabletop tools (Friends & Fables' Franz, Hidden Door, Intra,
Generative Agents, Re3/DOC, Mythic GME, Ironsworn, Blades in the Dark, Lazy
DM, Kanka), and terminal and text-game UX (Infocom, Glk, Mudlet, Caves of Qud,
DCSS, btop, Ink, Ren'Py) plus unused Claude Code mod capabilities.

## Already covered

Lorebook with key and semantic activation; Author's Note and Guided
Generations (our directives and `((`); Memory and Plot Essentials (bible,
scene summaries, notes job); state trackers (widgets); per-speaker dialogue
tint; persona and info bar (status line); Quick Replies (slash commands and
skills); context compression (notes plus compaction rebuild).

## Table stakes we lack

1. **Regenerate, swipe, edit and branch.** Universal in RP frontends. Claude
   Code offers `/rewind` and edit-last-prompt; true swipes need message
   control the engine does not give us (the escape criterion in the brief).
   A `/storyteller:redo` that rewinds and resends the last prompt is the
   reachable part.
2. **"What fired this turn."** ST's WorldInfo Info, NovelAI's context viewer.
   A pane tab listing the lore and directives the hook injected, from
   `.rp/state.json`. Cheap.
3. **Pin exact text.** Character.AI pinned memories. Select a passage
   (`$.ui.selection`), pin it verbatim into the scene's Continuity so the notes
   job never paraphrases it.
4. **Full World Info controls.** Sticky, cooldown, delay, recursion, inclusion
   groups, probability. Already in Later.
5. **Card import.** SillyTavern V2 PNG and JSON cards, the ecosystem's shared
   format. Previously dropped from v1.

## UX for long play

6. **Choice band above the prompt.** Ink and visual novels. Vex may offer two
   to four numbered options; the `AbovePrompt` band draws them as hotkey
   buttons that fill or send the prompt, plus a one-key Continue.
7. **Suggested next action.** `$.prompt.suggest`, filled by a Haiku call after
   each turn, taken with Tab. Eases blank-prompt fatigue.
8. **Change feedback.** Caves of Qud, DCSS. A toast when a widget, scene or
   cast changes, and a ▲/▼ marker on changed widget values for one turn.
9. **Glossary on names.** Disco Elysium, Cogmind. Character, place and lore
   names as links in a pane (`Markdown` with `onLinkPress`) or hover cards.
10. **Bookmarks and quoting.** Ren'Py backlog. Bookmark a selected passage;
    quote it into the prompt (`$.prompt.fill`).
11. **In-world calendar.** Kanka. Dates, deadlines and travel time that tick
    clocks.

## Differentiators for an agentic Storyteller

12. **Hidden prep layer.** Lazy DM's secrets and clues, NPC goals and plans
    (Generative Agents), faction clocks (Blades). Kept on disk, never shown
    until revealed. A chat frontend cannot hide state and stay consistent.
13. **Downtime on resume.** On a new session Vex ticks faction clocks,
    advances NPC plans, rolls a random event, then opens with a Strong Start.
    The world moved while you were away.
14. **Plot and plan notepad.** Franz 2.0, Re3/DOC outlines, Façade's tension
    curve. An arc, scene and beat outline plus a short plan Vex rewrites each
    turn, visible and editable by the player.
15. **Honest randomness.** Mythic's likelihood-weighted yes/no oracle, chaos
    factor and random events drawn from the notes' threads; Ironsworn oracle
    tables (Datasworn, CC-licensed JSON). Counters the narrator's pull toward
    the predictable.
16. **Continuity check before sending.** A subagent compares a draft against
    cards, widgets and notes for contradictions.
17. **Relationship graph.** Kanka-style typed links ("rival of"), drawn as
    text, feeding NPC agency.

## Not feasible here

Sound on Windows (`$.audio.play` is silent on Windows terminals; speech is
documented for macOS only); sprites and Live2D; inline images outside kitty
and Ghostty; phrase bias (no logit bias in the Claude API); chat bubbles.
