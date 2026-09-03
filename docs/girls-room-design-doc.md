# Girl's Room — Design Document (v2)

Companion to `one-room-sim-architecture.md`. That doc covers *how it's built*.
This one covers *what it is*.

**Status:** core decisions locked. Room designed. Ready to scope the POC build.

---

## 0. The one sentence — LOCKED

> You are being cared for by someone who will not let you leave, and getting well enough
> to escape requires letting her believe you never will.

Every system serves this sentence. Anything that doesn't is a cut candidate.

---

## 1. Tech stack — DECIDED

**TypeScript engine + React/Vite shell, deployed to GitHub Pages.**

| Considered | Verdict |
|---|---|
| **TS engine + React/Vite** | **Chosen.** Pure engine portable anywhere later. Sprite layer drops on top. Known deploy path. |
| Ren'Py | Rejected. Built for authored branching scripts; fights simulation logic at every turn. |
| Godot | Deferred. Better long-term for timers and audio, but a new language now for a payoff years out. |
| Plain JS | Rejected. See below. |

**TypeScript specifically, not JavaScript.** With this many interacting systems the dominant
bug is a typo'd object id or a mood value that doesn't exist, failing silently and producing a
rule that never fires. Types convert those into build errors. When an agent writes most of the
code, this is the guardrail that prevents slow, invisible rot.

Engine must remain pure and Node-runnable — no browser APIs — so the headless test harness works.

---

## 2. The Room — DESIGNED

A converted attic on the third floor of her house, presented as a "guest room."

The premise leaks immediately: she carried a person with a broken leg up two flights of stairs
rather than using any room below. The player should register that as wrong within minutes.

### 2a. The stairs are the lock

The only exit is an open stairwell in the floor at one end of the room — a hole with a steep
run of steps below it. For someone with a broken leg that is not a door, it's a fall.

**She does not need a lock. This is why she chose the attic.**

Design consequence: the door at the bottom can be *wide open*. Far more unsettling than a
padlock, and it reframes the whole game — you're not locked in, you're physically unable to
leave, and she's counting on that. Every mobility tier you gain converts the stairs a little
further from wall into exit. That's the progression spine made literal.

### 2b. Sound geometry — the noise system, for free

Your floor is her ceiling. This runs in both directions and is the single most productive
feature of the room:

- **She hears you.** Every step, every dragged object, every drawer. Noise values aren't
  arbitrary numbers, they're structural and the player intuits them immediately.
- **You hear her.** Water running, the television, the back door, footsteps crossing rooms
  below. **Listening is an action worth spending time on** — it's how the player tracks her
  during absences with no UI whatsoever.
- **The staircase creaks.** Your early warning. Also hers.

### 2c. Layout

- **Sloped ceiling** on two sides. You can only stand upright along the center strip.
- **The bed**, centered on that strip, positioned so she sees it the instant her head clears
  the stairwell. Almost no warning if you're out of it.
- **One dormer window** at the far end. Small, painted shut. Three floors up, so not an exit —
  but it's your only channel to the outside world: weather, light, time of day, a neighbor's
  window, whether a car is in the drive.
- **Exposed rafters and collar ties** overhead. Hiding places above eye level, but they require
  standing.
- **The eaves** — low triangular crawl spaces behind knee walls, packed with her family's
  stored boxes. **This is the backstory mine.** Attics store the past, so her history is
  physically in the room with you. Reachable only at high mobility, loud to open, unmistakable
  if noticed.
- **The light switch** is at the top of the stairs, out of reach from the bed. She controls
  darkness.
- **Heat** is controlled from downstairs. An attic swings hot and cold. Temperature as reward
  and punishment, applied without her being present.

### 2d. Objects

| Object | Reach tier | Role |
|---|---|---|
| Nightstand: lamp, clock, water glass | 0 | The player's whole world on day one |
| Pill bottle | 0–1 | The keystone item (§6) |
| Journal + pen | 0 | Given day one. She can read it (§9) |
| Her chair | 1 | Placed close. Hers. Moving it is a tier-4 change |
| Under the bed | 1 | First hiding place |
| Dresser | 2 | Clothes that aren't yours and don't fit. Whose? |
| Window | 2 | Information, not escape |
| Radiator / heater | 2 | Her control surface, physically present |
| Rafters | 3 | Hiding above eye level |
| Eaves boxes | 3 | Her past |
| The stairs | 3 | The endgame |
| A nail on the wall | 0 (visible) | Something used to hang here. The outline is still there |

