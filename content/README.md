# content/

The game, as data. Nothing in here is code, and nothing in `engine/` needs editing to add to it.

## The text in these files is placeholder

Design doc §16: *"Build the ugly version first. Clickable text boxes, object and action
descriptions, no prose. If that loop isn't tense at this scale, no quantity of additional
systems will fix it — and that's the question the POC exists to answer."*

Most of `beats.json` is functional placeholder written to make the loop run and to give the
reaction rules something to point at. It is deliberately flat so that it reads as scaffolding
rather than as a draft, and so that replacing it is obviously the next job rather than an
optional polish pass.

**The exception, and it is a real one.** Her explanation on day 1 (`expl_*`), what the world
says when she comes and goes (`enters_*`, `goes_*`, `stairs_*`, `night_*`, `d1_wake_*`), the
three questions you can ask her, and the two details you can work out — the nail and the
trauma kit — are *drafted*. They are a proposal about who she is, written to be argued with.
Cut them, rewrite them, or keep them, but do not treat them as stand-in text that nobody
intended.

Rewriting a line can never break logic: rules reference beats by id, so the text and the
simulation are only ever connected by a name.

## The files

| File | What it holds |
|---|---|
| `places.json` | Where things can be. **Reach lives here**, not on objects — the same book is tier 0 on the nightstand and tier 2 on the dresser |
| `objects.json` | The things in the room, where they start, and any contextual verbs bound to them |
| `actions.json` | What the verbs cost in time and noise, and what they mechanically do |
| `reactions.json` | The rule database. Most matching conditions wins |
| `beats.json` | Every line, by id |
| `schedule.json` | Her routine, per day. Where she is, what she's doing, how closely she's watching, and which blocks are meals |

## Adding to it

- A **new object** is cheap. The catch-all rules already answer every verb for it, so it works
  the moment it is added.
- A **new contextual verb** is cheap. Bind it to one object; only that object has to answer.
- A **new universal verb** is expensive and locked. Every object in the game would need an
  answer for it. Design doc §13.
- A **new reaction** is one row. Add conditions to make it more specific than the catch-all and
  it wins automatically.
- A **new line for a moment the world raises** — she comes up, she goes, the day turns — is
  also one row, against the verb in `actions.json` carrying that `raisedBy`. Architecture §5b.

Everything is checked when the game starts. A typo'd id refuses to load and says where it is.
Run `npm run sim` after any change here: it reports beats that nothing can reach, which is what
a typo in a rule's conditions looks like from the outside.
