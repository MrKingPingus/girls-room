/**
 * Girl's Room — shared facts about the room.
 *
 * Small questions that more than one stage needs to ask: where is this thing really, how far
 * do you have to get out of bed to touch it, and does this verb involve your hands at all.
 *
 * These live here rather than in a stage because **stages are never allowed to import each
 * other** (hard rule 6). The moment one does, the pipeline stops being eight independent
 * passes and becomes a tangle where adding a system means rewiring the others.
 */

import type { GameState } from './state.ts';
import type { ContentBundle } from './content.ts';
import type { ActionEffect } from './vocab.ts';

/**
 * Whether a verb involves reaching for something.
 *
 * This is the line between the eyes and the hands, and two stages need it for different
 * reasons: reach only gates the hands (the clock is across the room and reading it from the
 * bed is the entire point of it), and looking at something leaves no trace and makes no sound
 * however awkwardly placed it is.
 */
export function isHandsOn(effect: ActionEffect): boolean {
  return effect !== 'none' && effect !== 'inspect';
}

/**
 * Whether a verb leaves something behind for her to find later.
 *
 * A whitelist rather than a list of exceptions, so a new verb is invisible to her by default
 * and has to be added here on purpose. The alternative — "everything except these" — means the
 * day someone adds a verb it silently becomes evidence, which is the wrong direction to fail.
 *
 * Looking and talking leave nothing. Eating in front of her is not evidence of anything; she
 * watched you do it. Palming is the interesting one: nothing changes in the room, but there is
 * now a pill in your hand that was supposed to be in you.
 */
export function leavesEvidence(effect: ActionEffect): boolean {
  return effect === 'open_close' || effect === 'toggle_on' || effect === 'take'
    || effect === 'relocate' || effect === 'conceal' || effect === 'care_palm';
}

/** Which place an object really sits in, following containers up to whatever holds them. */
export function placeOf(
  state: GameState, objectId: string, depth = 0,
): string | null {
  const object = state.objects[objectId];
  if (object === undefined || depth > 8) return null;
  switch (object.location.kind) {
    case 'placed':
    case 'hidden':
      return object.location.place;
    case 'inside':
      return placeOf(state, object.location.container, depth + 1);
    case 'carried':
      return null; // already in hand — reach is not a question
    case 'gone':
      return null;
  }
}

/** The mobility tier needed to touch this object where it currently is. */
export function reachOf(
  state: GameState, content: ContentBundle, objectId: string,
): number | null {
  if (state.objects[objectId]?.location.kind === 'carried') return 0;
  const place = placeOf(state, objectId);
  if (place === null) return null;
  return content.places.find((def) => def.id === place)?.reach ?? null;
}