### 2e. Mobility tiers mapped to the room

| Tier | Access | The feeling |
|---|---|---|
| **0** Bedbound | Nightstand, listening, partial window view, talking | Total dependence |
| **1** Limited | Floor beside bed, under bed, her chair. Crawling — quiet but slow, and catastrophic to recover from if she returns | First risk |
| **2** Fuller | Dresser, window, top of stairs, standing | The room becomes yours when she's out |
| **3** Mostly | Rafters, eaves, the stairs themselves | Escape becomes real |

---

## 3. The Girl

**POC version:** classic yandere. Adores the player for reasons that make sense only to her.
Not cruel by default — cruelty is what happens when her model of the situation is threatened.

**Full version:** a complete person. Learning who she is *is* the progression system.
Knowledge about her converts into leverage over her, and the eaves are where it's stored.

**She is never a vending machine.** Some moods must originate outside the player's actions —
a bad day, a phone call, an anniversary. If every mood traces to something the player did, she
reads as a mechanism. If some come from her own life, the player starts wondering what's
happening down there.

### Her state

| Field | Range | Meaning | Player-visible |
|---|---|---|---|
| `affection` | 0–100 | How much she wants you | No — inferred |
| `trust` | 0–100 | How much she believes what you say | No — inferred |
| `suspicion` | 0–100, tiered | Active alertness to deception | No — inferred |
| `mood` | enum | Short-term, volatile, resets often | Yes — via tells |
| `disposition` | enum | Long-term, slow, biases mood rolls | No |
| `stress` | 0–100 | Outside pressure. Drives mood independently | Partially |
| `attention` | 0–1 | How closely she's watching right now | Yes — via tells |

### Mood vs disposition

**Mood is this scene. Disposition is this month.** Disposition biases which moods are likely
without determining them, so a warm disposition rarely rolls angry but the day-to-day still
surprises. Player actions mostly move disposition; mood is rolled against it plus her own
external state.

Mood effects, per your list:

| Mood | Perception | Time in room | Response timer | Tell |
|---|---|---|---|---|
| Excited | Less critical — misses tier 1–2 changes | Short, restless | Generous | Talks fast, brought something |
| Warm | Baseline | Normal | Generous | Sits down, unhurried |
| Sad | Slightly less critical | **Long** — the absence window closes | Generous but heavy | Doesn't turn the lamp on |
| Irritable | More critical | Short | Tight | Straightens objects |
| Angry | **Much** more critical, actively inspects | Variable | **Very tight** | Comes up fast, stairs loud |
| Suspicious | Actively searching, not just noticing | Long | Tight | Quiet. Doesn't announce herself |

**Every mood needs a diegetic tell.** A hidden system with no visible surface is
indistinguishable from randomness, and players will call it unfair. The tells *are* the game.

---

## 4. Classes

Classes differ in **knowledge and relationship**, not stat blocks.

Each defines: starting facts · her priors about you · confidence profile · two or three
unique verbs.

| Class | Starting knowledge | Her priors | Confidence |
|---|---|---|---|
| **The Mailman** | Almost nothing | Neutral, low familiarity | Flat |
| **Family Friend** | Her history, family, the house | High affection, **high suspicion** — she reads your tells too | High social, low deception |
| **Former Bully** | Her past, from the wrong side | Low affection, high emotional charge | High physical, low social |
| **The Charmer** | Nothing factual; reads people | Neutral, warms fast | High social + deception, low physical |
| *(fifth TBD)* | | | |

### Preconceptions as a system

Each class carries a list of **her priors** — beliefs she already holds about who you are.
Play confirms or denies them, and each resolution moves affection, trust, and disposition.

This is what makes affection class-dependent rather than a universal meter. The Bully
confirming her belief that he's still cruel is catastrophic; denying it is worth more than
any kindness the Mailman could offer, because it costs him more.

Priors are checkable, finite, and authored per class. They're cheap content with high yield.

### Distinctness without duplication

Concern raised: classes should feel like genuinely different runs.

The rule database solves this. `class` is just another criterion, so one rule tagged
`class: family_friend` overrides that specific moment while the other several hundred rules
keep working untouched. Distinct runs come from priors, starting knowledge, unique verbs, and
targeted overrides — not from parallel content trees.

**Rule of thumb:** if a class needs its own reaction *set*, it's too expensive. If it needs
forty overrides, that's exactly right.

---

## 5. Trust, Affection, and the central tension

- **Trust** — how much she believes what you say. Buys autonomy and information. Relatively
  linear in effect.
