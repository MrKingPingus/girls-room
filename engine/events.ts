/**
 * Girl's Room — things the world did, worth saying out loud.
 *
 * Her schedule has always been real: she is in the kitchen at eleven and back up at one, and
 * `listen` will tell you so. What the game never did was **mention it**. She moved between
 * floors in silence, and the only way to know she had walked into the attic was that the menu
 * quietly grew a section. A rhythm the player cannot hear is not a rhythm.
 *
 * So: a small, closed list of moments where the world speaks without being spoken to. She
 * starts up the stairs, she comes in, she goes, a day turns over, the light goes.
 *
 * **Derived, never stored.** Every one of these is a difference between how the room was at
 * the top of the turn and how it is now, which is information the turn already has. Storing
 * "she just arrived" would be a state field with an owner, and it could disagree with where
 * she actually is. `care.ts` works exactly this way and for exactly this reason.
 *
 * **Not a pipeline stage.** It answers a question, it writes nothing, and stages may not ask
 * each other things (hard rule 6).
 *
 * How one of these becomes words: an action in `content/actions.json` marked `raisedBy`, with
 * rules in the database like any other verb. So what she says on the stairs can depend on her
 * mood, the day, how suspicious she is — the whole fact bag — and adding a new line is a row
 * in a file. The mechanism is the one her care offers already use (design doc §8): a second
 * thing happening in the same moment as whatever the player did.
 */

import type { GameState } from './state.ts';
import type { WorldEvent } from './vocab.ts';
import { dayOf } from './clock.ts';

/**
 * What changed between these two pictures of the room, in the order it should be said.
 *
 * The order is the order of the fiction, not the order of the code: the day turns over before
 * anything happens in it, you hear her on the stairs before she is in the room, and the light
 * going is the last thing said about a day.
 */
export function worldEvents(before: GameState, after: GameState): WorldEvent[] {
  const events: WorldEvent[] = [];

  // The run's first move counts as the day beginning — the opening of the game is the moment
  // that most needs saying, and nothing has "changed" on turn one by definition.
  //
  // Measured as the clock leaving zero rather than as "no time has passed yet", because a
  // refused action costs nothing: testing the before-picture alone would replay the opening
  // of the game on every failed move until the player did something that worked.
  const opening = before.meta.minutesElapsed === 0 && after.meta.minutesElapsed > 0;
  if (opening || dayOf(after.meta.minutesElapsed) !== dayOf(before.meta.minutesElapsed)) {
    events.push('day_begins');
  }

  const wasHere = before.her.location === 'attic';
  const isHere = after.her.location === 'attic';

  // Design doc §2b: the staircase is the early warning, and it is the player's only one.
  //
  // Only on the way *up*. She crosses the stairs in both directions, but going down is
  // already the departure below, and raising both gave her a line about climbing unhurriedly
  // followed immediately by a line about walking out.
  if (!wasHere && before.her.location !== 'stairs' && after.her.location === 'stairs') {
    events.push('she_on_stairs');
  }
  if (!wasHere && isHere) events.push('she_arrives');
  if (wasHere && !isHere) events.push('she_leaves');

  if (before.world.phase !== 'sleep' && after.world.phase === 'sleep') {
    events.push('night_falls');
  }

  return events;
}
