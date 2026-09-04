/**
 * One rule: when this happens, she does this.
 *
 * The forms are the easy half. The half that earns this screen is at the bottom — the panel
 * that says which rules already in the game answer the same moment, and who wins. Most
 * conditions wins, ties break by weight, and a tie on weight is a coin flip. Nothing about that
 * is guessable from looking at a rule on its own, and it is where authors lose days.
 */

import type { ContentBundle } from '../../../engine/content.ts';
import type { ConditionRow, DraftRule } from '../../builder.ts';
import { ALL_FACTS, factSpec } from '../../../engine/facts.ts';
import {
  TESTS, choicesFor, describeCondition, rivals, testsFor, toCriteria,
} from '../../builder.ts';

type Props = {
  rule: DraftRule;
  content: ContentBundle;

  /** Beat ids this pack defines, offered first because they are the ones being written. */
  ownBeats: string[];
  onChange: (rule: DraftRule) => void;
  onRemove: () => void;
};

export default function RuleForm({ rule, content, ownBeats, onChange, onRemove }: Props) {
  const set = (patch: Partial<DraftRule>) => onChange({ ...rule, ...patch });

  const competing = rivals(content, {
    id: rule.id, action: rule.action, when: toCriteria(rule.conditions), weight: rule.weight,
  });
  const flips = competing.filter((rival) => rival.outcome === 'coin_flip');
  const beaten = competing.filter((rival) => rival.outcome === 'they_win');
  const outranked = beaten.filter((rival) => rival.reason === 'conditions');
  const outweighed = beaten.filter((rival) => rival.reason === 'weight');
  const won = competing.filter((rival) => rival.outcome === 'you_win');
  const heaviest = Math.max(0, ...outweighed.map((rival) => rival.rule.weight ?? 0));

  function setCondition(index: number, patch: Partial<ConditionRow>) {
    set({ conditions: rule.conditions.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }

  return (
    <div className="card rule">
      <div className="cardhead">
        <input
          className="id"
          value={rule.id}
          placeholder="a short name for this rule"
          onChange={(event) => set({ id: event.target.value })}
        />
        <button className="drop" onClick={onRemove}>Remove</button>
      </div>

      <label>
        <span>When the player does</span>
        <select value={rule.action} onChange={(event) => set({ action: event.target.value })}>
          {content.actions.map((action) => (
            <option key={action.id} value={action.id}>{action.name} ({action.id})</option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Only when…</legend>
        {rule.conditions.length === 0 && (
          <p className="muted">
            No conditions. This rule answers every time — which is what one rule per verb has to
            do, and what every other rule beats.
          </p>
        )}

        {rule.conditions.map((row, index) => {
          const spec = factSpec(row.fact);
          const choices = spec === null ? [] : choicesFor(spec, content);
          return (
            <div className="condition" key={index}>
              <select
                value={row.fact}
                onChange={(event) => {
                  const next = factSpec(event.target.value);
                  setCondition(index, {
                    fact: event.target.value,
                    test: next === null ? 'is' : (testsFor(next)[0] ?? 'is'),
                    values: [],
                  });
                }}
              >
                <option value="">choose something to check…</option>
                {ALL_FACTS.map((fact) => (
                  <option key={fact.id} value={fact.id}>{fact.label}</option>
                ))}
              </select>

              <select
                value={row.test}
                disabled={spec === null}
                onChange={(event) =>
                  setCondition(index, { test: event.target.value as ConditionRow['test'] })}
              >
                {(spec === null ? [] : testsFor(spec)).map((test) => (
                  <option key={test} value={test}>
                    {TESTS.find((entry) => entry.id === test)?.label}
                  </option>
                ))}
              </select>

              {row.test === 'one_of' ? (
                <div className="multi">
                  {choices.map((choice) => (
                    <label key={choice} className="check">
                      <input
                        type="checkbox"
                        checked={row.values.includes(choice)}
                        onChange={(event) => setCondition(index, {
                          values: event.target.checked
                            ? [...row.values, choice]
                            : row.values.filter((value) => value !== choice),
                        })}
                      />
                      {choice}
                    </label>
                  ))}
                </div>
              ) : choices.length > 0 ? (
                <select
                  value={row.values[0] ?? ''}
                  onChange={(event) => setCondition(index, { values: [event.target.value] })}
                >
                  <option value="">choose…</option>
                  {choices.map((choice) => (
                    <option key={choice} value={choice}>{choice}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={spec?.kind === 'number' ? 'number' : 'text'}
                  value={row.values[0] ?? ''}
                  onChange={(event) => setCondition(index, { values: [event.target.value] })}
                />
              )}

              <button
                className="drop"
                onClick={() => set({
                  conditions: rule.conditions.filter((_, i) => i !== index),
                })}
              >
                &times;
              </button>

              {spec !== null && <p className="hint">{spec.about}</p>}
            </div>
          );
        })}

        <button
          onClick={() => set({ conditions: [...rule.conditions, { fact: '', test: 'is', values: [] }] })}
        >
          Add a condition
        </button>
      </fieldset>

      <fieldset>
        <legend>She says…</legend>
        {rule.beats.length === 0 && <p className="muted">A rule that says nothing is a bug.</p>}
        {rule.beats.map((beatId, index) => (
          <div className="beatrow" key={index}>
            <select
              value={beatId}
              onChange={(event) => set({
                beats: rule.beats.map((id, i) => (i === index ? event.target.value : id)),
              })}
            >
              <option value="">choose a line…</option>
              {ownBeats.length > 0 && (
                <optgroup label="this scenario">
                  {ownBeats.map((id) => <option key={id} value={id}>{id}</option>)}
                </optgroup>
              )}
              <optgroup label="already in the game">
                {Object.keys(content.beats)
                  .filter((id) => !ownBeats.includes(id))
                  .map((id) => <option key={id} value={id}>{id}</option>)}
              </optgroup>
            </select>
            <button
              className="drop"
              disabled={index === 0}
              onClick={() => {
                const beats = [...rule.beats];
                const above = beats[index - 1];
                const here = beats[index];
                if (above === undefined || here === undefined) return;
                beats[index - 1] = here;
                beats[index] = above;
                set({ beats });
              }}
            >
              &uarr;
            </button>
            <button
              className="drop"
              onClick={() => set({ beats: rule.beats.filter((_, i) => i !== index) })}
            >
              &times;
            </button>
          </div>
        ))}
        <button onClick={() => set({ beats: [...rule.beats, ''] })}>Add a line</button>
      </fieldset>

      <fieldset>
        <legend>And it changes…</legend>
        <div className="meters">
          {([
            ['affection', 'affection'], ['trust', 'trust'],
            ['suspicion', 'suspicion'], ['dispositionPressure', 'how she is holding up'],
          ] as const).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type="number"
                value={rule[key]}
                onChange={(event) => set({ [key]: Number(event.target.value) } as Partial<DraftRule>)}
              />
            </label>
          ))}
        </div>
        <p className="hint">
          For scale: being caught opening the drawer is +18 suspicion and &minus;6 trust. Being
          caught palming a dose is +30 and &minus;18.
        </p>
      </fieldset>

      <fieldset>
        <legend>Which rule wins</legend>
        {competing.length === 0 ? (
          <p className="muted">Nothing else in the game answers this moment. Yours plays.</p>
        ) : (
          <>
            {flips.length > 0 && (
              <div className="warn">
                <p>
                  <strong>Coin flip with {flips.map((rival) => rival.rule.id).join(', ')}.</strong>{' '}
                  Same number of conditions and the same weight, so the game picks between them
                  at random every time. It will look like it works, then like it doesn&rsquo;t.
                </p>
                <button
                  onClick={() => set({
                    weight: Math.max(...flips.map((rival) => rival.rule.weight ?? 0)) + 10,
                  })}
                >
                  Settle it — give this rule more weight
                </button>
              </div>
            )}

            {outranked.length > 0 && (
              <p className={rule.conditions.length === 0 ? 'muted' : undefined}>
                Gives way to <strong>{outranked.map((rival) => rival.rule.id).join(', ')}</strong>.
                {rule.conditions.length === 0
                  ? ' Which is what a rule with no conditions is for — it answers every moment'
                    + ' the sharper ones do not.'
                  : ' Those have more conditions, so they take the moments where both apply.'
                    + ' Yours still plays the rest of the time.'}
              </p>
            )}

            {outweighed.length > 0 && (
              <div className="warn">
                <p>
                  Gives way to <strong>{outweighed.map((rival) => rival.rule.id).join(', ')}</strong>
                  {' '}— the same number of conditions, but heavier. Weight is only ever consulted
                  on a tie like this.
                </p>
                <button onClick={() => set({ weight: heaviest + 10 })}>
                  Outweigh them
                </button>
              </div>
            )}

            {won.length > 0 && (
              <details>
                <summary>
                  Yours beats {won.length} other rule{won.length === 1 ? '' : 's'} for this verb
                </summary>
                <ul className="rivals">
                  {won.map((rival) => (
                    <li key={rival.rule.id} className="you_win">
                      <strong>{rival.rule.id}</strong>
                      <span> — {rival.why}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        <label className="weight">
          <span>weight</span>
          <input
            type="number"
            value={rule.weight}
            onChange={(event) => set({ weight: Number(event.target.value) })}
          />
          <span className="hint">Only ever consulted between rules with the same number of
          conditions.</span>
        </label>
      </fieldset>

      {rule.conditions.length > 0 && (
        <p className="reads">
          Reads as: {rule.conditions.map(describeCondition).join(', and ')}
        </p>
      )}
    </div>
  );
}
