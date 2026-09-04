/**
 * Girl's Room — one turn.
 *
 * The player does one thing. This walks it down the eight stages, in order, and hands back a
 * new game and the beats to show. That is the entire public surface of the engine: everything
 * else in here is private machinery.
 *
 *   1. VALIDITY   can this happen?
 *   2. EFFECTS    what changed in the room
 *   3. WORLD      time and the world move on, with or without you
 *   4. NOISE      how loud was it, and what covered it
 *   5. DETECTION  does she notice — now, later, or never
 *   6. APPRAISAL  how she feels about it. The only stage that moves a meter
 *   7. REACTION   what she does
 *   8. BEATS      what the player reads
 *
 * The stages never call each other and never import each other. Each is handed the state as it
 * stands and whatever earlier stages worked out, and returns its own piece. Adding a system to
 * this game means adding a stage here, not threading a dependency through five files.
 *
 * Nothing in this file touches the outside world — no screen, no disk, no clock but its own.
 * That is what lets the headless harness run five thousand games without a browser.
 */

import type { GameState } from './state.ts';
import type { Beat } from './beat.ts';
import type { ContentBundle } from './content.ts';
import { buildQuery } from './query.ts';
import { dueCareNeed } from './care.ts';
import { worldEvents } from './events.ts';

import * as validity from './stages/validity.ts';
import * as effects from './stages/effects.ts';
import * as world from './stages/world.ts';
import * as noise from './stages/noise.ts';
import * as detection from './stages/detection.ts';
import * as appraisal from './stages/appraisal.ts';
import * as reaction from './stages/reaction.ts';
import * as beatsStage from './stages/beats.ts';

/** What the player is trying to do. `place` is only used by `hide`, the one two-target verb. */
export type TurnInput = {
  action: string;
  object: string | null;
  place: string | null;
};

export type TurnResult = {
  state: GameState;
  beats: Beat[];

  /**
   * What each stage concluded. The game itself never reads this — it is here so the test
   * harness can say *why* a run went the way it did, and so a failure post-mortem can name
   * the facts that produced it (design doc §14).
   */
  trace: {
    validity: validity.ValidityResult;
    noise: noise.NoiseResult;
    detection: detection.DetectionResult;
    ruleId: string | null;

    /** Her half of a care scene, when one was open. */
    offerRuleId: string | null;

    /** What the world said for itself — she reached the stairs, she came in, the day turned. */
    eventRuleIds: string[];
  };
};

export function takeTurn(
  startingState: GameState, content: ContentBundle, input: TurnInput,
): TurnResult {
  // What she was already holding out before this turn, so her offer plays once when the scene
  // opens rather than every turn until it is answered.
  const careWasDue = dueCareNeed(startingState, content);

  // 1. VALIDITY — decides only. Writes nothing.
  const validityResult = validity.run(startingState, content, input);

  // 2. EFFECTS — the room, the clock, what the player knows.
  let state = effects.run(startingState, content, input, validityResult);

  // 3. WORLD — her, the house, the body. Runs whether or not the action was allowed,
  //    because her life does not pause while you fail to reach the drawer. It is handed the
  //    action because the body is its territory and eating is a thing that happens to a body.
  state = world.run(state, content, input, validityResult);

  // 4. NOISE — decides only.
  const noiseResult = noise.run(state, content, input, validityResult);

  // 5. DETECTION — her picture of the room, and the pending queue.
  const detected = detection.run(state, content, input, validityResult, noiseResult);
  state = detected.state;

  // When a deferred consequence lands, she is reacting to the thing she just found — not to
  // whatever you happened to be doing at the moment she found it. Waiting quietly is not what
  // the scene is about; the open drawer is. So the rule lookup is asked about the earlier act.
  const fired = detected.result.fired;
  const subject = fired === null
    ? { action: input.action, object: input.object }
    : { action: fired.cause as string, object: fired.objectId as string | null };

  // What the world did on its own while that was happening — she started up the stairs, she
  // came in, a day turned over. Worked out by comparing the room before and after rather than
  // being recorded anywhere, so there is nothing to keep in step (see engine/events.ts).
  const events = worldEvents(startingState, state);

  // Everything true about this instant, flattened, for the rule database to match against.
  const facts = buildQuery(state, content, {
    action: subject.action,
    object: subject.object,
    place: input.place,
    deferred: fired !== null,
    events,
    knownBefore: startingState.player.knows,
    validity: validityResult,
    noise: noiseResult,
    detection: detected.result,
  });

  // 6. APPRAISAL — the meters. The only stage allowed near them.
  const minutesPassed = state.meta.minutesElapsed - startingState.meta.minutesElapsed;
  const appraised = appraisal.run(
    state, content, subject.action, facts, minutesPassed, careWasDue, events,
  );
  state = appraised.state;

  // 7. REACTION — which beats.
  const reacted = reaction.run(content, appraised.result);

  // 8. BEATS — the words, with every presentation tag stamped on.
  const beats = beatsStage.run(state, content, reacted.beats);

  return {
    state,
    beats,
    trace: {
      validity: validityResult,
      noise: noiseResult,
      detection: detected.result,
      ruleId: appraised.result.ruleId,
      offerRuleId: appraised.result.offerRuleId,
      eventRuleIds: appraised.result.eventRuleIds,
    },
  };
}
