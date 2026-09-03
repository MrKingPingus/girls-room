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
import type { ContentBundle } from '../engine/content.ts';
import type { GameState } from '../engine/state.ts';
import { clockFace } from '../engine/clock.ts';

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

export type MenuEntry = {
  key: string;
  label: string;
  action: string;
  object: string | null;
  place: string | null;
};

/**
 * Design doc §13: the text build is a verb menu. Every verb that could apply to something is
 * offered — including ones that will fail, because a refusal is content and the player learning
 * *why* they can't reach the drawer is the game teaching them the reach system.
 */
export function buildMenu(state: GameState, content: ContentBundle): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const push = (label: string, action: string, object: string | null, place: string | null) =>
    entries.push({ key: String(entries.length + 1), label, action, object, place });

  for (const action of content.actions) {
    if (action.target !== 'none') continue;
    push(action.name, action.id, null, null);
  }

  const known = content.objects.filter((def) => state.objects[def.id]?.known === true);

  for (const object of known) {
    const objectState = state.objects[object.id];
    if (objectState === undefined) continue;

    push(`Look at ${object.name}`, 'look', object.id, null);

    // Everything below is offered even when it will fail. Hard rule 8: a refusal is content,
    // and "you can't reach that from where you are" is how the player learns the reach system
    // without ever being told it exists. A greyed-out option teaches nothing.
    if (object.container) {
      push(`${objectState.open === true ? 'Close' : 'Open'} ${object.name}`, 'open', object.id, null);
    }
    if (object.togglable === true) {
      push(`${objectState.on === true ? 'Switch off' : 'Switch on'} ${object.name}`,
        'light_lamp', object.id, null);
    }
    if (objectState.location.kind !== 'carried') {
      push(`Take ${object.name}`, 'take', object.id, null);
    }
    for (const verb of object.verbs ?? []) {
      const def = content.actions.find((a) => a.id === verb);
      if (def !== undefined && def.effect !== 'toggle_on') push(def.name, verb, object.id, null);
    }
  }

  // move and hide need somewhere to put the thing, so they are offered per place.
  const movable = known.filter((def) => {
    const here = state.objects[def.id];
    return here !== undefined && here.location.kind !== 'gone';
  });
  for (const object of movable) {
    const here = state.objects[object.id];
    if (here === undefined) continue;
    for (const place of content.places) {
      const alreadyThere =
        (here.location.kind === 'placed' || here.location.kind === 'hidden')
        && here.location.place === place.id;
      if (alreadyThere) continue;
      if (here.location.kind === 'carried') {
        push(`Hide ${object.name} ${place.name}`, 'hide', object.id, place.id);
      } else if (place.reach <= state.player.mobility) {
        push(`Move ${object.name} to ${place.name}`, 'move', object.id, place.id);
      }
    }
  }

  return entries;
}
