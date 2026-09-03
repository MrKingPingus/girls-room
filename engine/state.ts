/**
 * Girl's Room — the canonical shape of the save file.
 *
 * This file contains NO code. It is a list of every value the game keeps track of, what each
 * one means, what values it is allowed to hold, and which pipeline stage is permitted to
 * change it. Nothing runs; nothing imports it yet.
 *
 * Three rules govern everything below:
 *
 *   1. It must survive being written to disk and read back.
 *      No class instances, no functions, no Map/Set, no Date. `_StateSurvivesSaveLoad` at the
 *      bottom of this file is a compile-time check that enforces this — if someone adds a
 *      field that can't be saved, the build breaks. That is the point.
 *
 *   2. Every field names its owning stage. See §5a of docs/one-room-sim-architecture.md.
 *      "INIT" means a new game sets it once and no stage ever touches it again.
 *
 *   3. Nothing derived is stored twice. Where a value is cached for convenience (her mood,
 *      the light level), exactly one stage recomputes it and the comment says so.
 */

import type {
  Activity, ChangeTier, Disposition, HouseLocation, Light, MobilityTier,
  Mood, Phase, PlayerClass, Temperature, Weather,
} from './vocab.ts';

// Re-exported so callers can reach the whole state vocabulary from one place.
export type {
  Activity, ChangeTier, Disposition, HouseLocation, Light, MobilityTier,
  Mood, Phase, PlayerClass, Temperature, Weather,
};

// ---------------------------------------------------------------------------
// Identifiers
//
// These are all just text underneath. The wrapper stops a beat id being passed where an
// object id belongs, which is the single most common way content breaks in a system this
// size. Content files are checked against the real id lists when they load.
// ---------------------------------------------------------------------------

export type ObjectId = string & { readonly __kind: 'ObjectId' };
export type PlaceId = string & { readonly __kind: 'PlaceId' };
export type BeatId = string & { readonly __kind: 'BeatId' };
export type RuleId = string & { readonly __kind: 'RuleId' };
export type ActionId = string & { readonly __kind: 'ActionId' };
export type FactId = string & { readonly __kind: 'FactId' };
export type PriorId = string & { readonly __kind: 'PriorId' };
export type ClaimId = string & { readonly __kind: 'ClaimId' };
export type TopicId = string & { readonly __kind: 'TopicId' };

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** Minutes since the player woke on day 1. The only clock in the game. */
export type Minute = number;

/** 0–100 unless a field says otherwise. */
export type Meter = number;

/** 0.0–1.0. */
export type Unit = number;

// ---------------------------------------------------------------------------
// meta — the run itself
// ---------------------------------------------------------------------------

export type MetaState = {
  /** Bumped when this file changes shape, so old saves can be spotted and refused. INIT. */
  schemaVersion: number;

  /** Day 1 is the day the player wakes. WORLD. */
  day: number;

  /** Minutes since waking on day 1. The clock every other system reads. EFFECTS. */
  minutesElapsed: Minute;

  /**
   * Fixes every roll in the run so a playthrough can be replayed exactly. INIT.
   * Randomness is derived from (seed + minutesElapsed + which stage is asking), so there is
   * no "next random number" counter to keep in sync — which means no second writer.
   */
  seed: number;

  /** Design doc §4. Chosen at the start, never changes. INIT. */
  playerClass: PlayerClass;
};

// ---------------------------------------------------------------------------
// world — the attic and the weather. Everything here is owned by WORLD.
// ---------------------------------------------------------------------------

export type WorldState = {
  /** Design doc §12. WORLD. */
  phase: Phase;

  /**
   * Cached, not authoritative: recomputed each turn from the hour, whether the lamp is on,
   * and whether she left the ceiling light on. WORLD.
   */
  light: Light;

  /** Design doc §2c. Reward and punishment applied without her being in the room. WORLD. */
  temperature: Temperature;

  /** Visible through the window. Post-POC — the window is a tier-2 object. WORLD. */
  weather: Weather;

  /**
   * Design doc §2a: there is no lock. The door at the bottom of the stairs can be standing
   * wide open, which is worse. Tracked because whether it's open changes what you can hear.
   * (Replaces the old `doorState: "locked"`, which predates the stairs-as-lock decision.) WORLD.
   */
  doorBelow: 'open' | 'closed';
};

