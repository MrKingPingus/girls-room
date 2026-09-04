/**
 * The scenario builder's thinking.
 *
 * The forms are not the interesting part. These cover the two things that would make the tool
 * lie to an author: turning what they filled in into content that means what they meant, and
 * working out which rule actually wins — the part of the system nobody can eyeball, and the
 * part that already cost us a real bug when two new rules quietly tied with an existing one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadGameContent } from '../app/load.ts';
import { loadPacked } from '../engine/pack.ts';
import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';
import {
  blankDraft, canBothMatch, describeCondition, fromCriteria, rivals, toCriteria, toDraft, toPack,
  verbsWithoutFallback, type Draft,
} from '../app/builder.ts';

const content = loadGameContent();

// ---------------------------------------------------------------------------
// What an author fills in, and what it becomes
// ---------------------------------------------------------------------------

test('the tests on the dropdown become the conditions in the file', () => {
  assert.deepEqual(
    toCriteria([
      { fact: 'she_is_here', test: 'is', values: ['true'] },
      { fact: 'suspicion', test: 'at_least', values: ['50'] },
      { fact: 'mood', test: 'one_of', values: ['warm', 'excited'] },
      { fact: 'her_activity', test: 'is_not', values: ['sleeping'] },
      { fact: 'attention', test: 'less_than', values: ['0.5'] },
    ]),
    {
      she_is_here: true,
      suspicion: { gte: 50 },
      mood: { in: ['warm', 'excited'] },
      her_activity: { ne: 'sleeping' },
      attention: { lt: 0.5 },
    },
  );
});

test('and can be read back into the form, unchanged', () => {
  const rows = [
    { fact: 'she_is_here' as const, test: 'is' as const, values: ['true'] },
    { fact: 'suspicion' as const, test: 'at_least' as const, values: ['50'] },
    { fact: 'mood' as const, test: 'one_of' as const, values: ['warm', 'excited'] },
  ];
  assert.deepEqual(toCriteria(fromCriteria(toCriteria(rows))), toCriteria(rows));
});

test('a half-filled condition is left out rather than written as nonsense', () => {
  assert.deepEqual(toCriteria([{ fact: 'mood', test: 'is', values: [] }]), {});
  assert.deepEqual(toCriteria([{ fact: '', test: 'is', values: ['warm'] }]), {});
});

test('a condition reads as a sentence', () => {
  assert.equal(
    describeCondition({ fact: 'suspicion', test: 'at_least', values: ['50'] }),
    'suspicion is at least 50',
  );
  assert.equal(
    describeCondition({ fact: 'she_is_here', test: 'is', values: ['true'] }),
    'she is in the room: yes',
  );
});

// ---------------------------------------------------------------------------
// Which rule wins
// ---------------------------------------------------------------------------

test('two rules with one condition each and no weight are a coin flip', () => {
  // This is the exact shape of a bug we shipped: a rule keyed on `repeated` was added to stop
  // a pleasantry being farmed for affection, tied with `thank_warm`, and so only worked half
  // the time. Nothing on screen said so. Now something does.
  const found = rivals(content, {
    id: 'thank_repeat', action: 'thank_her', when: { repeated: true }, weight: 0,
  });
  assert.equal(found.find((rival) => rival.rule.id === 'thank_warm')?.outcome, 'coin_flip');
});

test('and weight settles it, which is what the fix for that bug was', () => {
  const found = rivals(content, {
    id: 'thank_repeat', action: 'thank_her', when: { repeated: true }, weight: 10,
  });
  const rival = found.find((entry) => entry.rule.id === 'thank_warm');
  assert.equal(rival?.outcome, 'you_win');
  assert.equal(rival?.reason, 'weight');
});

test('the weight the game actually ships is enough to have settled it', () => {
  const shipped = content.reactions.find((rule) => rule.id === 'thank_repeat');
  const found = rivals(content, {
    id: 'thank_repeat', action: 'thank_her',
    when: shipped?.when ?? {}, weight: shipped?.weight ?? 0,
  });
  assert.equal(found.some((rival) => rival.outcome === 'coin_flip'), false);
});

test('more conditions beats fewer, whatever the weight', () => {
  const found = rivals(content, {
    id: 'mine', action: 'thank_her',
    when: { repeated: true, she_is_here: true, mood: 'warm' }, weight: 0,
  });
  const rival = found.find((entry) => entry.rule.id === 'thank_repeat');
  assert.equal(rival?.outcome, 'you_win', 'three conditions lost to one with a heavier weight');
  assert.equal(rival?.reason, 'conditions');
});

test('a rule is never told it competes with itself', () => {
  assert.ok(!rivals(content, {
    id: 'thank_warm', action: 'thank_her', when: { mood: 'warm' }, weight: 0,
  }).some((rival) => rival.rule.id === 'thank_warm'));
});

test('rules that could never both be true are not reported as rivals', () => {
  assert.equal(canBothMatch({ mood: 'warm' }, { mood: 'angry' }), false);
  assert.equal(canBothMatch({ suspicion: { gte: 80 } }, { suspicion: { lte: 20 } }), false);
  assert.equal(canBothMatch({ mood: { in: ['warm'] } }, { mood: { in: ['angry'] } }), false);
  assert.equal(canBothMatch({ she_is_here: true }, { she_is_here: false }), false);
});

test('and rules that could are', () => {
  assert.equal(canBothMatch({ mood: 'warm' }, { suspicion: { gte: 50 } }), true);
  assert.equal(canBothMatch({ suspicion: { gte: 40 } }, { suspicion: { lte: 60 } }), true);
  assert.equal(canBothMatch({ mood: { in: ['warm', 'angry'] } }, { mood: 'angry' }), true);
  assert.equal(canBothMatch({ mood: { ne: 'warm' } }, { mood: 'angry' }), true);
});

// ---------------------------------------------------------------------------
// A whole scenario, from the forms to the room
// ---------------------------------------------------------------------------

const SILL: Draft = {
  ...blankDraft(),
  pack: 'sill',
  title: 'The thing on the sill',
  objects: [{
    id: 'keepsake', name: 'a small carved thing', place: 'nightstand',
    container: false, portable: true, togglable: false, knownAtStart: true,
    changeTier: 2, verbs: ['turn_keepsake'],
  }],
  actions: [{
    id: 'turn_keepsake', name: 'Turn it over', timeCost: 2, noise: 'silent',
    effect: 'inspect', concealable: true, target: 'object', satisfies: '',
  }],
  beats: [
    { id: 'keepsake_look', speaker: 'narrator', text: 'It is heavier than it looks.', pose: 'absent', mood: '' },
    { id: 'keepsake_then', speaker: 'narrator', text: 'There is a name scratched under it.', pose: 'absent', mood: '' },
    { id: 'keepsake_seen', speaker: 'her', text: '"Careful with that."', pose: 'chair', mood: '' },
  ],
  rules: [
    { id: 'keepsake_any', action: 'turn_keepsake', conditions: [], beats: ['keepsake_look', 'keepsake_then'],
      affection: 0, trust: 0, suspicion: 0, dispositionPressure: 0, weight: 0 },
    { id: 'keepsake_caught', action: 'turn_keepsake',
      conditions: [{ fact: 'she_is_here', test: 'is', values: ['true'] }],
      beats: ['keepsake_seen'], affection: 0, trust: 0, suspicion: 4, dispositionPressure: 0, weight: 0 },
  ],
};

test('a scenario written in the forms loads into the game', () => {
  const merged = loadPacked(content, [toPack(SILL)]);
  assert.ok(merged.objects.some((object) => object.id === 'keepsake'));
});

test('and it plays', () => {
  const merged = loadPacked(content, [toPack(SILL)]);
  const state = newGame(merged, { seed: 11 });
  const turn = takeTurn(state, merged, { action: 'turn_keepsake', object: 'keepsake', place: null });
  assert.ok(turn.beats.length > 0);
  assert.ok(turn.beats.every((beat) => beat.id.startsWith('keepsake_')));
});

test('a line that is not the last of its scene does not charge the player time', () => {
  const pack = toPack(SILL);
  assert.equal(pack.beats?.['keepsake_look']?.advancesClock, false, 'mid-scene lines are free');
  assert.equal(pack.beats?.['keepsake_then']?.advancesClock, true, 'the last line before a choice');
});

test('a scenario survives being exported and opened again', () => {
  const there = toPack(SILL);
  const back = toPack(toDraft(JSON.parse(JSON.stringify(there))));
  assert.deepEqual(back, there);
});

test('meters left at zero are not written into the file at all', () => {
  const pack = toPack(SILL);
  assert.equal(pack.reactions?.[0]?.effects, undefined);
  assert.deepEqual(pack.reactions?.[1]?.effects, { suspicion: 4 });
});

test('a new verb with no catch-all is named before the validator has to refuse it', () => {
  assert.deepEqual(verbsWithoutFallback(SILL), []);
  assert.deepEqual(
    verbsWithoutFallback({ ...SILL, rules: SILL.rules.filter((rule) => rule.id !== 'keepsake_any') }),
    ['turn_keepsake'],
  );
});
