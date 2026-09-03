import { makeSheet, PITCHES } from './sheet.ts';
import type { WrittenNote } from './sheet';
import type { IntervalScore } from './circuits';
import type { Parameters, Passage } from './quantum';

export const NOTE_STATES = PITCHES.flatMap((pitch, y) => ([1, 2] as const).map(beats => ({
  pitch: y, beats,
  label: pitch.label + ' · ' + beats,
})));

export function noteState(note: Pick<WrittenNote, 'pitch' | 'beats'>) {
  if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch >= 4 || (note.beats !== 1 && note.beats !== 2)) throw new Error('Invalid note state');
  return 2 * note.pitch + note.beats - 1;
}

/** Each comparison is an actual complete run of the same amplitude simulator.
 * Slice only for display: an eight-note row break must not reset the selector.
 * No random draws from this helper enter the score being played.
 */
export function sampleNotePaths(passage: Passage, parameters: Parameters, entrance: number, family: IntervalScore, seed: number, count: number, samples: number) {
  if (!Number.isSafeInteger(samples) || samples < 0 || samples > 256) throw new Error('Invalid number of comparison scores');
  return Array.from({ length: samples }, (_, i) => makeSheet(passage, parameters, entrance, family, (seed + i + 1) >>> 0, count).notes.map(noteState));
}

// The CSS staff-note position and canvas node center share exactly this geometry.
export function noteColumn(slot: number, columns: number) {
  if (!Number.isSafeInteger(columns) || columns < 1 || !Number.isSafeInteger(slot) || slot < 0 || slot >= columns) throw new Error('Invalid note column');
  const fraction = slot / columns;
  return { fraction, left: 'calc(' + fraction * 100 + '% + ' + (92 - 118 * fraction) + 'px)' };
}
export function graphColumnX(width: number, slot: number, columns: number) {
  return 109 + noteColumn(slot, columns).fraction * (width - 118);
}