// ---------------------------------------------------------------------------
// player — the body and what it knows. The body is owned by WORLD; knowledge by EFFECTS.
// ---------------------------------------------------------------------------

/** Design doc §8. Each rises on its own and is answered by a scene she performs on you. */
export type Needs = {
  hunger: Meter;
  thirst: Meter;
  hygiene: Meter;
  toileting: Meter;
  woundCare: Meter;
};

/**
 * Design doc §6. RESERVED FOR v2 — declared so the shape is settled, but no stage writes it
 * and nothing reads it. Do not implement without asking.
 */
export type ConfidenceProfile = {
  physical: Meter;
  social: Meter;
  deception: Meter;
  observation: Meter;
};

/** Design doc §8. The keystone item. Taking it helps the leg and hurts the judgement. */
export type MedicationState = {
  /** How much is in the player right now, 0–100. Drags on observation and toward sleep. WORLD. */
  inSystem: Meter;

  /** When the last dose was actually swallowed, or null if never. WORLD. */
  lastDoseAt: Minute | null;

  /** Doses accepted and swallowed. WORLD. */
  dosesTaken: number;

  /** Doses palmed instead. Each one becomes contraband in `objects`. WORLD. */
  dosesPalmed: number;
};

export type PlayerState = {
  /** Design doc §2e. The progression spine. Raising it silently unlocks content. WORLD. */
  mobility: MobilityTier;

  /** WORLD. */
  pain: Meter;

  /** WORLD. */
  energy: Meter;

  /** WORLD. */
  needs: Needs;

  /** WORLD. */
  medication: MedicationState;

  /** Facts the player has learned. Half of the game's central gap. EFFECTS. */
  knows: FactId[];

  /** v2. No writer, no reader. See ConfidenceProfile above. */
  confidence: ConfidenceProfile;
};

// ---------------------------------------------------------------------------
// her
// ---------------------------------------------------------------------------

/** Design doc §7c. Something the player told her, kept so contradictions can be caught. */
export type Claim = {
  id: ClaimId;

  /** When it was said. EFFECTS. */
  day: number;
  at: Minute;

  /** What it was about, so later statements on the same topic can be compared. EFFECTS. */
  topic: TopicId;

  /** The assertion itself, as a content id — never free text. EFFECTS. */
  assertion: FactId;

  /** Whether she took it. null until she has had reason to judge it. APPRAISAL. */
  believed: boolean | null;
};

/** Design doc §4. A belief she already holds about who you are, waiting to be settled. */
export type Prior = {
  id: PriorId;

  /** APPRAISAL. */
  status: 'open' | 'confirmed' | 'denied';
};

/**
 * Design doc §7a. What she last saw of an object. Detection compares the room against this,
 * not against the truth — which is what makes re-baselining possible: if she looks and doesn't
 * notice, this updates and the change becomes permanently safe.
 */
export type BaselineEntry = {
  /** Where she believes it is. DETECTION. */
  location: ObjectLocation;

  /** Whether she believes it is open. DETECTION. */
  open: boolean | null;

  /** When she last had eyes on it. DETECTION. */
  seenAt: Minute | null;
};

export type HerState = {
  /** Design doc §5. How much she wants you. Not shown to the player. APPRAISAL. */
  affection: Meter;

  /** How much she believes what you say. Buys autonomy. APPRAISAL. */
  trust: Meter;

  /** Active alertness to deception. APPRAISAL. */
  suspicion: Meter;

  /** This scene. Rolled by WORLD against disposition, stress, and her own day. WORLD. */
  mood: Mood;

  /** This month. Moved by what the player does, so APPRAISAL owns it. APPRAISAL. */
  disposition: Disposition;

  /** Design doc §3. Outside pressure. Moves her mood with no player involvement. WORLD. */
  stress: Meter;

  /**
   * 0–1, how closely she is watching right now. Cached, recomputed each turn from mood,
   * schedule, and affection — design doc §5's tax, where closeness costs privacy. WORLD.
   */
  attention: Unit;

  /** Design doc §2b. Noise thresholds key off this. WORLD. */
  location: HouseLocation;

  /** Her own noise is the player's cover window. WORLD. */
  activity: Activity;

  /**
   * When she said she'd be back. Distorted from the truth in proportion to mood — design doc
   * §12, teaching distrust of her word without exposition. null when she is here. WORLD.
   */
  statedReturnAt: Minute | null;

  /** What she holds true, including things that aren't. The other half of the gap. APPRAISAL. */
  believes: FactId[];

  /** Design doc §7c. Appended by EFFECTS; each entry's `believed` set by APPRAISAL. */
  claims: Claim[];

  /** Design doc §4. Class preconceptions, resolved by play. APPRAISAL. */
  priors: Prior[];

  /** Design doc §7a. Her mental picture of the room, keyed by object id. DETECTION. */
  roomBaseline: { [objectId: string]: BaselineEntry };
};

