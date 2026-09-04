/**
 * Girl's Room — replay a test report.
 *
 *   npm run replay -- 920505564 wait wait look:drawer open:drawer
 *
 * The engine is pure and every roll comes from the seed, so this reproduces a reported run
 * exactly — same moods, same detection rolls, same everything. Paste the replay line out of a
 * test report and the bug is back on screen, with the reasoning for each turn printed beside it.
 *
 * `--state` also dumps the save at the end, for when the question is "what did the numbers
 * actually look like" rather than "what did she say".
 */

import { loadGameContent } from '../app/load.ts';
import { buildReport, replayMoves } from '../app/report.ts';

const args = process.argv.slice(2);
const showState = args.includes('--state');
const positional = args.filter((arg) => !arg.startsWith('--'));
const seed = Number(positional[0]);

if (!Number.isFinite(seed)) {
  console.error('usage: npm run replay -- <seed> [move ...]');
  console.error('  a move is action:object:place, e.g. open:drawer or hide:pill_bottle:under_bed');
  console.error('  paste the line out of a test report');
  process.exit(1);
}

const content = loadGameContent();

// The same transcript the tester saw, from the same three inputs: seed, moves, content — and
// through the very same function the browser builds its report with.
const { turns, final } = replayMoves(content, seed, positional.slice(1));
const report = buildReport({ seed, turns, final });
console.log(showState ? report : report.split('## Final state')[0]);
