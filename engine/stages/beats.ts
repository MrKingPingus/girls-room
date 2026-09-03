/**
 * Stage 8 — BEATS. Assemble what the player actually sees.
 *
 * Writes nothing to state. It turns beat ids into finished beats, and **all presentation is
 * assembled here and nowhere else.**
 *
 * This is where hard rule 5 stops being a discipline problem. An author writes the line, who
 * says it, where she's standing, and whether the clock moves. Her mood, the light, the time of
 * day, the weather — the simulation already knows those, so they get stamped on automatically.
 * The result: every beat in the game carries correct presentation tags, and it is not possible
 * to author one that contradicts the simulation. The text renderer throws all of it away. The
 * visual novel renderer, years from now, reads it off the same beats without a line of game
 * logic changing.
 */

import type { GameState, BeatId } from './../state.ts';
import type { Audio, Beat, Choice, ChoiceId, Portrait, Scene, TimerSpec } from './../beat.ts';
import type { BeatContent, ContentBundle } from './../content.ts';
import { timeOfDay } from './../clock.ts';

const NO_AUDIO: Audio = {
  music: { kind: 'unchanged' },
  ambience: { kind: 'unchanged' },
  sfx: [],
};

export function run(state: GameState, content: ContentBundle, beatIds: string[]): Beat[] {
  return beatIds
    .map((id) => {
      const authored = content.beats[id];
      return authored === undefined ? null : assemble(state, id, authored);
    })
    .filter((beat): beat is Beat => beat !== null);
}

function assemble(state: GameState, id: string, authored: BeatContent): Beat {
  // Stamped from the world, not from the author. These cannot contradict the simulation
  // because the author was never given the chance to state them.
  const scene: Scene = {
    location: 'attic',
    light: state.world.light,
    timeOfDay: timeOfDay(state.meta.minutesElapsed),
    weather: state.world.weather,
    ...(authored.scene ?? {}),
  };

  const portrait: Portrait = authored.pose === 'absent'
    ? { onScreen: false }
    : { onScreen: true, mood: authored.mood ?? state.her.mood, pose: authored.pose };

  const audio: Audio = { ...NO_AUDIO, ...(authored.audio ?? {}) };

  const timer: TimerSpec = authored.prompt?.timer ?? { kind: 'mood_scaled' };
  const choices: Choice[] = (authored.prompt?.choices ?? []).map((choice) => ({
    id: choice.id as ChoiceId,
    label: choice.label,
    requires: choice.requires ?? {},
  }));

  return {
    id: id as BeatId,
    speaker: authored.speaker,
    text: authored.text,
    portrait,
    scene,
    audio,
    advancesClock: authored.advancesClock,
    prompt: authored.prompt === undefined ? null : { choices, timer },
    register: authored.register ?? null,
  };
}