- **Affection** — how much she wants you. Double-edged and more nuanced. Class-dependent in
  how it's earned.

```
              LOW TRUST                    HIGH TRUST
HIGH        Obsessed and watching.        The intimacy route.
AFFECTION   Most dangerous square.        Mobility granted freely.
            Constant presence.            Escape means betrayal.

LOW         Indifferent, then              Trusted but disposable.
AFFECTION   disposable. Fast bad ends.     Freedom without leverage.
```

**The tax — CONFIRMED:** rising affection raises `attention` and time spent in the room.
Closeness buys physical freedom and costs privacy. Without this, "maximize affection" is the
dominant strategy and the game collapses. This is the load-bearing tradeoff.

---

## 6. Confidence — deferred to v2, spec locked

Per-domain: `physical` · `social` · `deception` · `observation`

Modulates how the game describes options to the player — the PC's internal appraisal.

### The fairness rule — REVISED

**Original framing (facts vs appraisals) was wrong. The real line is verifiability.**

Confidence *can* skew facts, provided **every skewed fact has an in-world verification action
that costs something.**

| Can be wrong | Because | Cannot be wrong |
|---|---|---|
| "She's still downstairs" | Listening at the stairwell would tell you | What you just did |
| "The stairs are clear" | Looking costs seconds | What's plainly in front of you with no way to check |
| "There's time" | The clock exists, and checking it costs time | The current mobility tier |

This makes **verification a resource you spend against your own narrator**, which is a
stronger system than the original. It also gives overconfidence its real teeth: an
overconfident PC is dangerous precisely because they *don't bother checking*, and the player
has to consciously override that impulse.

### The tell

Legible in register, not in a number:

- **Overconfident:** flat declarative certainty. "She won't check."
- **Calibrated:** conditional and specific. "If she's still in the kitchen, there's time."
- **Underconfident:** hedged, self-interrupting. "Maybe if... no, she'd hear it."

Players learn to distrust certainty. Thematically exact for a story about managed perception.

### Loop

Successes raise confidence and can overshoot. Failure streaks drop toward paralysis, where
good ideas get described as hopeless and the player must override their own character.
**Medication, pain, and sleep debt all shift calibration** — this is where the care loop plugs
straight into the narrator.

**Taught through gameplay, not explained.** One early scripted moment where confidence helps,
one where it betrays. After that the player is expected to carry it.

---

## 7. Detection

### 7a. Sight — the room baseline

| Tier | Example | Noticed at suspicion |
|---|---|---|
| 1 | Blanket rearranged, book angled | 70%+ |
| 2 | Drawer ajar, curtain moved | 40%+ |
| 3 | Object relocated across the room | 20%+ |
| 4 | Object missing, her chair moved, damage | Always |

**Re-baselining — CONFIRMED, class-gated.** If she enters, doesn't notice a change, and
leaves, that change becomes permanently safe. This converts risk into permanent ground gained
and gives the player room to breathe. Without it, tension only accumulates and the game is
exhausting.

Grace scales inversely with how well she knows you. The Mailman gets full re-baselining. The
Family Friend gets much less — she knows what he'd normally do.

### 7b. Noise — structural (see §2b)

Every action carries a noise value. Her location and activity set the threshold. Her own noise
(water, TV, her footsteps) creates cover windows the player learns to listen for.

### 7c. Testimony — the claims ledger — CONFIRMED

Every assertion the player makes is logged with content and day. Contradictions are checked
against future statements and spike suspicion. The dialogue-side equivalent of object state,
and the Charmer's primary content surface.

---

## 8. The care loop

The engine of the premise. Dependence is the horror.

**Needs:** food · water · medication · hygiene · toileting · wound care

Each is an interaction she performs *on you*. Each is a scene with choices: accept, resist, or
perform gratitude. Eat, refuse, or hide. Swallow, or palm.

**Medication is the keystone — CONFIRMED.** Taking it reduces pain and speeds recovery but
degrades `observation` calibration and pulls toward sleep. Palming preserves clarity at the
cost of pain and slower healing, and creates contraband that must be hidden and can be found.
It touches confidence, mobility, detection, and the escape track simultaneously. Build it early.

**Refusing care is a lever on her.** It reads as rejection and produces either panic and
appeasement or anger, depending on disposition.

---

## 9. The journal — CONFIRMED, expanded

Three jobs at once:

1. **Player memory** — the game generates more state than anyone can hold.
2. **The diegetic meter display** — holds the PC's *estimate* of her mood and suspicion, not
   the true value. The player reads inference, not numbers, and it can be wrong.
