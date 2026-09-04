/**
 * Tests for the knowledge ladder — design doc §19, and the thing that lets one authored
 * moment lead to another instead of ending where it starts.
 *
 * Two halves, and both have to hold or the ladder is decorative: a verb can teach the player
 * something, and a later rule or verb can read it back. The tests below are written against
 * the behaviour an author is promised, not against the code that happens to provide it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';
import { buildRoomMenu } from '../render/menu.ts';
import { loadGameContent } from '../app/load.ts';
import { validateContent } from '../engine/validate.ts';
import { criterionHolds } from '../engine/rules.ts';
import type { GameState } from '../engine/state.ts';

const content = loadGameContent();
const start = () => newGame(content, { seed: 4242 });

function move(state: GameState, action: string, object: string | null = null) {
  return takeTurn(state, content, { action, object, place: null });
}

/** Wind forward until she is in the room, so the topics on her are on the menu at all. */
function untilSheIsHere(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 400 && current.her.location !== 'attic'; i += 1) {
    current = move(current, 'wait').state;
  }
  return current;
}

function topicsOnHer(state: GameState): string[] {
  const her = buildRoomMenu(state, content).people.find((group) => group.objectId === 'her');
  return (her?.entries ?? []).map((entry) => entry.action);
}

// ---------------------------------------------------------------------------
// The teaching half
// ---------------------------------------------------------------------------

test('a verb that teaches something puts it in what the player knows', () => {
  const before = start();
  assert.deepEqual(before.player.knows, [], 'a new run starts knowing nothing');

  const after = move(before, 'study_nail', 'nail').state;
  assert.deepEqual(after.player.knows, ['nail_recently_emptied']);
});

test('learning the same thing twice does not record it twice', () => {
  let state = start();
  for (let i = 0; i < 3; i += 1) state = move(state, 'study_nail', 'nail').state;
  assert.deepEqual(state.player.knows, ['nail_recently_emptied']);
});

test('a verb that teaches nothing leaves what the player knows alone', () => {
  const state = move(move(start(), 'look', 'clock').state, 'listen').state;
  assert.deepEqual(state.player.knows, []);
});

