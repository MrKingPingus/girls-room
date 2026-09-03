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
app/       wiring. Loading, saving, the browser build
sim/       the headless harness
test/      33 tests, written against the hard rules rather than the code
```

Read `docs/one-room-sim-architecture.md` and `docs/girls-room-design-doc.md` before changing
anything. `CLAUDE.md` has the rules that must not be broken and why.

## Where it is up to

Playable: three days, the eight verbs, eight objects, her routine, sound, deferred discovery,
re-baselining, saves.

Not built yet: **the care loop** — meals, medication, accepting or refusing help. This is the
biggest hole and the harness says so plainly: affection never moves in any run, because nothing
in the game can raise it. She can only ever become more suspicious. Also missing: the mobility
0→1 climb, the journal, palming pills, and the three endings.

**Every line of text is placeholder.** Design doc §16 calls for the ugly version first;
`content/README.md` says which files hold it and what replacing it involves.
