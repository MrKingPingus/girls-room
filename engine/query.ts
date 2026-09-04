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

/** How many times this action happened in the last so-many minutes, this turn included. */
function countRecent(state: GameState, action: string, minutes: number): number {
  const since = state.meta.minutesElapsed - minutes;
  return state.history.filter((entry) => entry.type === action && entry.at >= since).length;
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

    /**
     * What the player had worked out *coming into* this turn — not counting anything the verb
     * they just used has taught them.
     *
     * The one place the bag deliberately looks backwards, and it has to. The stage that grants
     * knowledge runs before the stage that picks her reaction, so by the time a rule is asked
     * "do they know about the nail?" the answer on the very turn they work it out is already
     * yes — and the scene of *working it out* becomes impossible to write, silently. Reading
     * it as of the start of the turn makes both rungs authorable, `lacks` for the moment they
     * learn it and `has` for every moment after, and it makes this agree exactly with the
     * gate in VALIDITY, which is also asking before anything was taught.
     */
    knownBefore: readonly string[];
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

    /**
     * Everything the player had worked out before this turn. The only fact that holds a list,
     * and the one that lets a moment lead somewhere: a verb teaches a name, and from then on
     * any rule in the game can ask about it. Design doc §19. See `knownBefore` above for why
     * it is the *before* picture and not the current one.
     */
    knows: [...parts.knownBefore],

    // The care loop. `care_due` is what she is holding out right now, or 'none'
    care_due: dueCareNeed(state) ?? 'none',

    // History she can draw on
    times_caught: state.history.filter((entry) => entry.seen).length,

    /**
     * Whether the player has already done this, recently. Nothing that costs her something to
     * say should pay the same twice in a row: without this, saying a nice thing is a button
     * that prints affection, and the fastest way to play is to press it a hundred times.
     *
     * Read off the history log, so there is nothing new to store and nothing new to own.
     */
    repeated: countRecent(state, parts.action, 90) > 1,
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
