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

```js
{
  id: "drawer_caught_01",
  speaker: "her",              // her | narrator | player_thought
  text: "You were in my drawer.",

  portrait: { mood: "cold", pose: "doorway" },
  scene:    { location: "bedroom", time: "night", light: "lamp" },
  audio:    { music: "dread_low", sfx: ["door_close"] },

  tags: ["discovery", "suspicion_spike"],
  choices: [ { id: "deny", label: "\"I wasn't.\"", requires: {} } ]
}
```

**Text renderer** prints `speaker` + `text`, renders `choices`, ignores the rest.
**VN renderer** reads `portrait` to pick a sprite, `scene` for the background, `audio` for the mix.

Fill in `portrait` / `scene` / `audio` on every beat starting with beat #1, even though nothing
consumes them for months. They cost you five seconds each now and are unrecoverable later —
you will not go back and re-mood four hundred beats.

**Payoff:** your art manifest is derivable. Walk the content files, collect every distinct
`portrait.mood` and `scene` combination, and you have an exact sprite and background list —
before you draw anything. That number is also your reality check on scope.

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
| `knows[]` | EFFECTS | Learning a fact is the mechanical result of looking or listening |
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

## 7. Content files

All of it data, none of it code. Content is added without touching `engine/`.

```
content/objects.json     id, reach, states, what actions apply
content/actions.json     verbs, time cost, noise, concealability
content/reactions.json   the rule database (§6)
content/beats.json       beat id -> text + portrait/scene/audio tags
content/schedule.json    her routine per day — when she enters, how long, attention level
```

Keep `beats.json` separate from `reactions.json`. Rules reference beats by id. This means
rewriting a line never risks breaking logic, and a translator or editor can work in one file.

Validate content on load against a schema. A typo'd object id should fail loudly at startup,
not silently produce a rule that never fires — silent non-firing is nearly undebuggable in a
system this size.

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
