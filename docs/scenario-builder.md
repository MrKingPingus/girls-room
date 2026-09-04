# Scenario Builder — PLAN, not built

A dev tool: a second tab in the game that lets the designer write new moments for the game
by filling in forms, test them in the running room, tune them, and export them as a file.

Status: **planned, awaiting build.** Stages 1 and 2 approved. Stage 3 explicitly deferred.

---

## 1. What this is actually for

Adding a moment to this game already requires **zero** engine code — hard rule 4 guarantees it.
A new scene for her is rows in `content/reactions.json` and `content/beats.json`, and nothing
else. That was the whole point of building it as data.

So the builder does not save code. What it removes is the **round trip**:

> idea → described in chat → translated into JSON rows with exactly-correct ids → waited for →
> looked at in the game → described again

becomes

> idea → typed into a form → seen in the room

That is the entire justification. Everything below is in service of it, and anything that does
not shorten that loop is out of scope.

Second-order benefit: a pack is data, never code, so a stranger who playtests the game can
write one and send it without any ability to execute anything inside the game.

---

## 2. Step 0 — the fact catalogue (must happen first)

### The problem

The way a rule connects to the simulation is a list of conditions:

```json
{ "id": "open_caught", "action": "open", "when": { "detected": true }, "beats": ["o_caught"] }
```

Those condition names — `detected`, `suspicion_tier`, `mood` — come from a bag of facts that
`engine/query.ts` assembles fresh every turn.

**That bag is not declared anywhere.** It is a set of string keys inside one function. Nothing
checks that a rule's conditions are real facts. Write `suspicon` instead of `suspicion` and the
rule loads clean, counts as a genuine condition for specificity, and then **never fires, for the
life of the project.** The only trace is a "this beat is never seen" warning, and only if that
beat is not used anywhere else.

This is exactly the failure hard rule 9 exists to prevent, and it is live in the repo today.

It is also a hard blocker for the builder: a condition dropdown has to be generated from a real
list, or the tool is just a fancier way to make the same typo.

### The fix

New file `engine/facts.ts`. Every fact declared once, with its type, its legal values, and one
line of plain English:

```ts
export type FactSpec = {
  id: string;
  label: string;            // "how suspicious she is"
  about: string;            // one line of help text for the builder
  kind: 'number' | 'text' | 'flag';
  values?: readonly string[];   // closed list, for 'text'
  range?: readonly [number, number];
  /** Present only on some turns — object facts, noise, detection. */
  contextual?: boolean;
};

export const FACTS = [ /* ... */ ] as const;
export type FactId = (typeof FACTS)[number]['id'];
```

Then the same trick `engine/vocab.ts` already uses: **make it impossible for the catalogue and
the code to disagree.** `QueryBag` in `engine/rules.ts` becomes keyed by `FactId`, so
`buildQuery` cannot invent a fact that is not in the catalogue, and the catalogue cannot list a
fact the game does not produce. The compiler enforces it, not discipline.

And in `engine/validate.ts`, a condition naming an unknown fact becomes an **error**, not a
silent nothing. Same for a value outside a fact's legal set — `"mood": "wrm"` and
`"suspicion": "high"` both stop the game at startup with a clear message.

### Cost of this step

Checked before writing this: **every criteria key in all 167 existing rules is already a real
fact.** So turning this into a hard error breaks nothing that exists. It is a clean addition
that closes the hole ahead of the tool that needs it.

Worth doing even if the builder is cancelled.

---

## 3. What a "scenario" is — the pack

A moment in this game is rarely one row. "She notices the pill under the pillow" wants an
object, a verb, two or three rules, and their beats. So the unit of authorship is a **pack**:
one file that can carry rows for several content files at once.

```json
{
  "pack": "kettle",
  "title": "Something on the stove",
  "author": "…",
  "notes": "what this is meant to do, in plain words",
  "objects":   [ /* ObjectDef rows */ ],
  "actions":   [ /* ActionDef rows */ ],
  "reactions": [ /* ReactionRule rows */ ],
  "beats":     { /* BeatContent by id */ },
  "tested": { "seed": 813218377, "moves": ["wait", "look:her", "listen"] }
}
```

