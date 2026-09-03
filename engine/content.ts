/**
 * Girl's Room — the shape of the content files.
 *
 * Everything the game is made of lives in `content/*.json` as data: the objects in the room,
 * what the verbs cost, her routine, her reactions, and every line of text. None of it is code,
 * and adding content must never require touching a single file in `engine/` (hard rule 4).
 *
 * This file says what those JSON files are allowed to contain. `validate.ts` enforces it at
 * startup, loudly, because a rule that silently never fires is close to undebuggable at scale.
 *
 * Still no runtime code here — this is a description, not a loader.
 */

import type {
  ActionId, BeatId, ObjectId, ObjectLocation, PlaceId, RuleId,
} from './state.ts';
import type { Audio, Criteria, Scene, TimerSpec } from './beat.ts';
import type {
  ActionEffect, Activity, CareNeed, ChangeTier, ConfidenceRegister, HouseLocation,
  MobilityTier, Mood, NoiseLevel, Phase, Pose, Speaker,
} from './vocab.ts';

// ---------------------------------------------------------------------------
// content/places.json — the room, as somewhere to reach into
// ---------------------------------------------------------------------------

/**
 * Design doc §2e. Reach lives on the place, not on the thing: the same book is tier 0 on the
 * nightstand and tier 2 on the dresser. Raising mobility silently unlocks everything at the
 * new tier at once, which is the progression curve made mechanical.
 */
export type PlaceDef = {
  id: PlaceId;

  /** A short label — "the nightstand". Not a description; descriptions are beats. */
  name: string;

  /** The mobility tier needed to touch anything here. */
  reach: MobilityTier;

  /** 0-100. How well something hidden here goes unseen. Under the bed beats the nightstand. */
  concealment: number;

  /** Added to an action's noise when performed here. The eaves are loud to open. */
  noiseModifier: number;
};

// ---------------------------------------------------------------------------
// content/objects.json — the things in it
// ---------------------------------------------------------------------------

export type ObjectDef = {
  id: ObjectId;
  name: string;

  /** Where it sits at the start of a run. */
  startsAt: ObjectLocation;

  /** Whether things can be put inside it, and therefore whether `open` applies. */
  container: boolean;

  /** Whether it switches on and off. The lamp does; the water glass does not. */
  togglable?: boolean;

  /**
   * She is in the room, so she is something the player can direct actions at — but she is not
   * furniture. A person is never offered the handling verbs (take, move, hide, open), only
   * looking and whatever contextual verbs are bound to them, and they vanish from the menu
   * when they are not in the room.
   */
  person?: boolean;

  /** Whether the player knows it exists from the first moment. Defaults to reach-tier 0. */
  knownAtStart?: boolean;

  /** Whether `take` applies at all. */
  portable: boolean;

  /** Design doc §7a. How obvious it is when this moves. Tier 4 is always noticed. */
  changeTier: ChangeTier;

  /**
   * Contextual verbs bound to this one object — palm the pill, read the journal, pry the
   * window. Free to add at any time, because only this object has to answer for them.
   * The eight universal verbs are never listed here; they apply to everything.
   */
  verbs?: ActionId[];

  /** Per-object noise overrides. The drawer is louder than the water glass. */
  noise?: { [actionId: string]: NoiseLevel };
};

// ---------------------------------------------------------------------------
// content/actions.json — what the verbs cost
// ---------------------------------------------------------------------------

export type ActionDef = {
  id: ActionId;
  name: string;

  /** True for the locked eight (design doc §13). Contextual verbs are false. */
  universal: boolean;

  /** Minutes spent. Design doc §12 — checking the clock is itself priced in time. */
  timeCost: number;

  noise: NoiseLevel;

  /**
   * What it mechanically does. The engine switches on this, never on the verb's name, so a
   * new contextual verb can reuse an existing mechanic without touching engine/.
   */
  effect: ActionEffect;

  /**
   * Which care need this answers. Required by the `care_accept` and `care_palm` effects and
   * meaningless without them — it is what lets one engine branch serve every care scene, so a
   * new one is a row in this file rather than a change in engine/.
   */
  satisfies?: CareNeed;

  /**
   * Marks this action as *hers*: her offering the player that care need. These are never bound
   * to an object's verbs and never appear in a menu — the player cannot choose to be offered
   * dinner. They exist so her half of a care scene is a row in the rule database like
   * everything else, with its own beats and its own catch-all.
   */
  offers?: CareNeed;

  /**
   * An object this action puts into the player's hands. Palming a pill is the case that
   * matters: design doc §8 says it "creates contraband that must be hidden and can be found",
   * so the pill has to become a real thing in the room with a location, not a counter.
   */
  produces?: ObjectId;

  /** Whether doing this can be concealed from her at all. */
  concealable: boolean;

  /** `hide` is the only two-target verb: a thing, and somewhere to put it. */
  target: 'none' | 'object' | 'object_and_place';
};

