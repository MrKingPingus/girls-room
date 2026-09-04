/**
 * Girl's Room — writing a scenario the way you'd describe one.
 *
 * The first version of this screen had a form per content file: Things, Verbs, Lines, Rules.
 * That is the engine's filing system, not an author's. Getting a matchbox into the room meant
 * visiting four sections and inventing four ids, and the part anybody actually cares about —
 * what she does about it — was at the bottom behind three sections of setup.
 *
 * This is shaped like the sentence instead: **a thing, some things you can do to it, and what
 * she does about each.**
 *
 * The reactions are a ladder, most specific at the top, and the order on screen is the order the
 * game really uses. That is not a diagram of the game — it is the game. There is no flow here
 * and no branching: every turn, the topmost situation whose conditions all hold is the one that
 * plays. A flowchart would draw a shape this engine does not have.
 */

import { useEffect, useRef, useState } from 'react';

import type { ContentBundle } from '../../../engine/content.ts';
import type { Draft, DraftObject, Rung } from '../../builder.ts';
import { CHANGE_TIERS } from '../../../engine/vocab.ts';
import {
  EFFECTS, addLine, addRung, addThing, addVerb, ladderFor, moveRung, removeLine, removeRung,
  removeThing, renameThing, speakingWhileAway, updateBeat, updateRule, verbsOn,
} from '../../builder.ts';
import Conditions from './Conditions.tsx';

type Props = {
  draft: Draft;
  content: ContentBundle;
  base: ContentBundle;
  onChange: (draft: Draft) => void;
};

const TIER_LABELS: Record<number, string> = {
  1: 'she may never notice',
  2: 'she notices eventually',
  3: 'she notices soon',
  4: 'she notices instantly',
};

