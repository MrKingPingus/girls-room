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
  // A yes/no fact needs no test at all: "is not yes" and "is no" are the same sentence, and
  // offering both is two dropdowns doing one dropdown's work.
  if (spec.kind === 'flag') return ['is'];

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
export const EFFECTS: readonly {
  id: ActionEffect;

  /** What the option says on the dropdown. */
  label: string;

  /** Completes the sentence "clicking it …", so it reads as one line to a person. */
  does: string;

  /** The catch, where there is one. Shown underneath, dim. */
  note: string;

  group: 'common' | 'care';
}[] = [
  {
    id: 'none', group: 'common', label: 'nothing — it is just a scene',
    does: 'plays whichever line below fits', note: 'Nothing moves and nothing changes hands. Most verbs are this one.',
  },
  {
    id: 'inspect', group: 'common', label: 'look at it',
    does: 'marks it as something you have looked at', note: 'Also reveals what is inside, if it is open.',
  },
  {
    id: 'take', group: 'common', label: 'pick it up',
    does: 'puts it in your hands', note: 'Only works on a thing that can be picked up — see “more about this thing”.',
  },
  {
    id: 'conceal', group: 'common', label: 'hide it somewhere',
    does: 'hides it somewhere the player picks', note: 'How well hidden depends on the place. Under the bed beats the nightstand.',
  },
  {
    id: 'relocate', group: 'common', label: 'move it somewhere',
    does: 'moves it somewhere the player picks', note: 'In the open, where she can see it.',
  },
  {
    id: 'open_close', group: 'common', label: 'open or shut it',
    does: 'opens it, or shuts it', note: 'Only for things that other things go inside.',
  },
  {
    id: 'toggle_on', group: 'common', label: 'switch it on or off',
    does: 'switches it on, or off', note: 'Only for things with an on and an off, like the lamp.',
  },
  {
    id: 'talk', group: 'common', label: 'say something to her',
    does: 'says it to her, and nothing else changes', note: 'The whole effect is social — no object moves.',
  },
  {
    id: 'care_accept', group: 'care', label: 'take what she is offering',
    does: 'takes what she is holding out', note: 'Her half of a care scene. Needs to name which need it answers.',
  },
  {
    id: 'care_refuse', group: 'care', label: 'turn her down',
    does: 'turns her down', note: 'Nothing happens to your body, which is the point of it.',
  },
  {
    id: 'care_palm', group: 'care', label: 'appear to take it, and not',
    does: 'appears to take it, and does not', note: 'The keystone move. Makes real contraband she can find.',
  },
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

  /** True while the id is being kept in step with the name. Editing it by hand stops that. */
  autoId: boolean;
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

  /** Things this could be for, whether or not the game can do any of them yet. */
  ideas: { about: string; text: string }[];
  objects: DraftObject[];
  actions: DraftAction[];
  rules: DraftRule[];
  beats: DraftBeat[];
  tested?: { seed: number; moves: string[] };
};

