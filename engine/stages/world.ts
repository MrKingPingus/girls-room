/**
 * Stage 3 — WORLD. Time and the world move on, with or without you.
 *
 * Owns: the day, the phase, the light, the heat, the weather, the door downstairs — and her
 * mood, stress, attention, whereabouts and activity, and the player's body.
 *
 * **This stage exists so that she can have a bad day you had nothing to do with.** Design doc
 * §3 is firm that if every mood traces back to something the player did, she stops reading as
 * a person and starts reading as a machine. Folding this into the previous stage would make
 * "the world reacts to you" the easy path every single time we author something.
 */

import type { GameState } from './../state.ts';
import type { ContentBundle, ScheduleBlock } from './../content.ts';
import type { Disposition, Mood } from './../vocab.ts';
import { dayOf, minuteOfDay, timeOfDay } from './../clock.ts';
import { pickWeighted, roll } from './../random.ts';

/**
 * Design doc §3. Disposition biases which moods are likely without deciding them, so a devoted
 * disposition rarely rolls angry but the day-to-day still surprises. Weights, not rules.
 */
const MOOD_WEIGHTS: Record<Disposition, Partial<Record<Mood, number>>> = {
  devoted: { warm: 50, excited: 30, worried: 10, irritated: 7, sad: 2, angry: 1 },
  content: { warm: 45, excited: 20, irritated: 20, worried: 8, sad: 5, angry: 2 },
  unsettled: { worried: 30, irritated: 28, warm: 20, sad: 10, angry: 10, excited: 2 },
  brittle: { angry: 33, sad: 25, irritated: 22, worried: 15, warm: 4, excited: 1 },
};

/** Her stress pulls independently of the player — the phone call, the anniversary, the bad day. */
function moodTable(disposition: Disposition, stress: number) {
  const base = MOOD_WEIGHTS[disposition];
  const strain = 1 + stress / 50;
  return (Object.entries(base) as [Mood, number][]).map(([mood, weight]) => ({
    item: mood,
    weight: mood === 'angry' || mood === 'irritated' || mood === 'sad'
      ? weight * strain
      : weight / strain,
  }));
}

function blockAt(content: ContentBundle, day: number, minute: number): ScheduleBlock | null {
  const today = content.schedule.find((entry) => entry.day === day)
    ?? content.schedule[content.schedule.length - 1];
  if (today === undefined) return null;
  return today.blocks.find((block) => minute >= block.from && minute < block.to)
    ?? today.blocks[today.blocks.length - 1]
    ?? null;
}

export function run(state: GameState, content: ContentBundle): GameState {
  const { meta } = state;
  const minute = meta.minutesElapsed;
  const day = dayOf(minute);
  const block = blockAt(content, day, minuteOfDay(minute));

  const wasHere = state.her.location === 'attic';
  const nowHere = block?.location === 'attic';

  // --- Her ------------------------------------------------------------------
  // Mood is rolled when she comes up the stairs, and once at the start of a day. Not every
  // turn: a mood that changed every minute would have no tells worth reading.
  const rollMood = (!wasHere && nowHere) || minuteOfDay(minute) === 0;
  const mood = rollMood
    ? pickWeighted(meta.seed, minute, 'mood', moodTable(state.her.disposition, state.her.stress))
      ?? state.her.mood
    : state.her.mood;

  // Her own life, drifting. Nothing the player does touches this.
  const stressDrift = (roll(meta.seed, minute, 'stress') - 0.55) * 2;
  const stress = clamp(state.her.stress + stressDrift, 0, 100);

  // Design doc §5's tax: affection buys physical freedom and costs privacy. The closer she
  // feels, the harder she watches — which is what stops "maximise affection" being the
  // dominant strategy and the game collapsing.
  const moodAttention: Record<Mood, number> = {
    warm: 0, excited: -0.1, irritated: 0.15, angry: 0.35, sad: -0.05, worried: 0.25,
  };
  const attention = clamp(
    (block?.attention ?? 0) + moodAttention[mood] + state.her.affection / 400
      + suspicionPressure(state.her.suspicion),
    0, 1,
  );

  // --- The room -------------------------------------------------------------
  const lampOn = state.objects['lamp']?.on === true;
  const visualTime = timeOfDay(minute);
  const daylight = visualTime !== 'night';
  const light = daylight ? 'daylight' : lampOn ? 'lamp' : 'dark';

  // --- The body -------------------------------------------------------------
  // Recovery is slow and mostly passive; it is what raises the mobility tier, which is the
  // progression spine. Medication speeds it and clouds the narrator (design doc §8).
  const minutesPassed = Math.max(0, minute - lastMinute(state));
  const healing = minutesPassed * (0.0015 + state.player.medication.inSystem / 40000);
  const pain = clamp(
    state.player.pain - minutesPassed * (0.002 + state.player.medication.inSystem / 8000),
    0, 100,
  );
  const inSystem = clamp(state.player.medication.inSystem - minutesPassed * 0.05, 0, 100);

  return {
    ...state,
    meta: { ...state.meta, day },
    world: {
      ...state.world,
      phase: block?.phase ?? state.world.phase,
      light,
      temperature: state.world.temperature,
      weather: state.world.weather,
      doorBelow: state.world.doorBelow,
    },
    player: {
      ...state.player,
      pain,
      energy: clamp(state.player.energy + minutesPassed * 0.004, 0, 100),
      needs: {
        hunger: clamp(state.player.needs.hunger + minutesPassed * 0.05, 0, 100),
        thirst: clamp(state.player.needs.thirst + minutesPassed * 0.07, 0, 100),
        hygiene: clamp(state.player.needs.hygiene + minutesPassed * 0.02, 0, 100),
        toileting: clamp(state.player.needs.toileting + minutesPassed * 0.06, 0, 100),
        woundCare: clamp(state.player.needs.woundCare + minutesPassed * 0.03 - healing, 0, 100),
      },
      medication: { ...state.player.medication, inSystem },
    },
    her: {
      ...state.her,
      mood,
      stress,
      attention,
      location: block?.location ?? state.her.location,
      activity: block?.activity ?? state.her.activity,
      statedReturnAt: state.her.statedReturnAt,
    },
  };
}

/** She watches harder when she already half-suspects. */
function suspicionPressure(suspicion: number): number {
  return (suspicion / 100) * 0.3;
}

function lastMinute(state: GameState): number {
  return state.history[state.history.length - 1]?.at ?? state.meta.minutesElapsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
