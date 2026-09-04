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
import type { FailureReason } from './../vocab.ts';
import { isHandsOn, reachOf } from './../room.ts';
import { dueCareNeed } from './../care.ts';

export type ValidityResult =
  | { ok: true }
  | { ok: false; reason: FailureReason };

export function run(
  state: GameState, content: ContentBundle, input: TurnInput,
): ValidityResult {
  const action = content.actions.find((def) => def.id === input.action);
  if (action === undefined) return { ok: false, reason: 'unknown_action' };

  // Asleep, you can still lie there, listen, and look at the ceiling — those pass time, and
  // time has to keep moving or the game stops dead. It is your hands that are unavailable.
  if (state.world.phase === 'sleep' && isHandsOn(action.effect)) {
    return { ok: false, reason: 'asleep' };
  }

  // Design doc §19. A topic you have not earned is not a refusal of something you tried, it is
  // a thought you have not had — so the menu leaves it out entirely (see render/menu.ts). This
  // still answers for it, because a save, a replay or the harness can all name it directly and
  // hard rule 8 does not allow "nothing happens" as an answer.
  if (action.requiresKnown !== undefined
      && !action.requiresKnown.every((fact) => state.player.knows.includes(fact))) {
    return { ok: false, reason: 'dont_know_that_yet' };
  }

  if (action.target === 'none') return { ok: true };

  if (input.object === null) return { ok: false, reason: 'target_required' };

  // Answering care needs her to be offering. Checked before anything about the room, because
  // "she isn't here" is a better answer than "you can't reach that".
  if (action.effect === 'care_accept' || action.effect === 'care_refuse'
      || action.effect === 'care_palm' || action.effect === 'talk') {
    if (state.her.location !== 'attic') return { ok: false, reason: 'she_isnt_here' };
    if (action.effect !== 'talk') {
      const due = dueCareNeed(state, content);
      if (due === null) return { ok: false, reason: 'nothing_offered' };
      if (action.satisfies !== undefined && action.satisfies !== due) {
        return { ok: false, reason: 'nothing_offered' };
      }
    }
    return { ok: true };
  }

  const objectState = state.objects[input.object];
  const objectDef: ObjectDef | undefined = content.objects.find((def) => def.id === input.object);
  if (objectState === undefined || objectDef === undefined) {
    return { ok: false, reason: 'no_such_object' };
  }
  if (!objectState.known) return { ok: false, reason: 'object_unknown' };

  // A person can be looked at and spoken to. Everything else in the verb set is handling, and
  // handling her is not a thing the game lets you attempt.
  if (objectDef.person === true) {
    if (state.her.location !== 'attic') return { ok: false, reason: 'she_isnt_here' };
    if (isHandsOn(action.effect)) return { ok: false, reason: 'not_a_thing' };
    return { ok: true };
  }

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
