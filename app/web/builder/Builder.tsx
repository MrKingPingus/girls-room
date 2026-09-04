/**
 * Girl's Room — the scenario builder.
 *
 * A dev tool. It writes scenario packs: things, verbs, rules and lines, as data. It never
 * writes code, and it never decides for itself what is legal — everything here is checked by
 * the same validator the game loads through, because two opinions about what is valid is the
 * one failure that would make this tool worse than useless.
 */

import { useMemo, useRef, useState } from 'react';

import type { ContentBundle } from '../../../engine/content.ts';
import type { Draft } from '../../builder.ts';
import type { PackShelf } from '../../packs.ts';
import { applyPacks, overriddenBy, validatePack } from '../../../engine/pack.ts';
import { validateContent, type Problem } from '../../../engine/validate.ts';
import {
  blankAction, blankBeat, blankDraft, blankObject, blankRule, toDraft, toPack, unfinished,
  verbsWithoutFallback,
} from '../../builder.ts';
import {
  download, packFromFile, packToFile, putPack, removePack, setEnabled,
} from '../../packs.ts';
import Simple from './Simple.tsx';
import RuleForm from './RuleForm.tsx';
import BeatForm from './BeatForm.tsx';
import { ActionForm, ObjectForm } from './ThingForm.tsx';

type Props = {
  /** The game as it ships. A scenario is always written against this, never against itself. */
  base: ContentBundle;

  /** The game as it is currently running — base plus whatever packs are switched on. */
  content: ContentBundle;
  shelf: PackShelf;
  onChange: (shelf: PackShelf) => void;
};

