/**
 * Girl's Room — everything a rule is allowed to ask about.
 *
 * A rule in `content/reactions.json` connects to the simulation through a list of conditions:
 *
 *     "when": { "suspicion_tier": { "gte": 2 }, "she_is_here": true }
 *
 * Those names come from a bag of facts that `query.ts` assembles fresh every turn. **This file
 * is the declared list of what may go in that bag**, and it exists for three reasons:
 *
 *   1. Without it, a mistyped condition is invisible. `suspicon` loads clean, counts as a real
 *      condition when the game decides which rule wins, and then never matches — for the life
 *      of the project. That is precisely the silent-lookup failure hard rule 9 forbids, and the
 *      validator can only catch it against a list like this one.
 *
 *   2. The scenario builder generates its condition picker from here. An author picks a fact
 *      off a list and picks a legal value off a list, so the typo above cannot be typed at all.
 *
 *   3. The labels below are what a person actually reads. "how suspicious she is, in bands"
 *      is a condition someone can reason about; `suspicion_tier` is not.
 *
 * **The catalogue and the code cannot disagree.** `QueryBag` in `rules.ts` is built from the
 * ids below, so `query.ts` cannot produce a fact that isn't listed here, and nothing can be
 * listed here that `query.ts` doesn't produce. The compiler enforces both directions — the
 * same trick `vocab.ts` uses for the game's closed lists.
 *
 * **Adding a system means adding a row here.** One row, and every rule ever written can start
 * asking about it, with no change to any of them.
 */

import {
  ACTIVITIES, CARE_NEEDS, DETECTION_OUTCOMES, DISPOSITIONS, FAILURE_REASONS, HOUSE_LOCATIONS,
  LIGHTS, MOODS, NOISE_LEVELS, OBJECT_LOCATION_KINDS, PHASES, PLAYER_CLASSES, TEMPERATURES,
  TIMES_OF_DAY, WORLD_EVENTS,
} from './vocab.ts';

/**
 * What sort of value a fact holds.
 *
 *   `flag`   — yes or no
 *   `number` — a quantity, so it can be compared with at least / at most
 *   `text`   — one of a set of names
 *   `list`   — several names at once, asked about with `has` / `lacks` rather than compared
 */
export type FactKind = 'flag' | 'number' | 'text' | 'list';

/**
 * Some facts hold ids from the content files rather than a fixed list — which object was
 * touched, which place it went to. Those can't be enumerated here because they change every
 * time content does, so the fact names where to look them up instead.
 */
export type FactDomain = 'actions' | 'objects' | 'places' | 'knowledge';

export type FactSpec = {
  id: string;

  /** What this is, in words an author reads off a dropdown. Lower case, no jargon. */
  label: string;

  /** One line of help. Why you would check this, or what the numbers mean. */
  about: string;

  kind: FactKind;

  /** The legal values, when there is a fixed set of them. */
  values?: readonly (string | number)[];

  /** Where the legal values come from, when they come from the content files. */
  domain?: FactDomain;

  /** Lowest and highest this can be. Only set where the bound is real — a condition outside a
   *  stated range can never be true, and the validator refuses it on that basis. */
  range?: readonly [number, number];

  /**
   * True for facts that only exist on some turns — the ones about an object, a place, the
   * noise made, or whether she noticed. A rule that checks one of these is implicitly also
   * saying "and this was that kind of turn", which is usually what you want.
   */
  contextual?: true;
};

