import { blocks, born, column, multiply, multiplyK } from './quantum.ts';
import { basisState, evolve, readoutProbabilities, runCircuits } from './circuits.ts';
import type { IntervalScore } from './circuits';
import type { Parameters, Passage } from './quantum';

// The dictionary changes sounds, never Born probabilities. All four outcomes sound.
export const PITCHES = [
  { name: 'C4', label: 'C₄', midi: 60, staffY: 120, sample: 'C4', sampleMidi: 60 },
  { name: 'E4', label: 'E₄', midi: 64, staffY: 104, sample: 'Ds4', sampleMidi: 63 },
  { name: 'G4', label: 'G₄', midi: 67, staffY: 88, sample: 'Fs4', sampleMidi: 66 },
  { name: 'C5', label: 'C₅', midi: 72, staffY: 64, sample: 'C5', sampleMidi: 72 },
] as const;

export const SHEET_PASSAGES = {
  'full-first': { title: 'Full passage · check after U₁', gates: 'U₁ | U₂ → U₃', first: 'U₁', second: 'U₂ → U₃' },
  'full-second': { title: 'Full passage · check after U₂', gates: 'U₁ → U₂ | U₃', first: 'U₁ → U₂', second: 'U₃' },
  opening: { title: 'Opening pair', gates: 'U₁ | U₂', first: 'U₁', second: 'U₂' },
  internal: { title: 'Fresh internal pair', gates: 'U₂ | U₃', first: 'U₂', second: 'U₃' },
} as const;
export type SheetPassage = keyof typeof SHEET_PASSAGES;
export type WrittenNote = { index: number; pitch: number; onset: number; beats: 1 | 2 };

/** Figure 4: the measured selector enables or skips the next run's middle check.
 * A real sound readout starts a note; the next real check ends its hold. A skipped
 * check neither samples a pitch nor collapses the data state nor reattacks a key.
 * Take N readouts plus one hidden lookahead check, then shift the first readout to
 * audio time zero. This is an N-note excerpt, not N complete two-interval runs.
 */
export function makeSheet(passage: Passage, parameters: Parameters, entrance: number, intervalScore: IntervalScore, seed: number, count = 16) {
  if (!Number.isInteger(entrance) || entrance < 0 || entrance > 3 || !Number.isSafeInteger(count) || count < 1 || count > 4096) throw new Error('Invalid sheet settings');
  const [A, B] = blocks(passage, parameters), unitary = multiply(B, A);
  const pitchState = evolve(unitary, basisState(4, entrance));
  // The coherent endpoint law is a reference, not the law of every played note.
  const coherentEndpointKernel = born(unitary);
  const checkedEndpointKernel = multiplyK(born(B), born(A));
  const kernelResidual = Math.max(...coherentEndpointKernel.flatMap((row, y) => row.map((value, x) => Math.abs(value - checkedEndpointKernel[y][x]))));
  const pitchProbabilities = column(coherentEndpointKernel, entrance);
  const earlyLaw = column(born(A), entrance), finalKernel = born(B);
  const checkedEndpointProbabilities = column(checkedEndpointKernel, entrance);
  const run = runCircuits(passage, parameters, entrance, intervalScore, seed, count + 1);
  const readouts = run.events.filter(event => event.outcome !== null);
  const firstReadoutTick = readouts[0].tick;
  const firstInterval = run.traces[0].interval;
  // Initial joint law is computed before either register's outcomes are known.
  const firstJoint = earlyLaw.map((p, y) => [p * firstInterval.probabilities[1], pitchProbabilities[y] * firstInterval.probabilities[0]]);
  const traces = readouts.slice(0, count).map((event, index) => {
    const next = readouts[index + 1], source = run.traces[event.phrase];
    const early = event.slot === 1;
    const controller = early ? source : run.traces[event.phrase + 1];
    const beats = next.tick - event.tick;
    if (beats !== 1 && beats !== 2) throw new Error('Nonconsecutive sound checks');
    const note: WrittenNote = { index, pitch: event.outcome!, onset: event.tick - firstReadoutTick, beats };
    const nextProbabilities = early ? column(finalKernel, note.pitch)
      : controller.selector === 1 ? earlyLaw : pitchProbabilities;
    // Rows = NEXT readout pitch. Columns = waiting 1 or 2 beats from THIS note.
    // After an early Z, B acts on |Z>; after an endpoint, prepare fresh |x>.
    const joint = early ? nextProbabilities.map(p => [p, 0])
      : earlyLaw.map((p, y) => [p * controller.interval.probabilities[1], pitchProbabilities[y] * controller.interval.probabilities[0]]);
    return {
      note,
      source: { run: event.phrase + 1, check: early ? 'step' as const : 'end' as const, tick: event.tick, selector: source.selector,
        probabilities: early ? source.earlyProbabilities! : source.finalProbabilities,
        earlyOutcome: source.earlyOutcome, finalOutcome: source.finalOutcome },
      sourceInterval: source.interval, interval: controller.interval, controlSelector: controller.selector, joint, nextProbabilities,
      prefixProbabilities: controller.prefixProbabilities, checkedPrefixProbabilities: controller.checkedPrefixProbabilities, prefixResidual: controller.prefixResidual,
    };
  });
  const notes = traces.map(trace => trace.note);
  return { notes, traces, unitary, pitchState, pitchProbabilities, firstJoint,
    laws: { middle: earlyLaw, coherentEndpoint: pitchProbabilities, checkedEndpoint: checkedEndpointProbabilities, kernelResidual },
    firstReadoutTick, totalBeats: readouts[count].tick - firstReadoutTick };
}

/** Half-open score intervals: no overlap, no inserted silence, no extra attack. */
export function noteAtBeat(notes: WrittenNote[], beat: number): number {
  return notes.findIndex(note => beat >= note.onset && beat < note.onset + note.beats);
}

/** Unmetered staff rows: no invented rests, bar divisions, or tied reattacks. */
export function staffRows(notes: WrittenNote[], perRow = 8) {
  if (!Number.isSafeInteger(perRow) || perRow < 1) throw new Error('Invalid staff length');
  return Array.from({ length: Math.ceil(notes.length / perRow) }, (_, i) => {
    const row = notes.slice(i * perRow, (i + 1) * perRow);
    return { notes: row, firstBeat: row[0].onset, beats: row.at(-1)!.onset + row.at(-1)!.beats - row[0].onset };
  });
}
