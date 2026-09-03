/**
 * Girl's Room — the clock.
 *
 * One number runs the whole game: minutes since the player woke on day 1. Everything else —
 * what day it is, what time it is, what the light looks like — is worked out from it.
 * Storing those separately would mean four things to keep in sync.
 */

import type { TimeOfDay } from './vocab.ts';

/** She wakes the player at 8am. Minute 0 of day 1. */
export const WAKE_HOUR = 8;

export const MINUTES_PER_DAY = 24 * 60;

/** Day 1 is the day the player wakes. */
export function dayOf(minutesElapsed: number): number {
  return Math.floor(minutesElapsed / MINUTES_PER_DAY) + 1;
}

/** Minutes since she woke you *this* day. What the schedule is written against. */
export function minuteOfDay(minutesElapsed: number): number {
  return ((minutesElapsed % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Wall-clock hour, 0-23. The clock across the room shows this, and looking at it costs time. */
export function hourOf(minutesElapsed: number): number {
  return (WAKE_HOUR + Math.floor(minuteOfDay(minutesElapsed) / 60)) % 24;
}

/** For the clock face. */
export function clockFace(minutesElapsed: number): string {
  const hour = hourOf(minutesElapsed);
  const minute = minuteOfDay(minutesElapsed) % 60;
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * Visual time — what the light through the dormer looks like. Distinct from `world.phase`,
 * which is where we are in the day's *structure*.
 */
export function timeOfDay(minutesElapsed: number): TimeOfDay {
  const hour = hourOf(minutesElapsed);
  if (hour < 7) return 'night';
  if (hour < 9) return 'dawn';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 20) return 'dusk';
  return 'night';
}
