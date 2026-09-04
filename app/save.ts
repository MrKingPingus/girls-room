/**
 * Girl's Room — saves.
 *
 * The entire game is one plain object that survives being written out and read back, which is
 * the whole reason hard rule 2 exists. So a save is: turn it into text, put the text somewhere.
 * There is no save system to speak of, and that is the point.
 *
 * Lives in `app/` because it touches the browser. The engine never does.
 */

import type { Beat } from '../engine/beat.ts';
import type { GameState } from '../engine/state.ts';
import { SCHEMA_VERSION } from '../engine/newgame.ts';

/**
 * One entry in the scrollback: what you did, and what came of it.
 *
 * Saved along with the run. Without it a refresh restores the game correctly and then shows the
 * opening description again, which reads exactly like starting over — the save works and the
 * screen says it didn't.
 */
export type LogEntry = {
  id: number;
  you: string | null;
  beats: Beat[];
  repeats: number;
};

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

  /** What is on screen, so a refresh continues the scene rather than appearing to restart it. */
  log: LogEntry[];

  /**
   * Every move of the run so far, in the compact form the replay command takes.
   *
   * This is what makes a test report survive a refresh. A report's value is its replay line, and
   * a replay line missing the first half of the run does not reproduce the run — it reproduces a
   * different one, silently. Stored as moves rather than as whole recorded turns because the
   * moves are a few bytes each and everything else can be rebuilt from them by replaying.
   */
  moves: string[];
};

export type Session = {
  state: GameState;
  packs: readonly string[];
  log: readonly LogEntry[];
  moves: readonly string[];
};

export function save(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      state: session.state,
      packs: [...session.packs],
      log: [...session.log],
      moves: [...session.moves],
    } satisfies SaveFile));
  } catch {
    // A full or blocked store is not worth interrupting a run over.
  }
}

export function load(): SaveFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<SaveFile> & Partial<GameState>;

    // Saves written before any of this existed are the bare run. Still perfectly good — they
    // come back with an empty scrollback, which is what they had.
    const file: SaveFile = parsed.state === undefined
      ? { state: parsed as GameState, packs: [], log: [], moves: [] }
      : {
        state: parsed.state,
        packs: Array.isArray(parsed.packs) ? parsed.packs : [],
        log: Array.isArray(parsed.log) ? parsed.log : [],
        moves: Array.isArray(parsed.moves) ? parsed.moves : [],
      };

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
