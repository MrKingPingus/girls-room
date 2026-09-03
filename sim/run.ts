/**
 * Girl's Room — headless test harness.
 *
 * Architecture §8: in a systemic game you cannot find content gaps by playing, you find them
 * statistically. This runs the engine thousands of times with no browser and no human and
 * reports which beats never fired, which endings were reached and how often, and which runs
 * got stuck with nothing to do.
 *
 * NOT BUILT YET. It needs the pipeline, which does not exist. This file exists so that
 * `npm run sim` says something useful instead of "file not found".
 */

console.error(
  [
    'The simulation harness is not built yet.',
    '',
    'It needs the eight-stage pipeline in engine/, which has not been written.',
    'What exists today is the state shape, the beat schema, the content shapes,',
    'and the content validator. Run `npm run check` to exercise those.',
  ].join('\n'),
);

process.exit(1);
