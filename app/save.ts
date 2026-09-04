/**
 * Girl's Room — saves.
 *
 * The entire game is one plain object that survives being written out and read back, which is
 * the whole reason hard rule 2 exists. So a save is: turn it into text, put the text somewhere.
 * There is no save system to speak of, and that is the point.
 *
 * Lives in `app/` because it touches the browser. The engine never does.
 */

import type { GameState } from '../engine/state.ts';
import { SCHEMA_VERSION } from '../engine/newgame.ts';

const KEY = 'girls-room:save';

/**
 * A save is the run plus a note of which scenario packs were switched on when it was made.
 *
 * The packs are stored *beside* the state, not inside it. A pack is content, not something the
 * simulation knows about, and putting it in the state would mean a new field with an owning
 * stage — which is a lie, because no stage writes it.
 *
 * It has to be recorded somewhere, though: a run played with a pack loaded can be full of
 * things that stop existing the moment that pack is switched off. Knowing which packs a save
 * expects is what lets the game say so instead of behaving strangely.
 */
export type SaveFile = {
  state: GameState;
  packs: string[];
};

export function save(state: GameState, packs: readonly string[] = []): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ state, packs: [...packs] } satisfies SaveFile));
  } catch {
    // A full or blocked store is not worth interrupting a run over.
  }
}

export function load(): SaveFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<SaveFile> & Partial<GameState>;

    // Saves written before packs existed are the bare run. Still perfectly good.
    const file: SaveFile = parsed.state === undefined
      ? { state: parsed as GameState, packs: [] }
      : { state: parsed.state, packs: Array.isArray(parsed.packs) ? parsed.packs : [] };

    // A save from an older shape is refused rather than half-read into a broken run.
    if (file.state?.meta?.schemaVersion !== SCHEMA_VERSION) return null;
    return file;
  } catch {
    return null;
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to be done, and nothing that matters.
  }
}