3. **The confidence readout** — handwriting and phrasing shift with calibration.

**She reads it, and it's gated on trust:**

| Trust | Her behavior |
|---|---|
| High | Rarely, out of curiosity. Mostly harmless |
| Medium | Periodically. The player should suspect but not know |
| Low | **Compulsively.** Every absence |

At low trust the player must write in code to keep using it at all — a secondary system to
work out later, but the trust gradient is the right frame.

**Auto-fill is sparse and class-flavored.** The Family Friend's journal fills in background he
never asked for. The Mailman's stays mostly blank. Over-filling destroys the incentive to pay
attention.

Don't explain any of this. Let them find out.

---

## 10. Escape track — deferred, keep in mind

Separate from suspicion, hidden. Knowledge · assets · access · opportunity.
The player needs something to *build*, or the game is pure evasion with no forward pull.

---

## 11. Endings

**Death is game over — DECIDED.** Open sub-question: restart granularity. Day-start
checkpointing is the likely answer; full restart is probably too punishing for a game with
hidden meters. Revisit after the POC is playable.

| Ending | Rough condition |
|---|---|
| **Death** | The only failstate. Rare, telegraphed, always earned |
| **Escape — flight** | High escape track, low affection. Cold, unresolved |
| **Escape — exposure** | High knowledge, outside alerted. Her fate is on you |
| **Escape — betrayal** | High affection + high trust, then you leave. The cruelest |
| **Stay — surrender** | Trust maxed, escape abandoned. Ambiguous, not necessarily bad |
| **Stay — capture** | Suspicion maxed without death. Mobility revoked |
| **Stalemate** | Time runs out. Resolved without you |

---

## 12. Time and the daily cycle

```
WAKE        she's present. Care loop. Mood established via tells.
MORNING     conversation. Dialogue and claims.
ABSENCE     she leaves. Exploration window. Noise rules apply. Track her by sound.
RETURN      warnings escalate. Detection resolves. Consequences land.
EVENING     care loop, conversation, the day's emotional summary.
SLEEP       forced. Time skip. She may act unobserved.
```

**Sleep is a horror device.** Waking to a moved object, a new lock, a bandage you don't
remember, or her asleep in the chair costs almost nothing to author and is among the strongest
beats available.

**The clock.** Checking costs time — information priced in the same currency it's about. Her
stated return times are unreliable in proportion to mood, teaching distrust of her word with
no exposition. POC: a "check clock" button.

**Time passes always except during dialogue that doesn't require a response**, so slower
readers aren't penalized. Only the final line before a prompt advances the clock.

**Response timers** scale with mood (see §3 table). This is a stressful game by design and the
default should not be lax — but a global multiplier setting and a disable option outside the
two or three beats where the timer *is* the drama.

---

## 13. Input model — DECIDED

- **Text-only build:** verb menu.
- **After the visual layer:** hybrid — point-and-click on the room, with verbs revealed
  contextually per object.

### Why the verb set must lock early

The cost is asymmetric. Adding an **object** later is cheap — fallback rules already cover the
existing verbs, so a new object works the moment it's added. Adding a **verb** later is
expensive: every object in the game now needs an answer for it, and you're back-filling
hundreds of responses.

The relief: only **universal** verbs need locking. **Contextual** verbs attached to a single
object are free to add at any time, because only that object answers for them.

Verbs are also a thesis statement. `listen` as a universal verb is what declares this a game
about sound. The absence of a `lie` verb means deception lives purely in dialogue choices.

### Universal verbs — LOCKED (8)

| Verb | Time cost | Noise | Notes |
|---|---|---|---|
| `look` | Low (higher for distant targets) | None | The clock is a `look`, and it's across the room |
| `listen` | Medium | None | The verification action. Locates her below-decks |
| `take` | Low | Low–med | Fails on reach with an explanatory beat |
| `open` | Low | **High** | Drawers, boxes, the window |
| `move` | Med | Med | Creates baseline changes |
| `hide` | Med | Low | Two-target: object + place |
| `wait` | Variable | None | Spends time deliberately |
| `rest` | High | None | Buys back pain and stamina. Distinct from `wait` |

**Cut from the draft, with reasons:**
- `reach` — a gate, not an action. `take` fails on reach and explains why.
- `use` — use-X-on-Y explodes combinatorially. Make it contextual per object.
- `write` — journal-only. Contextual.
- `speak` — dialogue is its own mode, not a room verb.

