import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/lib/quantum.ts';
import { INTERVAL_SCORES } from '../src/lib/circuits.ts';
import { makeSheet } from '../src/lib/sheet.ts';
import { PUBLICATION_CAPTURE } from '../src/lib/publication-capture.ts';
import { TRAIL_LIMIT, trailOpacity } from '../src/lib/takes.ts';

assert.deepEqual(PUBLICATION_CAPTURE, { firstSeed: 1985, noteCount: 8, takes: 5, bpm: 108, volumePercent: 65 });
assert.equal(TRAIL_LIMIT, 4);
assert.ok(trailOpacity(0, 0) > trailOpacity(0, 1));
assert.ok(trailOpacity(0, 1) > trailOpacity(1, 1));

const selector = INTERVAL_SCORES.publication;
assert.equal(selector.lambda, 3 / 4);
assert.equal(selector.fixed, true);

const sheet = makeSheet('internal', DEFAULTS, 0, 'publication', 1985, 8);
const path = sheet.notes.map(note => 2 * note.pitch + note.beats - 1).join('');
assert.equal(path, '75353126');
assert.deepEqual(sheet.notes.map(({ pitch, onset, beats }) => ({ pitch, onset, beats })), [
  { pitch: 3, onset: 0, beats: 2 },
  { pitch: 2, onset: 2, beats: 2 },
  { pitch: 1, onset: 4, beats: 2 },
  { pitch: 2, onset: 6, beats: 2 },
  { pitch: 1, onset: 8, beats: 2 },
  { pitch: 0, onset: 10, beats: 2 },
  { pitch: 1, onset: 12, beats: 1 },
  { pitch: 3, onset: 13, beats: 1 },
]);
assert.deepEqual(sheet.traces.map(trace => trace.source.check), ['end', 'end', 'end', 'end', 'end', 'end', 'end', 'step']);
assert.deepEqual(sheet.traces.slice(0, 7).map(trace => ({ S: trace.source.selector, Z: trace.source.earlyOutcome, Y: trace.source.finalOutcome })), [
  { S: 0, Z: null, Y: 3 }, { S: 0, Z: null, Y: 2 }, { S: 0, Z: null, Y: 1 },
  { S: 0, Z: null, Y: 2 }, { S: 0, Z: null, Y: 1 }, { S: 0, Z: null, Y: 0 },
  { S: 0, Z: null, Y: 1 },
]);
assert.ok(sheet.laws.kernelResidual < 1e-12);
assert.deepEqual(sheet.laws.middle.map(value => Math.round(value * 8)), [3, 1, 1, 3]);
assert.deepEqual(sheet.laws.coherentEndpoint.map(value => Math.round(value * 16)), [5, 3, 5, 3]);
assert.deepEqual(sheet.laws.checkedEndpoint.map(value => Math.round(value * 16)), [5, 3, 5, 3]);
assert.equal(sheet.totalBeats, 14);

const capture = Array.from({ length: PUBLICATION_CAPTURE.takes }, (_, pass) => makeSheet('internal', DEFAULTS, 0, 'publication', PUBLICATION_CAPTURE.firstSeed + pass, PUBLICATION_CAPTURE.noteCount));
// A checked run must retain Z at its endpoint while revealing Y. This is the
// two-stage measurement state used by the animated circuit.
assert.deepEqual(capture[1].traces.slice(6, 8).map(trace => ({ run: trace.source.run, check: trace.source.check, Z: trace.source.earlyOutcome, Y: trace.source.finalOutcome })), [
  { run: 7, check: 'step', Z: 2, Y: 3 },
  { run: 7, check: 'end', Z: 2, Y: 3 },
]);
assert.deepEqual(capture.map(take => take.notes.map(note => 2 * note.pitch + note.beats - 1).join('')), [
  '75353126', '51575446', '55116657', '00002006', '11773711',
]);
assert.deepEqual(capture.map(take => take.totalBeats), [14, 13, 14, 8, 16]);
assert.equal(capture.reduce((total, take) => total + take.totalBeats, 0), 65);
assert.ok(Math.abs(.08 + 65 * 60 / PUBLICATION_CAPTURE.bpm + .08 - 36.27111111111111) < 1e-12);

console.log('PASS publication Figure 4 selector, score, laws, and timing');
