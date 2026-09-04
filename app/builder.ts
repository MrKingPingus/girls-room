/**
 * Girl's Room — what the scenario builder knows.
 *
 * All of the builder's thinking, with none of its screens. It is here rather than inside a
 * component so it can be tested without a browser, and because the interesting part is not the
 * forms — it is working out whether the rule somebody just wrote will ever actually fire.
 *
 * Two things it deliberately does *not* do: decide what is legal (the content validator does
 * that, and there must never be a second opinion), or work out which rule wins at run time
 * (the engine's own rule picker does that, and this calls it).
 */

import type { ContentBundle, ReactionRule } from '../engine/content.ts';
import type { ScenarioPack } from '../engine/pack.ts';
import type { Criteria, CriterionValue } from '../engine/beat.ts';
import type { FactSpec } from '../engine/facts.ts';
import type { ActionEffect } from '../engine/vocab.ts';
import { criterionHolds } from '../engine/rules.ts';
import { factSpec } from '../engine/facts.ts';

// ---------------------------------------------------------------------------
// Conditions, as an author builds them
// ---------------------------------------------------------------------------

/**
 * The tests offered in the builder, and what each one becomes in the content file.
 *
 * An author picks one of these off a dropdown; they never type `gte`.
 */
export const TESTS = [
  { id: 'is', label: 'is', kinds: ['flag', 'number', 'text'] },
  { id: 'is_not', label: 'is not', kinds: ['flag', 'number', 'text'] },
  { id: 'one_of', label: 'is one of', kinds: ['number', 'text'] },
  { id: 'at_least', label: 'is at least', kinds: ['number'] },
  { id: 'at_most', label: 'is at most', kinds: ['number'] },
  { id: 'more_than', label: 'is more than', kinds: ['number'] },
  { id: 'less_than', label: 'is less than', kinds: ['number'] },
] as const;

export type TestId = (typeof TESTS)[number]['id'];

/** One row of the "only when…" list. */
export type ConditionRow = {
  fact: string;
  test: TestId;

  /** One value for most tests; several for "is one of". Text, until it is turned into a value. */
  values: string[];
};

export function testsFor(spec: FactSpec): readonly TestId[] {
  return TESTS.filter((test) => (test.kinds as readonly string[]).includes(spec.kind))
    .map((test) => test.id);
}

/** The values a fact can take, when there is a list of them to pick from. */
export function choicesFor(spec: FactSpec, content: ContentBundle): string[] {
  if (spec.values !== undefined) return spec.values.map(String);
  if (spec.domain === 'actions') return content.actions.map((action) => action.id);
  if (spec.domain === 'objects') return content.objects.map((object) => object.id);
  if (spec.domain === 'places') return content.places.map((place) => place.id);
  if (spec.kind === 'flag') return ['true', 'false'];
  return [];
}

function toValue(spec: FactSpec, text: string): string | number | boolean {
  if (spec.kind === 'flag') return text === 'true';
  if (spec.kind === 'number') return Number(text);
  return text;
}

/** Turn the rows an author filled in into the conditions a content file carries. */
export function toCriteria(rows: readonly ConditionRow[]): Criteria {
  const criteria: Record<string, CriterionValue> = {};
  for (const row of rows) {
    const spec = factSpec(row.fact);
    if (spec === null) continue;
    const values = row.values.map((text) => toValue(spec, text));
    const first = values[0];

    switch (row.test) {
      case 'is': if (first !== undefined) criteria[row.fact] = first; break;
      case 'is_not': if (first !== undefined) criteria[row.fact] = { ne: first }; break;
      case 'one_of': {
        const list = values.filter((v): v is string | number => typeof v !== 'boolean');
        if (list.length > 0) criteria[row.fact] = { in: list };
        break;
      }
      case 'at_least': if (typeof first === 'number') criteria[row.fact] = { gte: first }; break;
      case 'at_most': if (typeof first === 'number') criteria[row.fact] = { lte: first }; break;
      case 'more_than': if (typeof first === 'number') criteria[row.fact] = { gt: first }; break;
      case 'less_than': if (typeof first === 'number') criteria[row.fact] = { lt: first }; break;
    }
  }
  return criteria as Criteria;
}

