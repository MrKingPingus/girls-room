/**
 * Girl's Room — the care loop.
 *
 * Design doc §8: dependence is the horror. Food, water, medication, hygiene, toileting, wound
 * care. Each is not something you do — it is **something she does to you**, and your only move
 * is how you answer: take it, turn it down, or appear to take it and not.
 *
 * This works out which of those scenes is on the table right now. It is deliberately derived
 * from state that already exists rather than stored: she is in the room, she is tending you,
 * and something has gone long enough unanswered. Storing "a care scene is open" would be a new
 * field with a new owner, and there is nothing it could say that the room does not already.
 *
 * Not a pipeline stage. Both the validity check and the fact bag need this same answer, and
 * stages may not ask each other for it (hard rule 6).
 */

import type { GameState } from './state.ts';
import type { ContentBundle, ScheduleBlock } from './content.ts';
import type { CareNeed } from './vocab.ts';
import { dayOf, minuteOfDay } from './clock.ts';
import { pickWeighted } from './random.ts';

/**
 * How far a need has to go before she does something about it. These are the pacing dial for
 * the whole loop: lower them and she is on you constantly, raise them and you are left alone
 * with a body that hurts. Both are horror; the first is the one the design is aiming at.
 */
const THRESHOLD: Record<CareNeed, number> = {
  thirst: 45,
  hunger: 50,
  medication: 40,   // read against pain, not against a need
  woundCare: 65,
  toileting: 70,
  hygiene: 80,
};

/**
 * Medication is the keystone (design doc §8), so it is not measured like the others. It comes
 * due when the leg hurts and there is nothing in you — which is exactly when palming it costs
 * the most, and is therefore the most interesting moment to be offered it.
 */
const DOSE_INTERVAL = 4 * 60;

function medicationPressure(state: GameState): number {
  if (state.player.medication.inSystem > 25) return 0;

  // She does not offer again for hours, and what you did with the last one is not the point —
  // she watched you take it. Without this, palming would be repeatable every turn, which turns
  // the keystone item into a tap you can leave running.
  const last = state.player.medication.lastDoseAt;
  if (last !== null && state.meta.minutesElapsed - last < DOSE_INTERVAL) return 0;

  return state.player.pain;
}

/** How badly each need wants answering, 0-100. */
export function carePressure(state: GameState): Record<CareNeed, number> {
  return {
    hunger: state.player.needs.hunger,
    thirst: state.player.needs.thirst,
    hygiene: state.player.needs.hygiene,
    toileting: state.player.needs.toileting,
    woundCare: state.player.needs.woundCare,
    medication: medicationPressure(state),
  };
}

/** The block of her day the clock is currently inside. */
export function blockNow(state: GameState, content: ContentBundle): ScheduleBlock | null {
  const minute = state.meta.minutesElapsed;
  const today = content.schedule.find((entry) => entry.day === dayOf(minute))
    ?? content.schedule[content.schedule.length - 1];
  if (today === undefined) return null;
  const at = minuteOfDay(minute);
  return today.blocks.find((block) => at >= block.from && at < block.to)
    ?? today.blocks[today.blocks.length - 1]
    ?? null;
}

/**
 * The scene she is offering right now, or null.
 *
 * She has to be in the room and actually tending you — she does not feed you on her way past.
 *
 * Of everything overdue she leans toward the worst, but does not simply always take it. Always
 * taking the worst means the need that climbs fastest masks every other one permanently: refuse
 * water once and she would never again offer food, because thirst outranks it forever after.
 * Weighting instead lets her work through everything while still starting with what is worst.
 *
 * Fixed for the hour, not rolled per turn, so the answer on the table does not change under the
 * player's hand while they are deciding.
 */
export function dueCareNeed(state: GameState, content: ContentBundle): CareNeed | null {
  if (state.her.location !== 'attic') return null;
  if (state.her.activity !== 'tending_you') return null;

  const pressure = carePressure(state);

  // A meal is a meal. Left purely to the thresholds, whether she brings food depends on
  // whether hunger happened to cross a number this hour, so breakfast lands at a different
  // time every day and some days never comes at all. The player learns this room by its
  // rhythm, and a rhythm has to be reliable before it can be read. So during a meal block
  // hunger is on the table whether or not you are starving — which is also just what it is
  // like to be fed by somebody else.
  if (blockNow(state, content)?.meal !== undefined) {
    pressure.hunger = Math.max(pressure.hunger, THRESHOLD.hunger + 30);
  }

  const overdue = (Object.entries(pressure) as [CareNeed, number][])
    .map(([need, value]) => ({ item: need, weight: value - THRESHOLD[need] }))
    .filter((entry) => entry.weight > 0);

  if (overdue.length === 0) return null;

  const hour = Math.floor(state.meta.minutesElapsed / 60);
  return pickWeighted(state.meta.seed, hour, 'care', overdue);
}
