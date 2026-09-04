/**
 * A new thing in the room, and a verb bound to it.
 *
 * Contextual verbs — palm the pill, turn the keepsake over — are free to add, because only the
 * one object they are bound to has to answer for them. The eight universal verbs are locked and
 * this screen does not offer to add a ninth.
 *
 * The hard field is what the verb *does*. Every action maps to one mechanic the engine knows,
 * and they are shown here in plain words rather than as their ids.
 */

import type { ContentBundle } from '../../../engine/content.ts';
import type { DraftAction, DraftObject } from '../../builder.ts';
import { CARE_NEEDS, CHANGE_TIERS, NOISE_LEVELS } from '../../../engine/vocab.ts';
import { EFFECTS } from '../../builder.ts';

const TIER_LABELS: Record<number, string> = {
  1: 'she may never notice',
  2: 'she notices eventually',
  3: 'she notices soon',
  4: 'she notices instantly',
};

export function ObjectForm({ object, content, verbs, onChange, onRemove }: {
  object: DraftObject;
  content: ContentBundle;
  verbs: DraftAction[];
  onChange: (object: DraftObject) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<DraftObject>) => onChange({ ...object, ...patch });

  return (
    <div className="card">
      <div className="cardhead">
        <input
          className="id"
          value={object.id}
          placeholder="a short name for this thing"
          onChange={(event) => set({ id: event.target.value })}
        />
        <button className="drop" onClick={onRemove}>Remove</button>
      </div>

      <label>
        <span>Called</span>
        <input
          value={object.name}
          placeholder="a small carved thing"
          onChange={(event) => set({ name: event.target.value })}
        />
      </label>

      <label>
        <span>Starts</span>
        <select value={object.place} onChange={(event) => set({ place: event.target.value })}>
          <option value="">choose somewhere…</option>
          {content.places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name} — {place.reach === 0 ? 'within reach' : `needs mobility ${place.reach}`}
            </option>
          ))}
        </select>
      </label>

      <div className="flags">
        {([
          ['knownAtStart', 'you know it is there from the first moment'],
          ['portable', 'can be picked up'],
          ['container', 'things go inside it'],
          ['togglable', 'switches on and off'],
        ] as const).map(([key, label]) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={object[key]}
              onChange={(event) => set({ [key]: event.target.checked } as Partial<DraftObject>)}
            />
            {label}
          </label>
        ))}
      </div>

      <label>
        <span>If it moves</span>
        <select
          value={object.changeTier}
          onChange={(event) => set({ changeTier: Number(event.target.value) })}
        >
          {CHANGE_TIERS.map((tier) => (
            <option key={tier} value={tier}>{TIER_LABELS[tier]}</option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Verbs bound to it</legend>
        {verbs.length === 0 && <p className="muted">Add a verb below, then tick it here.</p>}
        {verbs.map((verb) => (
          <label key={verb.id} className="check">
            <input
              type="checkbox"
              checked={object.verbs.includes(verb.id)}
              onChange={(event) => set({
                verbs: event.target.checked
                  ? [...object.verbs, verb.id]
                  : object.verbs.filter((id) => id !== verb.id),
              })}
            />
            {verb.name === '' ? verb.id : verb.name}
          </label>
        ))}
        <p className="hint">
          The eight universal verbs — look, listen, take, open, move, hide, wait, rest — already
          apply to everything and are never listed here.
        </p>
      </fieldset>
    </div>
  );
}

export function ActionForm({ action, onChange, onRemove }: {
  action: DraftAction;
  onChange: (action: DraftAction) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<DraftAction>) => onChange({ ...action, ...patch });
  const effect = EFFECTS.find((entry) => entry.id === action.effect);
  const needsNeed = action.effect === 'care_accept' || action.effect === 'care_palm';

  return (
    <div className="card">
      <div className="cardhead">
        <input
          className="id"
          value={action.id}
          placeholder="a short name for this verb"
          onChange={(event) => set({ id: event.target.value })}
        />
        <button className="drop" onClick={onRemove}>Remove</button>
      </div>

      <label>
        <span>On the button</span>
        <input
          value={action.name}
          placeholder="Turn it over"
          onChange={(event) => set({ name: event.target.value })}
        />
      </label>

      <label>
        <span>It does</span>
        <select value={action.effect} onChange={(event) => set({ effect: event.target.value })}>
          {EFFECTS.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.label}</option>
          ))}
        </select>
        {effect !== undefined && <span className="hint">{effect.note}</span>}
      </label>

      {needsNeed && (
        <label>
          <span>Answers</span>
          <select value={action.satisfies} onChange={(event) => set({ satisfies: event.target.value })}>
            <option value="">choose a need…</option>
            {CARE_NEEDS.map((need) => <option key={need} value={need}>{need}</option>)}
          </select>
          <span className="hint">
            Without this the scene would play and nothing about your body would change.
          </span>
        </label>
      )}

      <label>
        <span>Takes</span>
        <input
          type="number"
          min={0}
          value={action.timeCost}
          onChange={(event) => set({ timeCost: Number(event.target.value) })}
        />
        <span className="hint">minutes</span>
      </label>

      <label>
        <span>Sounds</span>
        <select value={action.noise} onChange={(event) => set({ noise: event.target.value })}>
          {NOISE_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
      </label>

      <label>
        <span>Needs</span>
        <select value={action.target} onChange={(event) => set({ target: event.target.value })}>
          <option value="object">a thing to do it to</option>
          <option value="none">nothing — it stands alone</option>
          <option value="object_and_place">a thing, and somewhere to put it</option>
        </select>
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={action.concealable}
          onChange={(event) => set({ concealable: event.target.checked })}
        />
        can be done without her seeing, if she is not looking
      </label>
    </div>
  );
}