export default function Simple({ draft, content, base, onChange }: Props) {
  return (
    <div className="simple">
      <section className="ideas">
        <h3>What is this for?</h3>
        <textarea
          rows={2}
          value={draft.notes}
          placeholder="In your own words. Never shown in the game."
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
        />
      </section>

      {draft.objects.map((thing, index) => (
        <Thing
          key={index}
          thing={thing}
          index={index}
          draft={draft}
          content={content}
          base={base}
          onChange={onChange}
        />
      ))}

      <button
        className="add"
        onClick={() => onChange(addThing(draft, base.places[0]?.id ?? ''))}
      >
        + Add something to the room
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Thing({ thing, index, draft, content, base, onChange }: {
  thing: DraftObject;
  index: number;
  draft: Draft;
  content: ContentBundle;
  base: ContentBundle;
  onChange: (draft: Draft) => void;
}) {
  const [more, setMore] = useState(false);
  const nameBox = useRef<HTMLInputElement>(null);

  // A new thing arrives with the cursor already in the box that has to be filled in.
  useEffect(() => {
    if (thing.name === '') nameBox.current?.focus();
  }, [thing.name]);

  const set = (patch: Partial<DraftObject>) => onChange({
    ...draft,
    objects: draft.objects.map((object, i) => (i === index ? { ...object, ...patch } : object)),
  });

  const idea = draft.ideas.find((entry) => entry.about === thing.id);

  return (
    <section className="thing-card">
      <header>
        <input
          ref={nameBox}
          className={thing.name.trim() === '' ? 'title needed' : 'title'}
          value={thing.name}
          placeholder="name it — a matchbox, a hairpin…"
          onChange={(event) => onChange(renameThing(draft, index, event.target.value))}
        />
        <button className="drop" onClick={() => onChange(removeThing(draft, index))}>Remove</button>
      </header>
      {thing.name.trim() === '' && (
        <p className="warn">
          This needs a name before the scenario will run. The faint words above are an example of
          what to write, not something you wrote.
        </p>
      )}

      <div className="line">
        <span>It starts</span>
        <select value={thing.place} onChange={(event) => set({ place: event.target.value })}>
          <option value="">somewhere…</option>
          {base.places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}{place.reach === 0 ? '' : ` — needs mobility ${place.reach}`}
            </option>
          ))}
        </select>
      </div>

      <div className="line">
        <span>If it moves</span>
        <select
          value={thing.changeTier}
          onChange={(event) => set({ changeTier: Number(event.target.value) })}
        >
          {CHANGE_TIERS.map((tier) => (
            <option key={tier} value={tier}>{TIER_LABELS[tier]}</option>
          ))}
        </select>
      </div>

      <button className="quiet" onClick={() => setMore(!more)}>
        {more ? 'fewer details' : 'more about this thing'}
      </button>

      {more && (
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
                checked={thing[key]}
                onChange={(event) => set({ [key]: event.target.checked } as Partial<DraftObject>)}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {verbsOn(draft, thing).map((verb) => (
        <Verb
          key={verb.id}
          verbId={verb.id}
          thingName={thing.name.trim() === '' ? 'it' : thing.name}
          draft={draft}
          content={content}
          onChange={onChange}
        />
      ))}

      <button className="add" onClick={() => onChange(addVerb(draft, index))}>
        + Something you can do to it
      </button>

      <label className="idea">
        <span>Ideas — what else could this be for?</span>
        <textarea
          rows={2}
          value={idea?.text ?? ''}
          placeholder="Light a candle with it. She smells smoke on you. Burning the journal."
          onChange={(event) => onChange({
            ...draft,
            ideas: [
              ...draft.ideas.filter((entry) => entry.about !== thing.id),
              { about: thing.id, text: event.target.value },
            ],
          })}
        />
        <span className="hint">
          Nothing here has to be possible yet. It stays with the scenario when you export it, so
          it can be read and answered — this one is a row of data, this one is a new system.
        </span>
      </label>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Verb({ verbId, thingName, draft, content, onChange }: {
  verbId: string;

  /** What it is a verb on, so the sentence below can name it. */
  thingName: string;
  draft: Draft;
  content: ContentBundle;
  onChange: (draft: Draft) => void;
}) {
  const [more, setMore] = useState(false);
  const verb = draft.actions.find((action) => action.id === verbId);
  if (verb === undefined) return null;

  const ladder = ladderFor(draft, verbId);
  const effect = EFFECTS.find((entry) => entry.id === verb.effect);

  const set = (patch: Partial<typeof verb>) => onChange({
    ...draft,
    actions: draft.actions.map((action) => (action.id === verbId ? { ...action, ...patch } : action)),
  });

  return (
    <div className="verb-card">
      <header>
        <input
          className={verb.name.trim() === '' ? 'verbname needed' : 'verbname'}
          value={verb.name}
          placeholder="what the button says — Take the matches…"
          onChange={(event) => set({ name: event.target.value })}
        />
        <select value={verb.effect} onChange={(event) => set({ effect: event.target.value })}>
          <optgroup label="what it does">
            {EFFECTS.filter((entry) => entry.group === 'common').map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </optgroup>
          <optgroup label="only for her care scenes">
            {EFFECTS.filter((entry) => entry.group === 'care').map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </optgroup>
        </select>
      </header>
      {verb.name.trim() === '' ? (
        <p className="warn">
          This needs a name — it is the words on the button the player clicks. The faint words
          above are an example, not something you wrote.
        </p>
      ) : (
        <>
          <p className="hint">
            In the room this is a button on <strong>{thingName}</strong> reading{' '}
            <strong>{verb.name}</strong>. Clicking it {effect?.does}.
          </p>
          {effect !== undefined && <p className="hint">{effect.note}</p>}
        </>
      )}

      <button className="quiet" onClick={() => setMore(!more)}>
        {more ? 'fewer details' : 'how long, how loud'}
      </button>

      {more && (
        <div className="line">
          <span>Takes</span>
          <input
            type="number"
            min={0}
            value={verb.timeCost}
            onChange={(event) => set({ timeCost: Number(event.target.value) })}
          />
          <span>minutes, and is</span>
          <select value={verb.noise} onChange={(event) => set({ noise: event.target.value })}>
            <option value="silent">silent</option>
            <option value="low">quiet</option>
            <option value="medium">audible</option>
            <option value="high">loud</option>
          </select>
          <label className="check">
            <input
              type="checkbox"
              checked={verb.concealable}
              onChange={(event) => set({ concealable: event.target.checked })}
            />
            can be done unseen
          </label>
        </div>
      )}

      {ladder.length > 1 ? (
        <p className="ladder-note">
          The game plays the topmost situation whose conditions all hold. Adding a condition moves
          a situation up the list, because more conditions always wins.
        </p>
      ) : (
        <p className="ladder-note">
          What happens when the player clicks it. Add an exception below for the times it should
          go differently — if she is watching, if she is angry.
        </p>
      )}

      <ol className="ladder">
        {ladder.map((rung, index) => (
          <RungRow
            key={rung.rule.id}
            rung={rung}
            above={ladder[index - 1]}
            below={ladder[index + 1]}
            verbId={verbId}
            draft={draft}
            content={content}
            onChange={onChange}
            alone={ladder.length === 1}
          />
        ))}
      </ol>

      <button className="add" onClick={() => onChange(addRung(draft, verbId))}>
        + Add an exception
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RungRow({ rung, above, below, verbId, draft, content, onChange, alone }: {
  rung: Rung;
  above: Rung | undefined;
  below: Rung | undefined;
  verbId: string;
  draft: Draft;
  content: ContentBundle;
  onChange: (draft: Draft) => void;

  /** The only situation there is, in which case "otherwise" is a word about nothing. */
  alone: boolean;
}) {
  const [showMeters, setShowMeters] = useState(false);
  const meters = ([
    ['affection', 'affection'], ['trust', 'trust'],
    ['suspicion', 'suspicion'], ['dispositionPressure', 'how she is holding up'],
  ] as const);
  const set = meters
    .filter(([key]) => rung.rule[key] !== 0)
    .map(([key, label]) => `${rung.rule[key] > 0 ? '+' : ''}${rung.rule[key]} ${label}`);

  // Only meaningful between rungs the game genuinely considers equal.
  const canRise = above !== undefined && above.specificity === rung.specificity;
  const canFall = below !== undefined && below.specificity === rung.specificity;

  return (
    <li className={rung.otherwise ? 'rung otherwise' : 'rung'}>
      <div className="when">
        {rung.otherwise ? (
          <span className="label">{alone ? 'always' : 'otherwise'}</span>
        ) : (
          <>
            <span className="label">if</span>
            <div className="conds">
              <Conditions
                rows={rung.rule.conditions}
                content={content}
                onChange={(conditions) => onChange(updateRule(draft, rung.rule.id, { conditions }))}
              />
            </div>
          </>
        )}

      </div>

      {rung.lines.map((line) => (
        <div className="say" key={line.id}>
          <select
            value={line.speaker}
            onChange={(event) => onChange(updateBeat(draft, line.id, {
              speaker: event.target.value,
              pose: event.target.value === 'her' ? 'bedside' : 'absent',
            }))}
          >
            <option value="narrator">the room</option>
            <option value="her">her</option>
            <option value="player_thought">your own head</option>
          </select>
          <textarea
            rows={2}
            value={line.text}
            placeholder={line.speaker === 'her' ? '"Those are not for you."' : 'You pick them up.'}
            onChange={(event) => onChange(updateBeat(draft, line.id, { text: event.target.value }))}
          />
          {rung.lines.length > 1 && (
            <button
              className="drop"
              onClick={() => onChange(removeLine(draft, rung.rule.id, line.id))}
            >
              &times;
            </button>
          )}
        </div>
      ))}

      {speakingWhileAway(draft, rung) && (
        <p className="warn">
          She is not in the room in this situation, but the line is hers. Deliberate for a voice
          up the stairwell; a mistake otherwise.
        </p>
      )}

      <div className="rung-foot">
        <button className="quiet" onClick={() => onChange(addLine(draft, rung.rule.id))}>
          + another line
        </button>
        <button className="quiet" onClick={() => setShowMeters(!showMeters)}>
          {set.length === 0 ? 'changes nothing about her — adjust' : `changes ${set.join(', ')}`}
        </button>

        <div className="rung-tools">
          {canRise && (
            <button
              className="quiet"
              title="move above the situation it is tied with"
              onClick={() => onChange(moveRung(draft, verbId, rung.rule.id, -1))}
            >
              move up
            </button>
          )}
          {canFall && (
            <button
              className="quiet"
              title="move below the situation it is tied with"
              onClick={() => onChange(moveRung(draft, verbId, rung.rule.id, 1))}
            >
              move down
            </button>
          )}
          {!rung.otherwise && (
            <button
              className="quiet drop"
              onClick={() => onChange(removeRung(draft, verbId, rung.rule.id))}
            >
              remove this situation
            </button>
          )}
        </div>
      </div>

      {showMeters && (
        <div className="meters">
          {meters.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type="number"
                value={rung.rule[key]}
                onChange={(event) => onChange(updateRule(draft, rung.rule.id, {
                  [key]: Number(event.target.value),
                }))}
              />
            </label>
          ))}
          <p className="hint">
            For scale: being caught opening the drawer is +18 suspicion and &minus;6 trust.
          </p>
        </div>
      )}

    </li>
  );
}