// ---------------------------------------------------------------------------
// content/reactions.json — the rule database
// ---------------------------------------------------------------------------

/**
 * Architecture §6. Deltas a rule applies when it wins. Applied by APPRAISAL, which owns the
 * meters — never by REACTION.
 */
export type MeterEffects = {
  affection?: number;
  trust?: number;
  suspicion?: number;

  /**
   * Pressure on the disposition ladder rather than a direct set. Keep the numbers small:
   * disposition is meant to move over days, and mostly downward.
   */
  dispositionPressure?: number;
};

/**
 * Architecture §6. The rule with the most matching criteria wins; ties break by weight, then
 * at random among equals. Three criteria beats two, so the specific rule wins automatically
 * and you only author the special moments.
 */
export type ReactionRule = {
  id: RuleId;

  /**
   * Which action this rule answers. Explicit rather than buried in `when`, so the validator
   * can prove every action has at least one catch-all — architecture §6's promise that the
   * game can never produce nothing.
   */
  action: ActionId;

  /** The conditions. More of them beats fewer. An empty bag is the catch-all. */
  when: Criteria;

  /** Beats to emit, in order. */
  beats: BeatId[];

  effects?: MeterEffects;

  /** Tiebreaker between rules with the same number of criteria. Defaults to 0. */
  weight?: number;
};

// ---------------------------------------------------------------------------
// content/beats.json — the words
// ---------------------------------------------------------------------------

/**
 * What an author actually writes for a beat.
 *
 * Deliberately smaller than the `Beat` the renderer receives. The simulation already knows
 * her mood, the light, the weather and the time — so the last pipeline stage stamps those on
 * automatically. Restating them here would be busywork that can silently contradict the game
 * ("she's warm" on a beat fired while she's furious).
 *
 * The upshot: hard rule 5 stops being a discipline problem. Every beat carries correct
 * presentation tags because it is impossible to author one that doesn't.
 *
 * `pose` is the exception — the simulation has no idea where in the room she is standing, so
 * that is authored, always.
 */
export type BeatContent = {
  speaker: Speaker;

  /**
   * The line. **Never carries presentation information.** "She looks annoyed" is wrong;
   * `mood` is right. Prose describing her face is prose a sprite layer can never replace.
   */
  text: string;

  /** Where she is standing, or 'absent' when she is not on screen at all. */
  pose: Pose | 'absent';

  /** Rare. Her real mood is stamped automatically; set this only to force a specific read. */
  mood?: Mood;

  /** Rare. The scene is stamped from the world; override for a dream or a memory. */
  scene?: Partial<Scene>;

  /** Anything omitted defaults to "leave it as it is". */
  audio?: Partial<Audio>;

  /**
   * Design doc §12. False on every line except the last one before a prompt, so a slow reader
   * is never charged time for reading.
   */
  advancesClock: boolean;

  prompt?: PromptContent;

  /** v2. Which confidence register this line is written in. Nothing reads it yet. */
  register?: ConfidenceRegister;
};

export type ChoiceContent = {
  id: string;
  label: string;

  /** Conditions for offering it. Omitted means always. */
  requires?: Criteria;
};

export type PromptContent = {
  choices: ChoiceContent[];

  /** Defaults to mood-scaled. */
  timer?: TimerSpec;
};

/** The file itself: beat id -> what to say. Kept separate so rewriting a line can't break logic. */
export type BeatLibrary = { [beatId: string]: BeatContent };

// ---------------------------------------------------------------------------
// content/schedule.json — her routine
// ---------------------------------------------------------------------------

/**
 * Design doc §12. One block of her day. WORLD walks these to decide where she is, what she is
 * doing, and how closely she is paying attention — which is what turns her routine into the
 * player's absence windows.
 */
export type ScheduleBlock = {
  /** Minutes from the start of the day. */
  from: number;
  to: number;

  location: HouseLocation;
  activity: Activity;

  /** 0-1 baseline attention while she is here. Her mood modifies it. */
  attention: number;

  /** Which part of the day's structure this block belongs to. */
  phase: Phase;
};

export type ScheduleDay = {
  day: number;
  blocks: ScheduleBlock[];
};

// ---------------------------------------------------------------------------
// All of it
// ---------------------------------------------------------------------------

export type ContentBundle = {
  places: PlaceDef[];
  objects: ObjectDef[];
  actions: ActionDef[];
  reactions: ReactionRule[];
  beats: BeatLibrary;
  schedule: ScheduleDay[];
};
