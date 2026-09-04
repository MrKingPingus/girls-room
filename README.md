# Girl's Room

A systemic one-room horror/dating sim. You are bedbound in a converted attic, cared for by a
woman who will not let you leave.

Text-only for now. **Built so the visual novel layer can be dropped on later without rewriting
any game logic** — nearly every rule in `CLAUDE.md` exists to protect that.

## Running it

Needs [Node](https://nodejs.org) 22.18 or newer. Nothing else — no build step to think about.

```bash
npm install

npm run dev      # the clickable build, in a browser. This is the one you want
npm run play     # the same game in a terminal
npm run check    # typecheck + tests
npm run sim      # play it 500 times with nobody watching, and report what broke
npm run replay -- <seed> <moves...>   # put a reported run back on screen
```

## Reporting a problem you hit while playing

In the game, **Report a problem** at the bottom. Write down what looked wrong, then download it
or copy it. The file has the transcript, the reasoning behind each turn (which rule fired,
whether she noticed, what the meters did), the whole save, and — the part that matters — a
**replay line**:

```
npm run replay -- 813218377 wait wait look:her open:drawer
```

Because the engine is pure and every roll comes from the seed, that command reproduces the run
move for move: same moods, same detection rolls, same everything. A replayed transcript is
byte-for-byte identical to the reported one, so it can be diffed. That turns "she did something
odd around lunchtime" into a thing anyone can put back on screen in one command.

`npm run sim` is not optional after changing anything in `engine/` or `content/`. In a game
made of interacting rules you cannot find the gaps by playing — a rule that stopped firing
looks exactly like a rule that was never reached. You find them statistically. It reports
beats nothing can reach, rules that never win, runs with nothing to press, and runs where the
clock stopped moving.

## Deploying

**Cloudflare.** The repo can stay private; Cloudflare builds private repos on the free plan.
GitHub Pages would require making it public.

Cloudflare's current flow deploys the site as a Worker that serves static files. In the
dashboard, **Workers & Pages -> Create -> Import a repository**, pick this repo, then:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`  (this is the default; it reads `wrangler.toml`)

**The branch matters.** Cloudflare builds one branch. The whole project must be on it — if it
builds a branch that has no `package.json`, the build fails with `ENOENT ... package.json`
before it does anything else. Point it at whichever branch actually holds the code (normally
`main`).

`wrangler.toml` and `.node-version` are in the repo, so the deploy settings are
version-controlled rather than living only in a dashboard. The page fetches nothing from
anywhere, so `public/_headers` locks it to exactly that: anything that later tries to reach
off-site fails loudly in the browser console instead of quietly working.

## How it is laid out

```
docs/      the design and the architecture. The source of truth
engine/    the game. Pure — no screen, no disk, no clock. Runs anywhere
content/   the game's data. Objects, verbs, her routine, her reactions, every line
render/    turns beats into something you can see. Swappable
app/       wiring. Loading, saving, the browser build, and the dev tools
sim/       the headless harness
test/      160 tests, written against the hard rules rather than the code
```

Read `docs/one-room-sim-architecture.md` and `docs/girls-room-design-doc.md` before changing
anything. `CLAUDE.md` has the rules that must not be broken and why.

## Writing a scenario without writing any code

There is a second tab, **Scenarios**. It is a dev tool — no player ever sees it — and it writes
new moments for the game: a thing in the room, a verb for doing something to it, the rules for
how she answers, and the lines she says. Switch one on and it is in the room; export it and it
is one file you can hand to somebody.

None of that is code. Content in this game is data by design, so a scenario a playtester writes
can only ever be more data. It is checked by exactly the same validator the game itself loads
through, live, while you type.

The panel worth knowing about is **"which rule wins"**. Her responses are chosen by whichever
rule has the most conditions that hold right now; ties break by weight, and a tie on weight is
a coin flip *every single time*. That is invisible looking at a rule on its own, and it has
already caused one real bug here. The builder names the rules that answer the same moment, says
who takes it and why, and offers to settle a coin flip before it can happen.

`docs/scenario-builder.md` has the whole design. **It is currently parked** — it works, but the
game has no way yet for one scenario to lead to another, so everything you can author with it
ends where it starts. §13 of that doc says where it stopped; §14 tracks what it owes.

## Where it is up to

Playable: three days with a shape you can hear, the eight verbs, sound, deferred discovery, the
care loop, saves, and exportable test reports that replay move for move.

**Her day is legible now.** You wake alone. You hear her on the stairs before you see her, she
comes up and tells you what happened to you and what she intends, and there is breakfast. She
goes, and you hear the house empty out under you. She is back at one, and at seven. At night
she turns the light off at the top of the stairs, and on the first night you are left with one
detail that does not fit. Her schedule was always in the content files — what it was missing
was any way for the player to hear it happening.

**A moment can now lead to another one.** A verb can teach the player something, and any later
rule or verb can read it back — so what you author no longer has to end where it starts. The
nail on the wall is the worked example: look closer at the outline and you learn that whatever
hung there came down recently, which unlocks a question for her that was not there before. None
of that is code — two fields on a verb and an ordinary condition. Design doc §19 and
architecture §6a.

You can ask her three things that have the game in them — how long you are here, whether anyone
knows where you are, and where a trauma kit like that came from — and each one costs you
something. Two of the room's details can be worked out and then asked about: the nail, and the
kit.

Not built yet: **anything else a rule can change.** Knowledge is the only mark a moment can
leave. It cannot move an object, and she cannot act on the room herself. She never comes up
off-schedule, so nothing you do can bring her.

Also not built: the mobility 0→1 climb, the journal, the three endings, response prompts in
dialogue, and sleep as a time skip — the night currently passes fifteen minutes at a time. The
builder's stage 3 is deferred, and the builder cannot write knowledge or the world's own lines.

**Most of the text is still placeholder.** Her explanation on day 1, the arrival and departure
lines, the three questions and the two details you can work out are drafted rather than
stand-in — they are meant to be argued with, not kept. Everything else is stand-in. Design doc
§16 calls for the ugly version first; `content/README.md` says which files hold it and what
replacing it involves.
