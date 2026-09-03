/**
 * Girl's Room — the playable text build.
 *
 * Design doc §16: build the ugly version first. Clickable text boxes, a verb menu, no art.
 * If the loop isn't tense at this scale, no quantity of additional systems will fix it — and
 * that is the only question this build exists to answer.
 *
 *   npm run play
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';
import { buildMenu, renderBeats, renderStatus } from '../render/text.ts';
import { loadGameContent } from './load.ts';

const content = loadGameContent();
const seed = Number(process.argv[2] ?? Math.floor(Math.random() * 1e9));

let state = newGame(content, { seed });

const io = createInterface({ input: stdin, output: stdout });

console.log('\n  GIRL\'S ROOM — text build');
console.log(`  seed ${seed}. Type a number, or "q" to stop.\n`);
console.log('  You wake in a room with a sloped ceiling. Your leg is splinted.');
console.log('  There is a hole in the floor at the far end with stairs going down.\n');

for (;;) {
  console.log(`  [ ${renderStatus(state)} ]\n`);

  const menu = buildMenu(state, content);
  for (const entry of menu) console.log(`   ${entry.key.padStart(2)}. ${entry.label}`);

  const answer = (await io.question('\n  > ')).trim().toLowerCase();
  if (answer === 'q' || answer === 'quit') break;

  const chosen = menu.find((entry) => entry.key === answer);
  if (chosen === undefined) {
    console.log('\n  Not one of the options.\n');
    continue;
  }

  const turn = takeTurn(state, content, {
    action: chosen.action,
    object: chosen.object,
    place: chosen.place,
  });
  state = turn.state;

  console.log('');
  console.log(renderBeats(turn.beats));
  console.log('');

  if (state.meta.day > 3) {
    console.log('  Three days. That is as far as this build goes.\n');
    break;
  }
}

io.close();
