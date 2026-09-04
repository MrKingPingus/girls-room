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
import type { FactSpec } from './facts.ts';
import { factSpec, nearestFact } from './facts.ts';
import {
  ACTION_EFFECTS, ACTIVITIES, CARE_NEEDS, CHANGE_TIERS, CONFIDENCE_REGISTERS, HOUSE_LOCATIONS, LIGHTS,
  MOBILITY_TIERS, MOODS, NOISE_LEVELS, OBJECT_LOCATION_KINDS, PHASES, POSES, SCENE_LOCATIONS,
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

  /** The id lists a condition can be checked against, when a fact holds an id. */
  const ids: ContentIds = { actions: actionIds, objects: objectIds, places: placeIds };

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
    if (object['togglable'] !== undefined) requireBoolean(object, 'togglable', at, add);
    if (object['person'] !== undefined) requireBoolean(object, 'person', at, add);
    if (object['knownAtStart'] !== undefined) requireBoolean(object, 'knownAtStart', at, add);
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
    requireOneOf(action, 'effect', ACTION_EFFECTS, at, add);
    if (action['satisfies'] !== undefined) requireOneOf(action, 'satisfies', CARE_NEEDS, at, add);
    if (action['offers'] !== undefined) requireOneOf(action, 'offers', CARE_NEEDS, at, add);

    // A care answer that names no need cannot be applied to anything, and the failure would be
    // silent: the scene would play and the body would not change.
    const effect = action['effect'];
    if ((effect === 'care_accept' || effect === 'care_palm') && action['satisfies'] === undefined) {
      add(`${at}.satisfies`,
        `"${String(action['id'])}" accepts care but names no need, so it would relieve nothing`);
    }
    if (action['produces'] !== undefined) {
      const produces = action['produces'];
      if (typeof produces !== 'string' || !objectIds.has(produces)) {
        add(`${at}.produces`, `"${String(produces)}" is not an object in objects.json`);
      }
    }
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
    } else if (isRecord(when)) {
      checkCriteria(when, `${at}.when`, add, ids);
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

  // Her half of a care scene is hers to initiate. Bound to an object it would show up in the
  // player's menu as something they could ask to be offered, which is not the relationship.
  const boundVerbs = new Set<string>();
  eachRecord(objects, 'objects', () => {}, (object) => {
    const verbs = object['verbs'];
    if (Array.isArray(verbs)) for (const verb of verbs) {
      if (typeof verb === 'string') boundVerbs.add(verb);
    }
  });
  const offersSeen = new Map<string, string>();
  eachRecord(actions, 'actions', add, (action, at) => {
    const offers = action['offers'];
    const id = action['id'];
    if (typeof offers !== 'string' || typeof id !== 'string') return;
    if (boundVerbs.has(id)) {
      add(`${at}.offers`,
        `"${id}" is something she does, but it is bound to an object's verbs, ` +
        'so it would appear in the player\'s menu');
    }
    const already = offersSeen.get(offers);
    if (already !== undefined) {
      add(`${at}.offers`,
        `both "${already}" and "${id}" offer ${offers} — only one of them can ever fire`);
    }
    offersSeen.set(offers, id);
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
              const requires = choice['requires'];
              if (requires !== undefined) {
                if (!isRecord(requires)) add(`${cAt}.requires`, 'must be an object of conditions');
                else checkCriteria(requires, `${cAt}.requires`, add, ids);
              }
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
      add(`${at}.kind`, `"${String(kind)}" is not one of: ${OBJECT_LOCATION_KINDS.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** The id lists a condition can name, for facts that hold an id rather than a fixed value. */
type ContentIds = {
  actions: Set<string>;
  objects: Set<string>;
  places: Set<string>;
};

/**
 * Check a rule's conditions against the fact catalogue.
 *
 * This is the check the whole catalogue exists for. A condition naming a fact the game does
 * not have — `suspicon`, or `her_mood` instead of `mood` — is not a small mistake. It loads
 * clean, it counts toward the rule's specificity when the game decides which rule wins, and
 * then it never matches, so the rule is dead and nothing anywhere says so. Hard rule 9.
 *
 * The same goes for a legal fact given an impossible value. `"mood": "wrm"` and
 * `"suspicion": { "gte": 150 }` are both rules that can never fire.
 */
function checkCriteria(when: Record<string, unknown>, at: string, add: Add, ids: ContentIds): void {
  for (const [fact, expected] of Object.entries(when)) {
    const spec = factSpec(fact);
    if (spec === null) {
      const near = nearestFact(fact);
      add(`${at}.${fact}`,
        `"${fact}" is not something the game knows about`
        + (near === null ? '. ' : ` — did you mean "${near}"? `)
        + 'A condition on it would never match. The full list is in engine/facts.ts');
      continue;
    }
    checkCriterion(spec, expected, `${at}.${fact}`, add, ids);
  }
}

const COMPARISONS = ['gte', 'lte', 'gt', 'lt'] as const;

function checkCriterion(
  spec: FactSpec, expected: unknown, at: string, add: Add, ids: ContentIds,
): void {
  // A bare list is the mistake an author makes when they mean "any of these".
  if (Array.isArray(expected)) {
    return add(at,
      'a list on its own is never equal to anything, so this could not match. '
      + `Did you mean { "in": ${JSON.stringify(expected)} }?`);
  }

  if (isRecord(expected)) {
    const keys = Object.keys(expected);
    if (keys.length === 0) {
      return add(at, 'has no test in it, so it is always true', 'warning');
    }

    for (const key of keys) {
      const value = expected[key];

      if ((COMPARISONS as readonly string[]).includes(key)) {
        if (spec.kind !== 'number') {
          add(`${at}.${key}`,
            `${spec.label} is ${spec.kind === 'flag' ? 'yes or no' : 'a name'}, `
            + 'so it cannot be compared with more-than or less-than');
          continue;
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          add(`${at}.${key}`, 'must be a number');
          continue;
        }
        checkComparisonRange(spec, key, value, `${at}.${key}`, add);
        continue;
      }

      if (key === 'ne') {
        checkValue(spec, value, `${at}.ne`, add, ids);
        continue;
      }

      if (key === 'in') {
        if (!Array.isArray(value) || value.length === 0) {
          add(`${at}.in`, 'must be a non-empty list of values');
          continue;
        }
        value.forEach((one, i) => checkValue(spec, one, `${at}.in[${i}]`, add, ids));
        continue;
      }

      add(`${at}.${key}`,
        `"${key}" is not a test. Use one of: gte, lte, gt, lt, ne, in — `
        + 'or a plain value, which means "must be exactly this"');
    }
    return;
  }

  checkValue(spec, expected, at, add, ids);
}

/** A comparison that falls outside what the fact can ever hold is a rule that never fires. */
function checkComparisonRange(
  spec: FactSpec, op: string, value: number, at: string, add: Add,
): void {
  if (spec.range === undefined) return;
  const [min, max] = spec.range;
  const impossible =
    (op === 'gte' && value > max) || (op === 'gt' && value >= max)
    || (op === 'lte' && value < min) || (op === 'lt' && value <= min);
  if (impossible) {
    add(at, `${spec.label} only ever runs from ${min} to ${max}, so this can never be true`);
  }
}

/** One concrete value a fact is being compared against. */
function checkValue(
  spec: FactSpec, value: unknown, at: string, add: Add, ids: ContentIds,
): void {
  if (spec.kind === 'flag') {
    if (typeof value !== 'boolean') {
      add(at, `${spec.label} is yes or no — write true or false, not "${String(value)}"`);
    }
    return;
  }

  if (spec.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return add(at, `${spec.label} is a number, and "${String(value)}" is not one`);
    }
    if (spec.values !== undefined && !spec.values.includes(value)) {
      return add(at, `${spec.label} is only ever one of: ${spec.values.join(', ')}`);
    }
    if (spec.range !== undefined && (value < spec.range[0] || value > spec.range[1])) {
      add(at,
        `${spec.label} only ever runs from ${spec.range[0]} to ${spec.range[1]}, `
        + `so it is never exactly ${value}`);
    }
    return;
  }

  if (typeof value !== 'string') {
    return add(at, `${spec.label} is a name, and ${String(value)} is not one`);
  }
  if (spec.values !== undefined && !spec.values.includes(value)) {
    return add(at, `"${value}" is not one of: ${spec.values.join(', ')}`);
  }
  if (spec.domain !== undefined && !ids[spec.domain].has(value)) {
    add(at, `"${value}" is not in ${spec.domain}.json`);
  }
}