Two rules about merging, chosen for predictability:

- **Additive only.** A pack adds rows. It cannot delete a base row. Turning a pack off is
  therefore always safe.
- **A colliding id is an override, and it is announced.** If a pack defines `thanks_warm`, it
  replaces the built-in one, and the builder says so in as many words — *"this replaces the
  built-in `thanks_warm`"*. This is more useful than forcing prefixes, because retuning an
  existing moment is a thing you will want to do constantly.

`tested` is the payoff from the report tool: a pack does not arrive saying "trust me". It
arrives with a seed and a move list, and `npm run replay` puts the scene back on screen for
anyone. That is the review workflow.

Merging lives in `engine/pack.ts` — pure, no file access. Reading and writing packs lives in
`app/packs.ts`, because storage is I/O and hard rule 1 keeps that out of the engine.

---

## 4. Stage 1 — the rule editor

The screen that covers most of what will ever be authored: **when this happens, she does this.**

**Pick a verb.** Dropdown of every action in the game, base plus pack.

**"Only when…"** Add condition rows. Each row is three controls:

| fact | test | value |
|---|---|---|
| how suspicious she is | at least | 2 |
| she's in the room | is | yes |

The fact list comes from the catalogue, shown by its plain-English label, not its id. The test
options adapt to the fact's type — a number offers *at least / at most / exactly / not*, a
closed list offers *is / is not / one of* with the legal values as checkboxes. **You cannot type
a fact name, and you cannot type an illegal value.** That is the point of step 0.

If a fact genuinely does not exist yet — "is she holding the pill bottle" — the builder says so
plainly and tells you to ask for it, rather than letting you invent a condition that will never
be true. Adding a fact is one line in the catalogue and it stays my job.

**"She says…"** An ordered list of beats. Per beat: who is speaking, the line, and where she is
standing. Two things the builder handles for you rather than asking:

- `advancesClock` is set automatically — false on every line except the last, per design doc
  §12, so a slow reader is never charged time for reading. Overridable, tucked away.
- Mood, light, weather and time are **not** authorable. The simulation stamps those on. Nothing
  in the builder lets you write "she looks annoyed" into a beat and thereby trap presentation
  inside prose (hard rule 5). `pose` is asked for, always, because the simulation cannot know it.

**"And it changes…"** Affection, trust, suspicion, disposition pressure. Numbers with the
existing rules' values shown alongside as a reference, so "is 18 a lot?" has an answer on screen.

### The feature that actually matters: **which rule wins?**

Valid JSON is the easy half. The part a non-coder will get wrong — the part that *already* bit
us, when two new rules tied with an existing one and won only half the time — is **specificity**.
The rule with the most conditions wins; ties break by weight, then at random.

So the editor shows, live, while you type:

- every existing rule for this verb that could match the same moment,
- whether yours beats them, loses, or **ties** (the dangerous one),
- and, on a tie, what weight would settle it.

And a **"try a moment"** panel: set up a situation, or grab the state from the game you have
open, and see which rule actually wins and which lines come out. This is cheap to build because
the engine is pure — the builder calls the real `selectRule`, not a reimplementation of it.

---

## 5. Stage 2 — things, and the verbs bound to them

Stage 1 can only reuse verbs that exist. Stage 2 adds new ones.

**A new object.** Name, where it starts, whether things go inside it, whether it can be picked
up, whether it switches on and off, and how obvious it is when it moves (change tier 1–4, in
plain words: *unnoticeable / noticed eventually / noticed soon / noticed instantly*).

**A new contextual verb bound to it.** Name, minutes it takes, how loud it is, whether it can be
done unseen, and what it mechanically does.

That last field is the hard one. Every action maps to one entry in a closed list of mechanics,
and the builder must show them in plain English rather than as `toggle_on` / `care_palm`:

