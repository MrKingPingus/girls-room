/**
 * Girl's Room — content validation.
 *
 * Hard rule 9: a typo'd id fails loudly at startup. It never produces a rule that quietly
 * never fires, because in a system this size a rule that stopped firing looks exactly like a
 * rule that was never reached, and you can lose days to the difference.
 *
 * This runs once, at load, over the parsed JSON — before any of it is trusted. It reports
 * *every* problem it finds rather than stopping at the first, so a content pass gets fixed in
 * one go instead of one error at a time.
 *
 * Pure: no file reading, no network, no console. It takes data and returns a list of problems.
 * Whoever called it decides what to do about them.
 */

import type { ContentBundle } from './content.ts';
import {
  ACTIVITIES, CHANGE_TIERS, CONFIDENCE_REGISTERS, HOUSE_LOCATIONS, LIGHTS,
  MOBILITY_TIERS, MOODS, NOISE_LEVELS, PHASES, POSES, SCENE_LOCATIONS,
  SPEAKERS, TIMES_OF_DAY, UNIVERSAL_VERBS, WEATHERS,
} from './vocab.ts';

export type Problem = {
  /** Where it is, e.g. `objects[3].startsAt.place` — precise enough to go straight there. */
  where: string;

  /** What is wrong, in words a person can act on. */
  what: string;

  /**
   * `error` means the game must not start. `warning` means it will run but something is
   * probably not what you meant — content nothing can ever reach, most often.
   */
  level: 'error' | 'warning';
};

export class ContentError extends Error {
  readonly problems: Problem[];
  constructor(problems: Problem[]) {
    super(formatProblems(problems));
    this.name = 'ContentError';
    this.problems = problems;
  }
}

