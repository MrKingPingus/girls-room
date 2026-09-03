/**
 * Stage 4 — NOISE. How loud was that, and what covered it?
 *
 * Writes nothing. It works out whether the sound of what you just did reached her.
 *
 * Design doc §2b: your floor is her ceiling. Noise values aren't arbitrary numbers here, they
 * are structural — a drawer is loud, a glass is quiet, the eaves are worse than either — and
 * players work them out immediately without being told. Her own noise runs the other way:
 * water running and the television are cover windows, and learning to listen for them is a
 * skill the game never has to explain.
 */

import type { GameState } from './../state.ts';
import type { ContentBundle } from './../content.ts';
import type { NoiseLevel, Activity, HouseLocation } from './../vocab.ts';
import type { TurnInput } from './../turn.ts';
import type { ValidityResult } from './validity.ts';
import { isHandsOn, placeOf } from './../room.ts';
import { chance } from './../random.ts';

export type NoiseResult = {
  level: NoiseLevel;

  /** Did the sound actually reach her, given where she is and what she's doing? */
  heard: boolean;
};

const LEVELS: NoiseLevel[] = ['silent', 'low', 'medium', 'high'];

/** How much of her own noise she is making. Higher means better cover for you. */
const COVER: Record<Activity, number> = {
  washing: 3,       // water running — the best window in the house
  watching_tv: 2,
  cooking: 2,
  cleaning: 2,
  on_phone: 1,
  away: 4,          // she isn't in the house at all
  sleeping: 2,
  unknown: 1,
  tending_you: 0,   // she is right here
  sitting_with_you: 0,
};

/** How much the house muffles you, by where she is standing in it. */
const DISTANCE: Record<HouseLocation, number> = {
  attic: 0,         // same room. She hears everything
  stairs: 0,        // and the stairs are directly below the floor
  her_bedroom: 1,
  bathroom: 1,
  living_room: 2,
  kitchen: 2,
  basement: 3,
  outside: 4,
  unknown: 2,
};

export function run(
  state: GameState, content: ContentBundle, input: TurnInput, validity: ValidityResult,
): NoiseResult {
  if (!validity.ok) return { level: 'silent', heard: false };

  const action = content.actions.find((def) => def.id === input.action);
  if (action === undefined) return { level: 'silent', heard: false };

  // An object can be louder than the verb: the drawer sticks, the glass doesn't.
  const objectDef = content.objects.find((def) => def.id === input.object);
  const override = objectDef?.noise?.[input.action];
  let index = LEVELS.indexOf(override ?? action.noise);

  // Where you did it matters — the eaves are loud to open. But only if you actually touched
  // anything: looking across the room at the clock is silent wherever the clock is.
  if (isHandsOn(action.effect)) {
    const placeId = input.object === null ? null : placeOf(state, input.object);
    const place = content.places.find((def) => def.id === placeId);
    index += place?.noiseModifier ?? 0;
  }

  const level = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index))] ?? 'silent';

  const loudness = LEVELS.indexOf(level);
  const muffling = DISTANCE[state.her.location] + COVER[state.her.activity];
  const audibility = (loudness - muffling) * 0.3 + state.her.attention * 0.4;

  return {
    level,
    heard: loudness > 0
      && chance(state.meta.seed, state.meta.minutesElapsed, `heard:${input.action}`, audibility),
  };
}