/** And back again, so a pack somebody sent can be opened and edited rather than only read. */
export function fromCriteria(criteria: Criteria): ConditionRow[] {
  const rows: ConditionRow[] = [];
  for (const [fact, expected] of Object.entries(criteria)) {
    if (expected === undefined) continue;
    if (typeof expected !== 'object') {
      rows.push({ fact, test: 'is', values: [String(expected)] });
      continue;
    }
    if (expected.ne !== undefined) rows.push({ fact, test: 'is_not', values: [String(expected.ne)] });
    if (expected.in !== undefined) rows.push({ fact, test: 'one_of', values: expected.in.map(String) });
    if (expected.gte !== undefined) rows.push({ fact, test: 'at_least', values: [String(expected.gte)] });
    if (expected.lte !== undefined) rows.push({ fact, test: 'at_most', values: [String(expected.lte)] });
    if (expected.gt !== undefined) rows.push({ fact, test: 'more_than', values: [String(expected.gt)] });
    if (expected.lt !== undefined) rows.push({ fact, test: 'less_than', values: [String(expected.lt)] });
  }
  return rows;
}

/** One condition, in a sentence. "she is in the room is yes" would be bad; this reads properly. */
export function describeCondition(row: ConditionRow): string {
  const spec = factSpec(row.fact);
  if (spec === null) return `${row.fact} — not a real fact`;
  const test = TESTS.find((entry) => entry.id === row.test);
  const values = row.values.length === 0 ? '…' : row.values.join(' or ');
  if (spec.kind === 'flag') {
    const yes = row.values[0] === 'true';
    return row.test === 'is_not' ? `${spec.label}: ${yes ? 'no' : 'yes'}` : `${spec.label}: ${yes ? 'yes' : 'no'}`;
  }
  return `${spec.label} ${test?.label ?? row.test} ${values}`;
}

// ---------------------------------------------------------------------------
// Which rule wins
// ---------------------------------------------------------------------------

/**
 * How a rule an author is writing would fare against one already in the game.
 *
 * This is the part of the system that surprises people. The rule with the most conditions wins;
 * a tie is broken by weight, and a tie on weight is settled by a coin flip every single time.
 * That last case is the one that eats afternoons — the rule works, then it doesn't, then it
 * does — so the builder names it out loud before it can happen.
 */
export type Rivalry = {
  rule: ReactionRule;
  outcome: 'you_win' | 'they_win' | 'coin_flip';

  /** What settled it. Losing on conditions and losing on weight need different advice. */
  reason: 'conditions' | 'weight';
  why: string;
};

export function rivals(
  content: ContentBundle,
  options: { id: string; action: string; when: Criteria; weight: number },
): Rivalry[] {
  const mine = Object.keys(options.when).length;

  return content.reactions
    .filter((rule) => rule.action === options.action && rule.id !== options.id)
    .filter((rule) => canBothMatch(options.when, rule.when))
    .map((rule): Rivalry => {
      const theirs = Object.keys(rule.when).length;
      if (mine > theirs) {
        return {
          rule, outcome: 'you_win', reason: 'conditions',
          why: `yours has ${mine} condition${mine === 1 ? '' : 's'} to its ${theirs}`,
        };
      }
      if (mine < theirs) {
        return {
          rule, outcome: 'they_win', reason: 'conditions',
          why: `it has ${theirs} conditions to your ${mine}`,
        };
      }
      const theirWeight = rule.weight ?? 0;
      if (options.weight > theirWeight) {
        return {
          rule, outcome: 'you_win', reason: 'weight',
          why: `same number of conditions, but your weight beats its ${theirWeight}`,
        };
      }
      if (options.weight < theirWeight) {
        return {
          rule, outcome: 'they_win', reason: 'weight',
          why: `same number of conditions, and its weight of ${theirWeight} beats yours`,
        };
      }
      return {
        rule, outcome: 'coin_flip', reason: 'weight',
        why: 'same number of conditions and the same weight',
      };
    })
    .sort((a, b) => rank(a.outcome) - rank(b.outcome));
}