/** Human-readable report. Errors first, because those are the ones stopping the game. */
export function formatProblems(problems: Problem[]): string {
  const errors = problems.filter((p) => p.level === 'error');
  const warnings = problems.filter((p) => p.level === 'warning');
  const lines: string[] = [];

  if (errors.length > 0) {
    lines.push(`${errors.length} content error${errors.length === 1 ? '' : 's'}:`);
    for (const p of errors) lines.push(`  ✗ ${p.where}: ${p.what}`);
  }
  if (warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}:`);
    for (const p of warnings) lines.push(`  ! ${p.where}: ${p.what}`);
  }
  return lines.join('\n');
}

/**
 * Check a content bundle. Returns everything wrong with it.
 *
 * Takes `unknown` on purpose: this content came out of a JSON file, so at this moment the
 * compiler's promises are worthless and every field has to be checked for real. That check is
 * the whole point of the function.
 */
export function validateContent(raw: unknown): Problem[] {
  const problems: Problem[] = [];
  const add = (where: string, what: string, level: Problem['level'] = 'error') =>
    problems.push({ where, what, level });

  if (!isRecord(raw)) {
    add('content', 'expected an object with places, objects, actions, reactions, beats, schedule');
    return problems;
  }

  const places = asArray(raw['places']);
  const objects = asArray(raw['objects']);
  const actions = asArray(raw['actions']);
  const reactions = asArray(raw['reactions']);
  const schedule = asArray(raw['schedule']);
  const beats = isRecord(raw['beats']) ? raw['beats'] : null;

  for (const [name, value] of [
    ['places', places], ['objects', objects], ['actions', actions],
    ['reactions', reactions], ['schedule', schedule],
  ] as const) {
    if (value === null) add(name, 'missing, or not a list');
  }
  if (beats === null) add('beats', 'missing, or not an object of beat id -> beat');

  // --- Identity: nothing may be defined twice ---------------------------------
  const placeIds = collectIds(places, 'places', add);
  const objectIds = collectIds(objects, 'objects', add);
  const actionIds = collectIds(actions, 'actions', add);
  collectIds(reactions, 'reactions', add);
  const beatIds = new Set(beats === null ? [] : Object.keys(beats));

  // --- The eight universal verbs must all exist -------------------------------
  for (const verb of UNIVERSAL_VERBS) {
    if (!actionIds.has(verb)) {
      add('actions', `universal verb "${verb}" is not defined. All eight are required`);
    }
  }

  // --- places -----------------------------------------------------------------
  eachRecord(places, 'places', add, (place, at) => {
    requireString(place, 'name', at, add);
    requireOneOf(place, 'reach', MOBILITY_TIERS, at, add);
    requireNumber(place, 'concealment', at, add, 0, 100);
    requireNumber(place, 'noiseModifier', at, add);
  });

  // --- objects ----------------------------------------------------------------
  eachRecord(objects, 'objects', add, (object, at) => {
    requireString(object, 'name', at, add);
    requireBoolean(object, 'container', at, add);
    requireBoolean(object, 'portable', at, add);
    requireOneOf(object, 'changeTier', CHANGE_TIERS, at, add);
    checkObjectLocation(object['startsAt'], `${at}.startsAt`, placeIds, objectIds, add);

    const verbs = object['verbs'];
    if (verbs !== undefined) {
      if (!Array.isArray(verbs)) {
        add(`${at}.verbs`, 'must be a list of action ids');
      } else {
        verbs.forEach((verb, i) => {
          if (typeof verb !== 'string' || !actionIds.has(verb)) {
            add(`${at}.verbs[${i}]`, `"${String(verb)}" is not an action in actions.json`);
          } else if ((UNIVERSAL_VERBS as readonly string[]).includes(verb)) {
            add(`${at}.verbs[${i}]`,
              `"${verb}" is a universal verb — it already applies to everything`, 'warning');
          }
        });
      }
    }

    const noise = object['noise'];
    if (noise !== undefined) {
      if (!isRecord(noise)) {
        add(`${at}.noise`, 'must be an object of action id -> noise level');
      } else {
        for (const [actionId, level] of Object.entries(noise)) {
          if (!actionIds.has(actionId)) {
            add(`${at}.noise.${actionId}`, `"${actionId}" is not an action in actions.json`);
          }
          if (typeof level !== 'string' || !(NOISE_LEVELS as readonly string[]).includes(level)) {
            add(`${at}.noise.${actionId}`,
              `"${String(level)}" is not a noise level (${NOISE_LEVELS.join(', ')})`);
          }
        }
      }
    }
  });

  // --- actions ----------------------------------------------------------------
  eachRecord(actions, 'actions', add, (action, at) => {
    requireString(action, 'name', at, add);
    requireBoolean(action, 'universal', at, add);
    requireBoolean(action, 'concealable', at, add);
    requireNumber(action, 'timeCost', at, add, 0);
    requireOneOf(action, 'noise', NOISE_LEVELS, at, add);
    requireOneOf(action, 'target', ['none', 'object', 'object_and_place'] as const, at, add);

    const id = action['id'];
    const universal = action['universal'];
    if (typeof id === 'string' && typeof universal === 'boolean') {
      const isLocked = (UNIVERSAL_VERBS as readonly string[]).includes(id);
      if (isLocked && !universal) {
        add(`${at}.universal`, `"${id}" is one of the locked eight and must be universal`);
      }
      if (!isLocked && universal) {
        add(`${at}.universal`,
          `"${id}" is marked universal but is not one of the locked eight. ` +
          'Universal verbs are locked (design doc §13) — this should be a contextual verb');
      }
    }
  });

  // --- reactions --------------------------------------------------------------
  const usedBeats = new Set<string>();
  const catchAllsByAction = new Map<string, number>();

  eachRecord(reactions, 'reactions', add, (rule, at) => {
    const action = rule['action'];
    if (typeof action !== 'string' || !actionIds.has(action)) {
      add(`${at}.action`, `"${String(action)}" is not an action in actions.json`);
    }

    const when = rule['when'];
    if (when !== undefined && !isRecord(when)) {
      add(`${at}.when`, 'must be an object of conditions');
    }
    const criteriaCount = isRecord(when) ? Object.keys(when).length : 0;
    if (criteriaCount === 0 && typeof action === 'string') {
      catchAllsByAction.set(action, (catchAllsByAction.get(action) ?? 0) + 1);
    }

    const ruleBeats = rule['beats'];
    if (!Array.isArray(ruleBeats) || ruleBeats.length === 0) {
      add(`${at}.beats`, 'must be a non-empty list of beat ids — a rule that says nothing is a bug');
    } else {
      ruleBeats.forEach((beatId, i) => {
        if (typeof beatId !== 'string' || !beatIds.has(beatId)) {
          add(`${at}.beats[${i}]`, `"${String(beatId)}" is not a beat in beats.json`);
        } else {
          usedBeats.add(beatId);
        }
      });
    }

    const effects = rule['effects'];
    if (effects !== undefined) {
      if (!isRecord(effects)) {
        add(`${at}.effects`, 'must be an object of meter deltas');
      } else {
        for (const [meter, delta] of Object.entries(effects)) {
          const known = ['affection', 'trust', 'suspicion', 'dispositionPressure'];
          if (!known.includes(meter)) {
            add(`${at}.effects.${meter}`, `unknown meter. Expected one of: ${known.join(', ')}`);
          }
          if (typeof delta !== 'number' || !Number.isFinite(delta)) {
            add(`${at}.effects.${meter}`, 'must be a number');
          }
        }
      }
    }
  });

  // Architecture §6: one catch-all per action, so the game can never produce nothing.
  for (const actionId of actionIds) {
    const count = catchAllsByAction.get(actionId) ?? 0;
    if (count === 0) {
      add('reactions',
        `action "${actionId}" has no catch-all rule (one with an empty \`when\`). ` +
        'Without it the game can reach a moment where she says nothing at all');
    } else if (count > 1) {
      add('reactions',
        `action "${actionId}" has ${count} catch-all rules. Only one can ever win, ` +
        'so the others are unreachable', 'warning');
    }
  }

  // --- beats ------------------------------------------------------------------
  if (beats !== null) {
    for (const [beatId, beat] of Object.entries(beats)) {
      const at = `beats.${beatId}`;
      if (!isRecord(beat)) {
        add(at, 'must be an object');
        continue;
      }
      requireString(beat, 'text', at, add);
      requireBoolean(beat, 'advancesClock', at, add);
      requireOneOf(beat, 'speaker', SPEAKERS, at, add);
      requireOneOf(beat, 'pose', [...POSES, 'absent'] as const, at, add);
      if (beat['mood'] !== undefined) requireOneOf(beat, 'mood', MOODS, at, add);
      if (beat['register'] !== undefined) {
        requireOneOf(beat, 'register', CONFIDENCE_REGISTERS, at, add);
      }

      // A line about her face is a line a sprite layer can never replace. Hard rule 5.
      if (beat['speaker'] === 'her' && beat['pose'] === 'absent') {
        add(at, 'she is speaking but marked absent — she cannot be off screen and talking');
      }

      const scene = beat['scene'];
      if (scene !== undefined) {
        if (!isRecord(scene)) {
          add(`${at}.scene`, 'must be an object');
        } else {
          if (scene['location'] !== undefined) {
            requireOneOf(scene, 'location', SCENE_LOCATIONS, `${at}.scene`, add);
          }
          if (scene['light'] !== undefined) requireOneOf(scene, 'light', LIGHTS, `${at}.scene`, add);
          if (scene['weather'] !== undefined) {
            requireOneOf(scene, 'weather', WEATHERS, `${at}.scene`, add);
          }
          if (scene['timeOfDay'] !== undefined) {
            requireOneOf(scene, 'timeOfDay', TIMES_OF_DAY, `${at}.scene`, add);
          }
        }
      }

      const prompt = beat['prompt'];
      if (prompt !== undefined) {
        if (!isRecord(prompt)) {
          add(`${at}.prompt`, 'must be an object');
        } else {
          const choices = prompt['choices'];
          if (!Array.isArray(choices) || choices.length === 0) {
            add(`${at}.prompt.choices`, 'must be a non-empty list');
          } else {
            const seen = new Set<string>();
            choices.forEach((choice, i) => {
              const cAt = `${at}.prompt.choices[${i}]`;
              if (!isRecord(choice)) return add(cAt, 'must be an object');
              requireString(choice, 'id', cAt, add);
              requireString(choice, 'label', cAt, add);
              const cid = choice['id'];
              if (typeof cid === 'string') {
                if (seen.has(cid)) add(cAt, `duplicate choice id "${cid}" within this prompt`);
                seen.add(cid);
              }
            });
          }
        }
      }
    }

    // Dead content. Not fatal, but it is almost always a typo'd criterion or an orphan.
    for (const beatId of beatIds) {
      if (!usedBeats.has(beatId)) {
        add(`beats.${beatId}`, 'no rule references this beat — it can never be seen', 'warning');
      }
    }
  }

  // --- schedule ---------------------------------------------------------------
  eachRecord(schedule, 'schedule', add, (day, at) => {
    requireNumber(day, 'day', at, add, 1);
    const blocks = day['blocks'];
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return add(`${at}.blocks`, 'must be a non-empty list');
    }

    let previousEnd: number | null = null;
    blocks.forEach((block, i) => {
      const bAt = `${at}.blocks[${i}]`;
      if (!isRecord(block)) return add(bAt, 'must be an object');
      requireNumber(block, 'from', bAt, add, 0);
      requireNumber(block, 'to', bAt, add, 0);
      requireNumber(block, 'attention', bAt, add, 0, 1);
      requireOneOf(block, 'location', HOUSE_LOCATIONS, bAt, add);
      requireOneOf(block, 'activity', ACTIVITIES, bAt, add);
      requireOneOf(block, 'phase', PHASES, bAt, add);

      const from = block['from'];
      const to = block['to'];
      if (typeof from === 'number' && typeof to === 'number') {
        if (to <= from) add(bAt, `ends at ${to} but starts at ${from}`);
        if (previousEnd !== null && from !== previousEnd) {
          add(bAt,
            from > previousEnd
              ? `gap in her day: nothing covers minute ${previousEnd} to ${from}`
              : `overlaps the previous block, which ran to minute ${previousEnd}`);
        }
        previousEnd = to;
      }
    });
  });

  return problems;
}

