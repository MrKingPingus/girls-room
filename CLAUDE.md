# CLAUDE.md

## Project

**Girl's Room** — a systemic one-room horror/dating sim. The player is bedbound in a converted
attic, held by a woman who is caring for them and will not let them leave.

Ships first as a text-only build. **Must be convertible to a visual novel later without
rewriting game logic.** Nearly every rule below exists to protect that conversion or to keep
the simulation from collapsing into hardcoded branches.

## Talking to me

I'm the designer, not a coder. I'm good at story, systems, and creative direction. I do not know
technical terminology and I'm not going to pick it up from context — assume zero.

- **Plain language, always.** If a technical term is genuinely unavoidable, define it in one line
  the first time it appears, in the same message. Don't send me to look something up.
- **Explain the code through the game.** "The step that decides how she feels is the only one
  allowed to move suspicion" lands. "APPRAISAL owns `her.suspicion`" does not.
- **Lead with what it costs the game.** Consequence first, mechanism second. If a technical choice
  closes off a creative option later, say so at the time — I can't see those coming.
- **Don't ask me to pick between things I can't evaluate.** Give me a recommendation and frame the
  tradeoff in terms of the fiction, the player's experience, or how long it'll take. I'll decide on
  that basis. A question phrased as two technical options is a question I can't answer.
- **Never assume I know what something in this repo does** because it's in my repo. Most of it was
  written for me, not by me.
- **Don't simplify the thinking, only the vocabulary.** I want the real tradeoff, not a softened
  version of it. Tell me when something is a bad idea and why.
- **Flag it when I've asked for something that contradicts the docs or these rules** rather than
  quietly making it work.

**I create subtractively.** I'm much better at "nah, nah, nah, yes" than at filling a blank page.

- **Propose, don't poll.** Put something concrete in front of me — a full list, a named set, a
  draft — and I'll tell you what to cut. An open question with nothing attached is the slowest
  possible way to get an answer out of me.
- **Make the small calls yourself until the game is playable.** Until I can actually run it and
  feel it, default to deciding and telling me what you picked and why. The decisions I genuinely
  need to make are the ones about who she is; almost everything else I'll trust and correct later.
- **Offer things to cut, not just things to add.** If something in the design is redundant or
  fighting itself, say which one you'd drop.

## Read first

- `docs/one-room-sim-architecture.md` — how it's built. State shape, the pipeline, the rule database.
- `docs/girls-room-design-doc.md` — what it is. Systems, the room, classes, Day 1, POC scope.

Read both before your first change in a session. If a request conflicts with either doc, say so
rather than silently picking one.

- `docs/scenario-builder.md` — the dev tool for authoring content. Read it before touching
  `app/builder.ts`, `app/web/builder/`, `engine/facts.ts` or `engine/pack.ts`.

## Stack

TypeScript. React + Vite for the shell. JSON for content. Deployed to Cloudflare as a
static site, with no back end of any kind. No other frameworks or state libraries without
asking — the builder is plain React and the code already here, on purpose.

## Layout

```
docs/        design + architecture. Update when decisions change.
engine/      pure TS. state + action -> new state + beats.
content/     JSON data. objects, actions, reactions, beats, schedule.
render/      consumes beats. Swappable. Currently text only.
sim/         headless test harness.
app/         wiring, save/load, input, and the dev tools. Thin.
app/web/builder/   the scenario builder. Dev only — no player ever sees it.
```

---

## Hard rules

These are invariants, not preferences. Violating any of them costs either the VN conversion or
the ability to scale content. If a task seems to require breaking one, stop and ask.

### 1. `engine/` is pure

- Never import from `render/` or `app/` into `engine/`.
- No DOM, no `window`, no `localStorage`, no timers, no I/O anywhere in `engine/`.
- It must run in plain Node. The headless harness depends on this.

### 2. State is serializable

- No class instances, no functions, no `Map`/`Set`, no `Date` objects in state.
- If `JSON.parse(JSON.stringify(state))` loses anything, it's wrong.

### 3. Single-writer principle

Every state field has exactly one pipeline stage permitted to write it. The table lives in
`docs/one-room-sim-architecture.md`.

- **Never write a state field from outside its owning stage.**
- **Never add a state field without adding it to the table in the same change.**

### 4. Reactions live in data, never in code

- No `if (suspicion > 40 && mood === 'cold')` in `engine/`.
- Her responses come from querying `content/reactions.json` by criteria count.
- Adding content must never require editing `engine/`.

### 5. Every beat carries presentation tags

Every beat needs `portrait`, `scene`, and `audio` fields, **even though the text renderer
discards them.** This is non-negotiable. These are unrecoverable later and they are the entire
VN conversion plan.

Never put presentation information inside prose. `"She looks annoyed"` is wrong;
`mood: "annoyed"` is right.

### 6. The pipeline is ordered and stages don't call each other

```
VALIDITY -> EFFECTS -> WORLD -> NOISE -> DETECTION -> APPRAISAL -> REACTION -> BEATS
```

Each stage is `(state, ctx) => diff`. Stages never import or invoke one another. Adding a
system means adding a stage, not wiring dependencies.

### 7. Universal verbs are locked

`look` · `listen` · `take` · `open` · `move` · `hide` · `wait` · `rest`

**Never add a universal verb.** Contextual verbs bound to a single object are fine and don't
need permission. If something seems to need a ninth universal verb, ask.

### 8. Failure is content

An action that can't happen returns a beat explaining why, in character. It is never an error,
a no-op, or a greyed-out button with no text.

### 9. Content validates on load

Typo'd ids fail loudly at startup. A rule that silently never fires is close to undebuggable in
a system this size, so never add a lookup that fails quietly.

Corollary: **every fact a rule can ask about is declared in `engine/facts.ts`**, with its type
and its legal values. The compiler will not let `query.ts` produce one that isn't listed, or
the catalogue list one the game never sets. Adding a fact to the bag means adding its row in
the same change — the same rule as the single-writer table, for the same reason.

### 10. The builder is never a second opinion

The scenario builder writes content, and content only. It uses the real validator to decide
what is legal and the real rule picker to decide which rule wins. Two opinions about validity
is the one failure that would make the tool worse than not having it.

---

## Working style

- **Plan before writing.** For anything touching more than one file, write the plan first and
  wait for confirmation.
- **Small commits, one concern each.** This codebase breaks silently — a rule that stops firing
  looks identical to a rule that was never reached. Granular history is the recovery path.
- **Run `npm run sim` after changes to engine or content.** Report dead beats and unreachable
  endings. Don't treat statistical output as optional.
- **Prefer adding a row over adding a branch.** If a feature can be a rule, a criterion, or a
  content entry rather than code, make it that.
- **Don't gold-plate.** We're building the POC in §16 of the design doc, not the full game.

## Ask before

- Adding a universal verb, a state field, a pipeline stage, or a dependency
- Changing the beat schema
- Anything that would put logic in `content/` or content in `engine/`
- Building any part of the VN renderer
- Implementing the confidence system (deferred to v2 — the field is reserved, nothing reads it)

## Don't

- Don't write prose for the game unless asked. Content is authored deliberately, not generated
  in passing.
- Don't add a class beyond the Mailman during POC.
- Don't "simplify" the pipeline by merging stages.
- Don't infer design decisions from the code when the docs are the source of truth. Ask.

## Tone note

This is horror. Content is intense but not gratuitous, and boundaries are in §15 of the design
doc. When writing any beat text, err toward restraint and implication. The room does the work.
