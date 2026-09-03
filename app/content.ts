/**
 * Girl's Room — content, for the browser.
 *
 * The terminal build reads the JSON files off the disk. A browser can't, so here they are
 * imported directly and bundled into the page. Either way it is `app/` doing the loading and
 * `engine/` never touching the outside world — that separation is what lets the same engine
 * run in a page, in a terminal, and in the headless harness.
 *
 * Validated before the engine sees any of it, exactly as on the terminal side.
 */

import places from '../content/places.json' with { type: 'json' };
import objects from '../content/objects.json' with { type: 'json' };
import actions from '../content/actions.json' with { type: 'json' };
import reactions from '../content/reactions.json' with { type: 'json' };
import beats from '../content/beats.json' with { type: 'json' };
import schedule from '../content/schedule.json' with { type: 'json' };

import type { ContentBundle } from '../engine/content.ts';
import { loadContent } from '../engine/validate.ts';

export function loadBundledContent(): ContentBundle {
  return loadContent({ places, objects, actions, reactions, beats, schedule });
}
