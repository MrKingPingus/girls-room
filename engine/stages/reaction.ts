/**
 * Stage 7 — REACTION. What does she actually do?
 *
 * Writes nothing. The previous stage already chose the rule; this turns that choice into the
 * list of beats to play, and guarantees there is always something.
 *
 * The guarantee matters: the content validator refuses to load a game where any action lacks
 * a catch-all rule, so under normal circumstances this can't come up empty. This is the belt
 * to that braces — if it ever did, the player would be staring at a blank screen with no idea
 * whether the game broke or they did.
 */

import type { ContentBundle } from './../content.ts';
import type { AppraisalResult } from './appraisal.ts';

export type ReactionResult = {
  beats: string[];
};

export function run(content: ContentBundle, appraisal: AppraisalResult): ReactionResult {
  const beats = appraisal.beats.filter((id) => content.beats[id] !== undefined);
  return { beats };
}
