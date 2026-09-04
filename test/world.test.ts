/**
 * Tests for the day having a shape the player can hear.
 *
 * Her schedule was always real — she has been in the kitchen at eleven and back up at one
 * since it was written — but the game never mentioned any of it, so she read as teleporting in
 * and out for no reason. These are the tests for the fix: the world says its own piece, and it
 * says it once, in the right order, without talking over itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';
import { worldEvents } from '../engine/events.ts';
import { dueCareNeed, blockNow } from '../engine/care.ts';
import { buildMenu } from '../render/menu.ts';
import { loadGameContent } from '../app/load.ts';
import { validateContent } from '../engine/validate.ts';
import { MEALS, WORLD_EVENTS } from '../engine/vocab.ts';
import type { GameState } from '../engine/state.ts';

const content = loadGameContent();
const start = (seed = 4242) => newGame(content, { seed });

function wait(state: GameState) {
  return takeTurn(state, content, { action: 'wait', object: null, place: null });
}

/** Play `wait` until something is true, collecting every turn on the way. */
function until(pred: (state: GameState) => boolean, from: GameState = start(), max = 400) {
  const turns = [];
  let state = from;
  for (let i = 0; i < max && !pred(state); i += 1) {
    const turn = wait(state);
    turns.push({ before: state, ...turn });
    state = turn.state;
  }
  return { state, turns };
}

// ---------------------------------------------------------------------------
// She stops teleporting
// ---------------------------------------------------------------------------

test('the run opens with her downstairs, so the arrival is a scene', () => {
  assert.notEqual(start().her.location, 'attic');
});

test('she cannot come into the room without the game saying so', () => {
  const { turns } = until((state) => state.her.location === 'attic');
  const arrival = turns[turns.length - 1];
  assert.ok(arrival !== undefined, 'she never came up');
  assert.equal(arrival.state.her.location, 'attic');
  assert.ok(arrival.trace.eventRuleIds.length > 0, 'she walked in and nothing was said');
  assert.ok(arrival.beats.length > 0);
});

test('she cannot leave the room without the game saying so', () => {
  const { state: here } = until((s) => s.her.location === 'attic');
  const { turns } = until((s) => s.her.location !== 'attic', here);
  const departure = turns[turns.length - 1];
  assert.ok(departure !== undefined, 'she never left');
  assert.ok(departure.trace.eventRuleIds.length > 0, 'she walked out and nothing was said');
});

test('the stairs are a warning — they come before she is in the room', () => {
  const { turns } = until((state) => state.her.location === 'attic');
  const heard = turns.findIndex((turn) => turn.state.her.location === 'stairs');
  const arrived = turns.findIndex((turn) => turn.state.her.location === 'attic');
  assert.ok(heard >= 0, 'she never crossed the stairs — design doc §2b has no warning left');
  assert.ok(heard < arrived, 'the warning did not come before she did');
});

test('going down the stairs is a departure, not a second arrival warning', () => {
  const before = start();
  const leaving = {
    ...before,
    her: { ...before.her, location: 'attic' as const },
  };
  const onStairs = {
    ...before,
    her: { ...before.her, location: 'stairs' as const },
  };
  const events = worldEvents(leaving, onStairs);
  assert.ok(events.includes('she_leaves'));
  assert.ok(!events.includes('she_on_stairs'),
    'she gets a line about climbing unhurriedly on her way out of the room');
});

// ---------------------------------------------------------------------------
// The opening, which must happen exactly once
// ---------------------------------------------------------------------------

test('the day opens once, not on every refused move', () => {
  // A refusal costs no time, so a first-turn test written against the clock standing still
  // would replay the opening of the game until the player pressed something that worked.
  let state = start();
  let openings = 0;
  const count = (turn: ReturnType<typeof wait>) => {
    if (turn.trace.eventRuleIds.some((id) => id.startsWith('day_open'))) openings += 1;
  };

  for (let i = 0; i < 3; i += 1) {
    const refused = takeTurn(state, content, { action: 'look', object: 'nothing', place: null });
    assert.equal(refused.trace.validity.ok, false, 'the fixture needs a refusal');
    count(refused);
    state = refused.state;
  }
  assert.equal(openings, 0, 'the game opened on a move that never happened');

  const first = wait(state);
  count(first);
  state = first.state;
  assert.equal(openings, 1, 'the first real move did not open the day');

  for (let i = 0; i < 20; i += 1) {
    const turn = wait(state);
    count(turn);
    state = turn.state;
  }
  assert.equal(openings, 1, 'the opening of the game played more than once');
});

test('a new day says so', () => {
  const { turns } = until((state) => state.meta.day >= 2, start(), 800);
  const rollover = turns[turns.length - 1];
  assert.ok(rollover !== undefined, 'the run never reached day 2');
  assert.ok(rollover.trace.eventRuleIds.some((id) => id.startsWith('day_open')));
});

// ---------------------------------------------------------------------------
// What the world says is never the player's to press
// ---------------------------------------------------------------------------

test('nothing the world does for itself is a button', () => {
  const worldVerbs = content.actions
    .filter((action) => action.raisedBy !== undefined)
    .map((action) => action.id);
  assert.ok(worldVerbs.length > 0, 'the fixture needs world verbs');

  const { state: here } = until((s) => s.her.location === 'attic');
  for (const state of [start(), here]) {
    const offered = buildMenu(state, content).map((entry) => entry.action);
    for (const verb of worldVerbs) {
      assert.ok(!offered.includes(verb), `"${verb}" is something the player can click`);
    }
  }
});

