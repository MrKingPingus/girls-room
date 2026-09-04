/**
 * Scenario packs.
 *
 * A pack is content somebody else wrote, possibly somebody we have never met. Two things have
 * to hold for that to be safe to run: it can only ever be data, and it goes through exactly the
 * same checks as the game's own content — no quieter, no looser.
 *
 * The third thing these defend is that turning a pack off puts the game back exactly as it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadGameContent } from '../app/load.ts';
import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';
import { buildRoomMenu } from '../render/menu.ts';
import {
  applyPacks, hasOverrides, loadPacked, overriddenBy, validatePack, type ScenarioPack,
} from '../engine/pack.ts';
import { ContentError } from '../engine/validate.ts';

const base = loadGameContent();

/**
 * A pack literal, put through the same shape check a real pack file gets and then trusted.
 *
 * Ids in the engine are branded so a beat id cannot be passed where an object id belongs, which
 * means a plain literal is never one. Content solves this by being checked at run time rather
 * than trusted at compile time; these fixtures do the same, so a malformed one fails here
 * rather than confusing a test further down.
 */
function fixture(raw: Record<string, unknown>): ScenarioPack {
  const problems = validatePack(raw).filter((problem) => problem.level === 'error');
  assert.deepEqual(problems, [], 'the fixture itself is malformed');
  return raw as ScenarioPack;
}

/** A small, complete scenario: a thing on the nightstand, and a verb for turning it over. */
const KEEPSAKE = fixture({
  pack: 'keepsake',
  title: 'The thing on the sill',
  actions: [{
    id: 'turn_keepsake', name: 'Turn it over', universal: false, timeCost: 2,
    noise: 'silent', effect: 'inspect', concealable: true, target: 'object',
  }],
  objects: [{
    id: 'keepsake', name: 'a small carved thing', startsAt: { kind: 'placed', place: 'nightstand' },
    container: false, portable: true, changeTier: 2, knownAtStart: true, verbs: ['turn_keepsake'],
  }],
  reactions: [
    { id: 'keepsake_any', action: 'turn_keepsake', when: {}, beats: ['keepsake_generic'] },
    {
      id: 'keepsake_seen', action: 'turn_keepsake', when: { she_is_here: true },
      beats: ['keepsake_watched'], effects: { suspicion: 4 },
    },
  ],
  beats: {
    keepsake_generic: {
      speaker: 'narrator', text: 'It is heavier than it looks.',
      pose: 'absent', advancesClock: true,
    },
    keepsake_watched: {
      speaker: 'her', text: '"Careful with that."', pose: 'chair', advancesClock: true,
    },
  },
});

function packed(...packs: ScenarioPack[]) {
  return loadPacked(base, packs);
}

// ---------------------------------------------------------------------------
// Adding
// ---------------------------------------------------------------------------

test('a pack adds its rows to the game', () => {
  const content = packed(KEEPSAKE);
  assert.ok(content.objects.some((object) => object.id === 'keepsake'));
  assert.ok(content.actions.some((action) => action.id === 'turn_keepsake'));
  assert.equal(content.reactions.length, base.reactions.length + 2);
  assert.ok('keepsake_generic' in content.beats);
});

test('and the new verb reaches the player, and plays', () => {
  const content = packed(KEEPSAKE);
  const state = newGame(content, { seed: 7 });

  const menu = buildRoomMenu(state, content);
  const group = menu.objects.find((entry) => entry.objectId === 'keepsake');
  assert.ok(group !== undefined, 'the new thing is not in the room');
  assert.ok(group.entries.some((entry) => entry.action === 'turn_keepsake'));

  const turn = takeTurn(state, content, { action: 'turn_keepsake', object: 'keepsake', place: null });
  assert.ok(turn.beats.length > 0);
  // The pack's own line has to reach the player. Other beats may ride along on the same turn:
  // the world says its own piece when a day opens or she moves between floors.
  assert.ok(turn.beats.some((beat) => beat.id.startsWith('keepsake_')),
    'the pack loaded but its line never reached the player');
});

test('the base game is left exactly as it was', () => {
  const before = JSON.stringify(base);
  applyPacks(base, [KEEPSAKE]);
  assert.equal(JSON.stringify(base), before, 'merging changed the content it merged onto');
});

test('turning a pack off puts the game back', () => {
  assert.deepEqual(applyPacks(base, []), base);
});