export const FACTS = [
  // --- what just happened ---------------------------------------------------
  {
    id: 'action', label: 'what the player did', kind: 'text', domain: 'actions',
    about: 'The verb this turn. Rules already name their action, so this is rarely needed.',
  },
  {
    id: 'valid', label: 'the action was possible', kind: 'flag',
    about: 'False when the game refused it. Pair with "why it was refused" for the line.',
  },
  {
    id: 'failure', label: 'why it was refused', kind: 'text', values: FAILURE_REASONS,
    contextual: true,
    about: 'Only present when the action was refused. Hard rule 8 — a refusal is a scene.',
  },
  {
    id: 'deferred', label: 'she is finding it late', kind: 'flag',
    about: 'True when this moment is her discovering something you did earlier, not just now.',
  },
  {
    id: 'just_happened', label: 'what the world just did', kind: 'list', values: WORLD_EVENTS,
    about:
      'Things that happened this turn for reasons of their own — she came in, she left, a day '
      + 'turned over. Asked with "has" or "lacks". Mostly you want "lacks", so a line does not '
      + 'contradict something the world said in the same breath.',
  },

  // --- the clock ------------------------------------------------------------
  {
    id: 'day', label: 'which day it is', kind: 'number',
    about: 'Counts from 1. The POC runs three days.',
  },
  {
    id: 'minute_of_day', label: 'minutes since midnight', kind: 'number', range: [0, 1439],
    about: '0 is midnight, 720 is noon. Prefer "time of day" unless you need a precise window.',
  },
  {
    id: 'time_of_day', label: 'time of day', kind: 'text', values: TIMES_OF_DAY,
    about: 'What the light through the dormer looks like.',
  },
  {
    id: 'phase', label: 'part of her day', kind: 'text', values: PHASES,
    about: 'Where the day is in its shape. "absence" is the window where she is out.',
  },

  // --- the room -------------------------------------------------------------
  {
    id: 'light', label: 'the light', kind: 'text', values: LIGHTS,
    about: 'Dark hides what you are doing and makes her likelier to reach for the lamp.',
  },
  {
    id: 'temperature', label: 'the temperature', kind: 'text', values: TEMPERATURES,
    about: 'She sets this from downstairs. Cold is something she is doing to you.',
  },

  // --- her ------------------------------------------------------------------
  {
    id: 'mood', label: 'her mood', kind: 'text', values: MOODS,
    about: 'This scene only. Rolled fresh, and always has a visible tell.',
  },
  {
    id: 'disposition', label: 'how she is holding up', kind: 'text', values: DISPOSITIONS,
    about: 'This month. Slow, hidden from the player, mostly falling. "brittle" is the bad end.',
  },
  {
    id: 'affection', label: 'affection', kind: 'number', range: [0, 100],
    about: 'How much she loves you. High affection is not safety.',
  },
  {
    id: 'trust', label: 'trust', kind: 'number', range: [0, 100],
    about: 'How much slack she gives you. This is the one that buys freedom.',
  },
  {
    id: 'suspicion', label: 'suspicion', kind: 'number', range: [0, 100],
    about: 'The exact number. Usually you want the banded version below instead.',
  },
  {
    id: 'suspicion_tier', label: 'how suspicious she is, in bands', kind: 'number', range: [0, 3],
    about: '0 nothing, 1 uneasy, 2 watching you, 3 searching. Bands age better than numbers.',
  },
  {
    id: 'attention', label: 'how closely she is watching', kind: 'number', range: [0, 1],
    about: '0 is oblivious, 1 is staring. Set by what she is doing, bent by her mood.',
  },
  {
    id: 'her_location', label: 'where she is', kind: 'text', values: HOUSE_LOCATIONS,
    about: '"stairs" is your warning. "outside" is the widest window you get.',
  },
  {
    id: 'her_activity', label: 'what she is doing', kind: 'text', values: ACTIVITIES,
    about: 'Her own noise is your cover — running water hides more than the television.',
  },
  {
    id: 'she_is_here', label: 'she is in the room', kind: 'flag',
    about: 'The single most useful condition in the game.',
  },

  // --- the player -----------------------------------------------------------
  {
    id: 'class', label: 'who the player is', kind: 'text', values: PLAYER_CLASSES,
    about: 'Chosen at the start of a run. The POC ships the Mailman only.',
  },
  {
    id: 'mobility', label: 'how far you can get out of bed', kind: 'number', range: [0, 3],
    about: '0 is bedbound. Each tier silently unlocks everything within reach of it.',
  },
  {
    id: 'pain', label: 'pain', kind: 'number', range: [0, 100],
    about: 'Rises when the wound goes untended. High pain is what makes the pills matter.',
  },
  {
    id: 'energy', label: 'energy', kind: 'number', range: [0, 100],
    about: 'Spent by doing things, restored by resting. Low energy narrows what you can try.',
  },
  {
    id: 'medicated', label: 'the pills are in you', kind: 'flag',
    about: 'True while a dose is still working. Design doc §8 — clarity is what you trade away.',
  },
  {
    id: 'hunger', label: 'hunger', kind: 'number', range: [0, 100],
    about: 'Rises until she feeds you. Above the offer threshold she will hold out a meal.',
  },
  {
    id: 'thirst', label: 'thirst', kind: 'number', range: [0, 100],
    about: 'As hunger, faster.',
  },
  {
    id: 'wound_care', label: 'the wound needs looking at', kind: 'number', range: [0, 100],
    about: 'Rises until she dresses it. Leaving it drives pain up, which is what she notices.',
  },
  {
    id: 'doses_taken', label: 'doses actually swallowed', kind: 'number',
    about: 'Counts across the whole run.',
  },
  {
    id: 'doses_palmed', label: 'doses palmed', kind: 'number',
    about: 'How many times you have appeared to take them and not. Contraband, and evidence.',
  },
  {
    id: 'knows', label: 'what you have worked out', kind: 'list', domain: 'knowledge',
    about:
      'Everything the player has learned so far, asked about one at a time with "has" or '
      + '"lacks". The legal names are whatever some verb teaches. Design doc §19 — knowing a '
      + 'thing is what makes the next question askable.',
  },

  // --- the care loop --------------------------------------------------------
  {
    id: 'care_due', label: 'what she is holding out', kind: 'text',
    values: [...CARE_NEEDS, 'none'],
    about: '"none" when she is not offering anything. Only ever set while she is in the room.',
  },

  // --- history --------------------------------------------------------------
  {
    id: 'times_caught', label: 'times she has caught you', kind: 'number',
    about: 'Across the whole run. A long memory is what makes the third time different.',
  },
  {
    id: 'repeated', label: 'you just did this', kind: 'flag',
    about:
      'True when the same action happened within the last hour and a half. Anything that pays '
      + 'a reward needs this, or it is a button that prints affection.',
  },

  // --- the thing you touched ------------------------------------------------
  {
    id: 'object', label: 'which thing', kind: 'text', domain: 'objects', contextual: true,
    about: 'The object this action was aimed at. Absent on verbs that take no target.',
  },
  {
    id: 'object_open', label: 'it is open', kind: 'flag', contextual: true,
    about: 'Containers only.',
  },
  {
    id: 'object_known', label: 'you know it exists', kind: 'flag', contextual: true,
    about: 'False for things not yet discovered — they are in the room but not in your world.',
  },
  {
    id: 'object_searched', label: 'you have searched it', kind: 'flag', contextual: true,
    about: 'Set the first time you look inside. The first look is the one worth writing.',
  },
  {
    id: 'object_location', label: 'where the thing is', kind: 'text',
    values: OBJECT_LOCATION_KINDS, contextual: true,
    about: 'In the open, inside something, in your hands, hidden, or gone.',
  },
  {
    id: 'object_change_tier', label: 'how obvious moving it is', kind: 'number',
    values: [1, 2, 3, 4], contextual: true,
    about: '1 she may never notice, 4 she notices instantly. A property of the thing itself.',
  },
  {
    id: 'place', label: 'which place', kind: 'text', domain: 'places', contextual: true,
    about: 'Only on verbs that name somewhere to put something — moving and hiding.',
  },

  // --- noise and being seen -------------------------------------------------
  {
    id: 'noise', label: 'how loud it was', kind: 'text', values: NOISE_LEVELS, contextual: true,
    about: 'What the action made, before asking whether it carried to where she is.',
  },
  {
    id: 'noise_heard', label: 'she heard it', kind: 'flag', contextual: true,
    about: 'Whether the sound actually reached her, given where she is and what she is doing.',
  },
  {
    id: 'detected', label: 'she caught you', kind: 'flag', contextual: true,
    about: 'True only for caught in the act. For the slower version use the fact below.',
  },
  {
    id: 'detection', label: 'what she noticed', kind: 'text', values: DETECTION_OUTCOMES,
    contextual: true,
    about: 'Nothing, caught now, or she will find it later — the one that makes the room tense.',
  },
] as const satisfies readonly FactSpec[];