function rank(outcome: Rivalry['outcome']): number {
  return outcome === 'coin_flip' ? 0 : outcome === 'they_win' ? 1 : 2;
}

/**
 * Could both of these rules be true at the same moment?
 *
 * Deliberately cautious: where it cannot prove two conditions are incompatible it assumes they
 * are not. Reporting a rivalry that can't really happen wastes a moment of an author's time.
 * Missing one hides exactly the coin flip this is here to surface.
 */
export function canBothMatch(mine: Criteria, theirs: Criteria): boolean {
  for (const [fact, ours] of Object.entries(mine)) {
    if (ours === undefined) continue;
    const other = (theirs as Record<string, CriterionValue | undefined>)[fact];
    if (other === undefined) continue;
    if (!overlaps(ours, other)) return false;
  }
  return true;
}

function overlaps(a: CriterionValue, b: CriterionValue): boolean {
  const aPlain = typeof a !== 'object' || a === null;
  const bPlain = typeof b !== 'object' || b === null;

  if (aPlain && bPlain) return a === b;
  if (aPlain) return criterionHolds(b, a);
  if (bPlain) return criterionHolds(a, b);

  // Two sets of allowed values: they can only meet on a value both allow.
  if (a.in !== undefined && b.in !== undefined) {
    return a.in.some((value) => b.in?.includes(value) === true);
  }
  if (a.in !== undefined) return a.in.some((value) => criterionHolds(b, value));
  if (b.in !== undefined) return b.in.some((value) => criterionHolds(a, value));

  // Two number ranges. Empty overlap means no moment can satisfy both.
  const low = Math.max(bound(a.gte, a.gt, 'low'), bound(b.gte, b.gt, 'low'));
  const high = Math.min(bound(a.lte, a.lt, 'high'), bound(b.lte, b.lt, 'high'));
  if (Number.isFinite(low) || Number.isFinite(high)) return low <= high;

  return true;
}

/** Turn a pair of comparisons into one bound. `gt` is a hair tighter than `gte`. */
function bound(inclusive: number | undefined, exclusive: number | undefined, end: 'low' | 'high'): number {
  const values: number[] = [];
  if (inclusive !== undefined) values.push(inclusive);
  if (exclusive !== undefined) values.push(end === 'low' ? exclusive + 1e-9 : exclusive - 1e-9);
  if (values.length === 0) return end === 'low' ? -Infinity : Infinity;
  return end === 'low' ? Math.max(...values) : Math.min(...values);
}

// ---------------------------------------------------------------------------
// Stage 2 — what a verb does, in plain words
// ---------------------------------------------------------------------------

/**
 * Every mechanic a verb can have, said in a way an author can choose between. The ids are what
 * the engine switches on; these are what a person reads.
 */
export const EFFECTS: readonly { id: ActionEffect; label: string; note: string }[] = [
  { id: 'none', label: 'nothing — it just produces a scene', note: 'For talking, waiting, looking out of the window.' },
  { id: 'inspect', label: 'look at it', note: 'Marks it known and searched, and reveals what is inside if it is open.' },
  { id: 'open_close', label: 'open or shut it', note: 'Containers only.' },
  { id: 'toggle_on', label: 'switch it on or off', note: 'Things that have an on and an off, like the lamp.' },
  { id: 'take', label: 'pick it up', note: 'Into your hands. Portable things only.' },
  { id: 'relocate', label: 'move it somewhere', note: 'To a place you name, in the open where she can see it.' },
  { id: 'conceal', label: 'hide it somewhere', note: 'To a place you name, out of sight. How well depends on the place.' },
  { id: 'care_accept', label: 'take what she is offering', note: 'Answers the need this verb names. Her half of a care scene.' },
  { id: 'care_refuse', label: 'turn her down', note: 'Nothing happens to your body, which is the point of it.' },
  { id: 'care_palm', label: 'appear to take it, and not', note: 'The keystone move. Makes real contraband that she can find.' },
  { id: 'talk', label: 'say something to her', note: 'No mechanical result at all — the whole effect is social.' },
];

