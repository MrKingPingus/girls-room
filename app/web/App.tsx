/**
 * Girl's Room — the browser build.
 *
 * Design doc §16: clickable text boxes, no art. Design doc §13: pick a thing, then pick what
 * to do to it — which is the shape the eventual point-and-click layer wants, so this is not
 * scaffolding that gets thrown away.
 *
 * This is a *renderer*. It reads `speaker` and `text` off each beat and styles them, and it
 * throws away every presentation tag — portrait, scene, audio — exactly as the terminal build
 * does. The visual novel renderer will sit beside this one, read the tags both of these
 * discard, and require no change to a single line of game logic.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Beat } from '../../engine/beat.ts';
import type { GameState } from '../../engine/state.ts';
import { newGame } from '../../engine/newgame.ts';
import { takeTurn } from '../../engine/turn.ts';
import { clockFace } from '../../engine/clock.ts';
import { buildRoomMenu, type MenuEntry } from '../../render/menu.ts';
import { loadBundledContent } from '../content.ts';
import * as saves from '../save.ts';
import { buildReport, describeMove, type RecordedTurn } from '../report.ts';

const content = loadBundledContent();
const LAST_DAY = 3;

/**
 * One entry in the scrollback: what you did, and what came of it.
 *
 * `repeats` exists because waiting her out is a real strategy and thirty identical boxes
 * saying "Time passes." bury the one line that matters underneath them. Identical turns stack
 * into a single entry with a count instead.
 */
type LogEntry = { id: number; you: string | null; beats: Beat[]; repeats: number };

/** How much scrollback to keep on screen. Older than this and nobody is scrolling back to it. */
const LOG_LIMIT = 14;

function sameOutcome(entry: LogEntry, you: string | null, beats: Beat[]): boolean {
  return entry.you === you
    && entry.beats.length === beats.length
    && entry.beats.every((beat, i) => beat.id === beats[i]?.id);
}

function freshSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

