/**
 * One line she says, or one line about the room.
 *
 * The notable thing here is what the form does *not* offer. There is no field for her mood, the
 * light, the weather or the time, because the simulation stamps those on when the beat is sent
 * to the screen. Hard rule 5, made structural: an author cannot write "she looks annoyed" into
 * a line and thereby trap that in prose where a sprite layer could never use it.
 *
 * Where she is standing is asked for, because the simulation genuinely has no idea.
 */

import type { DraftBeat } from '../../builder.ts';
import { MOODS, POSES, SPEAKERS } from '../../../engine/vocab.ts';

type Props = {
  beat: DraftBeat;
  onChange: (beat: DraftBeat) => void;
  onRemove: () => void;
};

const SPEAKER_LABELS: Record<string, string> = {
  her: 'her, out loud',
  narrator: 'the room, described',
  player_thought: 'your own head',
};

export default function BeatForm({ beat, onChange, onRemove }: Props) {
  const set = (patch: Partial<DraftBeat>) => onChange({ ...beat, ...patch });

  return (
    <div className="card beatform">
      <div className="cardhead">
        <input
          className="id"
          value={beat.id}
          placeholder="a short name for this line"
          onChange={(event) => set({ id: event.target.value })}
        />
        <button className="drop" onClick={onRemove}>Remove</button>
      </div>

      <label>
        <span>Spoken by</span>
        <select value={beat.speaker} onChange={(event) => set({ speaker: event.target.value })}>
          {SPEAKERS.map((speaker) => (
            <option key={speaker} value={speaker}>{SPEAKER_LABELS[speaker] ?? speaker}</option>
          ))}
        </select>
      </label>

      <label className="wide">
        <span>The line</span>
        <textarea
          rows={3}
          value={beat.text}
          onChange={(event) => set({ text: event.target.value })}
          placeholder={beat.speaker === 'her' ? '"You should be resting."' : 'The drawer is open.'}
        />
      </label>

      <label>
        <span>Where she is</span>
        <select value={beat.pose} onChange={(event) => set({ pose: event.target.value })}>
          <option value="absent">not on screen</option>
          {POSES.map((pose) => <option key={pose} value={pose}>{pose.replace('_', ' ')}</option>)}
        </select>
      </label>

      {beat.speaker === 'her' && beat.pose === 'absent' && (
        <p className="warn">She cannot be off screen and talking.</p>
      )}

      <label>
        <span>Force a mood</span>
        <select value={beat.mood} onChange={(event) => set({ mood: event.target.value })}>
          <option value="">no — use whatever she is actually feeling</option>
          {MOODS.map((mood) => <option key={mood} value={mood}>{mood}</option>)}
        </select>
        <span className="hint">
          Almost always leave this. Her real mood is stamped on for you, and forcing one can
          contradict the game — a warm line while she is furious.
        </span>
      </label>
    </div>
  );
}
