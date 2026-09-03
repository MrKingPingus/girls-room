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

```js
{
  meta:    { day: 3, minutesElapsed: 412, seed: 88117 },

  world:   { phase: "she_absent",        // she_present | she_absent | she_asleep | night
             light: "lamp",              // daylight | lamp | dark
             doorState: "locked" },

  player:  { mobility: 2,                // 0 bedbound .. 4 can cross room
             pain: 6, energy: 4,
             knows: ["her_name", "phone_exists"],   // flag set
             carrying: null,
             concealed: ["paperclip"] },

  her:     { affection: 34, suspicion: 12,
             mood: "warm",               // derived, but cached for reaction queries
             attention: 0.3,             // how closely she's watching right now
             activity: "kitchen",
             believes: ["you_are_grateful"] },

  objects: {
    nightstand_drawer: { reach: 2, open: false, known: true, searched: false },
    paperclip:         { reach: 3, location: "drawer", taken: false,
                         movedSinceSeen: false, missingNoticed: false }
  },

  history: [ { t: 388, type: "object_taken", id: "paperclip", seen: false } ]
}
```

Notes:

- **`reach`** is the mobility tier required. Reach checks are one comparison, and raising
  mobility silently unlocks a whole tranche of content. This is your progression curve.
- **`history`** is not a log for debugging. It is the substrate for her *memory* — "you were
  quiet yesterday" requires queryable past. Cap it and summarize old entries into `her.believes`.
- **`knows` / `believes`** are two separate flag sets. The gap between what the player knows and
  what she believes is where the entire game lives.

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

2. EFFECTS      Apply the mechanical result. Move objects, spend time, change flags.

3. DETECTION    Does she notice? Roll/threshold against her.attention, concealment,
                noise of the action, and how long until she next enters.
                Emits: unnoticed | noticed_now | noticed_later.

4. APPRAISAL    Convert what happened into affection/suspicion deltas.
                The ONLY stage allowed to write to her.affection / her.suspicion.

5. REACTION     Query the rule database (§6) for her response. May return nothing.

6. BEATS        Assemble beats from the above. Presentation assembled here and nowhere else.
```

Two rules that keep this clean:

- **Single-writer principle.** Each field of state has exactly one stage permitted to write it.
  Write it down in a table. When something changes unexpectedly, you have one suspect.
- **Deferred consequences.** `noticed_later` doesn't fire now — it pushes onto a pending queue
  checked when she next enters. The delay between the act and the discovery *is* the dread.

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
