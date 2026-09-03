/**
 * Tests for the pipeline, written against the hard rules rather than against the code.
 *
 * These are the invariants that, if they break, break the visual-novel conversion or the
 * ability to debug the simulation at all. Each test names the rule it defends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';
import { buildMenu } from '../render/text.ts';
import { loadGameContent } from '../app/load.ts';
import type { GameState } from '../engine/state.ts';

const content = loadGameContent();
const start = () => newGame(content, { seed: 4242 });

/** Play a list of moves and hand back where it ended up. */
function play(moves: [string, string | null, string | null][], state: GameState = start()) {
  let current = state;
  const beats = [];
  for (const [action, object, place] of moves) {
    const turn = takeTurn(current, content, { action, object, place });
    current = turn.state;
    beats.push(...turn.beats);
  }
  return { state: current, beats };
}

/** Wind forward until she is somewhere else in the house. */
function untilSheLeaves(state: GameState = start()): GameState {
  let current = state;
  for (let i = 0; i < 200 && current.her.location === 'attic'; i++) {
    current = takeTurn(current, content, { action: 'wait', object: null, place: null }).state;
  }
  return current;
}

test('hard rule 2 — the whole game survives being saved and loaded', () => {
  const { state } = play([['look', 'drawer', null], ['open', 'drawer', null], ['wait', null, null]]);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('hard rule 5 — every beat carries portrait, scene and audio', () => {
  const { beats } = play([
    ['look', 'drawer', null], ['open', 'drawer', null], ['listen', null, null],
    ['take', 'water_glass', null], ['wait', null, null], ['light_lamp', 'lamp', null],
  ]);
  assert.ok(beats.length > 0);
  for (const beat of beats) {
    assert.ok(beat.portrait !== undefined, `${beat.id} has no portrait`);
    assert.ok(beat.scene !== undefined, `${beat.id} has no scene`);
    assert.ok(beat.audio !== undefined, `${beat.id} has no audio`);
    assert.ok(beat.scene.light !== undefined && beat.scene.timeOfDay !== undefined);
    if (beat.portrait.onScreen) {
      assert.ok(beat.portrait.mood !== undefined && beat.portrait.pose !== undefined);
    }
  }
});

test('hard rule 8 — a refused action still says something', () => {
  // The pill bottle starts shut inside the drawer and the player has never seen it.
  const turn = takeTurn(start(), content, { action: 'take', object: 'pill_bottle', place: null });
  assert.equal(turn.trace.validity.ok, false);
  assert.ok(turn.beats.length > 0, 'a refusal produced no beat — that is a dead end');
  assert.ok(turn.beats[0]!.text.length > 0);
});

test('hard rule 8 — nothing the menu offers can produce silence', () => {
  let state = start();
  for (let turn = 0; turn < 120; turn++) {
    const menu = buildMenu(state, content);
    assert.ok(menu.length > 0, 'the player has nothing to press');
    const choice = menu[turn % menu.length]!;
    const result = takeTurn(state, content, {
      action: choice.action, object: choice.object, place: choice.place,
    });
    assert.ok(result.beats.length > 0, `"${choice.label}" produced no beat at all`);
    state = result.state;
  }
});

test('the same seed and the same moves produce the same game, exactly', () => {
  const moves: [string, string | null, string | null][] = [
    ['look', 'drawer', null], ['open', 'drawer', null], ['wait', null, null],
    ['listen', null, null], ['wait', null, null], ['look', 'clock', null],
  ];
  assert.deepEqual(play(moves).state, play(moves).state);
});

test('reach gates the hands, not the eyes — the clock is across the room', () => {
  const state = start();
  assert.equal(state.player.mobility, 0);
  const looking = takeTurn(state, content, { action: 'look', object: 'clock', place: null });
  assert.equal(looking.trace.validity.ok, true, 'could not look at the clock from the bed');

  const taking = takeTurn(state, content, { action: 'take', object: 'clock', place: null });
  assert.deepEqual(taking.trace.validity, { ok: false, reason: 'out_of_reach' });
});

test('looking makes no sound and leaves no trace, wherever the thing is', () => {
  const turn = takeTurn(start(), content, { action: 'look', object: 'clock', place: null });
  assert.equal(turn.trace.noise.heard, false);
  assert.equal(turn.trace.detection.outcome, 'unnoticed');
});

test('single writer — EFFECTS cannot move a meter', async () => {
  const effects = await import('../engine/stages/effects.ts');
  const before = start();
  const after = effects.run(before, content, { action: 'open', object: 'drawer', place: null }, { ok: true });
  assert.deepEqual(after.her, before.her, 'the room-changing stage touched her');
  assert.notDeepEqual(after.objects, before.objects, 'the room-changing stage changed nothing');
});

test('single writer — APPRAISAL cannot move an object', async () => {
  const appraisal = await import('../engine/stages/appraisal.ts');
  const before = start();
  const after = appraisal.run(
    before, content, 'open', { action: 'open', detected: true }, 2, null,
  );
  assert.deepEqual(after.state.objects, before.objects, 'the meter stage moved something');
  assert.deepEqual(after.state.world, before.world);
});

test('tampering while she is out waits for her instead of firing now', () => {
  const alone = untilSheLeaves();
  assert.notEqual(alone.her.location, 'attic');

  const turn = takeTurn(alone, content, { action: 'open', object: 'drawer', place: null });
  assert.equal(turn.trace.detection.outcome, 'noticed_later');
  assert.equal(turn.state.pending.length, 1);
  // She is two floors down. Suspicion may drift with the quiet, but it must not spike.
  assert.ok(turn.state.her.suspicion <= alone.her.suspicion, 'she reacted before finding it');
});

test('and it lands on her, about the drawer, once she is back in the room', () => {
  let state = takeTurn(untilSheLeaves(), content,
    { action: 'open', object: 'drawer', place: null }).state;
  const suspicionBefore = state.her.suspicion;

  let landed = null;
  for (let i = 0; i < 300 && landed === null; i++) {
    const turn = takeTurn(state, content, { action: 'wait', object: null, place: null });
    state = turn.state;
    if (turn.trace.detection.fired !== null) landed = turn;
  }

  assert.ok(landed !== null, 'she never found the open drawer');
  assert.equal(landed.trace.ruleId, 'late_open_found',
    'she reacted to being waited at, not to the drawer she just found');
  assert.ok(state.her.suspicion > suspicionBefore);
  assert.equal(state.pending.length, 0);
});

test('meters can come down again — an uneventful hour is a move', () => {
  let state = start();
  state = { ...state, her: { ...state.her, suspicion: 60, trust: 20 } };
  const settled = play(Array.from({ length: 8 },
    () => ['wait', null, null] as [string, null, null]), state).state;
  assert.ok(settled.her.suspicion < 60, 'suspicion is a one-way ratchet');
  assert.ok(settled.her.trust > 20, 'trust never recovers');
});

test('the clock never stops, not even at night', () => {
  // Sleep is a forced time skip (design doc §12), not a state the player has to guess their
  // way out of. If every action is refused, refusals cost no time, and the clock freezes —
  // a menu full of buttons that do nothing, which looks exactly like a working game.
  let state = start();
  let frozen = 0;
  let sawSleep = false;

  for (let turn = 0; turn < 700; turn++) {
    const before = state.meta.minutesElapsed;
    state = takeTurn(state, content, { action: 'wait', object: null, place: null }).state;
    if (state.world.phase === 'sleep') sawSleep = true;
    frozen = state.meta.minutesElapsed === before ? frozen + 1 : 0;
    assert.ok(frozen < 5, `the clock stopped during "${state.world.phase}"`);
  }

  assert.ok(sawSleep, 'never reached the night, so this proved nothing');
  assert.ok(state.meta.day > 1, 'never reached the next day');
});

test('her mood is rolled by the world, not by what the player did', async () => {
  // Two different seeds, identical play. If mood only ever came from player actions these
  // would match, and she would read as a mechanism rather than a person (design doc §3).
  const moods = [11, 22, 33, 44, 55, 66].map((seed) => {
    let state = newGame(content, { seed });
    for (let i = 0; i < 120; i++) {
      state = takeTurn(state, content, { action: 'wait', object: null, place: null }).state;
    }
    return state.her.mood;
  });
  assert.ok(new Set(moods).size > 1, 'her mood never varies with anything but the player');
});
