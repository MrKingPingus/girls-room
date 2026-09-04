# Scenario Builder — PLAN, not built

A dev tool: a second tab in the game that lets the designer write new moments for the game
by filling in forms, test them in the running room, tune them, and export them as a file.

Status: **PARKED**, and the reason it was parked is now fixed — see §13. Stages 1 and 2 were
built, then rebuilt around the ladder (§11, which
supersedes the screens described in §4 and §5 — the model underneath them is unchanged). Work
stopped deliberately at §13. Read §13 before touching any of it again, and keep §14 up to date
even while it is parked. Stage 3 (the room's places, her schedule) deferred, as is the
choice-and-timer editor, which belongs to the v2 dialogue mode rather than here.

Where it lives: `engine/facts.ts` and `engine/pack.ts` in the engine; `app/builder.ts` for the
tool's thinking and `app/packs.ts` for its files; `app/web/builder/` for the screens. Tests in
`test/facts.test.ts`, `test/pack.test.ts` and `test/builder.test.ts`.

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

### Cost of this step — as built

**Every condition in all 167 existing rules already named a real fact**, so making this an error
broke nothing. The change is behaviourally inert: the simulation runs identically, seed for
seed, including the one seed in five hundred that stalls under fully random play.

Architecture spec §6a is the permanent record of how the catalogue and the code are held
together. It was worth doing on its own account, and would have been even if the builder had
been cancelled.

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

**Step 0 — the catalogue.** ✅ `engine/facts.ts`; `QueryBag` keyed by `FactId`; validator errors on
unknown facts and illegal values. Tests. This ships on its own and is useful on its own.

**Step 1 — packs.** ✅ `engine/pack.ts` (pure merge, override rules) and `app/packs.ts` (storage,
import, export). Tests: merge, override, round-trip, a pack that fails validation.

**Step 2 — the shell.** ✅ A tab in the web build; the game and the builder side by side; a pack
loaded into the running game; the save-compatibility stamp.

**Step 3 — the rule editor.** ✅ Conditions, beats, meters, and the "which rule wins" panel.

**Step 4 — the object and verb editor.** ✅

**Step 5 — export.** ✅ The `tested` line — a seed and a move list captured from a real run, so a
scenario arrives with proof it fires rather than a promise — is in the pack format and validated,
but the builder does not yet fill it in from a session. That is the next small piece.

Each step is its own commit, per the small-commits rule — a rule that stops firing looks
identical to a rule that was never reached, and granular history is the recovery path.

### Verification — as done

103 tests. A real Chromium pass against the production security headers: a scenario authored
through the forms, checked, switched on, played in the room with the sharper of its two rules
winning, and exported — with no console errors, which is the thing that matters, because local
storage and file downloads are precisely what works locally and fails silently live.

Two mistakes the screenshot caught that the tests did not. The rivalry panel told a catch-all
rule it would "never be seen", which is exactly backwards — being given way to is what a rule
with no conditions is *for*. And it gave one blanket reason for losing when there are two,
which are not interchangeable: losing on conditions is usually fine, losing on weight is a tie
somebody already settled against you.

Still not covered: nothing checks that a pack is *balanced*. The validator proves a scenario is
legal, never that it is good. `npm run sim` and reading it are the only answers to that.

---

## 11. The ladder — how it actually ended up

The first version of these screens had a form per content file: Things, Verbs, Lines, Rules.
That is the engine's filing system, not an author's. Getting a matchbox into the room meant
visiting four sections and inventing four ids by hand, and the part anybody cares about — what
she does about it — was at the bottom, behind three sections of setup.

Nobody asks for four things. They ask for **a matchbox and some ways she might react to it.**

### Not a flowchart

The obvious suggestion is to draw the reactions as a flowchart. It would be wrong, and wrong in
a way that costs more than the confusion it solved.

**This game has no flow.** §6 is explicit: her reactions are not a tree. Every turn, the game
looks at the moment, scores every rule whose conditions hold, and plays the most specific one.
There is no "and then". A flowchart draws sequence and branching — a shape this engine does not
have — so an author would learn a false model of the game and then author against it.

The flowchart earns its place when the v2 dialogue mode arrives, because choices and branches
genuinely are a flow. Not before.

### The ladder

What is honest is a **fallback ladder**, most specific at the top:

```
THE MATCHBOX                                   on the nightstand

  Take the matches                                        pick it up
    if  she is in the room · her mood is angry
        her ⟩ "Put them back. Now."                    +25 suspicion
    if  she is in the room
        her ⟩ "Those aren't for you."                  +12 suspicion
    otherwise
        the room ⟩ You slide the matchbox into the pillowcase.
```

Every rung is one situation. Reading top to bottom tells you what happens and in what order of
priority — and **that order is the order the game really uses**, which is checked by a test that
walks thirty turns comparing the ladder's topmost matching rung against the engine's own rule
picker. If it ever disagrees, the picture is lying to an author and the test fails.

Consequences worth stating:

- **A rung's position is which rule wins**, so weight and the rivalry panel mostly stop being
  something an author has to think about within their own scenario.
- **Rungs cannot be dragged anywhere.** Two conditions always beat one, whatever anybody wants,
  so the ladder sorts itself. A rung landing lower than expected is the system explaining
  itself, and the note above the ladder says so before it happens.
- **Ties are given weights automatically**, only where a tie actually exists. Two rungs at the
  same height with the same weight is a coin flip — the thank-you bug — and a ladder that drew
  one above the other would be lying.

### What else changed

- **A thing owns its verbs, and a verb owns its ladder.** Indentation carries the structure.
- **Ids are generated from names** and shown only under *show every field*. That is four text
  fields gone, and the id-and-name-in-agreement bookkeeping with them.
- **Lines are typed where they are used**, not written elsewhere and picked back by id.
- **Defaults hide.** How long a verb takes, how loud it is, whether things go inside a thing —
  all behind one link each. What stays visible is what this game is about: where it starts, and
  whether she notices if it moves.
- **A new verb arrives with its catch-all rung already written**, rather than letting an author
  discover that rule by tripping over it.
- **A yes/no condition lost its test dropdown.** "is not yes" and "is no" are one sentence.
- **Problems are said in plain words.** `actions[22].name: missing or not a non-empty string` is
  the right message for a content pass and the wrong one for somebody naming a matchbox, so
  `unfinished()` reads the draft and says what is missing in terms of what is on screen. The
  validator remains the only authority on what is *legal*.
- **Everything the old screens did is still there**, under *show every field*. Both views edit
  the same draft, so you can start simple and drop down for something odd.

### Ideas

Every thing has an **Ideas** box: what it could be for, whether or not the game can do any of it
yet. *Light a candle with it. She smells smoke on you. Burning the journal.*

Never validated, never shown in the game, never read by a line of `engine/` — it rides along in
the pack file so that an idea arrives attached to the thing it is about instead of scattered
through a conversation, and so someone can answer which of them is a row of data, which is an
engine change, and which is a new system worth designing.

### What the browser caught that the tests did not

**A freshly added exception was unfinishable.** "No conditions yet" and "no conditions at all"
were the same test, so a new exception rendered as the *otherwise* rung with its condition
picker hidden — a dead end reachable in three clicks. Those are now two different questions: what
the game sees (conditions with something chosen) and what the author sees (any conditions at
all).

**Two `×` buttons sat side by side** meaning "remove this condition" and "remove this whole
situation". The second is now a worded link in the rung's footer.

---

## 12. What the first tester hit

Two problems, from somebody trying to add a matchbox and take it.

### "I'm getting errors and I don't know why"

The scenario said *Not finished yet: something in the room still needs a name*, on a screen
where the thing plainly appeared to be called "a matchbox".

It was not. That was the **placeholder**. The placeholders were example content — `a matchbox`,
`Take the matches` — and on a dark ground, in the field's own font, an example is
indistinguishable from something you typed. The tester filled in the lines, left the names
alone because they looked filled, and then read an error about a missing name while looking
straight at what appeared to be one.

Fixed at the cause, not the symptom:

- placeholders are instructions now — *name it — a matchbox, a hairpin…* — set in italic at half
  opacity, so they cannot be mistaken for content
- a required field that is empty gets a warm dashed underline and a tinted ground
- underneath it, a line saying in as many words that the faint text is an example
- adding a thing or a verb puts the cursor in the box that must be filled in
- the messages point at the box: *"type one in the big box at the top of its card"*

### "I barely understand what the options do"

The honest reading: **a blank form is the worst possible way to explain a system.** Every
control was asking for a decision before there was anything to see, and the meaning of each one
only becomes clear once something is running.

So **New, from an example** is now the first button. It creates a matchbox that already works —
a thing on the nightstand, a verb that picks it up, and three rungs including one for her being
angry. Zero problems on arrival, playable before a word is changed. The way to find out what
"pick it up" or a condition or a rung does is to change it and play it, not to read about it.
**New, empty** is still there for when the shape is already known.

Alongside that:

- the mechanics dropdown is grouped, with her care-scene mechanics out of the way of the seven
  an author will actually reach for
- each verb says what it becomes: *"In the room this is a button on a matchbox reading Take the
  matches. Clicking it puts it in your hands."*
- **"otherwise" is called "always" when it is the only situation**, because otherwise-than-what
  is a question with no answer until there is a second rung. The ladder's explanation of
  precedence only appears once there is precedence to explain.
- the empty screen says what a scenario *is*, in one sentence, before offering to make one

The example is built through the ordinary editing functions rather than written out as data, so
it cannot drift from what the screens produce, and a test asserts it arrives with nothing
unfinished — an example that needs fixing before it runs teaches exactly the wrong thing.

---

## 13. Parked — where this stopped, and why

Stopped after two sessions of use by the designer. Not abandoned, and not because it does not
work: it does. Stopped because **the tool outran the game.**

### The reason

A rule can currently change exactly one thing: her meters. It cannot change the world, teach the
player anything, or leave a mark that a later rule could see. So every scenario an author can
build is a dead end by construction — as the designer put it, *"I can grab a thing, and she can
say something about it, and that's that."*

That is not a workflow problem, and no amount of screen work fixes it. More polish on a tool for
authoring dead ends is the wrong spend. The systems come first; the builder is revisited when
there is something worth authoring.

### What works, and can be trusted

- Writing a thing, verbs bound to it, a ladder of situations per verb, and the lines she says
- The ladder's order being the order the game really uses (§11, and the test that proves it)
- Live validation through the real content validator — never a second opinion (hard rule 10)
- Switching a scenario on, playing it in the room, exporting it as a file, importing one
- **New, from an example** — a matchbox that already works, three rungs deep
- Ideas boxes, carried in the pack file and never seen by `engine/`

### What is known to be wrong, and was not fixed

- **A rung jumps position as you add a condition to it.** Correct — more conditions wins, so the
  ladder re-sorts — but it moves while you are typing in it. There is a note above the ladder
  explaining it. If it is still irritating in practice, make it settle rather than jump.
- **Two conditions in one rung both show their subject dropdown**, which reads as repetition
  when they are about the same subject.
- **The scenario name and author sit above the "what is this for?" box**, which is a strange
  reading order for what is really one header.
- **Nothing checks that a scenario is balanced.** The validator proves it is legal, never good.
- **Everything in §14 below** is content the game supports and the builder cannot write.

### The open design question

The designer wants a branching picture — pick up the egg, and branches from there leading to
consequences. §11 argues against a flowchart and that argument still holds *for one turn*: the
rule database is not a tree and has no "and then".

But what they were describing is not one turn. It is the scenario's life over time, and that
genuinely is a graph. It cannot be drawn today because **nothing in a scenario changes state, so
there is exactly one node.** Once a rung can teach the player something and a condition can read
it back, the states are real and a map of them becomes honest rather than decorative.

**So: build the connective tissue first, then look again at whether a map earns its place.** Do
not draw the graph before there is something to draw.

### The first thing to do when picking this up again — DONE, in the game

`player.knows` is now live. An action can carry `teaches` (*and now you know…*) and
`requiresKnown` (*you can only do this if you already know…*), and any rule can ask about a
name with `knows: { has: … }` or `knows: { lacks: … }`. Architecture §6a has the shape; the
nail on the wall is the worked example shipping in `content/`.

So the premise of this section no longer holds: a scenario **can** now lead to another. What is
still true is that the builder cannot write any of it — see the `player.knows` row in §14.

The design question above is the one to look at next. There are real states now, so a map of a
scenario's life over time would have something honest to draw. It is worth asking again whether
it earns its place before drawing it.

---

## 14. The builder ledger — what the game can say and the builder cannot

**Standing rule: when a system is added to the game, add a row here in the same change.**

The builder is parked, not deleted. Every system built while it is parked is a thing an author
will eventually expect to reach, and the cost of finding that out later — by an author hitting a
wall — is what this list exists to avoid. A row costs one line. Reconstructing this list from the
code costs an afternoon and will miss things.

Say what the system is, and what the builder would need in order to author it.

### Owed as of parking

| System | What the builder would need |
|---|---|
| **Places** (`content/places.json`) | Stage 3. Reach tier, concealment, noise modifier. Packs do not carry places at all. |
| **Her routine** (`content/schedule.json`) | Stage 3. Blocks per day, with the no-gaps-or-overlaps check surfaced as it is typed. |
| **Contraband** (`action.produces`) | A verb that *makes* a thing — palming a dose is the keystone move of §8 and cannot be authored. |
| **Her care offers** (`action.offers`) | Her half of a care scene. Deliberately excluded from the player's menu, so it needs its own way in. |
| **Hidden and nested starts** (`object.startsAt`) | Only `placed` can be written. `hidden`, `inside`, `carried` cannot. |
| **Per-object noise** (`object.noise`) | A drawer being louder than a glass is authorable in the file and not in the tool. |
| **People** (`object.person`) | Only she is one today, but the field exists and the builder cannot set it. |
| **Prompts, choices, timers** (`beat.prompt`) | The v2 dialogue mode. Deliberately deferred — do not build it into the ladder. |
| **Dream and memory scenes** (`beat.scene`) | Overriding the stamped-on light, weather or location for a beat that is not in the room now. |
| **Sound** (`beat.audio`) | Nothing reads it yet, but every beat carries it, and one day a VN layer will. |
| **Confidence register** (`beat.register`) | v2, reserved. Nothing reads it. Listed so it is not forgotten. |
| **What the player knows** (`action.teaches` / `action.requiresKnown`) | *and now you know…* on a verb, and *you know…* / *you don't know…* as a condition. The condition picker needs a fourth shape: the names are not a fixed list, they are whatever some verb in the scenario teaches, so the dropdown has to be built from the pack being edited. Built in the game; unreachable from the tool. |

### Owed by systems not yet built

| System | What the builder would need |
|---|---|
| **Talking to her** (design doc §19) | Topics as contextual verbs on her, with the once-only rule. The knowledge gating is built; the topics themselves are not. |
| **Her acting on the world** | A rung causing her to move or take something. A genuine pipeline question, not a small change. |
| **The journal** (design doc §9) | Writing in it, and her reading it. |
| **Mobility 0 → 1** | Reach tiers become authorable, which drags Stage 3 with it. |
| **The three endings** (design doc §11) | Whatever an ending turns out to be, an author will want to write one. |
