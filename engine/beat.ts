/**
 * Girl's Room — the shape of a beat.
 *
 * A beat is one moment the player is shown: a line she says, a line of narration, a thought,
 * usually with a prompt attached. The pipeline's last stage produces a list of them and hands
 * it to the renderer. **This is the only thing the renderer ever sees.**
 *
 * That is the whole visual-novel plan. The text build prints `speaker` and `text` and throws
 * everything else away. The visual build reads `portrait` to pick a sprite, `scene` to pick a
 * background, `audio` to run the mix — off the exact same beats, with no change to game logic.
 *
 * Which is why the presentation fields are filled in from beat #1, months before anything reads
 * them. They cost seconds now. They are unrecoverable later: nobody is going back to re-mood
 * four hundred lines, and a line that says "she looks annoyed" has trapped that information in
 * prose where no sprite layer can ever reach it.
 *
 * Like `state.ts`, this file contains no code.
 */

import type { BeatId } from './state.ts';
import type { FactId } from './facts.ts';
import type {
  ConfidenceRegister, Light, Mood, Pose, SceneLocation, Speaker, TimeOfDay, Weather,
} from './vocab.ts';

export type { ConfidenceRegister, Pose, SceneLocation, Speaker, TimeOfDay };

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type ChoiceId = string & { readonly __kind: 'ChoiceId' };
export type MusicCue = string & { readonly __kind: 'MusicCue' };
export type SfxCue = string & { readonly __kind: 'SfxCue' };
export type AmbienceCue = string & { readonly __kind: 'AmbienceCue' };

// ---------------------------------------------------------------------------
// portrait — what she looks like
// ---------------------------------------------------------------------------

/**
 * A discriminated union rather than a nullable field, so "she isn't here" is something an
 * author has to say on purpose. Hard rule 5: this field is never simply left off.
 */
export type Portrait =
  | { onScreen: false }
  | {
      onScreen: true;
      /**
       * Must be one of her six real moods — never free text. If this were open, the sprite
       * list would be unbounded and the art manifest below would be a guess instead of a
       * count. It also means a beat can't show her cold while the game thinks she's warm.
       */
      mood: Mood;
      pose: Pose;
    };

// ---------------------------------------------------------------------------
// scene — what the background looks like
// ---------------------------------------------------------------------------

export type Scene = {
  location: SceneLocation;

  /** Same vocabulary as `world.light`, deliberately, so the two can never drift apart. */
  light: Light;

  timeOfDay: TimeOfDay;

  /** Through the window. Drives an overlay, not a separate painting. */
  weather: Weather;
};

// ---------------------------------------------------------------------------
// audio — what it sounds like
//
// Design doc §2b: your floor is her ceiling. Sound is not decoration in this game, it is the
// player's only instrument for tracking her during an absence. `ambience` is that instrument.
// ---------------------------------------------------------------------------

/**
 * Spelled out rather than using null, because "leave the music alone" and "cut the music" are
 * completely different instructions and horror needs to be able to say the second one on purpose.
 */
export type AudioDirection<Cue> =
  | { kind: 'unchanged' }
  | { kind: 'play'; cue: Cue }
  | { kind: 'stop' };

export type Audio = {
  music: AudioDirection<MusicCue>;

  /** Water running, the television, the back door, her weight on the stairs. */
  ambience: AudioDirection<AmbienceCue>;

  /** One-shots fired with this beat. Empty list is normal and fine. */
  sfx: SfxCue[];
};

// ---------------------------------------------------------------------------
// choices and timers
// ---------------------------------------------------------------------------

/**
 * A single condition to check. Same shape the reaction rules use for their `when` blocks, so
 * there is one way to express "only if" across the whole game.
 * (Will move to a shared file once the rule database exists.)
 */
export type CriterionValue =
  | string
  | number
  | boolean
  | {
      gte?: number;
      lte?: number;
      gt?: number;
      lt?: number;
      ne?: string | number | boolean;
      in?: (string | number)[];
    };

/**
 * A bag of conditions, all of which must pass. An empty bag always passes — that is the
 * catch-all every action is required to have.
 *
 * Keyed by the fact catalogue, so a condition naming something the game has never heard of is
 * a compile error where it is written in TypeScript, and a startup error where it comes out of
 * a content file. Silently never matching is not one of the options.
 */
export type Criteria = { [K in FactId]?: CriterionValue };

export type Choice = {
  id: ChoiceId;

  /** What the player sees on the button. */
  label: string;

  /** Conditions for offering it at all. Empty means always. */
  requires: Criteria;
};

/**
 * Design doc §12. Timers scale with her mood — see the mood table in §3 of the design doc.
 *
 * The accessibility contract: a global multiplier applies to everything, and a disable switch
 * removes every timer except `dramatic` ones, where the clock running out *is* the scene.
 * If more than two or three beats in the whole game are `dramatic`, that's a design smell.
 */
export type TimerSpec =
  | { kind: 'none' }                     // take as long as you like
  | { kind: 'mood_scaled' }              // the default. Length comes from her current mood
  | { kind: 'dramatic'; seconds: number }; // exempt from the disable switch. Use almost never

export type Prompt = {
  choices: Choice[];
  timer: TimerSpec;
};

// ---------------------------------------------------------------------------
// The beat
// ---------------------------------------------------------------------------

export type Beat = {
  id: BeatId;

  speaker: Speaker;

  /**
   * The line itself. **Never carries presentation information.** "She looks annoyed" is wrong;
   * `portrait.mood: 'irritated'` is right. Prose that describes her face is prose a sprite
   * layer can never replace, and it is the single easiest way to lose the VN conversion.
   */
  text: string;

  /** Hard rule 5. Present on every beat, always, even though the text build discards it. */
  portrait: Portrait;

  /** Hard rule 5. */
  scene: Scene;

  /** Hard rule 5. */
  audio: Audio;

  /**
   * Design doc §12: time passes always, except during dialogue that doesn't need a response.
   * Only the last line before a prompt advances the clock, so a slow reader is never punished
   * for reading. Set false on every beat in a run except the one the prompt hangs off.
   */
  advancesClock: boolean;

  /** null when there is nothing to answer and the game moves on by itself. */
  prompt: Prompt | null;

  /** v2. See ConfidenceRegister above. null = usable at any calibration. */
  register: ConfidenceRegister | null;
};

// ---------------------------------------------------------------------------
// The art manifest
//
// The point of all the tagging above: the art budget is countable before anything is drawn.
// Walk every beat in content, collect the distinct combinations, and you get the exact list.
//
//   backgrounds = locations x light states       1 x 3 = 3 today, 6 with the second location
//                 (timeOfDay and weather are overlays and tints on those, not new paintings)
//   sprites     = moods x poses                  6 x 5 = 30 ceiling, far fewer in practice
//
// If either number comes back frightening, the fix is to cut a pose or a light state now,
// while it costs a find-and-replace instead of a commission.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Save/load guarantee — same check state.ts uses.
//
// Beats aren't saved today, but a scrollback log is a normal thing to want later, and this
// also guarantees no beat can smuggle a function past the renderer boundary.
// ---------------------------------------------------------------------------

type Saveable =
  | string | number | boolean | null
  | Saveable[]
  | { [key: string]: Saveable };

type MustBeSaveable<T extends Saveable> = T;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _BeatSurvivesSaveLoad = MustBeSaveable<Beat>;
