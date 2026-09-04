/**
 * Girl's Room — starting a run.
 *
 * INIT. It builds the whole state once from the content files, a class, and a seed, and then
 * never runs again. It is one of the three writers that isn't a pipeline stage, which is why
 * it is named explicitly in the single-writer table — an unnamed second writer is the exact
 * thing that table exists to prevent.
 */

import type { GameState, ObjectState } from './state.ts';
import type { ContentBundle } from './content.ts';
import type { PlayerClass } from './vocab.ts';

export const SCHEMA_VERSION = 1;

export function newGame(
  content: ContentBundle,
  options: { seed: number; playerClass?: PlayerClass } ,
): GameState {
  const objects: { [id: string]: ObjectState } = {};
  for (const def of content.objects) {
    objects[def.id] = {
      location: def.startsAt,
      open: def.container ? false : null,
      on: def.togglable === true ? false : null,
      // Design doc §14, day 1 beat 2: the player wakes and looks. Tier 0 is their whole world,
      // so what sits within reach of the bed is known from the first moment; everything else
      // has to be discovered.
      known: def.knownAtStart ?? isWithinReach(content, def.id, 0),
      searched: false,
      damaged: false,
    };
  }

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      day: 1,
      minutesElapsed: 0,
      seed: options.seed,
      playerClass: options.playerClass ?? 'mailman',
    },
    world: {
      phase: 'wake',
      light: 'daylight',
      temperature: 'comfortable',
      weather: 'overcast',
      doorBelow: 'open', // design doc §2a. She doesn't need a lock. That's the point
    },
    player: {
      mobility: 0, // bedbound. The whole POC is the climb to tier 1
      pain: 45,
      energy: 40,
      // She dosed you before you woke up. It is the first thing the state says about her, and
      // it means the first medication scene arrives when it wears off rather than at minute 0.
      needs: { hunger: 20, thirst: 25, hygiene: 20, toileting: 25, woundCare: 40 },
      medication: { inSystem: 60, lastDoseAt: 0, dosesTaken: 1, dosesPalmed: 0 },
      knows: [],
      confidence: { physical: 50, social: 50, deception: 50, observation: 50 }, // v2. Unread
    },
    her: {
      affection: 40,
      trust: 50,
      suspicion: 5,
      mood: 'warm',        // design doc §14: the baseline every future mood is read against
      disposition: 'content',
      stress: 20,
      // Design doc §14 beats 1-3: you wake alone, you take the room in, and *then* she comes
      // up. Starting her at the bedside would spend the game's first scene before the player
      // has pressed anything, and the arrival is the beat the rest of the day is read against.
      attention: 0.1,
      location: 'kitchen',
      activity: 'cooking',
      statedReturnAt: null,
      believes: [],
      claims: [],
      priors: [],
      roomBaseline: {},
    },
    objects,
    pending: [],
    history: [],
  };
}

function isWithinReach(content: ContentBundle, objectId: string, tier: number): boolean {
  const object = content.objects.find((def) => def.id === objectId);
  if (object === undefined) return false;
  const start = object.startsAt;
  if (start.kind !== 'placed') return false;
  const place = content.places.find((def) => def.id === start.place);
  return place !== undefined && place.reach <= tier;
}
