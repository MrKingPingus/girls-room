/**
 * Girl's Room — headless test harness.
 *
 * Architecture §8: in a systemic game you cannot find content gaps by playing. A rule that
 * stopped firing looks exactly like a rule that was never reached, and no amount of playing
 * will tell you which. You find them statistically instead.
 *
 * This plays the game thousands of times with no screen and no human, then reports:
 *
 *   - beats that never fired         either unreachable, or a criterion with a typo in it
 *   - rules that never won           the same problem one level up
 *   - runs that got stuck            no valid action left, which is a dead end
 *   - where suspicion and affection actually land, per day
 *
 *   npm run sim -- --runs 2000
 */

import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';
import { buildMenu } from '../render/text.ts';
import { loadGameContent } from '../app/load.ts';
import { pick, roll } from '../engine/random.ts';

const args = process.argv.slice(2);
const runs = Number(args[args.indexOf('--runs') + 1]) || 500;
const policyName = args.indexOf('--policy') === -1 ? 'random' : args[args.indexOf('--policy') + 1];
// Enough that a run reaches the end of day 3 rather than being cut off inside day 2. The
// number is turns, not minutes, so it has to be generous: the cheapest verbs cost a minute,
// and a random player takes a lot of them. If day 3's row in the report ever comes back with
// far fewer runs than day 1's, this is the first thing to check — the game did not get
// shorter, the runs stopped early and the last day went untested.
const maxTurns = Number(args[args.indexOf('--turns') + 1]) || 3000;

const content = loadGameContent();

/**
 * Play it safe while she is in the room: look, listen, wait her out — and take the care she
 * offers, which is the whole point of the loop. Never palm anything in front of her.
 */
function cautious(menu: ReturnType<typeof buildMenu>, sheIsHere: boolean) {
  const safe = new Set(['look', 'listen', 'wait', 'rest', 'read_journal']);
  for (const action of content.actions) {
    if (action.effect === 'care_accept' || action.effect === 'talk') safe.add(action.id);
  }
  return sheIsHere ? menu.filter((entry) => safe.has(entry.action)) : menu;
}

/**
 * Cautious, and restrained during her absences too: touches something in the room roughly one
 * turn in eight rather than ransacking it the moment she is gone.
 *
 * This is the policy that answers the question the POC exists to ask. `cautious` only behaves
 * while she is watching, which is not the same as playing well — if restraint during absences
 * does not buy anything measurable, the player's choices are not doing any work.
 */
function sparing(
  menu: ReturnType<typeof buildMenu>, sheIsHere: boolean, seed: number, turn: number,
) {
  const safe = cautious(menu, true);
  if (sheIsHere) return safe;
  if (roll(seed, turn, 'restraint') < 0.125) return menu;
  return safe.length > 0 ? safe : menu;
}

const beatsFired = new Set<string>();
const rulesWon = new Set<string>();
const stuck: number[] = [];
const stalled: number[] = [];
const byDay = new Map<number, { suspicion: number[]; affection: number[]; trust: number[] }>();
let totalTurns = 0;

for (let run = 0; run < runs; run++) {
  const seed = run * 7919 + 13;
  let state = newGame(content, { seed });
  let frozenFor = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const menu = buildMenu(state, content);
    if (menu.length === 0) {
      stuck.push(seed);
      break;
    }

    // Two policies, because they answer different questions. `random` is the worst case and
    // finds content nothing reaches. `cautious` plays the way a careful person would — never
    // touching anything while she is in the room — and answers the question that actually
    // matters: can you play well and stay safe? If both end at the same suspicion, the
    // player's choices aren't doing anything and the game has no game in it.
    const options = policyName === 'cautious'
      ? cautious(menu, state.her.location === 'attic')
      : policyName === 'sparing'
        ? sparing(menu, state.her.location === 'attic', seed, turn)
        : menu;
    const choice = pick(seed, turn, 'policy', options.length > 0 ? options : menu);
    if (choice === null) break;

    const before = state.meta.day;
    const clockBefore = state.meta.minutesElapsed;
    const result = takeTurn(state, content, {
      action: choice.action, object: choice.object, place: choice.place,
    });
    state = result.state;
    totalTurns++;

    // A menu full of buttons that all refuse is worse than an empty one: the game looks like
    // it is working while the clock has stopped and nothing the player presses will ever
    // change that. Thirty turns without the clock moving is not a player being careful.
    frozenFor = state.meta.minutesElapsed === clockBefore ? frozenFor + 1 : 0;
    if (frozenFor >= 30) {
      stalled.push(seed);
      break;
    }

    for (const beat of result.beats) beatsFired.add(beat.id);
    if (result.trace.ruleId !== null) rulesWon.add(result.trace.ruleId);

    if (state.meta.day !== before) {
      const bucket = byDay.get(before) ?? { suspicion: [], affection: [], trust: [] };
      bucket.suspicion.push(state.her.suspicion);
      bucket.affection.push(state.her.affection);
      bucket.trust.push(state.her.trust);
      byDay.set(before, bucket);
    }

    if (state.meta.day > 3) break;
  }
}

const deadBeats = Object.keys(content.beats).filter((id) => !beatsFired.has(id));
const deadRules = content.reactions.filter((rule) => !rulesWon.has(rule.id)).map((r) => r.id);

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

console.log(`\n  ${runs} runs, ${totalTurns} turns, ${policyName} policy\n`);

console.log(`  beats fired    ${beatsFired.size}/${Object.keys(content.beats).length}`);
console.log(`  rules won      ${rulesWon.size}/${content.reactions.length}`);
console.log(`  stuck runs     ${stuck.length}   (nothing to press)`);
console.log(`  stalled runs   ${stalled.length}   (buttons that never move the clock)`);

if (deadBeats.length > 0) {
  console.log(`\n  DEAD BEATS (${deadBeats.length}) — nothing ever reached these.`);
  console.log('  Check each: a typo\'d criterion looks exactly like this.');
  for (const id of deadBeats) console.log(`    ${id}`);
}
if (deadRules.length > 0) {
  console.log(`\n  RULES THAT NEVER WON (${deadRules.length}):`);
  for (const id of deadRules) console.log(`    ${id}`);
}
if (stuck.length > 0) {
  console.log(`\n  STUCK SEEDS: ${stuck.slice(0, 10).join(', ')}`);
}

console.log('\n  at each day boundary:');
for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
  const bucket = byDay.get(day);
  if (bucket === undefined) continue;
  console.log(
    `    day ${day}  suspicion ${mean(bucket.suspicion).toFixed(1).padStart(5)}` +
    `   affection ${mean(bucket.affection).toFixed(1).padStart(5)}` +
    `   trust ${mean(bucket.trust).toFixed(1).padStart(5)}` +
    `   (${bucket.suspicion.length} runs)`,
  );
}
console.log('');

// A stuck run is always a bug: the player is looking at a screen with nothing to press.
// Dead beats are reported, not fatal — some refusals exist for renderers that don't exist yet
// (a parser, or the point-and-click layer) and cannot be reached from a verb menu.
if (stalled.length > 0) {
  console.log(`  STALLED SEEDS: ${stalled.slice(0, 10).join(', ')}`);
}

if (stuck.length > 0 || stalled.length > 0) process.exit(1);