export default function App() {
  const [state, setState] = useState<GameState>(
    () => saves.load() ?? newGame(content, { seed: freshSeed() }),
  );
  const [log, setLog] = useState<LogEntry[]>([]);
  const [openThing, setOpenThing] = useState<string | null>(null);

  // Every turn, kept for the test report. Not game state — it never affects a run, and it is
  // deliberately not saved: a report is about the session you just played.
  const [recording, setRecording] = useState<RecordedTurn[]>([]);
  const [note, setNote] = useState('');
  const [reporting, setReporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { saves.save(state); }, [state]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

  const menu = useMemo(() => buildRoomMenu(state, content), [state]);
  const over = state.meta.day > LAST_DAY;

  function act(entry: MenuEntry) {
    const turn = takeTurn(state, content, {
      action: entry.action, object: entry.object, place: entry.place,
    });
    setState(turn.state);
    setRecording((previous) => [
      ...previous,
      {
        input: { action: entry.action, object: entry.object, place: entry.place },
        // Worded from the content, not from the button, so a replay of this report produces a
        // transcript that diffs cleanly against it.
        label: describeMove(content, {
          action: entry.action, object: entry.object, place: entry.place,
        }),
        beats: turn.beats,
        trace: turn.trace,
        after: turn.state,
      },
    ]);

    const you = describe(entry);
    setLog((previous) => {
      const last = previous[previous.length - 1];
      if (last !== undefined && sameOutcome(last, you, turn.beats)) {
        return [...previous.slice(0, -1), { ...last, repeats: last.repeats + 1 }];
      }
      return [
        ...previous,
        { id: (previous[previous.length - 1]?.id ?? 0) + 1, you, beats: turn.beats, repeats: 1 },
      ].slice(-LOG_LIMIT);
    });
    setOpenThing(null);
  }

  function restart() {
    saves.clear();
    setState(newGame(content, { seed: freshSeed() }));
    setLog([]);
    setRecording([]);
    setNote('');
    setOpenThing(null);
  }

  const report = () => buildReport({
    seed: state.meta.seed, turns: recording, final: state, note,
  });

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function downloadReport() {
    const blob = new Blob([report()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `girls-room-${state.meta.seed}-${recording.length}turns.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="shell">
      <div className="status">
        <span className="title">GIRL&rsquo;S ROOM</span>
        <span>Day {state.meta.day}</span>
        <span>{clockFace(state.meta.minutesElapsed)}</span>
        <span>{state.world.light}</span>
        <span className={state.her.location === 'attic' ? 'here' : 'alone'}>
          {state.her.location === 'attic' ? 'she is here' : 'you are alone'}
        </span>
        <span>{bodyReport(state)}</span>
      </div>

      <div className="log">
        {log.length === 0 && (
          <div className="beat narrator">
            You wake in a room with a sloped ceiling. Your leg is splinted and heavy.
            {'\n'}There is a hole in the floor at the far end, with stairs going down.
          </div>
        )}
        {log.map((line, index) => (
          <div key={line.id} className={index < log.length - 1 ? 'stale' : undefined}>
            {line.you !== null && (
              <p className="you">
                &rsaquo; {line.you}
                {line.repeats > 1 && <span className="repeat"> &times;{line.repeats}</span>}
              </p>
            )}
            {line.beats.map((beat, i) => (
              <div key={`${beat.id}-${i}`} className={`beat ${beat.speaker}`}>
                {beat.text}
              </div>
            ))}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {over ? (
        <div className="over">
          <p>Three days. That is as far as this build goes.</p>
          <button onClick={restart}>Start again</button>
        </div>
      ) : (
        <div className="menu">
          <section>
            <h2>On your own</h2>
            <div className="row">
              {menu.general.map((entry) => (
                <button key={entry.action} onClick={() => act(entry)}>{entry.label}</button>
              ))}
            </div>
          </section>

          {menu.people.length > 0 && (
            <section>
              <h2>She is here</h2>
              <div className="row">
                {menu.people.map((group) => (
                  <button
                    key={group.objectId}
                    className="thing person"
                    aria-expanded={openThing === group.objectId}
                    onClick={() =>
                      setOpenThing(openThing === group.objectId ? null : group.objectId)}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
              {openThing !== null && menu.people.some((g) => g.objectId === openThing) && (
                <div className="verbs">
                  {menu.people
                    .find((group) => group.objectId === openThing)
                    ?.entries.map((entry) => (
                      <button key={entry.label + entry.action} onClick={() => act(entry)}>
                        {entry.label}
                      </button>
                    ))}
                </div>
              )}
            </section>
          )}

          <section>
            <h2>The room</h2>
            <div className="row">
              {menu.objects.map((group) => (
                <button
                  key={group.objectId}
                  className="thing"
                  aria-expanded={openThing === group.objectId}
                  onClick={() =>
                    setOpenThing(openThing === group.objectId ? null : group.objectId)}
                >
                  {group.name}
                </button>
              ))}
            </div>
            {openThing !== null && menu.objects.some((g) => g.objectId === openThing) && (
              <div className="verbs">
                {menu.objects
                  .find((group) => group.objectId === openThing)
                  ?.entries.map((entry) => (
                    <button key={entry.label + entry.place} onClick={() => act(entry)}>
                      {entry.label}
                    </button>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="footer">
        <span>seed {state.meta.seed}</span>
        <span>{recording.length} turns</span>
        <button onClick={restart}>Start again</button>
        <button onClick={() => setReporting(!reporting)}>
          {reporting ? 'Close report' : 'Report a problem'}
        </button>
      </div>

      {reporting && (
        <div className="report">
          <p>
            This writes down everything that happened, including the seed — which means the run
            can be replayed move for move, exactly as you saw it.
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What looked wrong? (optional)"
            rows={3}
          />
          <div className="row">
            <button onClick={downloadReport} disabled={recording.length === 0}>
              Download report
            </button>
            <button onClick={copyReport} disabled={recording.length === 0}>
              {copied ? 'Copied' : 'Copy to clipboard'}
            </button>
          </div>
          {recording.length === 0 && <p className="muted">Play a turn or two first.</p>}
        </div>
      )}
    </div>
  );
}

/** What the player just did, for the scrollback. */
function describe(entry: MenuEntry): string {
  const object = content.objects.find((def) => def.id === entry.object);
  if (object === undefined) return entry.label;
  return `${entry.label.replace(/\bit\b/, object.name)}`;
}

/**
 * The body, in words. Design doc §9: the player reads their own inference, never a number —
 * nothing hidden is shown here. No affection, no trust, no suspicion.
 */
function bodyReport(state: GameState): string {
  if (state.player.pain >= 60) return 'in a lot of pain';
  if (state.player.pain >= 30) return 'sore';
  if (state.player.energy < 25) return 'exhausted';
  return 'steady';
}
