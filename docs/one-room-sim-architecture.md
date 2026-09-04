# One-Room Sim — Architecture Spec

Working title: TBD. A systemic horror/dating sim set in a single room, played from a bed.
Ships first as plain text boxes. Must be convertible to a visual novel without rewriting game logic.

---

## 1. The prime directive

**The engine emits data. The renderer decides what that data looks like.**

Every violation of this rule costs you the VN conversion later. If a line of prose ever
contains presentation info ("you see her frown"), that information is trapped in text and
a sprite layer can never use it. Tag it instead: `mood: "annoyed"`.

Corollary: write nothing to the DOM from inside game logic. Ever.

---

## 2. Four layers

```
content/     data files — objects, rules, dialogue. No logic.
engine/      pure functions. state + action -> new state + beats. No DOM, no I/O.
render/      consumes beats. Swappable. text-renderer today, vn-renderer later.
app/         wiring, save/load, input. Thin.
```

`engine/` must be importable and runnable in Node with zero browser APIs. This is what
makes automated playtesting possible (§8) and what makes the VN swap a one-directory change.

---

## 3. State

One serializable object. No class instances, no functions, no Maps. If `JSON.parse(JSON.stringify(state))`
loses something, you've made a mistake. This buys you free saves, undo, replay, and testing.

**The authoritative definition is `engine/state.ts`.** That file carries every field, its allowed
values, the doc section it serves, and its owning stage. What follows is the shape at a glance —
if it disagrees with `engine/state.ts`, the file is right and this sketch is stale.

```
meta      schemaVersion, day, minutesElapsed, seed, playerClass
world     phase, light, temperature, weather, doorBelow
player    mobility, pain, energy, needs{}, medication{}, knows[], confidence{} (v2, unused)
her       affection, trust, suspicion, mood, disposition, stress, attention,
          location, activity, statedReturnAt, believes[], claims[], priors[], roomBaseline{}
objects   id -> { location, open, known, searched, damaged }
pending   deferred discoveries — the dread queue
history   capped event log; the substrate for her memory
```

Notes:

- **Reach lives in content, not state.** Reach is a property of the *place*, not the object: a
  book on the nightstand is tier 0 and the same book on the dresser is tier 2. Objects carry a
  `location`; places carry a reach tier. Raising mobility silently unlocks a tranche of content,
  and that is the progression curve.
- **One `location` field per object** covers placed, inside-a-container, carried, hidden, and
  gone. There is no separate carried-list or concealed-list that could disagree with it.
- **`history`** is not a log for debugging. It is the substrate for her *memory* — "you were
  quiet yesterday" requires queryable past. Cap it and summarize old entries into `her.believes`.
- **`knows` / `believes`** are two separate flag sets. The gap between what the player knows and
  what she believes is where the entire game lives.
- **`her.roomBaseline`** is her mental picture of the room, which is what detection compares
  against — not the truth. That is what makes re-baselining (design doc §7a) possible at all.
- **Randomness needs no state.** Every roll derives from `meta.seed` plus the current minute plus
  which stage is asking, so replays are exact and there is no shared cursor for two stages to
  fight over.

---

## 4. The beat — your VN insurance policy

The engine returns an array of beats. This is the *only* thing the renderer sees.

**The authoritative definition is `engine/beat.ts`.** Sketch:

```js
{
  id: "drawer_caught_01",
  speaker: "her",                    // her | narrator | player_thought
  text: "You were in my drawer.",

  portrait: { onScreen: true, mood: "angry", pose: "stairwell" },
  scene:    { location: "attic", light: "lamp", timeOfDay: "night", weather: "rain" },
  audio:    { music:    { kind: "play", cue: "dread_low" },
              ambience: { kind: "stop" },
              sfx:      ["stair_creak"] },

  advancesClock: true,
  register: null,                    // v2 — confidence variants. Nothing reads it

  prompt: {
    choices: [ { id: "deny", label: "\"I wasn't.\"", requires: {} } ],
    timer: { kind: "mood_scaled" }
  }
}
```

