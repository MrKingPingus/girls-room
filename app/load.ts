/**
 * Girl's Room — loading the content files.
 *
 * This is the only place that touches the disk. `engine/` never does, which is what lets it
 * run in a browser, in Node, and inside the headless harness without changing a line.
 *
 * Everything is validated before the engine sees any of it. If a content file has a typo the
 * game refuses to start and says exactly what is wrong, rather than running with a rule that
 * silently never fires (hard rule 9).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { ContentBundle } from '../engine/content.ts';
import { loadContent } from '../engine/validate.ts';

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(CONTENT_DIR, name), 'utf8')) as unknown;
}

export function loadGameContent(): ContentBundle {
  return loadContent({
    places: readJson('places.json'),
    objects: readJson('objects.json'),
    actions: readJson('actions.json'),
    reactions: readJson('reactions.json'),
    beats: readJson('beats.json'),
    schedule: readJson('schedule.json'),
  });
}
