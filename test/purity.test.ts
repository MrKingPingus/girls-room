/**
 * Hard rule 1: `engine/` is pure.
 *
 * It must run in plain Node with no browser, no screen and no disk. That is what lets the
 * headless harness play thousands of games unattended, and it is what will let the visual
 * novel renderer be swapped in later without a line of game logic changing.
 *
 * This is the kind of rule that erodes one convenient import at a time, so it is checked
 * rather than trusted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Strip comments before scanning. Otherwise the word "window" in a sentence about the dormer
 * window trips a check meant to catch browser code, and a test that cries wolf gets ignored.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const engineFiles = sourceFiles('engine');

test('engine/ never imports the renderer or the app', () => {
  for (const file of engineFiles) {
    const source = codeOnly(readFileSync(file, 'utf8'));
    assert.doesNotMatch(source, /from '.*\.\.\/(render|app|sim)\//, `${file} reaches outside`);
  }
});

test('engine/ touches nothing outside itself — no disk, no screen, no clock', () => {
  const forbidden = [
    [/from 'node:fs'|require\('fs'\)/, 'reads the disk'],
    [/\bdocument\.|\bwindow\.|localStorage/, 'touches the browser'],
    [/console\.(log|warn|error)\(/, 'writes to the screen'],
    [/new Date\(|Date\.now\(/, 'reads the real clock'],
    [/Math\.random\(/, 'rolls unrepeatably — replays would stop matching'],
    [/setTimeout|setInterval/, 'uses a timer'],
  ] as const;

  for (const file of engineFiles) {
    const source = codeOnly(readFileSync(file, 'utf8'));
    for (const [pattern, why] of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} ${why}`);
    }
  }
});

test('no pipeline stage imports another pipeline stage', () => {
  // Architecture §6. The moment one does, the pipeline stops being eight independent passes
  // and becomes a tangle where adding a system means rewiring the others.
  for (const file of sourceFiles(join('engine', 'stages'))) {
    const source = codeOnly(readFileSync(file, 'utf8'));
    const imports = source.matchAll(/^import (type )?.*from '\.\/(\w+)\.ts';$/gm);
    for (const match of imports) {
      assert.ok(match[1] === 'type ',
        `${file} imports code from the ${match[2]} stage — stages must not call each other`);
    }
  }
});
