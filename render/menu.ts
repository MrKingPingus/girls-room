/**
 * Girl's Room — what the player can do right now.
 *
 * Shared by every renderer. Working out the available moves is not a presentation decision —
 * it is the same answer whether it comes out as a numbered list in a terminal or a column of
 * buttons in a browser — so it lives in one place rather than being reimplemented per
 * renderer and quietly drifting apart.
 *
 * Design doc §13: the text build is a verb menu; the eventual visual build is point-and-click
 * on the room with verbs revealed per object. `buildRoomMenu` is already shaped that way —
 * pick a thing, then pick what to do to it — so the visual layer inherits it unchanged.
 */

import type { ContentBundle } from '../engine/content.ts';
import type { GameState } from '../engine/state.ts';

export type MenuEntry = {
  key: string;
  label: string;
  action: string;
  object: string | null;
  place: string | null;
};

export type ObjectGroup = {
  objectId: string;
  name: string;
  entries: MenuEntry[];
};

export type RoomMenu = {
  /** Things you do without touching anything — listen, wait, rest. */
  general: MenuEntry[];
  objects: ObjectGroup[];
};

/**
 * Everything available, flat and numbered. Includes moves that will fail: hard rule 8, a
 * refusal is content, and "you can't reach that from where you are" is how the player learns
 * the reach system without ever being told it exists. A hidden option teaches nothing.
 */
export function buildMenu(state: GameState, content: ContentBundle): MenuEntry[] {
  const room = buildRoomMenu(state, content);
  const flat = [...room.general, ...room.objects.flatMap((group) => group.entries)];
  return flat.map((entry, index) => ({ ...entry, key: String(index + 1) }));
}

export function buildRoomMenu(state: GameState, content: ContentBundle): RoomMenu {
  const entry = (label: string, action: string, object: string | null, place: string | null):
    MenuEntry => ({ key: '', label, action, object, place });

  const general = content.actions
    .filter((action) => action.target === 'none')
    .map((action) => entry(action.name, action.id, null, null));

  const groups: ObjectGroup[] = [];

  for (const object of content.objects) {
    const here = state.objects[object.id];
    if (here === undefined || !here.known || here.location.kind === 'gone') continue;

    const entries: MenuEntry[] = [entry('Look at it', 'look', object.id, null)];

    if (object.container) {
      entries.push(entry(here.open === true ? 'Close it' : 'Open it', 'open', object.id, null));
    }
    if (object.togglable === true) {
      entries.push(entry(here.on === true ? 'Switch it off' : 'Switch it on',
        'light_lamp', object.id, null));
    }
    if (here.location.kind !== 'carried') {
      entries.push(entry('Take it', 'take', object.id, null));
    }
    for (const verb of object.verbs ?? []) {
      const def = content.actions.find((a) => a.id === verb);
      if (def !== undefined && def.effect !== 'toggle_on') {
        entries.push(entry(def.name, verb, object.id, null));
      }
    }

    // Reach failures are offered on purpose — that refusal is how the reach system is taught.
    // "Move the drawer to the bed" teaches nothing, so relocation is offered only where it
    // could ever make sense.
    for (const place of object.portable ? content.places : []) {
      const alreadyThere =
        (here.location.kind === 'placed' || here.location.kind === 'hidden')
        && here.location.place === place.id;
      if (alreadyThere) continue;

      if (here.location.kind === 'carried') {
        entries.push(entry(`Hide it ${place.name}`, 'hide', object.id, place.id));
      } else if (place.reach <= state.player.mobility) {
        entries.push(entry(`Move it to ${place.name}`, 'move', object.id, place.id));
      }
    }

    groups.push({ objectId: object.id, name: object.name, entries });
  }

  return { general, objects: groups };
}