export default function Builder({ base, content, shelf, onChange }: Props) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [imported, setImported] = useState<Problem[] | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const pack = useMemo(() => (editing === null ? null : toPack(editing)), [editing]);

  /**
   * The game with this scenario laid over it, whether or not it is switched on. This is what
   * the pickers read, so a rule can name a verb the same scenario is still in the middle of
   * inventing.
   */
  const withDraft = useMemo(
    () => (pack === null ? content : applyPacks(base, [pack])),
    [base, content, pack],
  );

  const problems = useMemo(() => {
    if (pack === null) return [];
    return [...validatePack(pack), ...validateContent(applyPacks(base, [pack]))]
      // Warnings about the base game's own content are not this author's business.
      .filter((problem) => problem.level === 'error' || mentionsDraft(problem, pack.pack, editing));
  }, [base, pack, editing]);

  const errors = problems.filter((problem) => problem.level === 'error');

  /**
   * What is half-written, in plain words. The validator remains the authority on what is legal;
   * this is the same news said in terms of what is on screen, because `actions[22].name` is the
   * right message for a content pass and the wrong one for somebody naming a matchbox.
   */
  const todo = editing === null ? [] : unfinished(editing);
  const overrides = pack === null ? null : overriddenBy(base, pack);
  const missingFallback = editing === null ? [] : verbsWithoutFallback(editing);

  /** Keep the shelf in step with the draft, and never let a broken scenario into the room. */
  function commit(draft: Draft) {
    setEditing(draft);
    if (draft.pack === '') return;
    const next = putPack(shelf, toPack(draft));
    const broken = validatePack(toPack(draft)).some((problem) => problem.level === 'error')
      || validateContent(applyPacks(base, [toPack(draft)])).some((p) => p.level === 'error');
    onChange(broken ? setEnabled(next, draft.pack, false) : next);
  }

  function start() {
    setEditing({ ...blankDraft(), pack: `scenario-${shelf.packs.length + 1}` });
    setImported(null);
  }

  function open(id: string) {
    const found = shelf.packs.find((entry) => entry.pack === id);
    if (found !== undefined) setEditing(toDraft(found));
    setImported(null);
  }

  async function importFile(chosen: File) {
    const read = packFromFile(await chosen.text());
    if (!read.ok) return setImported(read.problems);
    onChange(putPack(shelf, read.pack));
    setEditing(toDraft(read.pack));
    setImported(null);
  }

  return (
    <div className="builder">
      <aside>
        <h2>Scenarios</h2>
        <p className="muted">
          Everything here is data laid on top of the game. Switching one on starts a fresh run,
          because a scenario is something you want to see from the beginning.
        </p>

        <ul className="packs">
          {shelf.packs.map((entry) => (
            <li key={entry.pack} className={editing?.pack === entry.pack ? 'on' : undefined}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={shelf.enabled.includes(entry.pack)}
                  onChange={(event) => onChange(setEnabled(shelf, entry.pack, event.target.checked))}
                />
                <strong>{entry.title === '' ? entry.pack : entry.title}</strong>
              </label>
              <div className="row">
                <button onClick={() => open(entry.pack)}>Edit</button>
                <button
                  onClick={() => download(`${entry.pack}.json`, packToFile(entry), 'application/json')}
                >
                  Export
                </button>
                <button
                  className="drop"
                  onClick={() => {
                    onChange(removePack(shelf, entry.pack));
                    if (editing?.pack === entry.pack) setEditing(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="row">
          <button onClick={start}>New scenario</button>
          <button onClick={() => file.current?.click()}>Import</button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen !== undefined) void importFile(chosen);
              event.target.value = '';
            }}
          />
        </div>

        {imported !== null && (
          <div className="alarm">
            <strong>That file will not load.</strong>
            <ul>{imported.map((problem, i) => <li key={i}>{problem.where}: {problem.what}</li>)}</ul>
          </div>
        )}
      </aside>

      {editing === null ? (
        <main className="empty">
          <p>Pick a scenario to edit, or start a new one.</p>
          <p className="muted">
            A scenario is a moment you want the game to have: a thing in the room, a verb for
            doing something to it, and what she does about it. It comes out as one file you can
            hand to somebody.
          </p>
        </main>
      ) : (
        <main>
          <section>
            <label>
              <span>Called</span>
              <input
                value={editing.title}
                placeholder="The thing on the sill"
                onChange={(event) => commit({ ...editing, title: event.target.value })}
              />
            </label>
            {advanced && (
              <label>
                <span>Filed under</span>
                <input
                  value={editing.pack}
                  onChange={(event) => commit({
                    ...editing,
                    pack: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  })}
                />
              </label>
            )}
            <label>
              <span>By</span>
              <input
                value={editing.author}
                onChange={(event) => commit({ ...editing, author: event.target.value })}
              />
            </label>
            <label className="check switch">
              <input
                type="checkbox"
                checked={advanced}
                onChange={(event) => setAdvanced(event.target.checked)}
              />
              show every field
            </label>
          </section>

          {overrides !== null && overrides.beats.concat(
            overrides.reactions, overrides.objects, overrides.actions,
          ).length > 0 && (
            <div className="notice">
              <strong>This replaces things the game already has:</strong>{' '}
              {[...overrides.objects, ...overrides.actions, ...overrides.reactions, ...overrides.beats]
                .join(', ')}
              . That is allowed and often the point — but switching this scenario off puts them
              back.
            </div>
          )}

          {todo.length > 0 && (
            <div className="notice">
              <strong>Not finished yet:</strong>
              <ul>{todo.map((what, i) => <li key={i}>{what}</li>)}</ul>
            </div>
          )}

          {errors.length > 0 && todo.length === 0 && (
            <div className="alarm">
              <strong>Something is wrong with this scenario:</strong>
              <ul>{errors.map((problem, i) => <li key={i}>{problem.where}: {problem.what}</li>)}</ul>
            </div>
          )}

          {advanced && missingFallback.length > 0 && (
            <div className="notice">
              {missingFallback.join(', ')} needs one rule with no conditions at all, or the game
              can reach a moment where she says nothing.
            </div>
          )}

          {advanced ? (
            <>
              <section>
                <h3>Things</h3>
                {editing.objects.map((object, index) => (
                  <ObjectForm
                    key={index}
                    object={object}
                    content={withDraft}
                    verbs={editing.actions}
                    onChange={(next) => commit({
                      ...editing,
                      objects: editing.objects.map((o, i) => (i === index ? next : o)),
                    })}
                    onRemove={() => commit({
                      ...editing, objects: editing.objects.filter((_, i) => i !== index),
                    })}
                  />
                ))}
                <button
                  onClick={() => commit({
                    ...editing,
                    objects: [...editing.objects, blankObject(base.places[0]?.id ?? '')],
                  })}
                >
                  Add a thing
                </button>
              </section>

              <section>
                <h3>Verbs</h3>
                {editing.actions.map((action, index) => (
                  <ActionForm
                    key={index}
                    action={action}
                    onChange={(next) => commit({
                      ...editing,
                      actions: editing.actions.map((a, i) => (i === index ? next : a)),
                    })}
                    onRemove={() => commit({
                      ...editing, actions: editing.actions.filter((_, i) => i !== index),
                    })}
                  />
                ))}
                <button onClick={() => commit({ ...editing, actions: [...editing.actions, blankAction()] })}>
                  Add a verb
                </button>
              </section>

              <section>
                <h3>Lines</h3>
                {editing.beats.map((beat, index) => (
                  <BeatForm
                    key={index}
                    beat={beat}
                    onChange={(next) => commit({
                      ...editing,
                      beats: editing.beats.map((b, i) => (i === index ? next : b)),
                    })}
                    onRemove={() => commit({
                      ...editing, beats: editing.beats.filter((_, i) => i !== index),
                    })}
                  />
                ))}
                <button onClick={() => commit({ ...editing, beats: [...editing.beats, blankBeat()] })}>
                  Add a line
                </button>
              </section>

              <section>
                <h3>Rules</h3>
                {editing.rules.map((rule, index) => (
                  <RuleForm
                    key={index}
                    rule={rule}
                    content={withDraft}
                    ownBeats={editing.beats.map((beat) => beat.id).filter((id) => id !== '')}
                    onChange={(next) => commit({
                      ...editing,
                      rules: editing.rules.map((r, i) => (i === index ? next : r)),
                    })}
                    onRemove={() => commit({
                      ...editing, rules: editing.rules.filter((_, i) => i !== index),
                    })}
                  />
                ))}
                <button
                  onClick={() => commit({
                    ...editing,
                    rules: [...editing.rules, blankRule(editing.actions[0]?.id ?? 'look')],
                  })}
                >
                  Add a rule
                </button>
              </section>
            </>
          ) : (
            <Simple draft={editing} content={withDraft} base={base} onChange={commit} />
          )}

          <div className="footer">
            <button
              disabled={errors.length > 0}
              onClick={() => onChange(setEnabled(putPack(shelf, toPack(editing)), editing.pack, true))}
            >
              {errors.length > 0 ? 'Finish it above first' : 'Switch it on and play it'}
            </button>
            <button
              disabled={errors.length > 0}
              onClick={() => download(
                `${editing.pack}.json`, packToFile(toPack(editing)), 'application/json',
              )}
            >
              Export
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

/** Whether a problem is about this scenario rather than about the game it sits on top of. */
function mentionsDraft(problem: Problem, packId: string, draft: Draft | null): boolean {
  if (problem.where.startsWith(packId)) return true;
  if (draft === null) return false;
  const own = [
    ...draft.objects.map((object) => object.id),
    ...draft.actions.map((action) => action.id),
    ...draft.rules.map((rule) => rule.id),
    ...draft.beats.map((beat) => beat.id),
  ].filter((id) => id !== '');
  return own.some((id) => problem.where.includes(id) || problem.what.includes(id));
}
