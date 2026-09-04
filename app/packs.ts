/**
 * Girl's Room — keeping scenario packs, in the browser.
 *
 * Packs live in the browser's own storage while you work on them, and leave as files. There is
 * no server and no account: a pack is a file you can hand to somebody, which is the whole
 * point of the format.
 *
 * Lives in `app/` because it touches storage and the page. `engine/pack.ts` does the merging
 * and knows nothing about either.
 */

import type { ScenarioPack } from '../engine/pack.ts';
import type { Problem } from '../engine/validate.ts';
import { validatePack } from '../engine/pack.ts';

const KEY = 'girls-room:packs';

export type PackShelf = {
  packs: ScenarioPack[];

  /** Which are switched on, in the order they are laid over the game. */
  enabled: string[];
};

const EMPTY: PackShelf = { packs: [], enabled: [] };

export function loadShelf(): PackShelf {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return EMPTY;
    const shelf = JSON.parse(raw) as Partial<PackShelf>;
    if (!Array.isArray(shelf.packs)) return EMPTY;
    const packs = shelf.packs;
    const known = new Set(packs.map((pack) => pack.pack));
    return {
      packs,
      // A pack switched on and then deleted must not linger in the enabled list.
      enabled: (Array.isArray(shelf.enabled) ? shelf.enabled : []).filter((id) => known.has(id)),
    };
  } catch {
    return EMPTY;
  }
}

export function saveShelf(shelf: PackShelf): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(shelf));
  } catch {
    // A full or blocked store is not worth losing the screen over. The export button is the
    // real safety net, and the builder says so.
  }
}

/** The packs that are switched on, in order. What the game is actually running. */
export function activePacks(shelf: PackShelf): ScenarioPack[] {
  return shelf.enabled
    .map((id) => shelf.packs.find((pack) => pack.pack === id))
    .filter((pack): pack is ScenarioPack => pack !== undefined);
}

export function putPack(shelf: PackShelf, pack: ScenarioPack): PackShelf {
  const packs = shelf.packs.some((existing) => existing.pack === pack.pack)
    ? shelf.packs.map((existing) => (existing.pack === pack.pack ? pack : existing))
    : [...shelf.packs, pack];
  return { packs, enabled: shelf.enabled };
}

export function removePack(shelf: PackShelf, id: string): PackShelf {
  return {
    packs: shelf.packs.filter((pack) => pack.pack !== id),
    enabled: shelf.enabled.filter((enabled) => enabled !== id),
  };
}

export function setEnabled(shelf: PackShelf, id: string, on: boolean): PackShelf {
  if (on) {
    return shelf.enabled.includes(id) ? shelf : { ...shelf, enabled: [...shelf.enabled, id] };
  }
  return { ...shelf, enabled: shelf.enabled.filter((enabled) => enabled !== id) };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** A pack as it leaves. Pretty-printed, because a person is going to read this. */
export function packToFile(pack: ScenarioPack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

export type PackRead =
  | { ok: true; pack: ScenarioPack }
  | { ok: false; problems: Problem[] };

/** Read a pack somebody sent. Never trusted — it goes through the same checks as anything else. */
export function packFromFile(text: string): PackRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      problems: [{
        where: 'pack',
        what: `this is not a readable file — ${(error as Error).message}`,
        level: 'error',
      }],
    };
  }

  const problems = validatePack(parsed);
  if (problems.some((problem) => problem.level === 'error')) return { ok: false, problems };
  return { ok: true, pack: parsed as ScenarioPack };
}

/** Hand a file to the person at the keyboard. */
export function download(name: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