test('every moment the world can raise has something to say for it', () => {
  for (const event of WORLD_EVENTS) {
    const verb = content.actions.find((action) => action.raisedBy === event);
    assert.ok(verb !== undefined, `"${event}" would happen in silence`);
    const rules = content.reactions.filter((rule) => rule.action === verb.id);
    assert.ok(rules.some((rule) => Object.keys(rule.when).length === 0),
      `"${event}" has no catch-all, so it can reach a moment with no line`);
  }
});

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

test('every day has all three meals', () => {
  for (const day of content.schedule) {
    const meals = day.blocks.flatMap((block) => (block.meal === undefined ? [] : [block.meal]));
    for (const meal of MEALS) {
      assert.ok(meals.includes(meal), `day ${day.day} has no ${meal}`);
    }
    assert.equal(new Set(meals).size, meals.length, `day ${day.day} has a meal twice`);
  }
});

test('she comes up for a meal, and there is food when she does', () => {
  // The point of marking a meal: whether she feeds you stops depending on whether hunger
  // happened to cross a number this hour, so the rhythm is learnable.
  let state = start();
  let mealsSeen = 0;
  for (let i = 0; i < 400; i += 1) {
    if (blockNow(state, content)?.meal !== undefined) {
      mealsSeen += 1;
      assert.equal(state.her.location, 'attic', 'a meal with her downstairs');
      assert.notEqual(dueCareNeed(state, content), null,
        'she is here for a meal and holding nothing out');
    }
    state = wait(state).state;
  }
  assert.ok(mealsSeen > 0, 'the run never reached a meal');
});

// ---------------------------------------------------------------------------
// Talking over itself
// ---------------------------------------------------------------------------

test('a line can tell that the world just did something', () => {
  const { turns } = until((state) => state.her.location === 'attic');
  const arrival = turns[turns.length - 1];
  assert.ok(arrival !== undefined);
  // "Time passes. She doesn't leave." is right up until the turn she walks in. The rule that
  // says it now checks this, so the fix lives in content rather than in the engine.
  assert.ok(!arrival.beats.some((beat) => beat.id === 'wait_watched'));
});

// ---------------------------------------------------------------------------
// Hard rule 9 — the new content shapes cannot fail quietly
// ---------------------------------------------------------------------------

function problemsFor(mutate: (bundle: Record<string, unknown>) => string): string {
  const bundle = JSON.parse(JSON.stringify({
    places: content.places, objects: content.objects, actions: content.actions,
    reactions: content.reactions, beats: content.beats, schedule: content.schedule,
  })) as Record<string, unknown>;
  const expectLevel = mutate(bundle);
  return validateContent(bundle)
    .filter((p) => p.level === expectLevel)
    .map((p) => `${p.where}: ${p.what}`).join('\n');
}

test('the shipped content is clean, warnings included', () => {
  assert.deepEqual(
    validateContent({
      places: content.places, objects: content.objects, actions: content.actions,
      reactions: content.reactions, beats: content.beats, schedule: content.schedule,
    }).filter((p) => p.level === 'error'),
    [],
  );
});

test('two verbs answering one world moment is refused — only one could ever fire', () => {
  const report = problemsFor((bundle) => {
    (bundle['actions'] as Record<string, unknown>[]).push({
      id: 'rival_arrival', name: 'x', universal: false, timeCost: 0, noise: 'silent',
      effect: 'none', concealable: false, target: 'none', raisedBy: 'she_arrives',
    });
    return 'error';
  });
  assert.match(report, /answer she_arrives — only one of them can ever fire/);
});

test('a world moment bound to an object would be a button, and is refused', () => {
  const report = problemsFor((bundle) => {
    const objects = bundle['objects'] as Record<string, unknown>[];
    const her = objects.find((object) => object['id'] === 'her');
    (her!['verbs'] as string[]).push('she_enters');
    return 'error';
  });
  assert.match(report, /would appear in the player's menu/);
});

test('a meal she is not in the room for is refused', () => {
  const report = problemsFor((bundle) => {
    const days = bundle['schedule'] as Record<string, unknown>[];
    const blocks = days[0]!['blocks'] as Record<string, unknown>[];
    const meal = blocks.find((block) => block['meal'] !== undefined)!;
    meal['location'] = 'kitchen';
    return 'error';
  });
  assert.match(report, /she is not in the attic tending you/);
});

test('a day missing a meal is a warning', () => {
  const report = problemsFor((bundle) => {
    const days = bundle['schedule'] as Record<string, unknown>[];
    const blocks = days[0]!['blocks'] as Record<string, unknown>[];
    delete blocks.find((block) => block['meal'] === 'lunch')!['meal'];
    return 'warning';
  });
  assert.match(report, /no lunch on day 1/);
});

test('a world moment nothing answers is a warning, not silence', () => {
  const report = problemsFor((bundle) => {
    const actions = bundle['actions'] as Record<string, unknown>[];
    delete actions.find((action) => action['raisedBy'] === 'night_falls')!['raisedBy'];
    return 'warning';
  });
  assert.match(report, /nothing answers "night_falls"/);
});

test('a condition naming a world moment that does not exist is refused', () => {
  const report = problemsFor((bundle) => {
    (bundle['reactions'] as Record<string, unknown>[]).push({
      id: 'probe', action: 'listen', when: { just_happened: { has: 'she_knocks' } },
      beats: ['l_generic'],
    });
    return 'error';
  });
  assert.match(report, /"she_knocks" is not one of/);
});
