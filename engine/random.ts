/**
 * Girl's Room — deterministic randomness.
 *
 * Every roll in the game comes from here, and every roll is a pure function of three things:
 * the run's seed, the minute it happens, and which stage is asking. Nothing is stored.
 *
 * Two consequences worth having:
 *
 *   - **Replays are exact.** Same seed, same choices, same game. That is what makes the
 *     headless harness (architecture §8) able to find a bug and then reproduce it.
 *   - **No shared counter.** A "next random number" cursor would be a piece of state that four
 *     different stages all needed to write, which is precisely what the single-writer rule
 *     exists to prevent. There is nothing to fight over here.
 */

/** Mixes three numbers and a label into one well-scrambled 32-bit number. */
function hash(seed: number, minute: number, salt: string): number {
  let h = 2166136261 >>> 0;
  const mix = (n: number) => {
    h ^= n >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  };
  mix(seed);
  mix(minute);
  for (let i = 0; i < salt.length; i++) mix(salt.charCodeAt(i));
  return h >>> 0;
}

/**
 * A roll between 0 (inclusive) and 1 (exclusive).
 *
 * `salt` names what is being decided — "mood", "detect:drawer" — so two different questions
 * asked in the same minute get different answers instead of the same one.
 */
export function roll(seed: number, minute: number, salt: string): number {
  let t = (hash(seed, minute, salt) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** True with the given probability (0-1). */
export function chance(seed: number, minute: number, salt: string, probability: number): boolean {
  return roll(seed, minute, salt) < probability;
}

/** One item from a list. Returns null only if the list is empty. */
export function pick<T>(seed: number, minute: number, salt: string, items: readonly T[]): T | null {
  if (items.length === 0) return null;
  const index = Math.floor(roll(seed, minute, salt) * items.length);
  return items[Math.min(index, items.length - 1)] ?? null;
}

/**
 * One item from a list, where each has a weight. Heavier means likelier.
 * Used for her mood, which is rolled against a table biased by her disposition.
 */
export function pickWeighted<T>(
  seed: number, minute: number, salt: string,
  items: readonly { item: T; weight: number }[],
): T | null {
  const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return null;
  let target = roll(seed, minute, salt) * total;
  for (const entry of items) {
    target -= Math.max(0, entry.weight);
    if (target < 0) return entry.item;
  }
  return items[items.length - 1]?.item ?? null;
}
