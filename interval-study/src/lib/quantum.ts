/** Four-dimensional amplitude simulation of manuscript Fig. 5.
 * Rows = exits, columns = entrances; rightmost matrix acts first.
 * All four outcomes stay distinct; 11 is the measured rest.
 */
export type Complex = readonly [number, number];
export type Matrix = Complex[][];
export type Kernel = number[][];
export type Passage = 'full-first' | 'full-second' | 'opening' | 'internal';
export type Parameters = { xi: number; eta: number; zeta: number };
export type Event = { tick: number; outcome: number | null; phrase: number; slot: 1 | 2; selector: 0 | 1 };
export const DEFAULTS: Parameters = { xi: 1 / 6, eta: 1 / 6, zeta: 0 };
export const BASIS = ['00', '01', '10', '11'];
export const SOUND = ['C', 'E', 'G', 'rest'];
export const PASSAGES: Record<Passage, { title: string; first: string; second: string; description: string }> = {
  'full-first': { title: 'Full score · cut after U₁', first: 'U₁', second: 'U₂ → U₃', description: 'All three Figure 5 gates. U₂ then U₃ share the second interval, with no check between them.' },
  'full-second': { title: 'Full score · cut after U₂', first: 'U₁ → U₂', second: 'U₃', description: 'The same full circuit with another cut. U₁ then U₂ share the first interval, with no check between them.' },
  opening: { title: 'Opening pair · U₁ then U₂', first: 'U₁', second: 'U₂', description: 'The first two gates, independently prepared at the initial boundary.' },
  internal: { title: 'Internal cue · U₂ then U₃', first: 'U₂', second: 'U₃', description: 'The last two gates, freshly prepared at their internal cue. This Figure 5 family still composes here.' },
};
export const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const abs2 = (a: Complex) => a[0] * a[0] + a[1] * a[1];
export const multiply = (a: Matrix, b: Matrix): Matrix => a.map(row => b[0].map((_, j) => row.reduce<Complex>((s, v, k) => add(s, mul(v, b[k][j])), [0, 0])));
export const product = (...matrices: Matrix[]) => matrices.reduce(multiply);
export const born = (a: Matrix): Kernel => a.map(row => row.map(abs2));
export const multiplyK = (a: Kernel, b: Kernel): Kernel => a.map(row => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
export const column = (a: Kernel, x: number) => a.map(row => row[x]);
const real = (a: number[][]): Matrix => a.map(row => row.map(v => [v, 0]));
export function gates({ xi, eta, zeta }: Parameters = DEFAULTS): Matrix[] {
  const W = real([[1, 1, 1, 1], [1, -1, 1, -1], [1, 1, -1, -1], [1, -1, -1, 1]].map(row => row.map(v => v / 2)));
  const C = real([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]]);
  const phi = (a: number, b: number, c: number): Matrix => [0, a, b, c].map((t, i) => [0, 1, 2, 3].map(j => i === j ? [Math.cos(Math.PI * t), Math.sin(Math.PI * t)] : [0, 0]));
  return [
    product(C, W, phi(xi, 0, xi), W, phi(0.5, 0, 0.5), W),
    product(C, W, phi(-0.5, 0.5, -1), W, phi(0.5 - xi, 0.5, -xi), W, C),
    product(C, W, phi(0.5, 0, 0.5), W, phi(eta, zeta, zeta - eta), W, C),
  ];
}
export function blocks(passage: Passage, parameters: Parameters = DEFAULTS): [Matrix, Matrix] {
  const [u1, u2, u3] = gates(parameters);
  if (passage === 'full-first') return [u1, multiply(u3, u2)];
  if (passage === 'full-second') return [multiply(u2, u1), u3];
  return passage === 'opening' ? [u1, u2] : [u2, u3];
}
export function analyse(passage: Passage, parameters: Parameters = DEFAULTS, entrance = 0) {
  const [A, B] = blocks(passage, parameters);
  const a = born(A), b = born(B), coherent = born(multiply(B, A)), checked = multiplyK(b, a);
  const p0 = column(coherent, entrance), p1 = column(checked, entrance);
  const joint = a.map((row, z) => b.map(brow => row[entrance] * brow[z]));
  const maxError = Math.max(...coherent.flatMap((row, y) => row.map((v, x) => Math.abs(v - checked[y][x]))));
  const nu = Math.sqrt(coherent.reduce((sum, row, y) => sum + row.reduce((s, v, x) => s + (v - checked[y][x]) ** 2, 0), 0) / 3);
  const amplitudes = [0, 1, 2, 3].map(z => mul(B[0][z], A[z][entrance]));
  const crossTerms = amplitudes.flatMap((v, z) => amplitudes.slice(z + 1).map((w, k) => ({ z, other: z + 1 + k, value: 2 * (v[0] * w[0] + v[1] * w[1]) })));
  return { A, B, a, b, coherent, checked, p0, p1, joint, maxError, nu, amplitudes, crossTerms };
}
export function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function sample(probabilities: number[], rng: () => number): number {
  const total = probabilities.reduce((s, v) => s + v, 0);
  if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-9 || probabilities.some(v => v < -1e-12)) throw new Error('Invalid Born distribution');
  let r = rng() * total;
  for (let k = 0; k < probabilities.length; k++) { r -= Math.max(0, probabilities[k]); if (r < 0) return k; }
  return probabilities.length - 1;
}
export function makeScore(passage: Passage, parameters: Parameters, entrance: number, bias: number, seed: number, phrases = 8): Event[] {
  if (!(bias >= 0 && bias <= 1) || !Number.isInteger(entrance) || entrance < 0 || entrance > 3) throw new Error('Invalid score settings');
  const { a, b, p0 } = analyse(passage, parameters, entrance);
  const rng = seeded(seed), events: Event[] = [];
  for (let phrase = 0; phrase < phrases; phrase++) {
    // Three independent draws per phrase keep comparative takes reproducible.
    const selector: 0 | 1 = rng() < bias ? 1 : 0;
    const earlyDraw = rng(), finalDraw = rng();
    const z = selector ? sample(column(a, entrance), () => earlyDraw) : null;
    const y = sample(z === null ? p0 : column(b, z), () => finalDraw);
    events.push({ tick: phrase * 2 + 1, outcome: z, phrase, slot: 1, selector });
    events.push({ tick: phrase * 2 + 2, outcome: y, phrase, slot: 2, selector });
  }
  return events;
}
export function audible(probabilities: number[]) { return [...probabilities]; }
export function entropy(p: number[]) { return -p.reduce((sum, v) => sum + (v > 0 ? v * Math.log2(v) : 0), 0); }
export function scheduleInformation(p0: number[], p1: number[], bias = 0.5) {
  const mixture = p0.map((v, i) => (1 - bias) * v + bias * p1[i]);
  return Math.max(0, entropy(mixture) - (1 - bias) * entropy(p0) - bias * entropy(p1));
}
