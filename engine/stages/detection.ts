/**
 * Stage 5 — DETECTION. Does she notice?
 *
 * Owns: her picture of the room, the pending queue, and whether a history entry was seen.
 *
 * Three jobs, in order:
 *
 *   1. Decide whether what just happened registers — by sound, or by sight if she's here.
 *   2. If she isn't here, push it onto the pending queue. **The gap between doing it and her
 *      finding it is the horror engine.** Nothing about a deferred consequence fires now.
 *   3. Re-baseline. Design doc §7a: if she is in the room and doesn't notice something, that
 *      change becomes permanently safe. This is what converts a risk into ground gained, and
 *      without it tension only ever accumulates and the game is exhausting to play.
 */

import type { GameState, ObjectId, PendingConsequence } from './../state.ts';
import type { ContentBundle } from './../content.ts';
import type { ChangeTier, DetectionOutcome } from './../vocab.ts';
import type { TurnInput } from './../turn.ts';
import type { NoiseResult } from './noise.ts';
import type { ValidityResult } from './validity.ts';
import { chance } from './../random.ts';
import { leavesEvidence } from './../room.ts';

export type DetectionResult = {
  outcome: DetectionOutcome;

  /** What she caught, when she caught something. */
  objectId: string | null;

  /** Set when this turn resolved something she was owed from earlier. */
  fired: PendingConsequence | null;
};

/**
 * Design doc §7a. How likely she is to clock a change of each size, before her mood, her
 * attention and her suspicion are taken into account.
 */
const BASE_NOTICE: Record<ChangeTier, number> = {
  1: 0.10,  // blanket rearranged, a book turned
  2: 0.35,  // drawer ajar, curtain moved
  3: 0.65,  // something moved across the room
  4: 1.00,  // missing, damaged, or her chair touched. Always
};

export function run(
  state: GameState,
  content: ContentBundle,
  input: TurnInput,
  validity: ValidityResult,
  noise: NoiseResult,
): { state: GameState; result: DetectionResult } {
  const here = state.her.location === 'attic';
  const seed = state.meta.seed;
  const minute = state.meta.minutesElapsed;

  // --- 1. Anything owed from earlier, now that she is back ---------------------
  let pending = [...state.pending];
  let fired: PendingConsequence | null = null;

  if (here) {
    const dueIndex = pending.findIndex((entry) => entry.triggerOn === 'her_next_entry');
    const due = dueIndex === -1 ? undefined : pending[dueIndex];
    if (due !== undefined) {
      const odds = BASE_NOTICE[due.tier] * (0.6 + state.her.attention);
      if (chance(seed, minute, `pending:${due.cause}`, odds)) {
        fired = due;
        pending = pending.filter((_, i) => i !== dueIndex);
      }
    }
  }

  // --- 2. What just happened --------------------------------------------------
  let outcome: DetectionOutcome = 'unnoticed';
  let caught: string | null = null;

  if (validity.ok && input.object !== null) {
    const actionDef = content.actions.find((def) => def.id === input.action);
    const leavesATrace = actionDef !== undefined && leavesEvidence(actionDef.effect);

    // What she would actually be noticing. For most verbs that is the thing you touched; for
    // palming it is the pill now in your hand, not the woman you took it from.
    const evidenceId = actionDef?.produces ?? input.object;
    const objectDef = content.objects.find((def) => def.id === evidenceId);
    const tier: ChangeTier = objectDef?.changeTier ?? 1;

    // Some verbs are done carefully by their nature. It is never safe — she is a foot away —
    // but it is the difference between a gamble and a certainty.
    const care = actionDef?.concealable === true ? 0.45 : 1;

    if (noise.heard) {
      outcome = here ? 'noticed_now' : 'noticed_later';
      caught = input.object;
    } else if (leavesATrace) {
      if (here) {
        const odds = BASE_NOTICE[tier] * care
          * (0.5 + state.her.attention + state.her.suspicion / 200);
        if (chance(seed, minute, `sight:${String(evidenceId)}`, odds)) {
          outcome = 'noticed_now';
          caught = evidenceId;
        }
      } else {
        // She isn't here. It waits for her, which is the point.
        outcome = 'noticed_later';
        caught = evidenceId;
        const deferred: PendingConsequence = {
          objectId: evidenceId as ObjectId,
          cause: input.action as PendingConsequence['cause'],
          tier,
          createdAt: minute,
          triggerOn: 'her_next_entry',
        };
        pending = [...pending, deferred].slice(-32);
      }
    }
  }

  if (fired !== null && outcome !== 'noticed_now') {
    outcome = 'noticed_now';
    caught = fired.objectId;
  }

  // --- 3. Re-baseline ---------------------------------------------------------
  // Everything she can see and didn't remark on becomes the new normal. Grace is scaled by
  // how well she knows you — the Mailman gets all of it (design doc §7a).
  const roomBaseline = { ...state.her.roomBaseline };
  if (here && outcome !== 'noticed_now') {
    for (const [id, object] of Object.entries(state.objects)) {
      if (object.location.kind === 'hidden') continue; // she can't re-baseline what she can't see
      roomBaseline[id] = { location: object.location, open: object.open, seenAt: minute };
    }
  }

  const history = outcome === 'noticed_now'
    ? state.history.map((entry, i) =>
        i === state.history.length - 1 ? { ...entry, seen: true } : entry)
    : state.history;

  return {
    state: { ...state, pending, history, her: { ...state.her, roomBaseline } },
    result: { outcome, objectId: caught, fired },
  };
}
