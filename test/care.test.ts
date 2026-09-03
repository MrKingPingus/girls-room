/**
 * The care loop — design doc §8. Dependence is the horror, and until this existed the only
 * thing the player could do to her was make her more suspicious.
 *
 * As with the other tests, these are written against what the design promises rather than
 * against the code that happens to implement it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';
import { dueCareNeed } from '../engine/care.ts';
import { buildMenu, buildRoomMenu } from '../render/menu.ts';
import { loadGameContent } from '../app/load.ts';
import type { GameState } from '../engine/state.ts';

const content = loadGameContent();
const start = (seed = 909) => newGame(content, { seed });

const wait = (state: GameState) =>
  takeTurn(state, content, { action: 'wait', object: null, place: null }).state;

/** Wind forward until she is holding something out, or give up. */
function untilSheOffers(want?: string): { state: GameState; need: string } {
  let state = start();
  for (let i = 0; i < 400; i++) {
    const need = dueCareNeed(state);
    if (need !== null && (want === undefined || need === want)) return { state, need };
    state = wait(state);
  }
  throw new Error(`she never offered ${want ?? 'anything'}`);
}

/** What the player can actually click on her right now. */
function herOptions(state: GameState): string[] {
  return buildRoomMenu(state, content).people.flatMap((g) => g.entries.map((e) => e.action));
}

test('accepting what she gives you raises affection', () => {
  // The whole point. Before the care loop, nothing in the game could move this number.
  const { state, need } = untilSheOffers();
  const answer = content.actions.find(
    (a) => a.effect === 'care_accept' && a.satisfies === need,
  );
  assert.ok(answer !== undefined, `nothing in the game can answer "${need}"`);

  const after = takeTurn(state, content, { action: answer.id, object: 'her', place: null });
  assert.equal(after.trace.validity.ok, true);
  assert.ok(after.state.her.affection > state.her.affection,
    'she felt nothing about being accepted');
});

test('refusing her costs you, and she says something about it', () => {
  const { state } = untilSheOffers();
  const after = takeTurn(state, content, { action: 'refuse_care', object: 'her', place: null });
  assert.ok(after.beats.length > 0);
  assert.ok(after.state.her.affection < state.her.affection);
});

test('she only offers while she is in the room and tending you', () => {
  let state = start();
  for (let i = 0; i < 400; i++) {
    if (dueCareNeed(state) !== null) {
      assert.equal(state.her.location, 'attic');
      assert.equal(state.her.activity, 'tending_you');
    }
    state = wait(state);
  }
});

test('you cannot answer a scene she has not started', () => {
  const state = start();
  assert.equal(dueCareNeed(state), null, 'the game opens mid-care-scene');
  const after = takeTurn(state, content, { action: 'eat', object: 'her', place: null });
  assert.deepEqual(after.trace.validity, { ok: false, reason: 'nothing_offered' });
  assert.ok(after.beats.length > 0, 'a refusal with no explanation');
});

test('the menu only offers the answer that fits the scene', () => {
  const { state, need } = untilSheOffers();
  const offered = herOptions(state);
  for (const action of content.actions) {
    if (action.effect !== 'care_accept' && action.effect !== 'care_palm') continue;
    const fits = action.satisfies === need;
    assert.equal(offered.includes(action.id), fits,
      `"${action.id}" ${fits ? 'should' : 'should not'} be offered for "${need}"`);
  }
});

test('palming puts a real pill in your hand — something that can be hidden and found', () => {
  // Design doc §8: palming "creates contraband that must be hidden and can be found". A
  // counter could not be hidden under a mattress, so it has to be a thing in the room.
  const { state } = untilSheOffers('medication');
  const after = takeTurn(state, content, { action: 'palm_pill', object: 'her', place: null });

  assert.equal(after.state.player.medication.dosesPalmed, 1);
  assert.deepEqual(after.state.objects['palmed_pill']?.location, { kind: 'carried' });
  assert.equal(after.state.objects['palmed_pill']?.known, true);

  // And it is hideable, which is the whole reason it is an object.
  const places = buildRoomMenu(after.state, content).objects
    .find((group) => group.objectId === 'palmed_pill')
    ?.entries.filter((entry) => entry.action === 'hide') ?? [];
  assert.ok(places.length > 0, 'the palmed pill cannot be hidden anywhere');
});

