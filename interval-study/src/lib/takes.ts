import { makeSheet } from './sheet.ts';
import type { WrittenNote, SheetPassage } from './sheet';
import type { Parameters } from './quantum';
import type { IntervalScore } from './circuits';

// Four layers leave the active path legible; opacity makes recency unambiguous.
export const TRAIL_LIMIT = 4;
export type GeneratedTake = { pass: number; seed: number; sheet: ReturnType<typeof makeSheet> };
export type HeardTake = { seed: number; notes: WrittenNote[] };

/** Audio and display share the same sampled record. Each take is a fresh
 * preparation, with S₀ = 0 and a new reproducible seed; coincidences are kept.
 */
export function createTakeSource(passage: SheetPassage, parameters: Parameters, entrance: number, intervalScore: IntervalScore, seed: number, count: number) {
  const records = new Map<number, GeneratedTake>();
  const settings = { ...parameters };
  return {
    get(pass: number): GeneratedTake {
      if (!Number.isSafeInteger(pass) || pass < 0) throw new Error('Invalid generation');
      let take = records.get(pass);
      if (!take) {
        const nextSeed = (seed + pass) >>> 0;
        take = { pass, seed: nextSeed, sheet: makeSheet(passage, settings, entrance, intervalScore, nextSeed, count) };
        records.set(pass, take);
        // Enough for the four faded takes and the short-score lookahead. Old
        // records can be reconstructed exactly, without keeping an infinite log.
        if (records.size > 16) records.delete(records.keys().next().value!);
      }
      return take;
    },
  };
}

/** Store only onsets already heard, never a future generated score. */
export function rememberTake(history: HeardTake[], seed: number, notes: WrittenNote[], revealed: number) {
  if (!Number.isSafeInteger(revealed) || revealed < 0 || revealed > notes.length) throw new Error('Invalid heard prefix');
  if (!revealed) return history;
  const snapshot = { seed, notes: notes.slice(0, revealed) };
  return [...history.filter(take => take.seed !== seed), snapshot].slice(-TRAIL_LIMIT);
}

/** Each older generation is markedly lighter than the one before it. */
export function trailOpacity(age: number, progress: number) {
  return Math.max(.045, .30 * .42 ** (Math.max(0, age) + Math.max(0, Math.min(1, progress))));
}