**Text renderer** prints `speaker` + `text`, renders the prompt, ignores the rest.
**VN renderer** reads `portrait` for the sprite, `scene` for the background, `audio` for the mix.

Fill in `portrait` / `scene` / `audio` on every beat starting with beat #1, even though nothing
consumes them for months. They cost you five seconds each now and are unrecoverable later —
you will not go back and re-mood four hundred beats.

### The fields that aren't obvious

- **`portrait` is a union, not a nullable field.** `{ onScreen: false }` has to be written on
  purpose. Leaving her off the screen is a decision, not a default.
- **`portrait.mood` is one of her six real moods**, never free text. Open text here would make
  the sprite list unbounded and the manifest below a guess; it also stops a beat rendering her
  cold while the simulation thinks she's warm.
- **`scene.location` stays even though there is one room.** A second location is planned. It is
  typed as a list with one entry, so adding the second is a one-word change that immediately
  makes the compiler check every beat in the game — and prices the new location in backgrounds
  before anything is commissioned.
- **`scene.timeOfDay` is visual time, not narrative time.** `world.phase` says where we are in
  the day's structure; this says what the light through the dormer looks like.
- **`audio.ambience` is not decoration.** Design doc §2b: your floor is her ceiling, and sound
  is the player's only instrument for tracking her during an absence. Water, the television,
  the back door, her weight on the stairs. It carries information, so it is a first-class field.
- **`audio` directions are spelled out** — `unchanged`, `play`, `stop` — because "leave the
  music alone" and "cut the music" are different instructions and horror needs to say the
  second one deliberately.
- **`advancesClock`** implements design doc §12: time passes always, except during dialogue
  that doesn't need a response. Only the last line before a prompt moves the clock, so a slow
  reader is never punished for reading.
- **`prompt.timer`** is `none`, `mood_scaled` (the default — length comes from her mood), or
  `dramatic`. The accessibility contract is that a global multiplier applies to everything and
  the disable switch removes every timer except `dramatic` ones. More than two or three
  `dramatic` beats in the whole game is a design smell.
- **`register`** is reserved for the confidence system (design doc §6). Nothing reads it. It
  exists now so we are not re-tagging hundreds of beats in v2, which is this file's entire job.

### Cut from the draft

- **`tags: []`.** Nothing specified what tags were for or who read them. An untyped free-text
  list is where typos go to hide. Add it back when something actually needs it.

**Payoff:** your art manifest is derivable. Walk the content files, collect every distinct
combination, and you have an exact list before you draw anything:

```
backgrounds = locations x light states     1 x 3 = 3 today, 6 with the second location
              (timeOfDay and weather are overlays and tints, not new paintings)
sprites     = moods x poses                6 x 5 = 30 ceiling, fewer in practice
```

That number is also your reality check on scope. If either comes back frightening, cut a pose
or a light state now, while it costs a find-and-replace instead of a commission.

---

## 5. The resolution pipeline

One ordered pass per player action. Each stage is `(state, ctx) => diff`. Stages do not call
each other and do not know each other exists. Adding a system = adding a stage.

```
1. VALIDITY     Can this action happen? (reach, mobility, phase, object state)
                Failure returns a beat explaining why — failure is content, not an error.

2. EFFECTS      Apply the mechanical result *in the room*. Move objects, spend the clock,
                set player knowledge, log the action and any claim made.

3. WORLD        Time and the world move on, with or without you. Roll the day over, advance
                her through her schedule, roll her mood, run her own stress, heal or hurt the
                body, heat or cool the attic, recompute the light.
                Owns everything that is not the room and not a meter.

4. NOISE        How loud was that, and what cover was there? Resolves the action's noise
                against her own noise (water, TV, her footsteps) and the floor between you.

5. DETECTION    Does she notice? Rolls against her.attention, concealment, the noise result,
                and the change tier (§7a of the design doc). Also promotes anything on the
                pending queue whose moment has now arrived, and re-baselines what she saw.
                Emits: unnoticed | noticed_now | noticed_later.

6. APPRAISAL    Convert what happened into affection / trust / suspicion / disposition deltas.
                Runs the rule query (§6) and applies the winning rule's `effects`, then hands
                the winning rule id forward. The ONLY stage allowed to move a meter.

7. REACTION     Resolve the winning rule id into her response. May return nothing.

8. BEATS        Assemble beats from the above. Presentation assembled here and nowhere else.
```

