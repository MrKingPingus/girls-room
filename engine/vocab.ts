/**
 * Girl's Room — every closed list in the game, in one place.
 *
 * A "closed list" is a set of values where anything outside the set is a mistake: her six
 * moods, the five poses, the four dispositions. Design doc §1 is explicit that the dominant
 * bug in a game this systemic is a mood or an id that doesn't exist, failing silently and
 * producing a rule that never fires.
 *
 * Each list is written once here and serves two masters at the same time:
 *
 *   - the compiler, which refuses to build if a beat is tagged with a mood that isn't real
 *   - the content validator, which needs the actual list at run time to check JSON files
 *
 * Written twice, the two copies drift and the day someone adds a mood the validator quietly
 * rejects every beat using it. Written once, that can't happen.
 *
 * `as const` below is what turns a plain list into a list the compiler treats as exact.
 */

// ---------------------------------------------------------------------------
// Her
// ---------------------------------------------------------------------------

/**
 * Design doc §3. This scene. Volatile, rolled fresh, always has a visible tell.
 * The POC ships the first four.
 *
 * There is deliberately no 'suspicious' mood: suspicion is a 0-100 meter, and having both
 * would make mood a readout of a meter instead of something rolled. High suspicion plus any
 * mood is what produces searching behaviour, as a criterion in the rule database.
 */
export const MOODS = [
  'warm',      // baseline. Sits down, unhurried
  'excited',   // talks fast, brought something. Misses small changes
  'irritated', // straightens objects. More critical, short visit
  'angry',     // comes up fast, stairs loud. Actively inspects
  'sad',       // doesn't turn the lamp on. Stays a long time — the absence window closes
  'worried',   // checks on you unprompted, off-schedule. Kindness as surveillance
] as const;
export type Mood = (typeof MOODS)[number];

/** The four the POC actually ships. Design doc §16. */
export const POC_MOODS = ['warm', 'excited', 'irritated', 'angry'] as const;

/**
 * Design doc §3. This month. Slow, hidden from the player, biases which moods are likely
 * without deciding them. These four are her model of the situation, from intact to failing —
 * cruelty is what happens when that model is threatened.
 *
 * Moves slowly and mostly downward; climbing back out of 'brittle' should cost real work.
 */