/** Every fact name the game knows. A condition naming anything else is a content error. */
export type FactId = (typeof FACTS)[number]['id'];

/**
 * The facts, in the order a person would go looking for them.
 *
 * Forty-four names in one flat dropdown is a wall. These are the headings an author actually
 * thinks in — *whether she noticed* is one thought, and it is the one this game is mostly about.
 */
export const FACT_GROUPS = [
  {
    id: 'moment', label: 'what just happened',
    facts: ['action', 'valid', 'failure', 'deferred', 'just_happened'],
  },
  {
    id: 'noticed', label: 'whether she noticed',
    facts: ['detected', 'detection', 'noise', 'noise_heard'],
  },
  {
    id: 'her', label: 'her',
    facts: [
      'she_is_here', 'mood', 'disposition', 'her_location', 'her_activity', 'attention',
      'affection', 'trust', 'suspicion', 'suspicion_tier', 'care_due',
    ],
  },
  {
    id: 'thing', label: 'the thing you touched',
    facts: [
      'object', 'object_open', 'object_known', 'object_searched', 'object_location',
      'object_change_tier', 'place',
    ],
  },
  {
    id: 'you', label: 'you',
    facts: [
      'mobility', 'pain', 'energy', 'medicated', 'hunger', 'thirst', 'wound_care',
      'doses_taken', 'doses_palmed', 'knows', 'class',
    ],
  },
  {
    id: 'when', label: 'the time, and the room',
    facts: ['day', 'time_of_day', 'phase', 'minute_of_day', 'light', 'temperature'],
  },
  {
    id: 'before', label: 'what has happened before',
    facts: ['times_caught', 'repeated'],
  },
] as const;