/** Validate and hand back the content, or throw with everything that is wrong with it. */
export function loadContent(raw: unknown): ContentBundle {
  const problems = validateContent(raw);
  if (problems.some((p) => p.level === 'error')) throw new ContentError(problems);
  return raw as ContentBundle;
}

// ---------------------------------------------------------------------------
// Small checkers. Nothing clever.
// ---------------------------------------------------------------------------

type Add = (where: string, what: string, level?: Problem['level']) => void;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

/** Walk a list of definitions, complaining about anything that isn't an object. */
function eachRecord(
  list: unknown[] | null,
  name: string,
  add: Add,
  check: (item: Record<string, unknown>, at: string) => void,
): void {
  if (list === null) return;
  list.forEach((item, i) => {
    const at = `${name}[${i}]`;
    if (!isRecord(item)) return add(at, 'must be an object');
    check(item, at);
  });
}

/** Gather ids, flagging anything missing or defined twice. */
function collectIds(list: unknown[] | null, name: string, add: Add): Set<string> {
  const ids = new Set<string>();
  if (list === null) return ids;
  list.forEach((item, i) => {
    if (!isRecord(item)) return;
    const id = item['id'];
    if (typeof id !== 'string' || id.length === 0) {
      return add(`${name}[${i}].id`, 'missing or not a string');
    }
    if (ids.has(id)) add(`${name}[${i}].id`, `"${id}" is defined more than once`);
    ids.add(id);
  });
  return ids;
}

