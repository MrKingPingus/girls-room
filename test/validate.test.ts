/**
 * The validator's job is to fail loudly. These tests prove it does — each one breaks the
 * content in a specific, realistic way and checks the complaint points at the right place.
 *
 * The fixture is deliberately structural: ids and numbers, no game prose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateContent, loadContent, ContentError } from '../engine/validate.ts';
import { UNIVERSAL_VERBS } from '../engine/vocab.ts';

/** The smallest bundle that is actually legal: all eight verbs, each with a catch-all rule. */
function validBundle(): Record<string, unknown> {
  return {
    places: [
      { id: 'nightstand', name: 'the nightstand', reach: 0, concealment: 10, noiseModifier: 0 },
      { id: 'under_bed', name: 'under the bed', reach: 1, concealment: 70, noiseModifier: 0 },
    ],
    objects: [
      {
        id: 'water_glass', name: 'the water glass', container: false, portable: true,
        changeTier: 2, startsAt: { kind: 'placed', place: 'nightstand' },
      },
      {
        id: 'drawer', name: 'the drawer', container: true, portable: false,
        changeTier: 2, startsAt: { kind: 'placed', place: 'nightstand' },
        noise: { open: 'high' },
      },
    ],
    actions: UNIVERSAL_VERBS.map((id) => ({
      id, name: id, universal: true, timeCost: 1, noise: 'low',
      concealable: false, target: 'object',
    })),
    reactions: UNIVERSAL_VERBS.map((id) => ({
      id: `fallback_${id}`, action: id, when: {}, beats: [`b_${id}`],
    })),
    beats: Object.fromEntries(
      UNIVERSAL_VERBS.map((id) => [
        `b_${id}`,
        { speaker: 'narrator', text: 'placeholder', pose: 'absent', advancesClock: true },
      ]),
    ),
    schedule: [
      {
        day: 1,
        blocks: [
          { from: 0, to: 60, location: 'attic', activity: 'tending_you', attention: 0.8, phase: 'wake' },
          { from: 60, to: 480, location: 'kitchen', activity: 'cooking', attention: 0.1, phase: 'absence' },
        ],
      },
    ],
  };
}

/** All the complaints about a bundle, as one string, so tests can assert on substrings. */
function problemsFor(mutate: (b: Record<string, unknown>) => void): string {
  const bundle = validBundle();
  mutate(bundle);
  return validateContent(bundle).map((p) => `${p.level} ${p.where}: ${p.what}`).join('\n');
}

test('a well-formed bundle produces no complaints at all', () => {
  assert.deepEqual(validateContent(validBundle()), []);
});

test('loadContent returns the bundle when it is valid', () => {
  const bundle = validBundle();
  assert.equal(loadContent(bundle), bundle);
});

test('a typo in a beat id is caught, and names the rule it is in', () => {
  const report = problemsFor((b) => {
    (b['reactions'] as Record<string, unknown>[])[0]!['beats'] = ['b_lok'];
  });
  assert.match(report, /reactions\[0\]\.beats\[0\].*"b_lok" is not a beat/);
});

test('a typo in an object id is caught', () => {
  const report = problemsFor((b) => {
    (b['objects'] as Record<string, unknown>[])[0]!['startsAt'] =
      { kind: 'placed', place: 'nighstand' };
  });
  assert.match(report, /objects\[0\]\.startsAt\.place.*"nighstand" is not a place/);
});

test('a mood that does not exist is caught', () => {
  const report = problemsFor((b) => {
    (b['beats'] as Record<string, Record<string, unknown>>)['b_look']!['mood'] = 'cold';
  });
  assert.match(report, /beats\.b_look\.mood.*"cold" is not one of/);
});

test('a missing universal verb stops the game', () => {
  const report = problemsFor((b) => {
    b['actions'] = (b['actions'] as unknown[]).filter(
      (a) => (a as Record<string, unknown>)['id'] !== 'listen',
    );
  });
  assert.match(report, /universal verb "listen" is not defined/);
});

test('an action with no catch-all rule is caught, because she could say nothing', () => {
  const report = problemsFor((b) => {
    b['reactions'] = (b['reactions'] as Record<string, unknown>[]).map((r) =>
      r['action'] === 'hide' ? { ...r, when: { detected: true } } : r,
    );
  });
  assert.match(report, /action "hide" has no catch-all rule/);
});

test('a beat no rule can reach is a warning, not a crash', () => {
  const report = problemsFor((b) => {
    (b['beats'] as Record<string, unknown>)['b_orphan'] = {
      speaker: 'narrator', text: 'placeholder', pose: 'absent', advancesClock: true,
    };
  });
  assert.match(report, /warning beats\.b_orphan.*can never be seen/);
  assert.doesNotMatch(report, /error beats\.b_orphan/);
});

test('a gap in her day is caught', () => {
  const report = problemsFor((b) => {
    const day = (b['schedule'] as Record<string, unknown>[])[0]!;
    (day['blocks'] as Record<string, unknown>[])[1]!['from'] = 90;
  });
  assert.match(report, /gap in her day: nothing covers minute 60 to 90/);
});

test('overlapping blocks in her day are caught', () => {
  const report = problemsFor((b) => {
    const day = (b['schedule'] as Record<string, unknown>[])[0]!;
    (day['blocks'] as Record<string, unknown>[])[1]!['from'] = 30;
  });
  assert.match(report, /overlaps the previous block/);
});

test('an id defined twice is caught', () => {
  const report = problemsFor((b) => {
    (b['objects'] as unknown[]).push({
      id: 'drawer', name: 'the other drawer', container: true, portable: false,
      changeTier: 2, startsAt: { kind: 'placed', place: 'nightstand' },
    });
  });
  assert.match(report, /"drawer" is defined more than once/);
});

test('a ninth universal verb is refused', () => {
  const report = problemsFor((b) => {
    (b['actions'] as unknown[]).push({
      id: 'lie', name: 'lie', universal: true, timeCost: 1, noise: 'silent',
      concealable: true, target: 'none',
    });
  });
  assert.match(report, /"lie" is marked universal but is not one of the locked eight/);
});

test('she cannot speak while off screen', () => {
  const report = problemsFor((b) => {
    (b['beats'] as Record<string, Record<string, unknown>>)['b_look']!['speaker'] = 'her';
  });
  assert.match(report, /she is speaking but marked absent/);
});

test('every problem is reported at once, not one at a time', () => {
  const problems = validateContent(
    (() => {
      const b = validBundle();
      (b['reactions'] as Record<string, unknown>[])[0]!['beats'] = ['nope'];
      (b['objects'] as Record<string, unknown>[])[0]!['startsAt'] =
        { kind: 'placed', place: 'nope' };
      (b['beats'] as Record<string, Record<string, unknown>>)['b_look']!['mood'] = 'nope';
      return b;
    })(),
  );
  assert.ok(problems.filter((p) => p.level === 'error').length >= 3);
});

test('loadContent throws with the whole report attached', () => {
  const b = validBundle();
  (b['reactions'] as Record<string, unknown>[])[0]!['beats'] = ['nope'];
  assert.throws(
    () => loadContent(b),
    (error: unknown) => error instanceof ContentError && error.problems.length > 0,
  );
});

test('garbage in place of content does not throw, it complains', () => {
  assert.match(validateContent(null).map((p) => p.what).join(), /expected an object/);
  assert.match(validateContent('nope').map((p) => p.what).join(), /expected an object/);
});
