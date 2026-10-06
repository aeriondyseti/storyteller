# Eval scenarios for the Storyteller prompt

Scripted checks for `plugin/prompts/storyteller.md`. Each scenario names a
setup, the exact player input (with the register tag the hook would attach),
and pass/fail checks a reviewer, or a grading model, can apply to the reply
and the tool calls. A scenario passes only if every check passes.

Unless stated otherwise, the setup is `stories/the-hollow-crown/` at scene 1,
with no turns yet logged. "Tool calls" means the world tools, the dialog and
the Skill tool.

Registers may share a reply when each part is marked (decided 2026-10-05):
prose for the fiction, `(( ))` around anything out of character, in separate
paragraphs. A register check fails on an unmarked switch, not on a mix.

## 1. Blank-story opening

- **Setup**: `templates/blank/story.md` copied into a fresh story; no
  characters, lore or scenes.
- **Input**: `[register: copilot] [new story] Begin.`
- **Checks**:
  1. The whole reply is inside `(( ))`.
  2. It invites the player to share what they have (genre, mood, character,
     image or similar) and asks at most two questions.
  3. No narration, no invented setting presented as decided, no scene opened.
  4. No tool call writes anything yet (nothing has been agreed).

## 2. Interview proposes, writes, and reports

- **Setup**: as 1, after Vex's opening.
- **Input**: `[register: copilot] (( something like a drowned city, a
  salvage diver who owes money to the wrong people. bleak but not
  hopeless ))`
- **Checks**:
  1. Reply is entirely inside `(( ))` and asks one or two questions, only
     about what is still missing (for example another character, lines and
     veils), not about what the player already gave.
  2. It offers at least one concrete proposal ("Two directions I can see…")
     rather than an open questionnaire.
  3. Anything written to disk (premise, a card) is reported in one line per
     change; nothing is reported that was not written.
  4. It does not open scene one or narrate.

## 3. Narrator turn must not write for the player

- **Input**: `[register: narrator] I set the letter on Mira's counter, seal
  up, and don't say anything.`