**Why WORLD is its own stage.** Her mood, her whereabouts, and the weather must be able to
change for reasons that have nothing to do with the player (design doc §3 — if every mood
traces to a player action she reads as a mechanism). Folding this into EFFECTS would make
"the world reacting to you" the path of least resistance every time we author. Separating it
makes "her life happens without you" structural rather than a thing we have to remember.

Three rules that keep this clean:

- **Single-writer principle.** Each field of state has exactly one stage permitted to write it.
  The table is §5a. When something changes unexpectedly, you have one suspect.
- **Deferred consequences.** `noticed_later` doesn't fire now — it pushes onto `state.pending`,
  checked by DETECTION once she is back in the room. The delay between the act and the
  discovery *is* the dread.
- **Rules propose, owners dispose.** A reaction rule's `effects` block is applied by APPRAISAL,
  which owns the meters — never by REACTION. REACTION only turns the selected rule into beats.

---

## 5a. The single-writer table

Every field, and the one stage allowed to change it. When a value moves and you don't know why,
this table gives you one suspect instead of eight. Nothing gets added to state without getting
a row here in the same change.

Read it as: *"only the step named here may touch this."*

### Outside the pipeline

Three writers are not stages and must be named, or they become the invisible second writer:

| Writer | May write | Constraint |
|---|---|---|
| **INIT** | The entire state, once | Builds a new game from content + class + seed. Never runs again |
| **LOAD** | The entire state, once | Replaces state wholesale from a save file. Validates `schemaVersion` first |
| **CONTENT** | Nothing | Content is read-only at runtime. Loaded once, validated, never written back |

### `meta`

| Field | Owner | Why |
|---|---|---|
| `schemaVersion` | INIT | Set at creation, compared on load |
| `day` | WORLD | Rolls over when the clock crosses the boundary |
| `minutesElapsed` | EFFECTS | The action's time cost is the only thing that spends the clock |
| `seed` | INIT | Fixed for the run so playthroughs replay exactly |
| `playerClass` | INIT | Chosen once |

### `world`

All of it WORLD's — the attic changes because time passed or because she did something downstairs,
never because of the player's action directly.

| Field | Owner | Why |
|---|---|---|
| `phase` | WORLD | Driven by the clock and her schedule |
| `light` | WORLD | Cached. Recomputed from the hour + `objects.lamp.open` + the ceiling switch |
| `temperature` | WORLD | She controls the heat from downstairs |
| `weather` | WORLD | Outside the house entirely. Post-POC |
| `doorBelow` | WORLD | She opens and closes it. Changes what carries up the stairs |

### `player`

The split: **WORLD owns the body, EFFECTS owns what the player knows.** Pain, energy, needs, and
medication all move both from the clock and from what the player just did, so putting them in one
stage — the one that runs immediately after EFFECTS and can see the action — is what keeps them to
a single writer.

| Field | Owner | Why |
|---|---|---|
| `mobility` | WORLD | Recovery over time and care. The progression spine |
| `pain` | WORLD | Rises with exertion, falls with rest and medication |
| `energy` | WORLD | Same |
| `needs.*` | WORLD | Rise with the clock, fall when she performs the care scene |
| `medication.*` | WORLD | Dose decays in the body; palming is recorded here, the pill itself in `objects` |
| `knows[]` | EFFECTS | Learning a fact is the mechanical result of having done something |
| `confidence.*` | *(none — v2)* | Reserved. No stage writes it, nothing reads it. Do not implement |

### `her`

The split: **APPRAISAL owns the meters, WORLD owns the mood and the body, DETECTION owns what
she has seen.**