export const DISPOSITIONS = [
  'devoted',   // certain of you. Rolls warm and excited — and never leaves the room
  'content',   // settled, nothing to examine. THE STARTING STATE
  'unsettled', // something doesn't add up. Rolls worried and irritated
  'brittle',   // actively threatened. Rolls angry and sad. Where cruelty lives
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

/** Design doc §2b. Where she is in the house, which is what noise thresholds key off. */
export const HOUSE_LOCATIONS = [
  'attic',       // in the room with you
  'stairs',      // on the way up or down — the creak is your warning
  'kitchen',
  'living_room',
  'her_bedroom',
  'bathroom',
  'basement',
  'outside',     // out of the house entirely — the widest window
  'unknown',     // the player's model of her, when the game needs one
] as const;
export type HouseLocation = (typeof HOUSE_LOCATIONS)[number];

/** What she is doing there. Her own noise, which is the player's cover. */
export const ACTIVITIES = [
  'cooking', 'washing', 'watching_tv', 'on_phone', 'cleaning',
  'tending_you', 'sitting_with_you', 'sleeping', 'away', 'unknown',
] as const;
export type Activity = (typeof ACTIVITIES)[number];

// ---------------------------------------------------------------------------
// The room and the day
// ---------------------------------------------------------------------------

/** Design doc §2e. How far out of the bed the player can get. */
export const MOBILITY_TIERS = [0, 1, 2, 3] as const;
export type MobilityTier = (typeof MOBILITY_TIERS)[number];

/** Design doc §12. Where we are in the day's structure. Narrative, not visual. */
export const PHASES = ['wake', 'morning', 'absence', 'return', 'evening', 'sleep'] as const;
export type Phase = (typeof PHASES)[number];

export const LIGHTS = ['daylight', 'lamp', 'dark'] as const;
export type Light = (typeof LIGHTS)[number];

/** Design doc §2c. She controls this from downstairs. */
export const TEMPERATURES = ['cold', 'cool', 'comfortable', 'warm', 'hot'] as const;
export type Temperature = (typeof TEMPERATURES)[number];

/** Seen through the dormer window. Feeds her mood without the player causing it. */
export const WEATHERS = ['clear', 'overcast', 'rain', 'snow'] as const;
export type Weather = (typeof WEATHERS)[number];

/** Design doc §7a. How big a change is, which sets how likely she is to clock it. */
export const CHANGE_TIERS = [1, 2, 3, 4] as const;
export type ChangeTier = (typeof CHANGE_TIERS)[number];

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Design doc §13 — LOCKED. Never add to this list. Adding a universal verb means every
 * object in the game needs an answer for it; contextual verbs bound to one object are free.
 */
export const UNIVERSAL_VERBS = [
  'look', 'listen', 'take', 'open', 'move', 'hide', 'wait', 'rest',
] as const;
export type UniversalVerb = (typeof UNIVERSAL_VERBS)[number];

export const NOISE_LEVELS = ['silent', 'low', 'medium', 'high'] as const;
export type NoiseLevel = (typeof NOISE_LEVELS)[number];

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export const SPEAKERS = [
  'her',             // dialogue. Gets a portrait
  'narrator',        // the room, described. Design doc §6 — its register shifts with confidence
  'player_thought',  // the PC's own head, which is not always right
] as const;
export type Speaker = (typeof SPEAKERS)[number];

/**
 * Design doc §2c. Where she is in the room, physically. Five of these times six moods is a
 * hard ceiling of thirty sprites for the whole game — a number worth keeping quotable.
 */
export const POSES = [
  'stairwell',   // head just clear of the hole in the floor. She sees the bed before you see her
  'standing',    // upright on the centre strip, where the ceiling allows it
  'chair',       // in her chair, beside the bed. Hers
  'bedside',     // leaning in. Close enough to touch
  'turned_away', // back to you, doing something with her hands
] as const;
export type Pose = (typeof POSES)[number];

/**
 * One entry today. A second location is planned, and adding it here is a one-word change that
 * immediately makes the compiler check every beat in the game — and prices the new location in
 * backgrounds before anything is commissioned.
 */
export const SCENE_LOCATIONS = ['attic'] as const;
export type SceneLocation = (typeof SCENE_LOCATIONS)[number];

/**
 * Visual time, not narrative time. `world.phase` says where we are in the day's structure;
 * this says what the light through the dormer looks like. Derived from the clock when a beat
 * is stamped — never stored in state.
 */
export const TIMES_OF_DAY = ['dawn', 'morning', 'afternoon', 'dusk', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/**
 * Design doc §6. RESERVED for v2 — which register a line is written in, so the narrator can
 * sound certain, careful, or defeated depending on the PC's calibration. Nothing reads it.
 */
export const CONFIDENCE_REGISTERS = ['overconfident', 'calibrated', 'underconfident'] as const;
export type ConfidenceRegister = (typeof CONFIDENCE_REGISTERS)[number];

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** Design doc §4. One per run. POC ships the Mailman only. */
export const PLAYER_CLASSES = ['mailman', 'family_friend', 'former_bully', 'charmer'] as const;
export type PlayerClass = (typeof PLAYER_CLASSES)[number];

/**
 * What a verb mechanically *does*, as opposed to what it is called.
 *
 * The engine switches on this, never on the verb's name. That is what lets a contextual verb
 * — "palm the pill", "pull the blanket over your head" — reuse an existing mechanic without a
 * single line being added to engine/. Hard rule 4, applied to actions instead of reactions.
 */
export const ACTION_EFFECTS = [
  'none',        // produces a beat and nothing else. wait, listen
  'inspect',     // marks it known and searched, and reveals what is in it if it is open
  'open_close',  // toggles a container
  'toggle_on',   // toggles a thing that is on or off. The lamp
  'take',        // into the player's hands
  'relocate',    // to a named place, in the open
  'conceal',     // to a named place, hidden
] as const;
export type ActionEffect = (typeof ACTION_EFFECTS)[number];
