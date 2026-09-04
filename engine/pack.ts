/**
 * Girl's Room — scenario packs.
 *
 * A pack is a scenario somebody wrote: a handful of rows added on top of the game's own
 * content. New things in the room, new verbs bound to them, new rules for how she answers, and
 * the lines she says. It is data and only ever data — hard rule 4 in the other direction. A
 * pack cannot contain logic, so a pack from a stranger cannot do anything a content file
 * couldn't, which is what makes handing the authoring tools to playtesters safe.
 *
 * Two rules about how a pack meets the base game, both chosen so that turning a pack off is
 * always safe:
 *
 *   - **A pack only adds.** There is no way to delete a row the base game ships.
 *   - **A colliding id is an override, and it is announced.** A pack that defines `thanks_warm`
 *     replaces the built-in one. That is deliberate — retuning a moment that already exists is
 *     the most common thing an author wants — so the builder says so in as many words rather
 *     than letting it happen quietly.
 *
 * Pure, like the rest of `engine/`. Reading and writing pack files is `app/`'s job.
 */

import type {
  ActionDef, BeatLibrary, ContentBundle, ObjectDef, ReactionRule,
} from './content.ts';
import type { Problem } from './validate.ts';
import { ContentError, validateContent } from './validate.ts';

export type ScenarioPack = {
  /** Short id, lower case and dashes. Used as a filename and to name the pack in a save. */
  pack: string;

  /** What it is called on screen. */
  title: string;

  author?: string;

  /** What this scenario is meant to do, in the author's own words. Never shown in the game. */
  notes?: string;

  objects?: ObjectDef[];
  actions?: ActionDef[];
  reactions?: ReactionRule[];
  beats?: BeatLibrary;

  /**
   * A run that proves it fires. The whole engine is deterministic, so a seed and a list of
   * moves put the scene back on screen exactly — which is how a pack arrives with evidence
   * instead of a promise. Written by the builder when the author tests in the room.
   */
  tested?: { seed: number; moves: string[] };
};

/** What a pack replaces, by content file. Everything in here is an existing id being taken over. */
export type Overrides = {
  objects: string[];
  actions: string[];
  reactions: string[];
  beats: string[];
};

const PACK_ID = /^[a-z0-9][a-z0-9-]*$/;

/** The content files a pack may carry. Places and her schedule are deliberately not among them. */
const CARRIES = ['objects', 'actions', 'reactions', 'beats'] as const;

/**
 * Lay packs over the base content, in order. Later packs win over earlier ones.
 *
 * Returns a new bundle; nothing is mutated, so the base content stays exactly as loaded and
 * turning a pack off is a matter of merging again without it.
 */
export function applyPacks(base: ContentBundle, packs: readonly ScenarioPack[]): ContentBundle {
  let merged: ContentBundle = base;
  for (const pack of packs) {
    merged = {
      ...merged,
      objects: mergeById(merged.objects, pack.objects),
      actions: mergeById(merged.actions, pack.actions),
      reactions: mergeById(merged.reactions, pack.reactions),
      beats: { ...merged.beats, ...pack.beats },
    };
  }
  return merged;
}

/** Which of the base game's rows this pack takes over. For telling the author before they commit. */
export function overriddenBy(base: ContentBundle, pack: ScenarioPack): Overrides {
  return {
    objects: collisions(base.objects, pack.objects),
    actions: collisions(base.actions, pack.actions),
    reactions: collisions(base.reactions, pack.reactions),
    beats: Object.keys(pack.beats ?? {}).filter((id) => id in base.beats),
  };
}

export function hasOverrides(overrides: Overrides): boolean {
  return CARRIES.some((file) => overrides[file].length > 0);
}

/**
 * Check a pack's own shape, before it is laid over anything.
 *
 * Whether its *contents* make sense is not decided here — that needs the base game alongside
 * it, because a pack's rule is allowed to name an object the base game ships. Merge first, then
 * run the normal content validator over the result. `loadPacked` below does both.
 */