- **Checks**:
  1. The first sentence is not a restatement of the player's action (no "You
     set the letter on the counter…").
  2. No words, decisions, feelings or reactions are given to Corwin (no "you
     wait", "you feel", "you say").
  3. Mira acts on her own wants: she reacts to the seal, the silence, or the
     debt in a way consistent with her card.
  4. The last line is Mira speaking or acting, an arrival, or the world
     moving; it is not a question to the player and not a summary.
  5. 150 to 400 words, prose only: no headers, lists, bold or tables.

## 4. A `((` request mid-scene

- **Setup**: two narrator turns logged in scene 1.
- **Input**: `[register: copilot] (( less dread, more banter. and mira is
  too helpful ))`
- **Checks**:
  1. The out-of-character answer is inside `(( ))`, plain and short, with an
     opinion of its own (it may agree, refine or push back).
  2. It acts: for example turns on the `lighter-touch` directive and edits
     `characters/mira.md` to make her less forthcoming.
  3. Each change is reported in exactly one line.
  4. Mixed is fine if marked: any narration is bare prose in its own
     paragraph, outside the `(( ))`, and no fiction sits inside the `(( ))`.
  5. On the next narrator input, the reply returns to prose with no mention
     of the aside.

## 5. Scene-close proposal and "not yet"

- **Setup**: scene 1 has run eight turns. Corwin and Mira have settled the
  debt and agreed she will get him into the Customs House at the Thaw Fair.
- **Input**: `[register: narrator] I pull my coat on and head for the door.`
- **Checks**:
  1. Vex proposes closing the scene through the dialog, with choices such as
     *yes, close it*, *one more beat*, *not yet*.
  2. No scene is closed and no new scene is opened before a yes.
- **Follow-up**: the player picks *not yet*, then sends
  `[register: narrator] I stop with my hand on the bar. "Who else knows I'm
  back?"`
- **Checks**:
  3. No second close proposal in this reply.
  4. The reply continues the scene in narration.

## 6. Lines and veils edge

- **Setup**: the story's veils include torture. Corwin has been taken to the
  Lamp Hall cells and Sergeant Crane wants the letter.
- **Input**: `[register: narrator] I tell Crane he'll get nothing from me.`
- **Checks**:
  1. Any torture happens off page: the narration cuts away.
  2. At most one sentence of aftermath describes its effects.
  3. Corwin's reaction, endurance or breaking is not decided for him.
  4. Nothing on the lines list happens, on page or off.

## 7. Proposing a new boundary

- **Setup**: lines and veils as in `story.md` (neither mentions animals).
  Corwin's contact is at a rat-pit under the fish docks, where dogs are set
  on rats for bets.
- **Input**: `[register: narrator] I push through the crowd to the edge of
  the pit.`
- **Checks**:
  1. Before describing the pit in graphic detail, Vex proposes adding a line
     or veil through the dialog, not in narration or a prose question.
  2. `story.md` lines and veils are unchanged by Vex's own decision; a write
     happens only after the player chooses to add one.
  3. If the player picks a veil, the cruelty stays off page with at most one
     sentence of aftermath.
  4. Nothing on the existing lines list happens.

## 8. Continuity check requiring lore

- **Setup**: `the-lamplighters` is keyed and has not been injected this
  scene.
- **Input**: `[register: narrator] I ask Mira how much the Stair pays the
  watch these days.`
- **Checks**:
  1. Vex reads or recalls the Lamplighters lore (or it was injected by the
     hook) before answering.
  2. Mira's answer matches the lore: two crowns a week to Sergeant Hesketh
     Crane, in candles and coin.
  3. No contradicting figure or name is invented.
  4. Mira answers in her voice (a price, short sentences), not as an
     exposition dump.

## 9. Invented NPC must be recorded

- **Input**: `[register: narrator] I go to the fish-dock tavern and find
  someone who'll tell me who was asking about the grain barge.`
- **Checks**:
  1. If Vex introduces a named person not in the cast, a card for them is
     written in the same turn (with a stem, e.g. `characters/nell-voss.md`).
  2. If the new person is in the scene, scene state `present` is updated with
     their stem, not their display name.
  3. Any new place or fact likely to recur (the tavern's name, a price) is
     written as lore or a widget.
  4. The narration never mentions the cards, files or tools.

## 10. Mechanics-free outcome

- **Setup**: `story.md` declares no system.
- **Input**: `[register: narrator] I try to pick the lock on the archive's
  lower door before the Lamplighter comes back round.`
- **Checks**:
  1. No dice tool is called and no number, roll or difficulty appears in the
     reply.
  2. The outcome follows from the fiction (Corwin is a clerk, not a thief;
     the Lamplighter's round is short), not from luck or a hidden roll.
  3. Corwin's choices beyond the stated attempt are not made for him: Vex
     does not have him reach for seal forty-one, though the door or the
     world may hint that the lock takes a seal.
  4. Ends on the world acting (the Lamplighter, the door, a sound), not a
     question.

## 11. Sensory versus reaction

- **Input**: `[register: narrator] I step between Mira and the Lamplighter's
  hook.`
- **Checks**:
  1. Vex may narrate what happens to Corwin's body and senses (the hook
     strikes his shoulder, the smell of lamp oil, a ringing in his ear).
  2. No inner reaction or response is narrated for him: no "you wince",
     "you stagger back", "anger floods you", "you grit your teeth".
  3. The Lamplighter and Mira act on their own wants.
  4. The last line is a character or the world acting, not a question.

## 12. Never mention the machinery

- **Setup**: scene 1 as shipped; the input forces time to pass, so the scene
  time and the `Days to the Crown Vote` widget (9) must change.
- **Input**: `[register: narrator] I lie low in Mira's back room for a full
  day and a night.`
- **Checks**:
  1. The widget goes to 8 and the scene time is updated, through the world tools.
  2. A scene-setting line appears as its own paragraph, a short italic phrase
     naming place and time, e.g. `*Tessaly's Chandlery, the next dawn.*`
  3. The narration contains no mention of widgets, tools, files, notes,
     context or the model.
  4. Corwin's day is not given dreams, feelings or decisions beyond lying low.

## 13. Interview skill on a blank story

- **Setup**: as 1.
- **Input**: `[register: copilot] [new story] Begin.`
- **Checks**:
  1. The Skill tool is called with `storyteller:storyteller-interview` before
     the reply.
  2. The reply passes every check of scenario 1.
- **Headless**: `bun scripts/session-surface.ts --story <blank story dir>
  --prompt "[register: copilot] [new story] Begin." --max-turns 4 --debug-file
  <log>`; the log says `SkillTool returning ... for skill
  storyteller:storyteller-interview`.

## 14. Scene-close skill

- **Setup and input**: as 5.
- **Checks**:
  1. The Skill tool is called with `storyteller:scene-close` in the turn that
     proposes the close, or in the turn after the player picks yes.
  2. Every check of scenario 5 passes.
  3. On yes: `close_scene` gets a past-tense summary naming what is left open,
     `open_scene` follows with card stems, and the transition opens with a
     scene-setting line.

## 15. Invent-and-record skill

- **Setup and input**: as 9.
- **Checks**:
  1. The Skill tool is called with `storyteller:invent-and-record` in the turn
     that introduces the new person.
  2. Every check of scenario 9 passes, and the new card has the shape the
     skill gives (appearance, personality, voice; a stem from the name).

## 16. `/storyteller:recap`

- **Setup**: scene 1 as shipped.
- **Input**: `/storyteller:recap` typed in the prompt box.
- **Checks**:
  1. The Storyteller answers, through the `storyteller:recap` skill.
  2. The whole recap is inside `(( ))`, past tense, one to three short
     paragraphs, names rather than stems.
  3. It ends by naming what is unresolved: the undelivered letter, the debt
     to Mira, the open warrant, nine days to the Crown Vote.
  4. Nothing is written to disk and no new fact is invented.
- **Headless**: `MSYS_NO_PATHCONV=1 bun scripts/session-surface.ts --prompt
  "/storyteller:recap" --max-turns 8` prints the recap as the reply.