export function describeEffect(effect: ActionEffect): string {
  return EFFECTS.find((entry) => entry.id === effect)?.label ?? effect;
}

// ---------------------------------------------------------------------------
// The draft — a scenario as it is being written
// ---------------------------------------------------------------------------

/**
 * What the forms hold onto.
 *
 * Deliberately looser than a real pack: everything is a plain string while it is being typed,
 * because half-finished is the normal state of a thing somebody is writing. Turning a draft
 * into a pack (`toPack`) is where it has to start being true, and the content validator is what
 * decides whether it is.
 */
export type DraftBeat = {
  id: string;
  speaker: string;
  text: string;
  pose: string;

  /** Rare. Her real mood is stamped on automatically; this forces a particular read. */
  mood: string;
};

export type DraftRule = {
  id: string;
  action: string;
  conditions: ConditionRow[];
  beats: string[];
  affection: number;
  trust: number;
  suspicion: number;
  dispositionPressure: number;
  weight: number;
};

export type DraftAction = {
  id: string;
  name: string;
  timeCost: number;
  noise: string;
  effect: string;
  concealable: boolean;
  target: string;
  satisfies: string;
};

export type DraftObject = {
  id: string;
  name: string;
  place: string;
  container: boolean;
  portable: boolean;
  togglable: boolean;
  knownAtStart: boolean;
  changeTier: number;
  verbs: string[];
};

export type Draft = {
  pack: string;
  title: string;
  author: string;
  notes: string;
  objects: DraftObject[];
  actions: DraftAction[];
  rules: DraftRule[];
  beats: DraftBeat[];
  tested?: { seed: number; moves: string[] };
};

export function blankDraft(): Draft {
  return {
    pack: '', title: '', author: '', notes: '',
    objects: [], actions: [], rules: [], beats: [],
  };
}

export function blankRule(action: string): DraftRule {
  return {
    id: '', action, conditions: [], beats: [],
    affection: 0, trust: 0, suspicion: 0, dispositionPressure: 0, weight: 0,
  };
}

export function blankBeat(): DraftBeat {
  return { id: '', speaker: 'her', text: '', pose: 'bedside', mood: '' };
}

export function blankAction(): DraftAction {
  return {
    id: '', name: '', timeCost: 2, noise: 'low', effect: 'none',
    concealable: true, target: 'object', satisfies: '',
  };
}

export function blankObject(place: string): DraftObject {
  return {
    id: '', name: '', place, container: false, portable: true,
    togglable: false, knownAtStart: true, changeTier: 2, verbs: [],
  };
}

/**
 * Whether a beat charges the player time.
 *
 * Design doc §12: only the last line before the player gets a choice does, so a slow reader is
 * never billed for reading. The builder works this out rather than asking — a beat that is not
 * last in some rule's list is mid-scene, and mid-scene lines are free.
 */
function advancesClock(beatId: string, rules: readonly DraftRule[]): boolean {
  return !rules.some((rule) => rule.beats.indexOf(beatId) >= 0
    && rule.beats.indexOf(beatId) < rule.beats.length - 1);
}

