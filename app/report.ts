/**
 * Girl's Room — test reports.
 *
 * Turns a play session into something that can be handed to someone else and acted on.
 *
 * The important half is not the transcript, it is the **replay line**. The engine is pure and
 * every roll comes from the seed, so a seed plus the list of moves reproduces a run exactly —
 * the same mood, the same detection rolls, the same everything. That turns "she did something
 * weird around lunchtime on day two" into a command that puts the bug back on screen.
 *
 * Lives in `app/` because it is about handing things to a person. `engine/` knows nothing
 * about it.
 */

import type { Beat } from '../engine/beat.ts';
import type { ContentBundle } from '../engine/content.ts';
import type { GameState } from '../engine/state.ts';
import type { TurnInput, TurnResult } from '../engine/turn.ts';
import { clockFace } from '../engine/clock.ts';
import { newGame } from '../engine/newgame.ts';
import { takeTurn } from '../engine/turn.ts';

export type RecordedTurn = {
  input: TurnInput;
  label: string;
  beats: Beat[];
  trace: TurnResult['trace'];

  /** The state *after* the turn, so a line of the report can show what it did. */
  after: GameState;
};

/** One move, in the compact form the replay command takes. */
export function encodeMove(input: TurnInput): string {
  return [input.action, input.object ?? '', input.place ?? '']
    .join(':')
    .replace(/:+$/, '');
}

export function decodeMove(move: string): TurnInput {
  const [action = '', object = '', place = ''] = move.split(':');
  return {
    action,
    object: object === '' ? null : object,
    place: place === '' ? null : place,
  };
}

/**
 * How a move reads in a report.
 *
 * Derived from the content rather than from whichever menu the player clicked, so a replayed
 * run produces a transcript that diffs cleanly against the reported one. If the two disagreed
 * on wording, every replay would look like it had changed something.
 */
export function describeMove(content: ContentBundle, input: TurnInput): string {
  const action = content.actions.find((def) => def.id === input.action);
  const object = content.objects.find((def) => def.id === input.object);
  const place = content.places.find((def) => def.id === input.place);

  let label = action?.name ?? input.action;
  if (object !== undefined) label = label.replace(/\bit\b/, object.name);
  if (object !== undefined && !label.includes(object.name)) label = `${label} ${object.name}`;
  if (place !== undefined) label = `${label} → ${place.name}`;
  return label;
}

/**
 * Play a list of moves from a seed and record every turn, exactly as the browser does.
 *
 * The engine is pure and every roll comes from the seed, so this reproduces a run move for
 * move. Both the replay command and the browser's own report button go through here — which
 * means a report is built by the same path that reproduces it, and if replay ever stopped
 * matching the live game, the report would show it rather than hide it.
 */
export function replayMoves(
  content: ContentBundle, seed: number, moves: readonly string[],
): { turns: RecordedTurn[]; final: GameState } {
  let state = newGame(content, { seed });
  const turns: RecordedTurn[] = [];

  for (const move of moves) {
    const input = decodeMove(move);
    const result = takeTurn(state, content, input);
    state = result.state;
    turns.push({
      input,
      label: describeMove(content, input),
      beats: result.beats,
      trace: result.trace,
      after: state,
    });
  }

  return { turns, final: state };
}

export type ReportOptions = {
  seed: number;
  turns: RecordedTurn[];
  final: GameState;

  /** Anything the tester typed about what looked wrong. */
  note?: string;

  /**
   * Scenario packs that were loaded. Named in the report because the replay command runs on the
   * game's own content — a run played with a pack on cannot be reproduced without it.
   */
  packs?: readonly string[];
};

export function buildReport({ seed, turns, final, note, packs }: ReportOptions): string {
  const lines: string[] = [];
  const replay = turns.map((turn) => encodeMove(turn.input)).join(' ');

  lines.push("# Girl's Room — test report", '');
  lines.push(`- recorded: ${new Date().toISOString()}`);
  lines.push(`- seed: \`${seed}\``);
  lines.push(`- turns: ${turns.length}`);
  lines.push(`- ended: day ${final.meta.day}, ${clockFace(final.meta.minutesElapsed)}`);
  lines.push(`- save format: ${final.meta.schemaVersion}`);
  if (packs !== undefined && packs.length > 0) lines.push(`- scenarios loaded: ${packs.join(', ')}`);
  lines.push('');

  if (note !== undefined && note.trim() !== '') {
    lines.push('## What looked wrong', '', note.trim(), '');
  }

  lines.push('## Replay this exactly', '');
  lines.push('```');
  lines.push(`npm run replay -- ${seed}${replay === '' ? '' : ` ${replay}`}`);
  lines.push('```', '');
  if (packs !== undefined && packs.length > 0) {
    lines.push(
      `This run had ${packs.join(', ')} switched on, and the command above runs without them. `
      + 'Load the same scenarios first, or the replay will not match.', '',
    );
  }

  lines.push('## Transcript', '');
  lines.push('```');
  for (const turn of turns) {
    const { after, trace } = turn;
    lines.push(
      `[ day ${after.meta.day} · ${clockFace(after.meta.minutesElapsed)} · ${after.world.light}` +
      ` · ${after.her.location === 'attic' ? 'she is here' : 'you are alone'}` +
      ` · her mood: ${after.her.mood} ]`,
    );
    lines.push(`> ${turn.label}`);
    for (const beat of turn.beats) lines.push(`    ${beat.speaker}: ${beat.text}`);

    const why: string[] = [];
    if (!trace.validity.ok) why.push(`REFUSED (${trace.validity.reason})`);
    if (trace.ruleId !== null) why.push(`rule ${trace.ruleId}`);
    if (trace.offerRuleId !== null) why.push(`she offers: ${trace.offerRuleId}`);
    if (trace.detection.outcome !== 'unnoticed') why.push(`detection ${trace.detection.outcome}`);
    if (trace.detection.fired !== null) why.push(`found earlier: ${trace.detection.fired.cause}`);
    if (trace.noise.heard) why.push(`heard (${trace.noise.level})`);
    if (why.length > 0) lines.push(`    · ${why.join(' · ')}`);

    lines.push(
      `    · affection ${round(after.her.affection)}` +
      ` trust ${round(after.her.trust)}` +
      ` suspicion ${round(after.her.suspicion)}` +
      ` · ${after.her.disposition}` +
      ` · pain ${round(after.player.pain)}`,
    );
    lines.push('');
  }
  lines.push('```', '');

  lines.push('## Final state', '');
  lines.push('<details><summary>the whole save, for reproducing by hand</summary>', '');
  lines.push('```json');
  lines.push(JSON.stringify(final, null, 2));
  lines.push('```', '');
  lines.push('</details>', '');

  return lines.join('\n');
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
