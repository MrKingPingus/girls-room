/**
 * Girl's Room — the text renderer.
 *
 * Turns beats into lines of text. This is the *whole* renderer, and it is deliberately
 * disposable: it reads `speaker` and `text`, renders the prompt, and throws away every
 * presentation tag on the beat. The visual novel renderer will live beside this one, read the
 * tags this one discards, and require no change whatsoever to the engine.
 *
 * That is the swap the entire architecture is built around, so nothing in here may ever leak
 * back the other way. This module imports from `engine/`; `engine/` never imports from here.
 */

import type { Beat } from '../engine/beat.ts';
import type { GameState } from '../engine/state.ts';
import { clockFace } from '../engine/clock.ts';

export { buildMenu, buildRoomMenu } from './menu.ts';
export type { MenuEntry, ObjectGroup, RoomMenu } from './menu.ts';

export function renderBeat(beat: Beat): string {
  switch (beat.speaker) {
    case 'her':
      return `  ${beat.text}`;
    case 'player_thought':
      return `  (${beat.text})`;
    case 'narrator':
      return `  ${beat.text}`;
  }
}

export function renderBeats(beats: Beat[]): string {
  return beats.map(renderBeat).join('\n');
}

/**
 * The status line. Deliberately thin: design doc §9 says the player reads their own inference
 * from the journal, not the real numbers. Nothing hidden is shown here — no affection, no
 * trust, no suspicion. The time, the light, and the body are things the player can just tell.
 */
export function renderStatus(state: GameState): string {
  const parts = [
    `Day ${state.meta.day}`,
    clockFace(state.meta.minutesElapsed),
    state.world.light,
    state.her.location === 'attic' ? 'she is here' : 'you are alone',
  ];
  if (state.player.pain >= 60) parts.push('in a lot of pain');
  else if (state.player.pain >= 30) parts.push('sore');
  return parts.join(' · ');
}