**Contextual examples (free to add):** palm the pill · read the journal · pull the blanket
over your head · pry the window · look under the mattress

---

## 14. Legibility and onboarding

### Day 1 — beat sheet

Day 1 is the only place every system can be taught while mistakes are free. **Teach by doing,
never by telling.** The fiction is that the PC wakes and she explains what happened and that
she'll be caring for them — the risk is that this plays as a cutscene.

Three principles:

1. **Her explanation is a conversation, not a monologue.** Response prompts throughout. This
   teaches the timer and the dialogue system and puts the first affection/trust movement on
   the board.
2. **One completely free failure.** The player moves something, she catches it, she's warm
   about it, and she says what gave it away. That single scene teaches detection, the
   post-mortem convention, and her mood tells at once — at zero cost.
3. **End on a detail that doesn't fit.** She knows something she shouldn't, or her account of
   the accident doesn't match the injuries. One line. No follow-up, no acknowledgement.

| # | Beat | Teaches |
|---|---|---|
| 1 | Wake. `look` is the only verb available | The verb menu, at its simplest |
| 2 | Look at: ceiling, your leg, the room, **the stairwell** | Mobility tier 0; the "something is wrong" beat |
| 3 | She arrives — warm | The baseline every future mood reads against |
| 4 | The explanation, as dialogue with choices | Timer, dialogue, first meter movement |
| 5 | Water, then food | The care loop. Dependence |
| 6 | She gives the journal. Player writes. **She glances at it leaving** | The journal; a seed never mentioned again |
| 7 | Medication. Palming is simply available, never flagged | The keystone item, discovered not explained |
| 8 | She leaves. `listen` locates her below | Absence windows; sound as intel |
| 9 | Small interaction window — nightstand only | That acting is possible at all |
| 10 | She returns, notices, is kind, names the tell | **The free failure.** Detection + post-mortem |
| 11 | Night. The wrong detail. Sleep | The hook; sleep as time skip |

- **Every consequence stays traceable after Day 1 too.**
- **Every consequence is traceable.** When she catches you she says *what* gave you away —
  gloating or hurt, not helpful, but the player learns the rule either way.
- **Failure post-mortem.** On death or capture, a short screen naming the state facts that
  produced it. Players cannot infer a hidden model from outcomes alone, and if you make them
  try they'll assume the game is arbitrary.

---

## 15. Content boundaries

Intense, not depraved, through early development. The design should support genuinely intense
moments later; the POC doesn't need them.

Write the actual line down before content authoring begins rather than after. It's much harder
to walk back once it's in the fiction and it determines storefront eligibility.

Standard: content warnings up front, jumpscare toggle, skip for repeated care-loop scenes.

---

## 16. POC scope

- **One class:** the Mailman
- **Three days**, forced conclusion
- **One mobility transition:** tier 0 → tier 1
- **Meters:** affection, trust, suspicion. Confidence deferred
- **Four moods** with tells: warm, excited, irritable, angry
- **Objects:** nightstand, lamp, clock, water glass, pill bottle, journal, her chair, under the bed
- **Care loop:** one meal, one medication scene per day
- **Detection:** sight and noise. Claims ledger deferred
- **Journal:** manual entry, and she reads it
- **Three endings:** death, one escape attempt, one stay

**Build the ugly version first.** Clickable text boxes, object and action descriptions, no
prose. One drawer, one hiding action. If that loop isn't tense at this scale, no quantity of
additional systems will fix it — and that's the question the POC exists to answer.

---

## 17. Architecture spec changes

- Add `player.confidence` as a per-domain map (v2, but reserve the field now).
- Add `her.claims` and `her.roomBaseline` to state.
- Add a NOISE stage to the pipeline, between EFFECTS and DETECTION.
- Add `her.location` tracking below-decks, since noise thresholds depend on it.
- Beats need a `confidence` field so the renderer can select register variants.
- Verification actions (`listen`, `check clock`) need explicit time costs in `actions.json`.
- Single-writer table needs: confidence, baseline, claims, needs, pain, location.

---

## 18. Open questions

1. **Restart granularity on death** — full restart or day checkpoint?
2. **The fifth class.**
3. **Outside world pressure** — is anyone looking for you, and does the player know?
   (Deferred; each class has different background hooks.)
4. **How much of her backstory surfaces in one run?** Is full knowledge a multi-run goal?
5. **What's in the eaves boxes**, specifically. This is the content mine — it needs an inventory.
6. **Whose clothes are in the dresser?**
7. **What used to hang on the nail?**
