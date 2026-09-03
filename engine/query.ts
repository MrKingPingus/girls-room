/**
 * Girl's Room — assembling the facts.
 *
 * Before the game asks the rule database what she does, it flattens everything true about
 * this instant into one bag of simple values. That bag is the only thing rules ever see.
 *
 * **This function is where new systems plug in.** Add a fact here and every rule ever written
 * can start using it, with no changes to any of them. That is the whole reason the reaction
 * system scales without a programmer in the loop.
 *
 * Keep the values simple — text, numbers, true/false. Rules compare, they don't inspect.
 */

import type { GameState } from './state.ts';
import type { QueryBag } from './rules.ts';
import type { ContentBundle } from './content.ts';
import type { DetectionResult } from './stages/detection.ts';
import type { NoiseResult } from './stages/noise.ts';
import type { ValidityResult } from './stages/validity.ts';
import { dayOf, minuteOfDay, timeOfDay } from './clock.ts';
import { dueCareNeed } from './care.ts';

/** Suspicion as a tier, because rules want "she's getting suspicious", not "she's at 43". */
export function suspicionTier(suspicion: number): 0 | 1 | 2 | 3 {
  if (suspicion >= 75) return 3;
  if (suspicion >= 50) return 2;
  if (suspicion >= 25) return 1;
  return 0;
}

export function buildQuery(
  state: GameState,
  content: ContentBundle,
  parts: {
    action: string;
    object: string | null;
    place: string | null;

    /** True when this moment is her finding something you did earlier, not reacting to now. */
    deferred: boolean;
    validity: ValidityResult;
    noise: NoiseResult | null;
    detection: DetectionResult | null;
  },
): QueryBag {
  const { her, player, world, meta } = state;

  const facts: QueryBag = {
    // What was attempted — or, when she is finding something late, what was done earlier
    action: parts.action,
    valid: parts.validity.ok,
    deferred: parts.deferred,

    // Where the run is
    day: dayOf(meta.minutesElapsed),
    minute_of_day: minuteOfDay(meta.minutesElapsed),
    time_of_day: timeOfDay(meta.minutesElapsed),
    phase: world.phase,
    light: world.light,
    temperature: world.temperature,
    class: meta.playerClass,

    // Her
    mood: her.mood,
    disposition: her.disposition,
    affection: her.affection,
    trust: her.trust,
    suspicion: her.suspicion,
    suspicion_tier: suspicionTier(her.suspicion),
    attention: her.attention,
    her_location: her.location,
    her_activity: her.activity,
    she_is_here: her.location === 'attic',

    // The player
    mobility: player.mobility,
    pain: player.pain,
    energy: player.energy,
    medicated: player.medication.inSystem > 25,

    // The body, as things she can see rather than as numbers
    hunger: player.needs.hunger,
    thirst: player.needs.thirst,
    wound_care: player.needs.woundCare,
    doses_taken: player.medication.dosesTaken,
    doses_palmed: player.medication.dosesPalmed,

    // The care loop. `care_due` is what she is holding out right now, or 'none'
    care_due: dueCareNeed(state) ?? 'none',

    // History she can draw on
    times_caught: state.history.filter((entry) => entry.seen).length,
  };

  if (parts.object !== null) {
    facts['object'] = parts.object;
    const objectState = state.objects[parts.object];
    const objectDef = content.objects.find((def) => def.id === parts.object);
    if (objectState !== undefined) {
      facts['object_open'] = objectState.open === true;
      facts['object_known'] = objectState.known;
      facts['object_searched'] = objectState.searched;
      facts['object_location'] = objectState.location.kind;
    }
    if (objectDef !== undefined) facts['object_change_tier'] = objectDef.changeTier;
  }

  if (parts.place !== null) facts['place'] = parts.place;

  if (!parts.validity.ok) facts['failure'] = parts.validity.reason;

  if (parts.noise !== null) {
    facts['noise'] = parts.noise.level;
    facts['noise_heard'] = parts.noise.heard;
  }

  if (parts.detection !== null) {
    facts['detected'] = parts.detection.outcome === 'noticed_now';
    facts['detection'] = parts.detection.outcome;
  }

  return facts;
}
