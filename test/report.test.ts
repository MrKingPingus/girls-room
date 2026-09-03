/**
 * Test reports.
 *
 * The point of a report is not the transcript, it is that the run can be put back on screen.
 * That rests entirely on the engine being deterministic — same seed, same moves, same game —
 * so if that ever quietly breaks, every report becomes fiction. These tests are the alarm.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';
import { loadGameContent } from '../app/load.ts';
import {
  buildReport, decodeMove, describeMove, encodeMove, type RecordedTurn,
} from '../app/report.ts';
import type { TurnInput } from '../engine/turn.ts';

const content = loadGameContent();

/** Play a list of moves and record them exactly as the browser build does. */
function record(seed: number, moves: TurnInput[]) {
  let state = newGame(content, { seed });
  const turns: RecordedTurn[] = [];
  for (const input of moves) {
    const result = takeTurn(state, content, input);
    state = result.state;
    turns.push({
      input,
      label: describeMove(content, input),
      beats: result.beats,
      trace: result.trace,
      after: state,
    });
  }
  return { turns, final: state };
}

const MOVES: TurnInput[] = [
  { action: 'wait', object: null, place: null },
  { action: 'look', object: 'her', place: null },
  { action: 'wait', object: null, place: null },
  { action: 'open', object: 'drawer', place: null },
  { action: 'look', object: 'drawer', place: null },
  { action: 'take', object: 'pill_bottle', place: null },
  { action: 'hide', object: 'pill_bottle', place: 'under_bed' },
];

test('a move survives being written down and read back', () => {
  for (const move of MOVES) {
    assert.deepEqual(decodeMove(encodeMove(move)), move);
  }
});

test('the replay line in a report reproduces the run exactly', () => {
  // This is the whole promise of a report. If it fails, a tester saying "look at turn 12" means
  // nothing, because turn 12 will be different when anyone else runs it.
  const original = record(4242, MOVES);

  const replayLine = buildReport({ seed: 4242, turns: original.turns, final: original.final })
    .match(/npm run replay -- (\d+) ?(.*)/);
  assert.ok(replayLine !== null, 'the report contains no replay line');

  const seed = Number(replayLine[1]);
  const moves = (replayLine[2] ?? '').split(' ').filter((m) => m !== '').map(decodeMove);
  const replayed = record(seed, moves);

  assert.deepEqual(replayed.final, original.final, 'the replay produced a different game');
  assert.deepEqual(
    replayed.turns.map((t) => [t.label, t.beats.map((b) => b.id), t.trace.ruleId]),
    original.turns.map((t) => [t.label, t.beats.map((b) => b.id), t.trace.ruleId]),
    'the replay produced a different transcript',
  );
});

test('two reports of the same run have identical transcripts', () => {
  const a = record(77, MOVES);
  const b = record(77, MOVES);
  const body = (r: ReturnType<typeof record>) =>
    buildReport({ seed: 77, turns: r.turns, final: r.final }).split('## Transcript')[1];
  assert.equal(body(a), body(b));
});

test('a report carries what is needed to act on it', () => {
  const { turns, final } = record(31337, MOVES);
  const report = buildReport({ seed: 31337, turns, final, note: 'the drawer felt wrong' });

  assert.match(report, /seed: `31337`/, 'no seed, so it cannot be replayed');
  assert.match(report, /npm run replay --/, 'no replay line');
  assert.match(report, /the drawer felt wrong/, 'the tester\'s note was dropped');
  assert.match(report, /"schemaVersion"/, 'no final state to inspect');
  assert.match(report, /rule /, 'no reasoning, so a wrong line cannot be traced to a rule');
  assert.match(report, /affection \d/, 'no meters');
});

test('a report of an empty session does not explode', () => {
  const state = newGame(content, { seed: 1 });
  const report = buildReport({ seed: 1, turns: [], final: state });
  assert.match(report, /npm run replay -- 1/);
});

test('the report never invents a move the player did not make', () => {
  const { turns, final } = record(5, MOVES);
  const report = buildReport({ seed: 5, turns, final });
  const replay = (report.match(/npm run replay -- \d+ (.*)/) ?? [])[1] ?? '';
  assert.equal(replay.split(' ').length, MOVES.length);
});
