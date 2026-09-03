/**
 * Stage 1 — VALIDITY. Can this action happen at all?
 *
 * Writes nothing. It only decides, and hands the decision forward.
 *
 * Hard rule 8: **failure is content.** A refusal never returns an error or a dead button. It
 * returns a reason, which the rule database turns into a line explaining why, in character.
 * "You can't reach that from here" is a beat, not a bug.
 */

import type { GameState } from './../state.ts';
import type { ContentBundle, ObjectDef } from './../content.ts';
import type { TurnInput } from './../turn.ts';
import { isHandsOn, reachOf } from './../room.ts';

/** Why an action was refused. Each of these is a fact the rule database can answer to. */
export type FailureReason =
  | 'unknown_action'
  | 'no_such_object'
  | 'object_unknown'      // the player doesn't know it exists yet
  | 'out_of_reach'        // mobility too low for where it is
  | 'not_portable'
  | 'already_held'
  | 'not_a_container'
  | 'inside_closed'       // it's in the drawer, and the drawer is shut
  | 'nowhere_to_hide'
  | 'nothing_to_hide'
  | 'target_required'
  | 'asleep';

export type ValidityResult =
  | { ok: true }
  | { ok: false; reason: FailureReason };

export function run(
  state: GameState, content: ContentBundle, input: TurnInput,
): ValidityResult {
  const action = content.actions.find((def) => def.id === input.action);
  if (action === undefined) return { ok: false, reason: 'unknown_action' };

  if (state.world.phase === 'sleep' && input.action !== 'rest') {
    return { ok: false, reason: 'asleep' };
  }

  if (action.target === 'none') return { ok: true };

  if (input.object === null) return { ok: false, reason: 'target_required' };

  const objectState = state.objects[input.object];
  const objectDef: ObjectDef | undefined = content.objects.find((def) => def.id === input.object);
  if (objectState === undefined || objectDef === undefined) {
    return { ok: false, reason: 'no_such_object' };
  }
  if (!objectState.known) return { ok: false, reason: 'object_unknown' };

  // Looking and listening are never reach-gated — the clock is across the room and being
  // able to see it from the bed is the entire point of it (design doc §13). Reach gates the
  // hands, not the eyes.
  if (isHandsOn(action.effect)) {
    // One comparison, and it is the entire progression curve (design doc §2e).
    const reach = reachOf(state, content, input.object);
    if (reach === null) return { ok: false, reason: 'no_such_object' };
    if (reach > state.player.mobility) return { ok: false, reason: 'out_of_reach' };
  }

  // Something inside a shut container can be seen through neither the lid nor the fiction.
  if (objectState.location.kind === 'inside') {
    const container = state.objects[objectState.location.container];
    if (container?.open !== true) return { ok: false, reason: 'inside_closed' };
  }

  switch (action.effect) {
    case 'take':
      if (!objectDef.portable) return { ok: false, reason: 'not_portable' };
      if (objectState.location.kind === 'carried') return { ok: false, reason: 'already_held' };
      return { ok: true };

    case 'open_close':
      if (!objectDef.container) return { ok: false, reason: 'not_a_container' };
      return { ok: true };

    case 'relocate':
      if (!objectDef.portable) return { ok: false, reason: 'not_portable' };
      if (input.place === null) return { ok: false, reason: 'target_required' };
      return { ok: true };

    case 'conceal': {
      if (!objectDef.portable) return { ok: false, reason: 'nothing_to_hide' };
      if (input.place === null) return { ok: false, reason: 'nowhere_to_hide' };
      const place = content.places.find((def) => def.id === input.place);
      if (place === undefined) return { ok: false, reason: 'nowhere_to_hide' };
      if (place.reach > state.player.mobility) return { ok: false, reason: 'out_of_reach' };
      return { ok: true };
    }

    default:
      return { ok: true };
  }
}
