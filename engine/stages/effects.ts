/**
 * Stage 2 — EFFECTS. What just changed in the room.
 *
 * Owns: the clock, every object, what the player knows, the claims ledger, the history log.
 * Owns nothing about her, her house, or the player's body — those belong to WORLD, next.
 *
 * Does nothing at all when the action was refused. A failed action changes no object and
 * costs no time; it produces a line explaining itself and that is all.
 */

import type { GameState, ObjectId, ObjectState, PlaceId } from './../state.ts';
import type { ContentBundle } from './../content.ts';
import type { TurnInput } from './../turn.ts';
import type { ValidityResult } from './validity.ts';
import { dayOf } from './../clock.ts';

export function run(
  state: GameState, content: ContentBundle, input: TurnInput, validity: ValidityResult,
): GameState {
  if (!validity.ok) return state;

  const action = content.actions.find((def) => def.id === input.action);
  if (action === undefined) return state;

  const minutesElapsed = state.meta.minutesElapsed + action.timeCost;
  const objects: { [id: string]: ObjectState } = { ...state.objects };
  // Design doc §19, the *and now you know…* half. Learning a thing is the mechanical result of
  // having done something, which is why it lands here and nowhere else. Kept unique and in the
  // order it was learned: it is a set in spirit, and hard rule 2 says state stays plain JSON.
  const knows = [...state.player.knows];
  for (const fact of action.teaches ?? []) {
    if (!knows.includes(fact)) knows.push(fact);
  }

  // Palming turns a dose into a physical object in your hand — something with a location, that
  // has to go somewhere, and that she can find. A counter could not be hidden under a mattress.
  const produced = action.produces === undefined ? undefined : objects[action.produces];
  if (action.produces !== undefined && produced !== undefined) {
    objects[action.produces] = { ...produced, location: { kind: 'carried' }, known: true };
  }

  const targetId = input.object;
  const target = targetId === null ? undefined : objects[targetId];

  if (targetId !== null && target !== undefined) {
    switch (action.effect) {
      case 'inspect':
        objects[targetId] = { ...target, known: true, searched: true };
        // Looking into an open container reveals what is in it.
        if (target.open === true) {
          for (const [id, object] of Object.entries(objects)) {
            if (object.location.kind === 'inside' && object.location.container === targetId) {
              objects[id] = { ...object, known: true };
            }
          }
        }
        break;

      case 'open_close':
        objects[targetId] = { ...target, open: !(target.open === true), searched: false };
        break;

      case 'toggle_on':
        objects[targetId] = { ...target, on: !(target.on === true) };
        break;

      case 'take':
        objects[targetId] = { ...target, location: { kind: 'carried' } };
        break;

      case 'relocate':
        if (input.place !== null) {
          objects[targetId] = {
            ...target, location: { kind: 'placed', place: input.place as PlaceId },
          };
        }
        break;

      case 'conceal':
        if (input.place !== null) {
          objects[targetId] = {
            ...target, location: { kind: 'hidden', place: input.place as PlaceId },
          };
        }
        break;

      default:
        break;
    }
  }

  return {
    ...state,
    meta: { ...state.meta, minutesElapsed },
    player: { ...state.player, knows },
    objects,
    history: [
      ...state.history,
      {
        day: dayOf(state.meta.minutesElapsed),
        at: state.meta.minutesElapsed,
        type: input.action,
        objectId: targetId as ObjectId | null,
        seen: false, // DETECTION decides this, sometimes much later
      },
    ].slice(-200), // capped; architecture §3 summarises the rest into her beliefs
  };
}
