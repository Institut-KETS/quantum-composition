import type { WrittenNote } from './sheet';

export type TimedTake = { pass: number; start: number; end: number; notes: WrittenNote[] };
export type ScoreClock = { start: number; beat: number; period: number; end: number; lastPass: number; takes: TimedTake[] };

/** Each generated take has its own duration; never infer its index from a
 * fixed loop period. The final release still belongs to the finishing take.
 */
export function scoreTakeAt(audioTime: number, clock: ScoreClock) {
  if (!Number.isFinite(audioTime) || !clock.takes.length) throw new Error('Invalid take clock');
  let take = clock.takes[0];
  for (const candidate of clock.takes) {
    if (candidate.start > audioTime || candidate.pass > clock.lastPass) break;
    take = candidate;
  }
  return take;
}

/** Every generation starts with a new, unrevealed score. */
export function scorePlaybackFrame(audioTime: number, clock: ScoreClock) {
  const take = scoreTakeAt(audioTime, clock);
  const progress = playbackFrame(take.notes, audioTime, take.start, clock.beat);
  return { ...progress, pass: take.pass, complete: audioTime >= clock.end };
}

/** Use the piano's scheduled audio times, including its start delay. Never
 * reveal an outcome from an animation-frame counter or a future score slot.
 */
export function playbackFrame(notes: WrittenNote[], audioTime: number, start: number, beatSeconds: number) {
  if (!Number.isFinite(audioTime) || !Number.isFinite(start) || !Number.isFinite(beatSeconds) || beatSeconds <= 0) throw new Error('Invalid playback clock');
  let lo = 0, hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (start + notes[mid].onset * beatSeconds <= audioTime) lo = mid + 1;
    else hi = mid;
  }
  const latest = lo - 1;
  const active = latest >= 0 && audioTime < start + (notes[latest].onset + notes[latest].beats) * beatSeconds ? latest : -1;
  return { revealed: lo, active, latest: latest < 0 ? null : latest };
}

export function visibleSelection(revealed: number, active: number, inspected: number, playing: boolean): number | null {
  if (revealed === 0) return null;
  if (active >= 0 && active < revealed) return active;
  return playing ? revealed - 1 : Math.max(0, Math.min(inspected, revealed - 1));
}

// At least 28 px per note, plus the clef/row-label margin. On a wide screen
// this accommodates roughly 40 notes per line, without stretching a short prefix.
export function denseColumns(width: number) {
  if (!Number.isFinite(width) || width <= 0) throw new Error('Invalid staff width');
  return Math.max(4, Math.floor((width - 100) / 28));
}
export function liveColumn(slot: number, columns: number) {
  if (!Number.isSafeInteger(columns) || columns < 1 || !Number.isSafeInteger(slot) || slot < 0 || slot >= columns) throw new Error('Invalid note column');
  const fraction = slot / columns;
  return { left: `calc(${fraction * 100}% + ${70 - 100 * fraction}px)`, fraction };
}
export function liveColumnX(width: number, slot: number, columns: number) {
  return 82 + liveColumn(slot, columns).fraction * (width - 100);
}

/** Paper Figure 4 uses a fixed sixteen-beat ruler: noteheads sit at the
 * centers of their measured one- or two-beat holds, never at equal note slots. */
export const SCORE_BEATS_PER_SYSTEM = 16;
export function liveBeat(beat: number, startBeat: number, span = SCORE_BEATS_PER_SYSTEM) {
  if (!Number.isFinite(beat) || !Number.isFinite(startBeat) || !Number.isFinite(span) || span <= 0) throw new Error('Invalid beat coordinate');
  const fraction = (beat - startBeat) / span;
  return { left: `calc(${fraction * 100}% + ${70 - 100 * fraction}px)`, fraction };
}
export function liveBeatX(width: number, beat: number, startBeat: number, span = SCORE_BEATS_PER_SYSTEM) {
  return 82 + liveBeat(beat, startBeat, span).fraction * (width - 100);
}

export const staffPitchY = [88, 76, 64, 46] as const;