export function blankDraft(): Draft {
  return {
    pack: '', title: '', author: '', notes: '',
    ideas: [], objects: [], actions: [], rules: [], beats: [],
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
    id: '', autoId: true, name: '', place, container: false, portable: true,
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
    ...(draft.ideas.length === 0 ? {} : {
      ideas: draft.ideas.filter((idea) => idea.text.trim() !== ''),
    }),
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
    ideas: (pack.ideas ?? []).map((idea) => ({ ...idea })),
    ...(pack.tested === undefined ? {} : { tested: pack.tested }),
    objects: (pack.objects ?? []).map((object) => ({
      id: object.id,
      // A scenario somebody sent has ids that mean something to them. Leave them alone.
      autoId: false,
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

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/**
 * One rung: a situation, and what she does in it.
 *
 * The ladder is the honest picture of how §6 works. There is no flow in this game and no
 * branching — every turn, the rule with the most conditions that hold is the one that plays. So
 * the rungs are shown most specific first, and **the order on screen is the order the game will
 * actually consider them**. Reading top to bottom tells you exactly what happens and when.
 *
 * That is also why rungs cannot be dragged wherever you like. A rung with two conditions always
 * beats one with a single condition, whatever anybody wants, so the ladder sorts itself and the
 * surprise of a rung landing lower than expected is the system explaining itself.
 */
export type Rung = {
  rule: DraftRule;
  lines: DraftBeat[];

  /** How many conditions it has, which is what decides its place. */
  specificity: number;

  /** The bottom rung — no conditions, so it answers everything the others don't. */
  otherwise: boolean;
};

export function verbsOn(draft: Draft, thing: DraftObject): DraftAction[] {
  return draft.actions.filter((action) => thing.verbs.includes(action.id));
}

/** Every rung for one verb, in the order the game will consider them. */
export function ladderFor(draft: Draft, actionId: string): Rung[] {
  return draft.rules
    .filter((rule) => rule.action === actionId)
    .map((rule): Rung => ({
      rule,
      lines: rule.beats
        .map((id) => draft.beats.find((beat) => beat.id === id))
        .filter((beat): beat is DraftBeat => beat !== undefined),

      // What the game sees: a condition with nothing chosen yet is not a condition.
      specificity: rule.conditions.filter((row) => row.fact !== '').length,

      // What the author sees: the bottom rung is the one with no conditions on it *at all*.
      // An exception halfway through being written is not that, however empty it is — conflating
      // the two hid its condition picker and made it impossible to finish.
      otherwise: rule.conditions.length === 0,
    }))
    .sort((a, b) =>
      Number(a.otherwise) - Number(b.otherwise)
      || b.specificity - a.specificity
      || b.rule.weight - a.rule.weight);
}

/**
 * Give rungs that would otherwise tie a weight, so the order on screen is the order that
 * happens.
 *
 * Two rules with the same number of conditions and the same weight are settled by a coin flip,
 * every time — the bug that let forty thank-yous be farmed for affection. A ladder that showed
 * one above the other would be lying. Weights are only handed out where there is an actual tie
 * to break, so a scenario stays as close to the game's own content as it can.
 */
export function normaliseLadder(draft: Draft, actionId: string): Draft {
  const ladder = ladderFor(draft, actionId);
  const weights = new Map<string, number>();

  const groups = new Map<number, Rung[]>();
  for (const rung of ladder) {
    const group = groups.get(rung.specificity) ?? [];
    group.push(rung);
    groups.set(rung.specificity, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) {
      for (const rung of group) weights.set(rung.rule.id, 0);
      continue;
    }
    group.forEach((rung, index) => weights.set(rung.rule.id, (group.length - index) * 10));
  }

  return {
    ...draft,
    rules: draft.rules.map((rule) =>
      (weights.has(rule.id) ? { ...rule, weight: weights.get(rule.id) ?? 0 } : rule)),
  };
}

/** Move a rung up or down among the rungs it is genuinely tied with. */
export function moveRung(draft: Draft, actionId: string, ruleId: string, by: -1 | 1): Draft {
  const ladder = ladderFor(draft, actionId);
  const at = ladder.findIndex((rung) => rung.rule.id === ruleId);
  const here = ladder[at];
  const there = ladder[at + by];
  if (here === undefined || there === undefined) return draft;

  // Only meaningful between equals. Across different numbers of conditions the game decides.
  if (here.specificity !== there.specificity) return draft;

  const reordered = [...ladder];
  reordered[at] = there;
  reordered[at + by] = here;

  const weights = new Map(reordered
    .filter((rung) => rung.specificity === here.specificity)
    .map((rung, index, all) => [rung.rule.id, (all.length - index) * 10]));

  return {
    ...draft,
    rules: draft.rules.map((rule) =>
      (weights.has(rule.id) ? { ...rule, weight: weights.get(rule.id) ?? 0 } : rule)),
  };
}

// ---------------------------------------------------------------------------
// Names, and the ids made from them
// ---------------------------------------------------------------------------

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

/** A rung id nothing else is using. Rungs are internal, so these are never shown to anybody. */
function freeRuleId(draft: Draft, actionId: string): string {
  for (let n = 1; ; n += 1) {
    const id = `${actionId}_${n}`;
    if (!draft.rules.some((rule) => rule.id === id)) return id;
  }
}

// ---------------------------------------------------------------------------
// Editing, from the shape an author thinks in
// ---------------------------------------------------------------------------

/** A new thing in the room, with nothing on it yet. */
export function addThing(draft: Draft, place: string): Draft {
  return { ...draft, objects: [...draft.objects, blankObject(place)] };
}

/**
 * Rename a thing, and keep its id in step.
 *
 * Ids are the tool's business, not the author's. Nobody writing "a matchbox" should also have
 * to invent `matchbox` and keep the two in agreement — the whole reason the first version of
 * this screen had four id fields on it.
 */
export function renameThing(draft: Draft, index: number, name: string): Draft {
  return {
    ...draft,
    objects: draft.objects.map((object, i) => {
      if (i !== index) return object;
      if (!object.autoId) return { ...object, name };
      return { ...object, name, id: slug(name) === '' ? `thing_${index + 1}` : slug(name) };
    }),
  };
}

/**
 * A new verb on a thing, complete with the rung that answers every time.
 *
 * That bottom rung is not optional — without one there is a moment the game can reach where she
 * says nothing at all — so the tool writes it rather than letting an author discover the rule
 * by tripping over it.
 */
export function addVerb(draft: Draft, thingIndex: number): Draft {
  const thing = draft.objects[thingIndex];
  if (thing === undefined) return draft;

  const base = slug(thing.name) === '' ? `verb_${draft.actions.length + 1}` : slug(thing.name);
  let id = `do_${base}`;
  for (let n = 2; draft.actions.some((action) => action.id === id); n += 1) id = `do_${base}_${n}`;

  const withVerb: Draft = {
    ...draft,
    actions: [...draft.actions, { ...blankAction(), id }],
    objects: draft.objects.map((object, i) =>
      (i === thingIndex ? { ...object, verbs: [...object.verbs, id] } : object)),
  };
  return addRung(withVerb, id);
}

/** A new situation for a verb. The first one is the catch-all; the rest are exceptions. */
export function addRung(draft: Draft, actionId: string): Draft {
  const id = freeRuleId(draft, actionId);
  const beatId = `${id}_line`;
  const existing = draft.rules.some((rule) => rule.action === actionId);

  return normaliseLadder({
    ...draft,
    rules: [...draft.rules, {
      ...blankRule(actionId),
      id,
      // The first rung answers everything. Every one after it is an exception to it.
      conditions: existing ? [{ fact: '', test: 'is', values: [] }] : [],
      beats: [beatId],
    }],
    beats: [...draft.beats, { ...blankBeat(), id: beatId, speaker: 'narrator', pose: 'absent' }],
  }, actionId);
}

export function removeRung(draft: Draft, actionId: string, ruleId: string): Draft {
  const rule = draft.rules.find((entry) => entry.id === ruleId);
  return normaliseLadder({
    ...draft,
    rules: draft.rules.filter((entry) => entry.id !== ruleId),
    beats: draft.beats.filter((beat) => !(rule?.beats ?? []).includes(beat.id)),
  }, actionId);
}

export function updateRule(draft: Draft, ruleId: string, patch: Partial<DraftRule>): Draft {
  const rule = draft.rules.find((entry) => entry.id === ruleId);
  const next = {
    ...draft,
    rules: draft.rules.map((entry) => (entry.id === ruleId ? { ...entry, ...patch } : entry)),
  };
  return rule === undefined ? next : normaliseLadder(next, rule.action);
}

export function updateBeat(draft: Draft, beatId: string, patch: Partial<DraftBeat>): Draft {
  return {
    ...draft,
    beats: draft.beats.map((beat) => (beat.id === beatId ? { ...beat, ...patch } : beat)),
  };
}

/** Another line in the same moment, for a scene that needs two beats rather than one. */
export function addLine(draft: Draft, ruleId: string): Draft {
  const rule = draft.rules.find((entry) => entry.id === ruleId);
  if (rule === undefined) return draft;
  const beatId = `${ruleId}_line${rule.beats.length + 1}`;

  return {
    ...draft,
    rules: draft.rules.map((entry) =>
      (entry.id === ruleId ? { ...entry, beats: [...entry.beats, beatId] } : entry)),
    beats: [...draft.beats, { ...blankBeat(), id: beatId, speaker: 'her', pose: 'bedside' }],
  };
}

export function removeLine(draft: Draft, ruleId: string, beatId: string): Draft {
  return {
    ...draft,
    rules: draft.rules.map((entry) =>
      (entry.id === ruleId ? { ...entry, beats: entry.beats.filter((id) => id !== beatId) } : entry)),
    beats: draft.beats.filter((beat) => beat.id !== beatId),
  };
}

/** Removing a thing takes its verbs and everything written for them with it. */
export function removeThing(draft: Draft, thingIndex: number): Draft {
  const thing = draft.objects[thingIndex];
  if (thing === undefined) return draft;

  const goneRules = draft.rules.filter((rule) => thing.verbs.includes(rule.action));
  const goneBeats = new Set(goneRules.flatMap((rule) => rule.beats));

  return {
    ...draft,
    objects: draft.objects.filter((_, i) => i !== thingIndex),
    actions: draft.actions.filter((action) => !thing.verbs.includes(action.id)),
    rules: draft.rules.filter((rule) => !thing.verbs.includes(rule.action)),
    beats: draft.beats.filter((beat) => !goneBeats.has(beat.id)),
  };
}

// ---------------------------------------------------------------------------
// What is not finished yet
// ---------------------------------------------------------------------------

/**
 * The half-written parts of a scenario, said in plain words.
 *
 * The content validator is the authority on what is *legal*, and it stays that way — but it
 * speaks in file positions, because it is checking a file. `actions[22].name: missing or not a
 * non-empty string` is the right message for a content pass and the wrong one for somebody who
 * has just typed the word "matchbox". This reads the draft and says what is missing, in terms
 * of the thing on screen.
 */
export function unfinished(draft: Draft): string[] {
  const missing: string[] = [];
  const name = (thing: DraftObject) => (thing.name.trim() === '' ? 'a thing in the room' : thing.name);

  if (draft.title.trim() === '') missing.push('The scenario needs a name.');

  draft.objects.forEach((thing, index) => {
    const which = draft.objects.length === 1 ? 'The thing' : `Thing ${index + 1}`;
    if (thing.name.trim() === '') {
      missing.push(`${which} has no name yet — type one in the big box at the top of its card. `
        + 'The faint grey words in there are an example, not something you typed.');
    }
    if (thing.place === '') missing.push(`${name(thing)} needs somewhere to start.`);

    for (const verb of verbsOn(draft, thing)) {
      if (verb.name.trim() === '') {
        missing.push(`One of the things you can do to ${name(thing)} has no name yet — that is `
          + 'the words on the button the player clicks. Again, the grey words are an example.');
      }

      const ladder = ladderFor(draft, verb.id);
      const label = verb.name.trim() === '' ? `that verb on ${name(thing)}` : `“${verb.name}”`;

      for (const rung of ladder) {
        if (rung.rule.conditions.some((row) => row.fact === '')) {
          missing.push(
            `An exception under ${label} still needs a condition — until it has one it means the `
            + 'same as “otherwise”.',
          );
        }
        for (const row of rung.rule.conditions) {
          if (row.fact !== '' && row.values.length === 0) {
            const spec = factSpec(row.fact);
            missing.push(`Under ${label}, “${spec?.label ?? row.fact}” needs a value.`);
          }
        }
        if (rung.lines.length === 0) missing.push(`A situation under ${label} has nothing to say.`);
        for (const line of rung.lines) {
          if (line.text.trim() === '') missing.push(`A line under ${label} is still blank.`);
        }
      }
    }
  });

  return [...new Set(missing)];
}

/**
 * A line she speaks in a situation where she is not in the room.
 *
 * Legal, and almost never meant. Worth pointing at rather than refusing, because there are
 * moments — a voice up the stairwell — where it is exactly right.
 */
export function speakingWhileAway(draft: Draft, rung: Rung): boolean {
  void draft;
  const away = rung.rule.conditions.some((row) =>
    row.fact === 'she_is_here' && row.test === 'is' && row.values[0] === 'false');
  return away && rung.lines.some((line) => line.speaker === 'her');
}

/**
 * A complete, working scenario to start from.
 *
 * A blank form is the worst possible way to explain a system to somebody. This is a matchbox
 * that already works: switch it on and it is in the room before a word has been changed. Every
 * control on the screen is filled in with something that does a real thing, so what the options
 * mean can be found out by changing them and playing, rather than by being told.
 *
 * Built through the ordinary editing functions rather than written out as data, so it cannot
 * drift away from what the screens produce.
 */
export function exampleDraft(place: string): Draft {
  let draft: Draft = {
    ...blankDraft(),
    pack: 'matchbox',
    title: 'A matchbox',
    notes: 'An example to cut down. Change the words, delete what you do not want, play it.',
  };

  draft = renameThing(addThing(draft, place), 0, 'a matchbox');
  draft = {
    ...draft,
    objects: draft.objects.map((thing) => ({ ...thing, changeTier: 2 })),
    ideas: [{
      about: 'a_matchbox',
      text: 'Light a candle with it. She smells smoke on you. Burning the journal.',
    }],
  };

  draft = addVerb(draft, 0);
  const verb = draft.actions[0]?.id ?? '';
  draft = {
    ...draft,
    actions: draft.actions.map((action) => ({ ...action, name: 'Take the matches', effect: 'take' })),
  };

  // The rung that answers when nothing more specific does.
  draft = updateBeat(draft, draft.beats[0]?.id ?? '', {
    speaker: 'narrator', pose: 'absent',
    text: 'You slide the matchbox under the blanket, against your leg.',
  });

  // Sharpest first, so nothing has to overtake anything on the way in.
  draft = exampleRung(draft, verb,
    [
      { fact: 'she_is_here', test: 'is', values: ['true'] },
      { fact: 'mood', test: 'is', values: ['angry'] },
    ],
    'her', '"Put those back. Now."', { suspicion: 25 });

  draft = exampleRung(draft, verb,
    [{ fact: 'she_is_here', test: 'is', values: ['true'] }],
    'her', '"Those aren’t for you."', { suspicion: 12 });

  return draft;
}

function exampleRung(
  draft: Draft, verb: string, conditions: ConditionRow[],
  speaker: string, text: string, meters: Partial<DraftRule>,
): Draft {
  const before = new Set(draft.rules.map((rule) => rule.id));
  let next = addRung(draft, verb);
  const added = next.rules.find((rule) => !before.has(rule.id));
  if (added === undefined) return draft;

  next = updateRule(next, added.id, { conditions, ...meters });
  return updateBeat(next, added.beats[0] ?? '', {
    speaker, text, pose: speaker === 'her' ? 'bedside' : 'absent',
  });
}