/**
 * Every fact belongs to exactly one group, proved by the compiler rather than by remembering.
 * Add a fact above without listing it here and this line stops compiling.
 */
type GroupedFact = (typeof FACT_GROUPS)[number]['facts'][number];
type _EveryFactIsGrouped = Exclude<FactId, GroupedFact> extends never ? true : never;
const _grouped: _EveryFactIsGrouped = true;
void _grouped;

/** Facts that only exist on some turns. */
export type ContextualFactId = Extract<(typeof FACTS)[number], { contextual: true }>['id'];

/** Facts present on every single turn, without exception. */
export type AlwaysFactId = Exclude<FactId, ContextualFactId>;

/**
 * The same list, seen as plain specs rather than as exact literals.
 *
 * `FACTS` above is deliberately exact so the compiler can derive `FactId` from it. That makes
 * it awkward to walk, because half the entries have no `range` and the compiler knows it. This
 * is the version to iterate — the scenario builder's condition picker reads this.
 */
export const ALL_FACTS: readonly FactSpec[] = FACTS;

const BY_ID = new Map<string, FactSpec>(FACTS.map((fact) => [fact.id, fact]));

/** Look a fact up by name. Null means the game has never heard of it. */
export function factSpec(id: string): FactSpec | null {
  return BY_ID.get(id) ?? null;
}

export function isFactId(id: string): id is FactId {
  return BY_ID.has(id);
}

/**
 * The closest real fact to something that isn't one, or null if nothing is close.
 *
 * Purely for the error message. "suspicon is not a fact" is a bad afternoon; "suspicon is not
 * a fact — did you mean suspicion?" is five seconds.
 */
export function nearestFact(id: string): FactId | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const fact of FACTS) {
    const distance = editDistance(id, fact.id);
    if (distance < bestDistance) {
      best = fact.id;
      bestDistance = distance;
    }
  }
  // Beyond a third of the name being wrong it stops being a typo and starts being a guess.
  const limit = Math.max(2, Math.floor(id.length / 3));
  return best !== null && bestDistance <= limit ? (best as FactId) : null;
}

/** Levenshtein. Small strings, called only when something is already wrong. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      current.push(Math.min(substitution, deletion, insertion));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
