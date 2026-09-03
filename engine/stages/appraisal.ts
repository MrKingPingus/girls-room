/**
 * Stage 6 — APPRAISAL. How does she feel about that?
 *
 * **The only stage in the game allowed to move a meter.** Affection, trust, suspicion and
 * disposition are written here and absolutely nowhere else. When one of them jumps and nobody
 * knows why, this is the one place to look.
 *
 * It also runs the rule lookup — asking the content files which rule fits this moment — and
 * applies that rule's effects, because the rule's effects are meter changes and meters live
 * here. The next stage gets the answer handed to it rather than asking again. Architecture §6
 * had rules writing suspicion directly, which would have meant two writers for one number.
 */

import type { GameState } from './../state.ts';
import type { ContentBundle } from './../content.ts';
import type { QueryBag } from './../rules.ts';
import type { Disposition } from './../vocab.ts';
import { selectRule } from './../rules.ts';
import { dueCareNeed } from './../care.ts';

export type AppraisalResult = {
  /** The rule that answers this moment, for REACTION to turn into words. */
  ruleId: string | null;

  /**
   * Her offering something, when a care scene is open. Separate from the rule above because
   * it is a second thing happening in the same moment — the player did something, *and* she
   * is holding out a bowl — and squashing them into one would lose whichever came second.
   */
  offerRuleId: string | null;

  beats: string[];
};

/** The ladder disposition slides along. Mostly downward, and slowly. */
const LADDER: Disposition[] = ['brittle', 'unsettled', 'content', 'devoted'];

export function run(
  state: GameState, content: ContentBundle, action: string, facts: QueryBag,
  minutesPassed: number, careWasDue: string | null,
): { state: GameState; result: AppraisalResult } {
  const rule = selectRule(
    content.reactions, action, facts, state.meta.seed, state.meta.minutesElapsed,
  );

  const effects = rule?.effects ?? {};

  // Meters have to be able to come back down, or the game is a one-way ratchet and every run
  // ends the same way. Design doc §7a makes this argument about objects — if she looks and
  // doesn't notice, the change becomes permanently safe, because tension that only ever
  // accumulates is exhausting to play. The same has to be true of what she is *feeling*:
  // an uneventful hour is how you buy your way back down.
  //
  // Time, not action. This is what makes waiting a real move rather than a wasted turn.
  const quiet = facts['detected'] !== true && facts['noise_heard'] !== true;
  const settling = quiet ? minutesPassed / 45 : 0;

  const affection = clamp(state.her.affection + (effects.affection ?? 0), 0, 100);
  const trust = clamp(
    state.her.trust + (effects.trust ?? 0) + towards(state.her.trust, 50, settling), 0, 100,
  );
  const suspicion = clamp(
    state.her.suspicion + (effects.suspicion ?? 0) - settling, 0, 100,
  );

  // Disposition doesn't jump. Pressure accumulates against a threshold, so a single bad
  // afternoon can't turn her brittle and a single kindness can't undo one that has.
  const pressure = effects.dispositionPressure ?? 0;
  const disposition = shiftDisposition(state.her.disposition, pressure);

  // She does not wait for you to finish what you were doing. If a care scene is open, her
  // half of it plays in the same moment — design doc §8, these are things she does *to* you.
  // Skipped when the action *was* the answer to it, or she would offer and be answered at once.
  // She says it once, when she starts. Repeating the same line every turn until you answer
  // would turn the most human thing in the game into a nag, and the menu already shows what
  // is on the table. What is on offer is a fact the player can check by looking at her.
  const answering = content.actions.find((def) => def.id === action)?.satisfies !== undefined;
  const nowDue = dueCareNeed(state);
  const due = answering || nowDue === careWasDue ? null : nowDue;
  const offerAction = due === null
    ? undefined
    : content.actions.find((def) => def.offers === due);
  const offer = offerAction === undefined || due === null
    ? null
    : selectRule(
        content.reactions, offerAction.id, { ...facts, care_due: due },
        state.meta.seed, state.meta.minutesElapsed,
      );

  return {
    state: { ...state, her: { ...state.her, affection, trust, suspicion, disposition } },
    result: {
      ruleId: rule?.id ?? null,
      offerRuleId: offer?.id ?? null,
      beats: [...(rule?.beats ?? []), ...(offer?.beats ?? [])],
    },
  };
}

function shiftDisposition(current: Disposition, pressure: number): Disposition {
  if (Math.abs(pressure) < 20) return current;
  const index = LADDER.indexOf(current);
  const next = index + (pressure > 0 ? 1 : -1);
  return LADDER[Math.min(LADDER.length - 1, Math.max(0, next))] ?? current;
}

/** Drift a meter toward a resting point, never overshooting it. */
function towards(current: number, resting: number, step: number): number {
  if (step <= 0) return 0;
  const gap = resting - current;
  return Math.abs(gap) <= step ? gap : Math.sign(gap) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
