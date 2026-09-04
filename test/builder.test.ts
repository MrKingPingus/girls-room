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
import { buildQuery } from '../engine/query.ts';
import { ruleMatches, selectRule } from '../engine/rules.ts';
import {
  addRung, addThing, addVerb, blankDraft, canBothMatch, describeCondition, fromCriteria,
  ladderFor, moveRung, removeThing, renameThing, rivals, toCriteria, toDraft, toPack, updateBeat,
  updateRule, verbsWithoutFallback, type ConditionRow, type Draft,
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
    id: 'keepsake', autoId: false, name: 'a small carved thing', place: 'nightstand',
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

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/** A matchbox with one named verb on it, built the way the ladder screen builds one. */
function built(): { draft: Draft; verb: string } {
  let draft = renameThing(
    addThing({ ...blankDraft(), pack: 'matches', title: 'Matches' }, 'nightstand'), 0, 'a matchbox',
  );
  draft = addVerb(draft, 0);
  const verb = draft.actions[0]?.id ?? '';
  draft = {
    ...draft,
    actions: draft.actions.map((action) => ({ ...action, name: 'Take the matches' })),
  };
  draft = updateBeat(draft, draft.beats[0]?.id ?? '', { text: 'You pick them up.' });
  return { draft, verb };
}

/** Add one exception to a verb: some conditions, and a line for when they hold. */
function exception(
  draft: Draft, verb: string, conditions: ConditionRow[], text: string,
): Draft {
  const before = new Set(draft.rules.map((rule) => rule.id));
  let next = addRung(draft, verb);
  const added = next.rules.find((rule) => !before.has(rule.id));
  next = updateRule(next, added?.id ?? '', { conditions });
  return updateBeat(next, added?.beats[0] ?? '', { text });
}

test('a new thing names itself, so nobody has to invent an id', () => {
  const { draft } = built();
  assert.equal(draft.objects[0]?.id, 'a_matchbox');
  assert.equal(draft.objects[0]?.name, 'a matchbox');
});

test('and an id somebody chose on purpose is left alone', () => {
  const { draft } = built();
  const chosen = draft.objects.map((object) => ({ ...object, autoId: false, id: 'matches' }));
  const locked = renameThing({ ...draft, objects: chosen }, 0, 'a box of matches');
  assert.equal(locked.objects[0]?.id, 'matches');
  assert.equal(locked.objects[0]?.name, 'a box of matches');
});

test('a new verb arrives with the rung that answers every time', () => {
  const { draft, verb } = built();
  const ladder = ladderFor(draft, verb);
  assert.equal(ladder.length, 1);
  assert.equal(ladder[0]?.otherwise, true,
    'without one there is a moment the game can reach where she says nothing');
});

test('the ladder is ordered most specific first, catch-all last', () => {
  const { draft, verb } = built();
  let next = exception(draft, verb, [
    { fact: 'she_is_here', test: 'is', values: ['true'] },
    { fact: 'mood', test: 'is', values: ['angry'] },
  ], '"Put those down."');
  next = exception(next, verb, [
    { fact: 'she_is_here', test: 'is', values: ['true'] },
  ], '"Those are not for you."');

  assert.deepEqual(ladderFor(next, verb).map((rung) => rung.specificity), [2, 1, 0]);
  assert.equal(ladderFor(next, verb).at(-1)?.otherwise, true);
});

test('rungs that would tie are given weights, so the order on screen is the real one', () => {
  const { draft, verb } = built();
  let next = exception(draft, verb, [{ fact: 'mood', test: 'is', values: ['warm'] }], '"Oh."');
  next = exception(next, verb, [{ fact: 'mood', test: 'is', values: ['angry'] }], '"Don\u2019t."');

  const tied = ladderFor(next, verb).filter((rung) => rung.specificity === 1);
  assert.equal(tied.length, 2);
  assert.notEqual(tied[0]?.rule.weight, tied[1]?.rule.weight,
    'two rungs at the same height is a coin flip, and the picture would be a lie');
});

test('a rung only moves among the rungs it is genuinely tied with', () => {
  const { draft, verb } = built();
  const next = exception(draft, verb,
    [{ fact: 'she_is_here', test: 'is', values: ['true'] }], '"Those are not for you."');
  const target = ladderFor(next, verb).find((rung) => !rung.otherwise)?.rule.id ?? '';

  // One condition cannot be pushed below none. The game decides that, not the author.
  const same = moveRung(next, verb, target, 1);
  assert.deepEqual(
    ladderFor(same, verb).map((rung) => rung.rule.id),
    ladderFor(next, verb).map((rung) => rung.rule.id),
  );
});

test('and does move among its equals', () => {
  const { draft, verb } = built();
  let next = exception(draft, verb, [{ fact: 'mood', test: 'is', values: ['warm'] }], '"Oh."');
  next = exception(next, verb, [{ fact: 'mood', test: 'is', values: ['angry'] }], '"Don\u2019t."');

  const before = ladderFor(next, verb).map((rung) => rung.rule.id);
  const moved = moveRung(next, verb, before[0] ?? '', 1);
  const after = ladderFor(moved, verb).map((rung) => rung.rule.id);
  assert.deepEqual(after, [before[1], before[0], before[2]]);
});

test('removing a thing takes its verbs and everything written for them', () => {
  const { draft } = built();
  const empty = removeThing(draft, 0);
  assert.deepEqual(empty.objects, []);
  assert.deepEqual(empty.actions, []);
  assert.deepEqual(empty.rules, []);
  assert.deepEqual(empty.beats, []);
});

test('the order on screen is the order the game really uses', () => {
  // The whole claim the ladder makes. If this fails, the picture is lying to an author.
  const { draft, verb } = built();
  const next = exception(draft, verb,
    [{ fact: 'she_is_here', test: 'is', values: ['true'] }], '"Those are not for you."');

  const merged = loadPacked(content, [toPack(next)]);
  let state = newGame(merged, { seed: 3131 });

  for (let turn = 0; turn < 30; turn += 1) {
    const facts = buildQuery(state, merged, {
      action: verb, object: 'a_matchbox', place: null, deferred: false,
      validity: { ok: true }, noise: null, detection: null,
    });

    const topmost = ladderFor(next, verb)
      .find((rung) => ruleMatches(toCriteria(rung.rule.conditions), facts));
    const chosen = selectRule(
      merged.reactions, verb, facts, state.meta.seed, state.meta.minutesElapsed,
    );

    assert.equal(chosen?.id, topmost?.rule.id,
      `turn ${turn}: the ladder showed ${topmost?.rule.id} but the game played ${chosen?.id}`);

    state = takeTurn(state, merged, { action: 'wait', object: null, place: null }).state;
  }
});

test('a scenario built entirely through the ladder loads and plays', () => {
  const { draft, verb } = built();
  const merged = loadPacked(content, [toPack(draft)]);
  const turn = takeTurn(newGame(merged, { seed: 8 }), merged,
    { action: verb, object: 'a_matchbox', place: null });
  assert.equal(turn.beats[0]?.text, 'You pick them up.');
});

test('ideas ride along with the scenario and never reach the game', () => {
  const { draft } = built();
  const note = { about: 'a_matchbox', text: 'could light a candle. she smells smoke on you.' };
  const pack = toPack({ ...draft, ideas: [note] });
  assert.deepEqual(pack.ideas, [note]);

  const merged = loadPacked(content, [pack]);
  const thing = merged.objects.find((object) => object.id === 'a_matchbox') ?? {};
  assert.equal('ideas' in thing, false, 'a design note is not something the engine should see');
});