test('palming does not put it in you', () => {
  const { state } = untilSheOffers('medication');
  const palmed = takeTurn(state, content, { action: 'palm_pill', object: 'her', place: null });
  const swallowed = takeTurn(state, content, { action: 'swallow_pill', object: 'her', place: null });
  assert.ok(swallowed.state.player.medication.inSystem > palmed.state.player.medication.inSystem,
    'palming medicated you anyway');
});

test('she does not offer the same dose twice — palming is not a tap', () => {
  const { state } = untilSheOffers('medication');
  const after = takeTurn(state, content, { action: 'palm_pill', object: 'her', place: null }).state;
  assert.notEqual(dueCareNeed(after), 'medication',
    'she offered the pills again immediately, so palming is unlimited');
});

test('an untended leg goes on hurting, so she keeps needing to medicate it', () => {
  // Pain used to only ever fall. It drifted under the threshold where she offers pills and the
  // keystone item became permanently unreachable — invisible except in the statistics.
  let state = start();
  state = { ...state, player: { ...state.player,
    medication: { inSystem: 0, lastDoseAt: null, dosesTaken: 0, dosesPalmed: 0 },
    needs: { ...state.player.needs, woundCare: 80 } } };
  const before = state.player.pain;
  for (let i = 0; i < 20; i++) state = wait(state);
  assert.ok(state.player.pain > before, 'an untreated broken leg stopped hurting on its own');
});

test('the player can never choose to be offered care', () => {
  // Her half of the loop must never be a button. Caught by looking at the built page, not by
  // any test — the offer verbs take no target, so they landed in the general verb menu and the
  // player could click "She offers food" whenever they liked.
  const hers = new Set<string>(
    content.actions.filter((a) => a.offers !== undefined).map((a) => String(a.id)),
  );
  assert.ok(hers.size > 0, 'no care offers exist, so this proved nothing');

  let state = start();
  for (let i = 0; i < 300; i++) {
    for (const option of buildMenu(state, content)) {
      assert.ok(!hers.has(option.action),
        `"${option.label}" lets the player ask to be cared for`);
    }
    state = wait(state);
  }
});

test('she is a person, not furniture', () => {
  const { state } = untilSheOffers();
  for (const action of ['take', 'move', 'hide', 'open']) {
    const after = takeTurn(state, content, { action, object: 'her', place: 'under_bed' });
    assert.equal(after.trace.validity.ok, false, `the game let you ${action} her`);
    assert.ok(after.beats.length > 0);
  }
  // But she can be looked at, and that is how her mood is read at all.
  assert.equal(
    takeTurn(state, content, { action: 'look', object: 'her', place: null }).trace.validity.ok,
    true,
  );
});

test('looking at her reports the mood she is actually in', () => {
  // Design doc §3: every mood needs a diegetic tell, and the tells are the game. If looking at
  // her showed a tell for a mood she is not in, the player would be learning a lie.
  const seen = new Set<string>();
  for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) {
    let state = start(seed);
    for (let i = 0; i < 120; i++) {
      if (state.her.location === 'attic') {
        const turn = takeTurn(state, content, { action: 'look', object: 'her', place: null });
        const tell = turn.beats.find((beat) => beat.id.startsWith('her_'));
        if (tell !== undefined && tell.id !== 'her_absent') {
          assert.equal(tell.id, `her_${state.her.mood}`, 'the tell contradicts her real mood');
          seen.add(state.her.mood);
        }
      }
      state = wait(state);
    }
  }
  assert.ok(seen.size > 1, 'only ever saw one mood, so this proved very little');
});

test('she never runs out of things to be doing to you', () => {
  // A care scene with no answer in the menu is a scene the player is trapped in.
  let state = start();
  for (let i = 0; i < 500; i++) {
    if (dueCareNeed(state) !== null) {
      const options = herOptions(state);
      assert.ok(options.includes('refuse_care'), 'an offer you cannot even refuse');
      assert.ok(options.length > 3, 'an offer with nothing to answer it');
    }
    state = wait(state);
  }
});
