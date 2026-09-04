/**
 * Girl's Room — the rule database.
 *
 * Architecture §6, and hard rule 4: her responses are never written as `if` statements. The
 * game assembles a flat bag of facts about this exact instant, then asks the content files
 * which rule fits best. The rule with the **most** matching conditions wins, so a specific
 * rule beats a general one automatically and you only ever author the special moments.
 *
 * (The technique is Elan Ruskin's, from Left 4 Dead and Firewatch.)
 *
 * Why this matters for how the game gets built: adding a whole new system later — weather,
 * her sister phoning — means adding one more fact to the bag. Every rule already written
 * keeps working untouched, and you write new rules only where you want a special moment.
 */

import type { Criteria, CriterionValue } from './beat.ts';
import type { ReactionRule } from './content.ts';
import type { AlwaysFactId, ContextualFactId } from './facts.ts';
import { pick } from './random.ts';

export type FactValue = string | number | boolean;

/**
 * Everything true about this instant, flattened. Assembled by `query.ts`.
 *
 * Keyed by the fact catalogue rather than by any old string, which is what makes it impossible
 * for `query.ts` and `facts.ts` to drift apart: a fact the catalogue doesn't list can't be put
 * in the bag, and a fact the catalogue lists as always-present can't be left out of it.
 */
export type QueryBag =
  { [K in AlwaysFactId]: FactValue }
  & { [K in ContextualFactId]?: FactValue };

/**
 * Read a fact whose name isn't known until run time — which is every fact a rule asks for,
 * since rules come out of a JSON file. The validator has already proved the name is real.
 */
export function factValue(facts: QueryBag, fact: string): FactValue | undefined {
  return (facts as Record<string, FactValue | undefined>)[fact];
}

/** Does one condition hold? */
export function criterionHolds(expected: CriterionValue, actual: unknown): boolean {
  if (actual === undefined) return false;

  // A plain value means "must equal this".
  if (typeof expected !== 'object' || expected === null) return expected === actual;

  if (expected.ne !== undefined && expected.ne === actual) return false;
  if (expected.in !== undefined) {
    if (typeof actual !== 'string' && typeof actual !== 'number') return false;
    if (!expected.in.includes(actual)) return false;
  }

  const numeric = ['gte', 'lte', 'gt', 'lt'] as const;
  if (numeric.some((key) => expected[key] !== undefined)) {
    if (typeof actual !== 'number') return false;
    if (expected.gte !== undefined && !(actual >= expected.gte)) return false;
    if (expected.lte !== undefined && !(actual <= expected.lte)) return false;
    if (expected.gt !== undefined && !(actual > expected.gt)) return false;
    if (expected.lt !== undefined && !(actual < expected.lt)) return false;
  }

  return true;
}

/** Do all of a rule's conditions hold? An empty set always holds — that's the catch-all. */
export function ruleMatches(criteria: Criteria, facts: QueryBag): boolean {
  for (const [fact, expected] of Object.entries(criteria)) {
    if (expected === undefined) continue;
    if (!criterionHolds(expected, factValue(facts, fact))) return false;
  }
  return true;
}

/**
 * Pick the rule that answers this moment.
 *
 * Most conditions wins. Ties break by weight, then at random among genuine equals — which is
 * why the same situation twice doesn't always produce the same line.
 *
 * Returns null only if the action has no rules at all, which the content validator refuses to
 * let happen: every action is required to have a catch-all, so the game can never say nothing.
 */
export function selectRule(
  rules: readonly ReactionRule[],
  action: string,
  facts: QueryBag,
  seed: number,
  minute: number,
): ReactionRule | null {
  const candidates = rules.filter(
    (rule) => rule.action === action && ruleMatches(rule.when, facts),
  );
  if (candidates.length === 0) return null;

  const score = (rule: ReactionRule) => Object.keys(rule.when).length;
  const best = Math.max(...candidates.map(score));
  const mostSpecific = candidates.filter((rule) => score(rule) === best);

  const heaviest = Math.max(...mostSpecific.map((rule) => rule.weight ?? 0));
  const finalists = mostSpecific.filter((rule) => (rule.weight ?? 0) === heaviest);

  return pick(seed, minute, `rule:${action}`, finalists);
}
