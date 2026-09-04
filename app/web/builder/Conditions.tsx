/**
 * The "only when…" rows, shared by both views of the builder.
 *
 * The fact list is grouped rather than flat: forty-four names in one dropdown is a wall, and
 * *whether she noticed* is a single thought an author has, not four scattered entries.
 */

import type { ContentBundle } from '../../../engine/content.ts';
import type { ConditionRow } from '../../builder.ts';
import { FACT_GROUPS, factSpec } from '../../../engine/facts.ts';
import { TESTS, choicesFor, testsFor } from '../../builder.ts';

type Props = {
  rows: ConditionRow[];
  content: ContentBundle;
  onChange: (rows: ConditionRow[]) => void;
};

export default function Conditions({ rows, content, onChange }: Props) {
  function set(index: number, patch: Partial<ConditionRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /** Which subject a row is about — the fact's own group, or one picked but not yet narrowed. */
  function groupOf(fact: string): string {
    const holding = rows.find((row) => row.fact === fact);
    if (fact === '') return holding?.group ?? '';
    return FACT_GROUPS.find((group) => (group.facts as readonly string[]).includes(fact))?.id ?? '';
  }

  return (
    <>
      {rows.map((row, index) => {
        const spec = factSpec(row.fact);
        const choices = spec === null ? [] : choicesFor(spec, content);
        const tests = spec === null ? [] : testsFor(spec);

        return (
          <div className="condition" key={index}>
            {/*
              * Two small dropdowns rather than one of forty-four. Pick the subject first — her,
              * whether she noticed, the thing you touched — and only then what about it. Every
              * list is short enough to read, and the subject stays on screen as a label for
              * what you are looking at.
              */}
            <select
              className="subject"
              value={groupOf(row.fact)}
              onChange={(event) => set(index, { fact: '', test: 'is', values: [], group: event.target.value })}
            >
              <option value="">about…</option>
              {FACT_GROUPS.map((group) => (
                <option key={group.id} value={group.id}>{group.label}</option>
              ))}
            </select>

            {groupOf(row.fact) !== '' && (
              <select
                value={row.fact}
                onChange={(event) => {
                  const next = factSpec(event.target.value);
                  set(index, {
                    fact: event.target.value,
                    test: next === null ? 'is' : (testsFor(next)[0] ?? 'is'),
                    values: [],
                  });
                }}
              >
                <option value="">which…</option>
                {(FACT_GROUPS.find((group) => group.id === groupOf(row.fact))?.facts ?? [])
                  // Facts the tool has no way to write yet are left out rather than offered
                  // and then half-working. Hard rule 10 — the builder is never a second
                  // opinion about what is legal, so it only ever offers what it can finish.
                  // The debt is tracked in docs/scenario-builder.md §14.
                  .filter((id) => {
                    const spec = factSpec(id);
                    return spec !== null && testsFor(spec).length > 0;
                  })
                  .map((id) => (
                    <option key={id} value={id}>{factSpec(id)?.label ?? id}</option>
                  ))}
              </select>
            )}

            {tests.length > 1 && (
              <select
                value={row.test}
                onChange={(event) =>
                  set(index, { test: event.target.value as ConditionRow['test'], values: [] })}
              >
                {tests.map((test) => (
                  <option key={test} value={test}>
                    {TESTS.find((entry) => entry.id === test)?.label}
                  </option>
                ))}
              </select>
            )}

            {row.test === 'one_of' ? (
              <div className="multi">
                {choices.map((choice) => (
                  <label key={choice} className="check">
                    <input
                      type="checkbox"
                      checked={row.values.includes(choice)}
                      onChange={(event) => set(index, {
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
                onChange={(event) => set(index, { values: [event.target.value] })}
              >
                <option value="">choose…</option>
                {choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {spec?.kind === 'flag' ? (choice === 'true' ? 'yes' : 'no') : choice}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={spec?.kind === 'number' ? 'number' : 'text'}
                value={row.values[0] ?? ''}
                onChange={(event) => set(index, { values: [event.target.value] })}
              />
            )}

            <button
              className="drop"
              title="remove this condition"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              &times;
            </button>

            {spec !== null && row.values.length === 0 && <p className="hint">{spec.about}</p>}
          </div>
        );
      })}

      <button
        className="quiet"
        onClick={() => onChange([...rows, { fact: '', test: 'is', values: [] }])}
      >
        + another condition
      </button>
    </>
  );
}