export function validatePack(raw: unknown): Problem[] {
  const problems: Problem[] = [];
  const add = (where: string, what: string, level: Problem['level'] = 'error') =>
    problems.push({ where, what, level });

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    add('pack', 'a pack file must be an object');
    return problems;
  }
  const pack = raw as Record<string, unknown>;

  const id = pack['pack'];
  if (typeof id !== 'string' || !PACK_ID.test(id)) {
    add('pack.pack', 'needs a short id in lower case, letters, numbers and dashes only');
  }
  if (typeof pack['title'] !== 'string' || pack['title'].length === 0) {
    add('pack.title', 'needs a title — it is how you will find this again');
  }
  for (const field of ['author', 'notes'] as const) {
    if (pack[field] !== undefined && typeof pack[field] !== 'string') {
      add(`pack.${field}`, 'must be text');
    }
  }

  for (const file of ['places', 'schedule'] as const) {
    if (pack[file] !== undefined) {
      add(`pack.${file}`,
        `a pack cannot change ${file === 'places' ? 'the room itself' : 'her routine'} yet. `
        + 'That is stage 3 of the builder, and it is not built');
    }
  }

  for (const file of ['objects', 'actions', 'reactions'] as const) {
    const rows = pack[file];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      add(`pack.${file}`, 'must be a list');
      continue;
    }
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      if (typeof row !== 'object' || row === null) {
        return add(`pack.${file}[${i}]`, 'must be an object');
      }
      const rowId = (row as Record<string, unknown>)['id'];
      if (typeof rowId !== 'string' || rowId.length === 0) {
        return add(`pack.${file}[${i}].id`, 'missing or not a string');
      }
      if (seen.has(rowId)) add(`pack.${file}[${i}].id`, `"${rowId}" appears twice in this pack`);
      seen.add(rowId);
    });
  }

  const beats = pack['beats'];
  if (beats !== undefined && (typeof beats !== 'object' || beats === null || Array.isArray(beats))) {
    add('pack.beats', 'must be an object of beat id -> beat');
  }

  const tested = pack['tested'];
  if (tested !== undefined) {
    if (typeof tested !== 'object' || tested === null || Array.isArray(tested)) {
      add('pack.tested', 'must be an object with a seed and a list of moves');
    } else {
      const proof = tested as Record<string, unknown>;
      if (typeof proof['seed'] !== 'number') add('pack.tested.seed', 'must be a number');
      if (!Array.isArray(proof['moves'])) add('pack.tested.moves', 'must be a list of moves');
    }
  }

  const known = new Set<string>([...CARRIES, 'pack', 'title', 'author', 'notes', 'tested']);
  for (const key of Object.keys(pack)) {
    if (!known.has(key) && key !== 'places' && key !== 'schedule') {
      add(`pack.${key}`, `nothing reads "${key}". It would be dropped silently`, 'warning');
    }
  }

  return problems;
}

/**
 * The base game with these packs laid over it, checked as one whole, or a loud failure saying
 * everything that is wrong with it. This is what the game and the builder both load through.
 */
export function loadPacked(base: ContentBundle, packs: readonly ScenarioPack[]): ContentBundle {
  const problems = packs.flatMap((pack) =>
    validatePack(pack).map((p) => ({ ...p, where: `${pack.pack}: ${p.where}` })));

  const merged = applyPacks(base, packs);
  problems.push(...validateContent(merged));

  if (problems.some((p) => p.level === 'error')) throw new ContentError(problems);
  return merged;
}

// ---------------------------------------------------------------------------

type Identified = { id: string };

/** Replace rows sharing an id, in place; append the rest. Order stays readable. */
function mergeById<T extends Identified>(base: readonly T[], incoming: readonly T[] | undefined): T[] {
  if (incoming === undefined || incoming.length === 0) return [...base];
  const byId = new Map(incoming.map((row) => [row.id, row]));
  const merged = base.map((row) => byId.get(row.id) ?? row);
  const existing = new Set(base.map((row) => row.id));
  for (const row of incoming) if (!existing.has(row.id)) merged.push(row);
  return merged;
}

function collisions<T extends Identified>(base: readonly T[], incoming: readonly T[] | undefined): string[] {
  const existing = new Set(base.map((row) => row.id));
  return (incoming ?? []).filter((row) => existing.has(row.id)).map((row) => row.id);
}