/** A draft as a pack file. Not checked here — `validatePack` and the content validator do that. */
export function toPack(draft: Draft): ScenarioPack {
  const meters = (rule: DraftRule) => {
    const effects: Record<string, number> = {};
    if (rule.affection !== 0) effects['affection'] = rule.affection;
    if (rule.trust !== 0) effects['trust'] = rule.trust;
    if (rule.suspicion !== 0) effects['suspicion'] = rule.suspicion;
    if (rule.dispositionPressure !== 0) effects['dispositionPressure'] = rule.dispositionPressure;
    return Object.keys(effects).length === 0 ? undefined : effects;
  };

  const pack: Record<string, unknown> = {
    pack: draft.pack,
    title: draft.title,
    ...(draft.author === '' ? {} : { author: draft.author }),
    ...(draft.notes === '' ? {} : { notes: draft.notes }),
    ...(draft.tested === undefined ? {} : { tested: draft.tested }),
  };

  if (draft.objects.length > 0) {
    pack['objects'] = draft.objects.map((object) => ({
      id: object.id,
      name: object.name,
      startsAt: { kind: 'placed', place: object.place },
      container: object.container,
      portable: object.portable,
      changeTier: object.changeTier,
      knownAtStart: object.knownAtStart,
      ...(object.togglable ? { togglable: true } : {}),
      ...(object.verbs.length === 0 ? {} : { verbs: object.verbs }),
    }));
  }

  if (draft.actions.length > 0) {
    pack['actions'] = draft.actions.map((action) => ({
      id: action.id,
      name: action.name,
      universal: false,
      timeCost: action.timeCost,
      noise: action.noise,
      effect: action.effect,
      concealable: action.concealable,
      target: action.target,
      ...(action.satisfies === '' ? {} : { satisfies: action.satisfies }),
    }));
  }

  if (draft.rules.length > 0) {
    pack['reactions'] = draft.rules.map((rule) => ({
      id: rule.id,
      action: rule.action,
      when: toCriteria(rule.conditions),
      beats: rule.beats,
      ...(meters(rule) === undefined ? {} : { effects: meters(rule) }),
      ...(rule.weight === 0 ? {} : { weight: rule.weight }),
    }));
  }

  if (draft.beats.length > 0) {
    pack['beats'] = Object.fromEntries(draft.beats.map((beat) => [beat.id, {
      speaker: beat.speaker,
      text: beat.text,
      pose: beat.pose,
      ...(beat.mood === '' ? {} : { mood: beat.mood }),
      advancesClock: advancesClock(beat.id, draft.rules),
    }]));
  }

  return pack as unknown as ScenarioPack;
}

/** And back, so a pack somebody sent can be opened in the forms rather than only read. */
export function toDraft(pack: ScenarioPack): Draft {
  return {
    pack: pack.pack,
    title: pack.title,
    author: pack.author ?? '',
    notes: pack.notes ?? '',
    ...(pack.tested === undefined ? {} : { tested: pack.tested }),
    objects: (pack.objects ?? []).map((object) => ({
      id: object.id,
      name: object.name,
      place: object.startsAt.kind === 'placed' || object.startsAt.kind === 'hidden'
        ? object.startsAt.place : '',
      container: object.container,
      portable: object.portable,
      togglable: object.togglable ?? false,
      knownAtStart: object.knownAtStart ?? false,
      changeTier: object.changeTier,
      verbs: [...(object.verbs ?? [])],
    })),
    actions: (pack.actions ?? []).map((action) => ({
      id: action.id,
      name: action.name,
      timeCost: action.timeCost,
      noise: action.noise,
      effect: action.effect,
      concealable: action.concealable,
      target: action.target,
      satisfies: action.satisfies ?? '',
    })),
    rules: (pack.reactions ?? []).map((rule) => ({
      id: rule.id,
      action: rule.action,
      conditions: fromCriteria(rule.when),
      beats: [...rule.beats],
      affection: rule.effects?.affection ?? 0,
      trust: rule.effects?.trust ?? 0,
      suspicion: rule.effects?.suspicion ?? 0,
      dispositionPressure: rule.effects?.dispositionPressure ?? 0,
      weight: rule.weight ?? 0,
    })),
    beats: Object.entries(pack.beats ?? {}).map(([id, beat]) => ({
      id,
      speaker: beat.speaker,
      text: beat.text,
      pose: beat.pose,
      mood: beat.mood ?? '',
    })),
  };
}

/**
 * A verb an author adds needs a rule that always matches, or there is a moment the game can
 * reach where she says nothing at all. The validator refuses a pack without one; this is so the
 * builder can say it while there is still something to do about it.
 */
export function verbsWithoutFallback(draft: Draft): string[] {
  return draft.actions
    .filter((action) => !draft.rules.some(
      (rule) => rule.action === action.id && rule.conditions.length === 0))
    .map((action) => action.id);
}
