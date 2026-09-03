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

export function save(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A full or blocked store is not worth interrupting a run over.
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const state = JSON.parse(raw) as GameState;
    // A save from an older shape is refused rather than half-read into a broken run.
    if (state?.meta?.schemaVersion !== SCHEMA_VERSION) return null;
    return state;
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