function requireString(o: Record<string, unknown>, key: string, at: string, add: Add): void {
  if (typeof o[key] !== 'string' || (o[key] as string).length === 0) {
    add(`${at}.${key}`, 'missing or not a non-empty string');
  }
}

function requireBoolean(o: Record<string, unknown>, key: string, at: string, add: Add): void {
  if (typeof o[key] !== 'boolean') add(`${at}.${key}`, 'missing or not true/false');
}

function requireNumber(
  o: Record<string, unknown>, key: string, at: string, add: Add,
  min?: number, max?: number,
): void {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return add(`${at}.${key}`, 'missing or not a number');
  }
  if (min !== undefined && v < min) add(`${at}.${key}`, `must be at least ${min}, got ${v}`);
  if (max !== undefined && v > max) add(`${at}.${key}`, `must be at most ${max}, got ${v}`);
}

function requireOneOf(
  o: Record<string, unknown>, key: string,
  allowed: readonly (string | number)[], at: string, add: Add,
): void {
  const v = o[key];
  if (v === undefined || !allowed.includes(v as string | number)) {
    add(`${at}.${key}`, `"${String(v)}" is not one of: ${allowed.join(', ')}`);
  }
}

/** An object's location is a small union, and each shape points at a different id list. */
function checkObjectLocation(
  loc: unknown, at: string, placeIds: Set<string>, objectIds: Set<string>, add: Add,
): void {
  if (!isRecord(loc)) return add(at, 'missing, or not an object');
  const kind = loc['kind'];
  switch (kind) {
    case 'placed':
    case 'hidden': {
      const place = loc['place'];
      if (typeof place !== 'string' || !placeIds.has(place)) {
        add(`${at}.place`, `"${String(place)}" is not a place in places.json`);
      }
      return;
    }
    case 'inside': {
      const container = loc['container'];
      if (typeof container !== 'string' || !objectIds.has(container)) {
        add(`${at}.container`, `"${String(container)}" is not an object in objects.json`);
      }
      return;
    }
    case 'carried':
    case 'gone':
      return;
    default:
      add(`${at}.kind`, `"${String(kind)}" is not one of: placed, inside, carried, hidden, gone`);
  }
}