> *puts it in your hands · opens it · shuts it · switches it on · switches it off · moves it ·
> hides it · looks at it · answers a care need · quietly pockets a dose · refuses her · passes time*

If a scenario needs a mechanic that does not exist, that is a genuine engine change, and the
builder says so rather than offering a lookalike.

The eight universal verbs are locked (hard rule 7) and the builder does not offer to add one.
Contextual verbs are free and need no permission — the docs say so explicitly, which is exactly
what makes Stage 2 safe to hand over.

**Why Stage 2 is worth doing now:** the next feature in the queue is talking to her (design doc
§19), which is roughly eight topics, each a contextual verb on `her` plus a couple of rules.
With Stage 2 you author those yourself and tune them in the room. Without it, I write eight
things you then read, and we do the round trip eight times.

---

## 6. Testing it in the running game

A pack loads on top of the base content, in `app/`, and the game runs with it. Same validator,
same loud failure — an unfinished pack refuses to load and says exactly what is missing.

One caveat, built in from the start rather than retrofitted: **a save made with a pack loaded
may reference things that vanish when the pack is turned off.** The pack name gets stamped into
the save, and loading a save whose pack is missing gives you a clear choice rather than a crash.

---

## 7. Deliberately not in this

- **Places and her schedule** (Stage 3). Rarely touched, worst to get wrong.
- **Prompts, choices, and timers.** That is the v2 dialogue mode, not this.
- **Deleting base content.** Override yes, delete no.
- **Any server, account, or sharing backend.** Packs are files. The site stays a static build
  with no back end, which is what keeps the deploy simple and the repo private.
- **New game state, new pipeline stages, new dependencies.** None of this needs any. Plain React
  and the code already here; no form library.

---

## 8. Honest risks

- **Nothing validates balance.** The validator proves a pack is *legal*, never that it is
  *good*. A pack that hands out 40 affection will load without complaint. Review and the sim
  harness are the answer, not the tool.
- **The builder is the most complex screen in the repo.** The game is text boxes; this is a
  form-heavy editor. It will be a meaningful chunk of the app by size, and it is dev-only —
  it should be excluded from anything a player ever sees.
- **It is not POC scope.** §16 does not mention it. This is time not spent on the journal, the
  mobility climb, or the endings. The argument for doing it now is sequencing (§5, last
  paragraph), not that it is on the critical path.

---

## 9. Rules this tool must keep obeying

For whoever builds or extends it later:

1. It uses **the real validator**, never its own idea of what is legal. Two opinions about
   validity is the failure mode that makes this tool worse than useless.
2. It uses **the real rule-picker** to answer "which rule wins", never an approximation.
3. It writes **only content**. No logic ever ends up in a pack (hard rule 4, in reverse).
4. Nothing in `engine/` may import from it, and it adds no game state.
5. It cannot author presentation into prose, and it cannot add a universal verb.

---

## 10. Build order

**Step 0 — the catalogue.** `engine/facts.ts`; `QueryBag` keyed by `FactId`; validator errors on
unknown facts and illegal values. Tests. This ships on its own and is useful on its own.

**Step 1 — packs.** `engine/pack.ts` (pure merge, override rules) and `app/packs.ts` (storage,
import, export). Tests: merge, override, round-trip, a pack that fails validation.

**Step 2 — the shell.** A tab in the web build; the game and the builder side by side; a pack
loaded into the running game; the save-compatibility stamp.

**Step 3 — the rule editor.** Conditions, beats, meters, and the "which rule wins" panel.

**Step 4 — the object and verb editor.**

**Step 5 — export, and a `tested` line captured from a real run.**

Each step is its own commit, per the small-commits rule — a rule that stops firing looks
identical to a rule that was never reached, and granular history is the recovery path.

### Verification

`npm run typecheck` and `npm test` throughout. `npm run sim` with a test pack loaded, to prove a
pack cannot make the game unwinnable without the harness noticing. And a real browser pass
against the production security headers before it ships, because local storage and file
downloads are precisely the things that work locally and are silently blocked live.