| Field | Owner | Why |
|---|---|---|
| `affection` | APPRAISAL | The only stage permitted to move a meter |
| `trust` | APPRAISAL | Same |
| `suspicion` | APPRAISAL | Same. Rule `effects` blocks are applied here, never in REACTION |
| `disposition` | APPRAISAL | Long-term, and design doc §3 says player actions are what move it |
| `mood` | WORLD | Rolled against disposition, stress, and her own day — must be able to move without the player |
| `stress` | WORLD | Outside pressure. Nothing the player does touches it |
| `attention` | WORLD | Cached. Recomputed from mood + schedule + affection (design doc §5's tax) |
| `location` | WORLD | Her schedule, not the player's action |
| `activity` | WORLD | Same. Her noise is the player's cover window |
| `statedReturnAt` | WORLD | Set when she leaves, distorted from the truth in proportion to mood |
| `believes[]` | APPRAISAL | What she concludes from what happened |
| `claims[]` *(append)* | EFFECTS | Saying something is an action; logging it is its mechanical result |
| `claims[].believed` | APPRAISAL | Whether she bought it is a judgement, not a record |
| `priors[].status` | APPRAISAL | Confirmed or denied by play |
| `roomBaseline{}` | DETECTION | Updated only when she actually looks. Re-baselining lives here |

### `objects`, `pending`, `history`

| Field | Owner | Why |
|---|---|---|
| `objects.*.location` | EFFECTS | The room changing is what EFFECTS is for |
| `objects.*.open` | EFFECTS | Same |
| `objects.*.known` | EFFECTS | The player discovering a thing exists |
| `objects.*.searched` | EFFECTS | Same |
| `objects.*.damaged` | EFFECTS | Same |
| `pending[]` | DETECTION | Appends `noticed_later`, and fires entries once she is back in the room |
| `history[]` *(append)* | EFFECTS | The record of what was done |
| `history[].seen` | DETECTION | Whether she saw it is decided later, and sometimes much later |

### Not state at all

Three things that look like state and must not become it:

- **The winning reaction rule id.** APPRAISAL selects it, REACTION resolves it into beats. It
  lives on the turn's working record and is thrown away at the end of the turn.
- **The beats themselves.** Output, not state. They go to the renderer and are gone.
- **Reach tiers, noise values, time costs, schedules.** Content. Loaded once, never written.

---

## 6. Reaction rule database

The scaling answer. Do not write `if (suspicion > 40 && mood === "cold" && ...)`.

Build a **query** — a flat bag of facts about this instant — and select the rule with the most
criteria where every criterion passes. Ties break by weight, then randomly among equals.
(Elan Ruskin's GDC talk "AI-driven Dynamic Dialog," used in Left 4 Dead and Firewatch.)

```js
// query, assembled automatically from state + the action
{ action: "open", object: "nightstand_drawer", detected: true,
  suspicion_tier: 2, mood: "warm", day: 3, phase: "she_present",
  times_caught: 1, knows_her_name: true }

// rules, in content/reactions.json — pure data
[
  { id: "generic_caught",
    when: { detected: true },
    beats: ["r_caught_generic"] },

  { id: "caught_drawer_warm",
    when: { detected: true, object: "nightstand_drawer", mood: "warm" },
    beats: ["r_drawer_disappointed"] },

  { id: "caught_drawer_repeat",
    when: { detected: true, object: "nightstand_drawer", times_caught: { gte: 2 } },
    beats: ["r_drawer_cold", "r_drawer_threat"],
    effects: { suspicion: +15 } }
]
```

Three criteria beats two, so the specific rule wins automatically. You always keep one
1-criterion fallback per action so the game can never produce nothing.

**Why this is the right call for your scope:** authoring cost stays linear. Adding a system
(say, weather, or her sister calling) means adding a key to the query bag — every existing
rule keeps working, and you write specific rules only where you want a special moment.
Hand-author the twenty beats players will screenshot; let the table cover the other eight hundred.

---

## 6a. The fact catalogue

The bag of facts in §6 is assembled by `engine/query.ts`, and **every name that may appear in
it is declared once in `engine/facts.ts`** — its type, its legal values, and a line of plain
English describing it.

This is not bookkeeping. Without it, a rule naming a fact that does not exist is invisible:

```json
{ "id": "caught_late", "when": { "suspicon": 50 }, "beats": ["r_caught"] }
```

That loads clean. It counts as one criterion when §6 decides which rule wins. And it never
matches, for the life of the project — a rule that stopped firing looks exactly like a rule
that was never reached. It is the failure hard rule 9 exists to prevent, and it cannot be
caught without a list to check against.

The catalogue and the code are held together by the compiler, the same way `vocab.ts` holds the
game's closed lists together:

- `QueryBag` is keyed by the catalogue, so `query.ts` cannot produce a fact the catalogue omits
- facts the catalogue marks as always-present are **required** in that bag, so it cannot list
  one the game never sets
- `Criteria` is keyed by it too, so conditions written in TypeScript are checked where written

The validator then refuses, at load: an unknown fact (naming the nearest real one), a value
outside a fact's legal set, a comparison a meter could never satisfy, a comparison against
something that is not a number, an object id that is not in the room, a bare list where `in`
was meant, and an invented operator.

**Adding a system means adding a row here.** One row, and every rule ever written can start
asking about it, with no change to any of them. That is §6's promise, made checkable.

### Facts that hold several names at once

Most facts hold one value and rules compare against it. One — `knows`, what the player has
worked out — holds a list, and is asked about a name at a time:

```json
{ "id": "ask_nail_first", "action": "ask_about_nail",
  "when": { "knows": { "lacks": "nail_recently_emptied" } }, "beats": ["..."] }
```

`has` and `lacks`, and nothing else: comparing a list with `gte`, or writing it as a plain
value, is refused at load with the shape that would have worked. Each stays one condition, so
the specificity count in §6 keeps meaning what it says.

**The legal names are exactly what some action `teaches`.** There is deliberately no separate
register of them. A second list would be a second thing to keep in step, and the failure when
they drifted would be the silent kind this section exists to prevent — so requiring or asking
about knowledge nothing can grant is impossible by construction rather than by checking.

### The knowledge ladder

Design doc §19. Two fields on an action in `content/actions.json`, and no new state field, no
new stage, no ninth verb:

- **`teaches`** — what doing this makes the player know. Applied by EFFECTS, which owns
  `player.knows`. Never on a universal verb: `look` teaching something would teach it off every
  object in the room, so the validator refuses it. Working a thing out is a contextual verb.
- **`requiresKnown`** — what the player must already know before this is offered. Checked in
  VALIDITY. The menu leaves an unearned topic out entirely rather than greying it out, because
  a visible locked question is a table of contents for the game; VALIDITY still answers for it
  in character, because hard rule 8 has no exceptions and a save or a replay can name it.

**`knows` is read as of the start of the turn.** The only place the fact bag deliberately looks
backwards, and it has to: EFFECTS grants knowledge before APPRAISAL asks which rule wins, so on
the current picture the turn a verb teaches something already reads as *they know this* — and
the scene of working it out becomes impossible to author, silently. Reading it from before the
turn makes both rungs writable (`lacks` for the moment they learn it, `has` for afterwards) and
makes it agree exactly with the gate in VALIDITY, which is also asking before anything was
taught.

---

## 7. Content files

All of it data, none of it code. Content is added without touching `engine/`.

```
content/places.json      id, reach tier, concealment, noise modifier
content/objects.json     id, where it starts, container/portable, change tier, contextual verbs
content/actions.json     verbs, time cost, noise, concealability, target shape, knowledge
content/reactions.json   the rule database (§6)
content/beats.json       beat id -> text + pose + clock + prompt
content/schedule.json    her routine per day — where she is, what she's doing, attention level
```

Keep `beats.json` separate from `reactions.json`. Rules reference beats by id. This means
rewriting a line never risks breaking logic, and a translator or editor can work in one file.

**`places.json` is separate from `objects.json` because reach belongs to the place.** The same
book is tier 0 on the nightstand and tier 2 on the dresser. Objects carry a location; places
carry a reach tier; raising mobility unlocks a whole tier at once.

**Beats are authored smaller than they are rendered.** An author writes text, speaker, pose,
whether the clock moves, and the prompt. Her mood, the light, the weather and the time of day
are stamped on automatically by the last pipeline stage, because the simulation already knows
them. This makes hard rule 5 structural: it is not possible to author a beat with missing or
contradictory presentation tags. `pose` is the exception — nothing in state knows where in the
room she is standing, so that is always authored.

Validate content on load against a schema. A typo'd object id should fail loudly at startup,
not silently produce a rule that never fires — silent non-firing is nearly undebuggable in a
system this size. `engine/validate.ts` does this, reports every problem at once rather than
stopping at the first, and additionally proves:

- all eight universal verbs exist, and nothing else claims to be universal
- every action has exactly one catch-all rule, so the game can never produce nothing (§6)
- every condition names a real fact, and gives it a value that fact can actually hold (§6a)
- her schedule has no gaps or overlaps
- no beat is unreachable by any rule (a warning — it is usually a typo'd criterion)

### 7a. Scenario packs

Content does not only arrive in those six files. A **pack** is a scenario somebody wrote — rows
for `objects`, `actions`, `reactions` and `beats` in one file — laid over the base content at
load time by `engine/pack.ts`.

Two rules, both so that switching a pack off is always safe:

- **A pack only adds.** There is no way to delete a row the base game ships.
- **A colliding id is an override, and it is announced.** Retuning a moment that already exists
  is the commonest thing an author wants, so it is allowed and said out loud rather than
  happening quietly.

A pack goes through the ordinary validator, merged, with nothing loosened. It is data and only
ever data, which is what makes running a pack written by a playtester no different from running
the game's own content. `docs/scenario-builder.md` covers the tool that writes them.

A save records which packs it was played with, stored beside the run rather than inside it — a
pack is content, and a state field no stage writes would be a lie in the table in §5a.

---

## 8. Headless test harness

Build this in week one, not month six. `engine/` is pure and Node-runnable, so:

```
npm run sim -- --runs 5000 --policy random
```

Report:
- Which beats never fired (dead content — either unreachable or a typo'd criterion)
- Which endings were reached, and at what frequency
- Distribution of affection/suspicion at each day boundary
- Runs that ended in a stuck state with no valid actions

In a systemic game you cannot find content gaps by playing. You find them statistically.
This harness is also what lets an agent iterate on the game unsupervised — it can run, read
the report, and fix, without a human being the eyes.

---

## 9. Build order

| Phase | Deliverable | Art required |
|---|---|---|
| 1 | State + pipeline + text renderer. 5 objects, 3 actions, suspicion only. Playable in 10 min. | none |
| 2 | Rule database, her schedule, deferred discovery. Affection added. | none |
| 3 | Test harness. Content expansion to full room. Endings. | none |
| 4 | Mobility progression, her memory / `believes`. Balance pass. | none |
| 5 | VN renderer against the existing beat stream. Backgrounds + sprites. | all of it |

Phases 1–4 are a complete, shippable text game. If the systems aren't compelling in phase 3,
no amount of art in phase 5 will save it — and you'll have found that out for free.

---

## 10. Things that will wreck this if you let them

- **Prose containing state.** "She looks annoyed" instead of `mood: "annoyed"`. Non-recoverable.
- **A system reading another system's half-finished work.** Enforce pipeline order.
- **Two writers to one state field.** See single-writer principle.
- **Content in code.** The moment reactions live in `if` statements, adding content requires
  a programmer, and the combinatorics kill the project.
- **Authoring per-combination instead of per-criterion.** If you find yourself writing
  the same line for six suspicion tiers, you want one rule with fewer criteria.
- **Building the VN layer early.** It is the most fun part and the least informative. Resist.

---

## 11. For the agent

When implementing: `engine/` is pure and has no browser dependencies. Never import from
`render/` into `engine/`. Never write DOM from `engine/`. Every new beat requires
`portrait`, `scene`, and `audio` fields even when the text renderer discards them. Every new
state field must be declared in the single-writer table before it is written anywhere.
