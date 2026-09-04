/**
 * The fact catalogue.
 *
 * Rules connect to the simulation by naming facts. Before this file existed, naming one that
 * didn't exist was invisible: the rule loaded, counted as specific, and never fired. You cannot
 * tell that apart from a rule that was simply never reached, which is the single most expensive
 * class of bug in a game made of rules.
 *
 * These tests are the alarm on that, and on the catalogue drifting away from the game.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame } from '../engine/newgame.ts';
import { buildQuery } from '../engine/query.ts';
import { validateContent } from '../engine/validate.ts';
import { ALL_FACTS, factSpec, nearestFact } from '../engine/facts.ts';
import { loadGameContent } from '../app/load.ts';
import type { ReactionRule } from '../engine/content.ts';

const content = loadGameContent();

/** The facts the game actually produces for a real moment. */
function bagFor(options: { deferred?: boolean } = {}) {
  return buildQuery(newGame(content, { seed: 99 }), content, {
    action: 'look', object: 'clock', place: null,
    deferred: options.deferred ?? false, knownBefore: [], events: [],
    validity: { ok: true }, noise: null, detection: null,
  });
}

/** Real content with one extra rule bolted on, so a bad condition is the only difference. */
function withRule(when: unknown): ReturnType<typeof validateContent> {
  const rule = { id: 'test_rule', action: 'look', when, beats: ['l_generic'] };
  return validateContent({
    ...content,
    reactions: [...content.reactions, rule as unknown as ReactionRule],
  });
}

function errorsOf(problems: ReturnType<typeof validateContent>): string[] {
  return problems.filter((p) => p.level === 'error').map((p) => `${p.where}: ${p.what}`);
}

// ---------------------------------------------------------------------------
// The catalogue and the game agree
// ---------------------------------------------------------------------------

test('every fact the catalogue promises on every turn is really there', () => {
  const bag = bagFor();
  for (const fact of ALL_FACTS) {
    if (fact.contextual === true) continue;
    assert.ok(fact.id in bag, `the catalogue lists "${fact.id}" but no turn produces it`);
  }
});

test('every fact the game produces is in the catalogue', () => {
  for (const name of Object.keys(bagFor())) {
    assert.notEqual(factSpec(name), null,
      `the game produces "${name}" but the catalogue does not list it, `
      + 'so no rule could be written against it and nothing would say why');
  }
});

test('the values the game produces are the values the catalogue promises', () => {
  const bag: Record<string, unknown> = bagFor();
  for (const fact of ALL_FACTS) {
    const value = bag[fact.id];
    if (value === undefined) continue;

    if (fact.kind === 'list') {
      assert.ok(Array.isArray(value), `${fact.id} is a list fact but did not come out as a list`);
      for (const one of value as unknown[]) {
        assert.equal(typeof one, 'string', `${fact.id} holds something that is not a name`);
      }
      continue;
    }

    const expected = fact.kind === 'flag' ? 'boolean' : fact.kind === 'number' ? 'number' : 'string';
    assert.equal(typeof value, expected, `${fact.id} is not ${fact.kind}`);

    if (fact.values !== undefined) {
      assert.ok((fact.values as readonly unknown[]).includes(value),
        `${fact.id} came out as "${String(value)}", which is not in its list of legal values`);
    }
    if (fact.range !== undefined && typeof value === 'number') {
      assert.ok(value >= fact.range[0] && value <= fact.range[1],
        `${fact.id} came out as ${value}, outside the range the catalogue states`);
    }
  }
});

test('the shipped content asks only about facts that exist', () => {
  assert.deepEqual(errorsOf(validateContent(content)), []);
});

// ---------------------------------------------------------------------------
// The bug this exists to catch
// ---------------------------------------------------------------------------

test('a mistyped condition is refused, and the message names the fact you meant', () => {
  const errors = errorsOf(withRule({ suspicon: 50 }));
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? '', /suspicon/);
  assert.match(errors[0] ?? '', /did you mean "suspicion"/);
});

test('a condition on a fact that never existed is refused too', () => {
  const errors = errorsOf(withRule({ her_favourite_colour: 'blue' }));
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? '', /not something the game knows about/);
});

// ---------------------------------------------------------------------------
// Values that could never be true
// ---------------------------------------------------------------------------

test('a mood that is not a mood is refused', () => {
  assert.match(errorsOf(withRule({ mood: 'wrm' }))[0] ?? '', /not one of: warm/);
});

test('a comparison beyond what a meter can reach is refused', () => {
  assert.match(errorsOf(withRule({ suspicion: { gte: 150 } }))[0] ?? '', /can never be true/);
});

test('a comparison on something that is not a number is refused', () => {
  assert.match(errorsOf(withRule({ mood: { gte: 2 } }))[0] ?? '', /cannot be compared/);
});

test('a yes-or-no fact given a word is refused', () => {
  assert.match(errorsOf(withRule({ she_is_here: 'yes' }))[0] ?? '', /write true or false/);
});

test('an object that is not in the room is refused', () => {
  assert.match(errorsOf(withRule({ object: 'clok' }))[0] ?? '', /not in objects\.json/);
});

test('a bare list is refused, with the shape that was meant', () => {
  const errors = errorsOf(withRule({ mood: ['warm', 'excited'] }));
  assert.match(errors[0] ?? '', /"in": \["warm","excited"\]/);
});

test('a made-up test is refused', () => {
  assert.match(errorsOf(withRule({ suspicion: { above: 50 } }))[0] ?? '', /is not a test/);
});

test('the tests that do exist are accepted', () => {
  assert.deepEqual(errorsOf(withRule({
    suspicion_tier: { gte: 2 },
    mood: { in: ['warm', 'excited'] },
    her_activity: { ne: 'sleeping' },
    attention: { lt: 0.5 },
    she_is_here: true,
    object: 'clock',
  })), []);
});

test('an empty test is allowed through, but noticed', () => {
  const problems = withRule({ mood: {} });
  assert.deepEqual(errorsOf(problems), []);
  assert.ok(problems.some((p) => p.level === 'warning' && /always true/.test(p.what)));
});

// ---------------------------------------------------------------------------
// The catalogue itself
// ---------------------------------------------------------------------------

test('no fact is listed twice, and every one is described', () => {
  const seen = new Set<string>();
  for (const fact of ALL_FACTS) {
    assert.ok(!seen.has(fact.id), `"${fact.id}" is listed twice`);
    seen.add(fact.id);
    assert.ok(fact.label.length > 0 && fact.about.length > 0,
      `"${fact.id}" needs a label and a line of help — the builder shows both to an author`);
    assert.doesNotMatch(fact.label, /_/,
      `"${fact.id}" has an id where its label should be — an author reads this off a dropdown`);
    assert.equal(fact.label, fact.label.toLowerCase(),
      `"${fact.id}" label should read as part of a sentence`);
  }
});

test('a name nothing resembles gets no suggestion', () => {
  assert.equal(nearestFact('xyzzy'), null);
});