test('hard rule 2 — knowledge survives being saved and loaded', () => {
  const { state } = move(start(), 'study_nail', 'nail');
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

// ---------------------------------------------------------------------------
// The reading-back half
// ---------------------------------------------------------------------------

test('a topic gated on knowledge is refused until it is earned, in character', () => {
  const here = untilSheIsHere(start());
  assert.equal(here.her.location, 'attic', 'the fixture needs her in the room');

  const refused = move(here, 'ask_about_nail', 'her');
  assert.equal(refused.trace.validity.ok, false);
  assert.equal(
    refused.trace.validity.ok === false ? refused.trace.validity.reason : null,
    'dont_know_that_yet',
  );

  // Hard rule 8: a refusal is a scene, never a dead button.
  assert.ok(refused.beats.length > 0, 'being unable to ask still produces a line');
  assert.ok(refused.beats.every((beat) => beat.text.trim() !== ''));
});

test('the same topic is allowed once the thing has been worked out', () => {
  const learned = move(untilSheIsHere(start()), 'study_nail', 'nail').state;
  const asked = move(untilSheIsHere(learned), 'ask_about_nail', 'her');
  assert.equal(asked.trace.validity.ok, true);
});

test('an unearned topic is not on the menu at all, and appears once it is earned', () => {
  const here = untilSheIsHere(start());
  assert.ok(topicsOnHer(here).includes('thank_her'), 'the fixture needs her topics listed');
  assert.ok(!topicsOnHer(here).includes('ask_about_nail'));

  const learned = untilSheIsHere(move(here, 'study_nail', 'nail').state);
  assert.ok(topicsOnHer(learned).includes('ask_about_nail'));
});

// ---------------------------------------------------------------------------
// The ordering that makes "the first time" authorable at all
//
// The stage that grants knowledge runs before the stage that picks her reaction. If the rule
// database were asked about the current picture, the turn a verb teaches something would
// already read as "they know this" — and the scene of working it out could never be written.
// It would fail silently, which is the exact shape of bug hard rule 9 exists to prevent.
// ---------------------------------------------------------------------------

test('the turn something is worked out is the turn the first-time rule fires', () => {
  const first = move(start(), 'study_nail', 'nail');
  assert.equal(first.trace.ruleId, 'study_nail_any');

  const again = move(first.state, 'study_nail', 'nail');
  assert.equal(again.trace.ruleId, 'study_nail_known');
});

// ---------------------------------------------------------------------------
// Asking about a list of names
// ---------------------------------------------------------------------------

test('has and lacks read a list of names one at a time', () => {
  assert.equal(criterionHolds({ has: 'a' }, ['a', 'b']), true);
  assert.equal(criterionHolds({ has: 'c' }, ['a', 'b']), false);
  assert.equal(criterionHolds({ lacks: 'c' }, ['a', 'b']), true);
  assert.equal(criterionHolds({ lacks: 'a' }, ['a', 'b']), false);
  assert.equal(criterionHolds({ has: 'a' }, []), false);

  // Nothing else is a list, so asking a plain fact this way is never quietly true.
  assert.equal(criterionHolds({ has: 'a' }, 'a'), false);
});

// ---------------------------------------------------------------------------
// Hard rule 9 — none of this may fail quietly
// ---------------------------------------------------------------------------

/** The shipped content, with one thing broken, as one string of complaints. */
function problemsFor(mutate: (bundle: Record<string, unknown>) => void): string {
  const bundle = JSON.parse(JSON.stringify({
    places: content.places, objects: content.objects, actions: content.actions,
    reactions: content.reactions, beats: content.beats, schedule: content.schedule,
  })) as Record<string, unknown>;
  mutate(bundle);
  return validateContent(bundle).map((p) => `${p.level} ${p.where}: ${p.what}`).join('\n');
}

function actionNamed(bundle: Record<string, unknown>, id: string): Record<string, unknown> {
  const found = (bundle['actions'] as Record<string, unknown>[]).find((a) => a['id'] === id);
  assert.ok(found !== undefined, `the fixture needs an action called ${id}`);
  return found;
}

test('the shipped content is clean, warnings included', () => {
  assert.deepEqual(validateContent({
    places: content.places, objects: content.objects, actions: content.actions,
    reactions: content.reactions, beats: content.beats, schedule: content.schedule,
  }).filter((p) => p.level === 'error'), []);
});

test('requiring something nothing teaches is refused, and says how to fix it', () => {
  const report = problemsFor((bundle) => {
    actionNamed(bundle, 'ask_about_nail')['requiresKnown'] = ['nail_recently_emptid'];
  });
  assert.match(report, /nothing in the game teaches "nail_recently_emptid"/);
  assert.match(report, /teaches/);
});

test('a condition naming knowledge nothing teaches is refused', () => {
  const report = problemsFor((bundle) => {
    (bundle['reactions'] as Record<string, unknown>[]).push({
      id: 'probe', action: 'listen', when: { knows: { has: 'she_has_a_sister' } },
      beats: ['l_generic'],
    });
  });
  assert.match(report, /nothing in the game teaches "she_has_a_sister"/);
});

test('asking a list of names the ordinary way is refused, with the shape that works', () => {
  const report = problemsFor((bundle) => {
    (bundle['reactions'] as Record<string, unknown>[]).push({
      id: 'probe', action: 'listen', when: { knows: 'nail_recently_emptied' },
      beats: ['l_generic'],
    });
  });
  assert.match(report, /holds several names at once/);
  assert.match(report, /"has": "nail_recently_emptied"/);
});

test('comparing a list of names with more-than is refused', () => {
  const report = problemsFor((bundle) => {
    (bundle['reactions'] as Record<string, unknown>[]).push({
      id: 'probe', action: 'listen', when: { knows: { gte: 2 } }, beats: ['l_generic'],
    });
  });
  assert.match(report, /cannot be compared with more-than or less-than/);
});

test('has on a fact that holds one value is refused', () => {
  const report = problemsFor((bundle) => {
    (bundle['reactions'] as Record<string, unknown>[]).push({
      id: 'probe', action: 'listen', when: { mood: { has: 'warm' } }, beats: ['l_generic'],
    });
  });
  assert.match(report, /holds one value, not several/);
});

test('a universal verb that teaches is refused — it would teach off every object', () => {
  const report = problemsFor((bundle) => {
    actionNamed(bundle, 'look')['teaches'] = ['nail_recently_emptied'];
  });
  assert.match(report, /is a universal verb/);
});

test('knowledge nothing ever asks about is a warning, like a beat nothing reaches', () => {
  const report = problemsFor((bundle) => {
    actionNamed(bundle, 'study_nail')['teaches'] = ['nail_recently_emptied', 'a_dead_end'];
  });
  assert.match(report, /warning .*"a_dead_end" is taught but nothing ever asks about it/);
});