// ---------------------------------------------------------------------------
// objects
// ---------------------------------------------------------------------------

/**
 * Where a thing is. One field, so there is exactly one answer to "where is the paperclip"
 * — no separate carried-list or hidden-list that can disagree with it.
 *
 * Reach is deliberately NOT stored here. Reach belongs to the *place*, in content: a book on
 * the nightstand is tier 0 and the same book on the dresser is tier 2. Storing it on the
 * object would let the two drift apart.
 */
export type ObjectLocation =
  | { kind: 'placed'; place: PlaceId }        // sitting somewhere in the open
  | { kind: 'inside'; container: ObjectId }   // in the drawer, in a box
  | { kind: 'carried' }                       // on the player
  | { kind: 'hidden'; place: PlaceId }        // deliberately concealed — `hide` is two-target
  | { kind: 'gone' };                         // she took it, or it was destroyed

export type ObjectState = {
  /** EFFECTS. */
  location: ObjectLocation;

  /** Containers only; null for everything else. EFFECTS. */
  open: boolean | null;

  /** Whether the player knows this exists at all. EFFECTS. */
  known: boolean;

  /** Whether the player has already searched it, so `look` can say something new. EFFECTS. */
  searched: boolean;

  /** Design doc §7a tier 4 — damage is always noticed. EFFECTS. */
  damaged: boolean;
};

// ---------------------------------------------------------------------------
// pending — the dread queue
// ---------------------------------------------------------------------------

/**
 * Architecture §5. Something she will notice later, not now. The gap between doing it and
 * her finding it is the whole horror engine. Owned start to finish by DETECTION.
 */
export type PendingConsequence = {
  /** What it is about. */
  objectId: ObjectId | null;

  /** The action that caused it, for the post-mortem when she names the tell. */
  cause: ActionId;

  /** Design doc §7a. How obvious the change is. */
  tier: ChangeTier;

  /** When it was set up. */
  createdAt: Minute;

  /** What has to happen for it to land. */
  triggerOn: 'her_next_entry' | 'her_next_search' | 'day_end';
};

// ---------------------------------------------------------------------------
// history — the substrate for her memory
// ---------------------------------------------------------------------------

/**
 * Architecture §3. Not a debug log. This is what lets her say "you were quiet yesterday".
 * Capped; old entries are summarised into `her.believes` rather than kept forever.
 */
export type HistoryEntry = {
  day: number;
  at: Minute;

  /** What happened, as a content id. EFFECTS. */
  type: string;

  /** What it happened to. EFFECTS. */
  objectId: ObjectId | null;

  /** Whether she saw it. Set later, when detection resolves. DETECTION. */
  seen: boolean;
};

// ---------------------------------------------------------------------------
// The whole thing
// ---------------------------------------------------------------------------

export type GameState = {
  meta: MetaState;
  world: WorldState;
  player: PlayerState;
  her: HerState;
  objects: { [objectId: string]: ObjectState };
  pending: PendingConsequence[];
  history: HistoryEntry[];
};

// ---------------------------------------------------------------------------
// Save/load guarantee
//
// Anything that can be written to a file and read back is one of: text, a number, true/false,
// nothing, a list of those, or a bag of those. The line below asks the compiler to prove the
// whole save file is made of only those things. If someone adds a field that can't survive
// being saved, this is where the build stops.
// ---------------------------------------------------------------------------

type Saveable =
  | string | number | boolean | null
  | Saveable[]
  | { [key: string]: Saveable };

type MustBeSaveable<T extends Saveable> = T;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StateSurvivesSaveLoad = MustBeSaveable<GameState>;