// ---------------------------------------------------------------------------
// Overriding
// ---------------------------------------------------------------------------

const RETUNE = fixture({
  pack: 'retune',
  title: 'She says less',
  beats: {
    thanks_warm: {
      speaker: 'her', text: '"Mm."', pose: 'bedside', advancesClock: true,
    },
  },
});

test('a pack that reuses an id replaces what was there', () => {
  const content = packed(RETUNE);
  assert.equal(content.beats['thanks_warm']?.text, '"Mm."');
  assert.equal(Object.keys(content.beats).length, Object.keys(base.beats).length);
});

test('and it says so before it happens', () => {
  const overrides = overriddenBy(base, RETUNE);
  assert.deepEqual(overrides.beats, ['thanks_warm']);
  assert.ok(hasOverrides(overrides));
  assert.ok(!hasOverrides(overriddenBy(base, KEEPSAKE)), 'a pack that adds is not an override');
});

test('later packs win over earlier ones', () => {
  const louder = fixture({
    pack: 'louder', title: 'Louder',
    beats: { thanks_warm: {
      speaker: 'her', text: '"Enough."', pose: 'bedside', advancesClock: true,
    } },
  });
  assert.equal(packed(RETUNE, louder).beats['thanks_warm']?.text, '"Enough."');
  assert.equal(packed(louder, RETUNE).beats['thanks_warm']?.text, '"Mm."');
});

// ---------------------------------------------------------------------------
// A pack gets no easier a ride than the game's own content
// ---------------------------------------------------------------------------

test('a pack cannot smuggle in a rule that could never fire', () => {
  const broken = {
    ...KEEPSAKE,
    reactions: [
      ...(KEEPSAKE.reactions ?? []),
      {
        id: 'keepsake_typo', action: 'turn_keepsake',
        when: { suspicon: 50 }, beats: ['keepsake_generic'],
      },
    ],
  } as unknown as ScenarioPack;
  assert.throws(() => packed(broken), (error: unknown) => {
    assert.ok(error instanceof ContentError);
    assert.match(error.message, /did you mean "suspicion"/);
    return true;
  });
});

test('a pack whose verb has no catch-all is refused, like any other content', () => {
  const noFallback = fixture({
    ...KEEPSAKE,
    reactions: [{
      id: 'keepsake_seen', action: 'turn_keepsake',
      when: { she_is_here: true }, beats: ['keepsake_watched'],
    }],
  });
  assert.throws(() => packed(noFallback), /catch-all/);
});

test('a pack naming a beat it never wrote is refused', () => {
  const dangling = fixture({ ...KEEPSAKE, beats: {} });
  assert.throws(() => packed(dangling), /is not a beat in beats\.json/);
});

// ---------------------------------------------------------------------------
// The pack file itself
// ---------------------------------------------------------------------------

function errorsOf(problems: ReturnType<typeof validatePack>): string[] {
  return problems.filter((p) => p.level === 'error').map((p) => `${p.where}: ${p.what}`);
}

test('a well-formed pack passes its own shape check', () => {
  assert.deepEqual(errorsOf(validatePack(KEEPSAKE)), []);
});

test('a pack needs an id and a title', () => {
  assert.equal(errorsOf(validatePack({})).length, 2);
  assert.match(errorsOf(validatePack({ pack: 'Not An Id', title: 'x' }))[0] ?? '', /lower case/);
});

test('a pack cannot change the room or her routine yet', () => {
  const errors = errorsOf(validatePack({ ...KEEPSAKE, places: [] }));
  assert.match(errors[0] ?? '', /stage 3/);
});

test('a pack that defines the same row twice is refused', () => {
  const twice = { ...KEEPSAKE, objects: [...(KEEPSAKE.objects ?? []), KEEPSAKE.objects?.[0]] };
  assert.match(errorsOf(validatePack(twice))[0] ?? '', /appears twice/);
});

test('a field nothing reads is a warning, not a refusal', () => {
  const problems = validatePack({ ...KEEPSAKE, mood: 'warm' });
  assert.deepEqual(errorsOf(problems), []);
  assert.ok(problems.some((p) => p.level === 'warning' && /nothing reads/.test(p.what)));
});

test('a proof-of-play must actually be one', () => {
  assert.match(
    errorsOf(validatePack({ ...KEEPSAKE, tested: { seed: 'x', moves: [] } }))[0] ?? '',
    /must be a number/,
  );
});
