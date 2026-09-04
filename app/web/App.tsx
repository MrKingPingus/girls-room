/**
 * Girl's Room — the shell.
 *
 * Two tabs over one game: the room, and the scenario builder. The shell owns the things both
 * need to agree about — which scenario packs are switched on, and therefore what content the
 * game is actually running.
 *
 * Everything below this line is a dev build. The builder is not something a player ever sees.
 */

import { useMemo, useState } from 'react';

import type { GameState } from '../../engine/state.ts';
import type { ContentBundle } from '../../engine/content.ts';
import { newGame } from '../../engine/newgame.ts';
import { loadPacked } from '../../engine/pack.ts';
import { loadBundledContent } from '../content.ts';
import { activePacks, loadShelf, saveShelf, type PackShelf } from '../packs.ts';
import * as saves from '../save.ts';
import Game from './Game.tsx';
import Builder from './builder/Builder.tsx';

/** The game as it ships, before anybody's scenarios are laid over it. */
const base = loadBundledContent();

function freshSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export default function App() {
  const [shelf, setShelfState] = useState<PackShelf>(loadShelf);
  const [tab, setTab] = useState<'room' | 'builder'>('room');

  function setShelf(next: PackShelf) {
    setShelfState(next);
    saveShelf(next);
  }

  const packs = useMemo(() => activePacks(shelf), [shelf]);
  const packKey = packs.map((pack) => pack.pack).join('|');

  /**
   * The content the game runs on. A pack that fails to load stops the room rather than
   * half-applying — hard rule 9, and the builder is the place that says what is wrong with it.
   */
  const loaded = useMemo((): { content: ContentBundle } | { failed: string } => {
    try {
      return { content: loadPacked(base, packs) };
    } catch (error) {
      return { failed: (error as Error).message };
    }
  }, [packs]);

  const content = 'content' in loaded ? loaded.content : base;

  /**
   * Where the run picks up.
   *
   * A save made with different packs loaded is not resumed: it can be full of things that no
   * longer exist, and a run that quietly behaves strangely is worse than one that starts again.
   * Changing which packs are on therefore starts a fresh run, which is what you want anyway
   * when the point is to see a new scenario from the beginning.
   */
  const start = useMemo((): { session: saves.Session; discarded: string[] | null } => {
    const saved = saves.load();
    const packIds = packKey === '' ? [] : packKey.split('|');
    if (saved !== null && sameSet(saved.packs, packIds)) {
      return { session: saved, discarded: null };
    }
    return {
      session: {
        state: newGame(content, { seed: freshSeed() }),
        packs: packIds,
        log: [],
        moves: [],
      },
      discarded: saved === null ? null : saved.packs,
    };
  }, [packKey, content]);

  return (
    <div className={tab === 'builder' ? 'shell wide' : 'shell'}>
      <nav className="tabs">
        <button className={tab === 'room' ? 'on' : undefined} onClick={() => setTab('room')}>
          The room
        </button>
        <button className={tab === 'builder' ? 'on' : undefined} onClick={() => setTab('builder')}>
          Scenarios
          {packs.length > 0 && <span className="count">{packs.length}</span>}
        </button>
      </nav>

      {'failed' in loaded && (
        <div className="alarm">
          <strong>The scenarios that are switched on will not load, so the room is running
          without them.</strong>
          <pre>{loaded.failed}</pre>
        </div>
      )}

      {tab === 'room' ? (
        <>
          {start.discarded !== null && (
            <div className="notice">
              Your last run was played with {start.discarded.length === 0
                ? 'no scenarios'
                : start.discarded.join(', ')} loaded, so it has been set aside and this is a
              fresh run.
            </div>
          )}
          <Game
            key={packKey}
            content={content}
            packIds={packKey === '' ? [] : packKey.split('|')}
            initial={start.session}
          />
        </>
      ) : (
        <Builder base={base} content={content} shelf={shelf} onChange={setShelf} />
      )}
    </div>
  );
}
