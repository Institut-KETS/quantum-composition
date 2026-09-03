import { abs2, add, blocks, born, mul, multiply, multiplyK, sample, seeded } from './quantum.ts';
import type { Complex, Event, Matrix, Parameters, Passage } from './quantum';

export type State = Complex[];
export type IntervalScore = 'publication' | 'ostinato' | 'jaws';
export const INTERVAL_SCORES = {
  publication: { name: 'Fixed selector', lambda: 0.75, fixed: true },
  ostinato: { name: 'Qubit Ostinato', lambda: 0.5, fixed: false },
  jaws: { name: 'Qubit Jaws', lambda: -0.5, fixed: false },
} as const;
export type PhraseTrace = {
  selector: 0 | 1;
  selectorProbability: number;
  interval: ReturnType<typeof intervalCircuit>;
  coherentSelectorState: State;
  prefixProbabilities: number[];
  checkedPrefixProbabilities: number[];
  prefixResidual: number;
  firstState: State;
  earlyProbabilities: number[] | null;
  earlyOutcome: number | null;
  finalState: State;
  finalProbabilities: number[];
  finalOutcome: number;
};
export function basisState(dimension: number, x: number): State {
  return Array.from({ length: dimension }, (_, i) => [i === x ? 1 : 0, 0]);
}
export function evolve(unitary: Matrix, state: State): State {
  return unitary.map(row => row.reduce<Complex>((sum, value, i) => add(sum, mul(value, state[i])), [0, 0]));
}
export function readoutProbabilities(state: State): number[] {
  const law = state.map(abs2), norm = law.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-9) throw new Error('Quantum state is not normalized');
  // Remove only floating-point norm drift; never reshape or musicalize the law.
  return law.map(value => value / norm);
}

/** Build either the manuscript's fixed measured selector Vsel or one step of
 * the complementary constant-kernel infinite score. Every option has Born
 * kernel K(lambda); the fixed selector repeats the same Ry(theta) operation.
 */
export function intervalCircuit(step: number, lambda = 0.5, input: 0 | 1 = 0, fixed = false) {
  if (!Number.isSafeInteger(step) || step < 1 || !Number.isFinite(lambda) || Math.abs(lambda) >= 1 || (input !== 0 && input !== 1)) throw new Error('Invalid interval score settings');
  const theta = Math.acos(lambda), c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  const prefix = lambda ** (step - 1);
  const alpha = fixed || step === 1 ? 0 : Math.atan(prefix * Math.sqrt(1 - lambda * lambda) / Math.sqrt(1 - prefix * prefix));
  const rotation: Matrix = fixed || step === 1
    ? [[[c, 0], [-s, 0]], [[s, 0], [c, 0]]]
    : [[[c, 0], [0, -s]], [[0, -s], [c, 0]]];
  const Rz: Matrix = [
    [[Math.cos(alpha / 2), -Math.sin(alpha / 2)], [0, 0]],
    [[0, 0], [Math.cos(alpha / 2), Math.sin(alpha / 2)]],
  ];
  const initial = basisState(2, input), afterRotation = evolve(rotation, initial);
  const state = evolve(Rz, afterRotation);
  return { step, lambda, fixed, theta, alpha, input, unitary: multiply(Rz, rotation), initial, afterRotation, state, probabilities: readoutProbabilities(state) };
}

/** Simulate both registers, sample measurements, and retain an auditable record.
 * The data state is explicitly collapsed only when an early check is enabled.
 * The selector is prepared once in |0>, then measured after each successive Uk.
 * The data is freshly prepared in |x> each phrase; its outcomes never feed back
 * into the selector. A separate coherent-prefix calculation is a comparison,
 * never the state from which the measured selector trajectory is sampled.
 */
export function runCircuits(passage: Passage, parameters: Parameters, entrance: number, intervalScore: IntervalScore, seed: number, phrases = 8) {
  if (!Number.isInteger(entrance) || entrance < 0 || entrance > 3 || !Number.isInteger(phrases) || phrases < 1) throw new Error('Invalid circuit settings');
  const score = INTERVAL_SCORES[intervalScore];
  if (!score) throw new Error('Unknown interval score');
  const [A, B] = blocks(passage, parameters);
  const rng = seeded(seed), events: Event[] = [], traces: PhraseTrace[] = [];
  let previous: 0 | 1 = 0;
  let coherentPrefix: Matrix = [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];
  let checkedPrefix = [[1, 0], [0, 1]];
  for (let phrase = 0; phrase < phrases; phrase++) {
    const interval = intervalCircuit(phrase + 1, score.lambda, previous, score.fixed);
    coherentPrefix = multiply(interval.unitary, coherentPrefix);
    checkedPrefix = multiplyK(born(interval.unitary), checkedPrefix);
    const coherentSelectorState = evolve(coherentPrefix, basisState(2, 0));
    const prefixProbabilities = readoutProbabilities(coherentSelectorState);
    const checkedPrefixProbabilities = checkedPrefix.map(row => row[0]);
    const prefixResidual = Math.max(...born(coherentPrefix).flatMap((row, y) => row.map((p, x) => Math.abs(p - checkedPrefix[y][x]))));
    // Independent uniform draws; correlated selector outcomes through state carry.
    const s = sample(interval.probabilities, rng) as 0 | 1;
    previous = s;
    const earlyDraw = rng(), finalDraw = rng();
    const firstState = evolve(A, basisState(4, entrance));
    const earlyProbabilities = s === 1 ? readoutProbabilities(firstState) : null;
    const z = earlyProbabilities === null ? null : sample(earlyProbabilities, () => earlyDraw);
    const stateAfterOptionalCheck = z === null ? firstState : basisState(4, z);
    const finalState = evolve(B, stateAfterOptionalCheck);
    const finalProbabilities = readoutProbabilities(finalState);
    const y = sample(finalProbabilities, () => finalDraw);
    events.push({ tick: phrase * 2 + 1, outcome: z, phrase, slot: 1, selector: s });
    events.push({ tick: phrase * 2 + 2, outcome: y, phrase, slot: 2, selector: s });
    traces.push({ selector: s, selectorProbability: interval.probabilities[s], interval, coherentSelectorState, prefixProbabilities, checkedPrefixProbabilities, prefixResidual, firstState, earlyProbabilities, earlyOutcome: z, finalState, finalProbabilities, finalOutcome: y });
  }
  return { intervalScore, events, traces };
}
