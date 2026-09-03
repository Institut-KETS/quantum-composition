import { PITCHES } from './sheet.ts';
import { liveBeatX, SCORE_BEATS_PER_SYSTEM } from './live.ts';
import type { WrittenNote } from './sheet';

export const FLOW_HEIGHT = 133;
const TOP = 20, GAP = 25;
// Figure 4(d) uses a 0.40-half-beat-unit ramp. Since the live ruler is in
// beats, that is exactly 0.20 beat on either side of the note boundary.
const TRANSITION_HALF_BEATS = .20;
export type FlowTrail = { notes: WrittenNote[]; previous?: WrittenNote; opacity: number };

/** Figure 4(d): note boundaries remain at their exact measured beats. Straight
 * ramps merely soften the joins and are centred on those boundaries. */
export function drawLiveFlow(ctx: CanvasRenderingContext2D, width: number, notes: WrittenNote[], startBeat: number, selected: number | null, terminalIndex: number | null, previous?: WrittenNote, history: FlowTrail[] = []) {
  ctx.clearRect(0, 0, width, FLOW_HEIGHT);
  // Match the manuscript's score plot: high pitch at the top, low pitch at
  // the bottom (C5, G4, E4, C4 from top to bottom).
  const y = (pitch: number) => TOP + GAP * (PITCHES.length - 1 - pitch);
  const x = (beat: number) => liveBeatX(width, beat, startBeat, SCORE_BEATS_PER_SYSTEM);
  const end = startBeat + SCORE_BEATS_PER_SYSTEM;
  const left = x(startBeat);
  ctx.globalAlpha = 1;
  for (let beat = startBeat; beat <= end; beat++) {
    ctx.strokeStyle = beat % 4 === 0 ? '#d6ded3' : '#edf1ea'; ctx.lineWidth = beat % 4 === 0 ? .8 : .5;
    ctx.beginPath(); ctx.moveTo(x(beat), 7); ctx.lineTo(x(beat), 117); ctx.stroke();
  }
  ctx.font = '10px Arial, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  PITCHES.forEach((pitch, row) => {
    ctx.strokeStyle = '#e1e7de'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(66, y(row)); ctx.lineTo(x(end), y(row)); ctx.stroke();
    ctx.fillStyle = '#5b6860'; ctx.fillText(pitch.label, 5, y(row));
  });
  const selectedNote = notes.find(note => note.index === selected);
  if (selectedNote) { ctx.fillStyle = '#dce8db88'; ctx.fillRect(x(selectedNote.onset), 7, x(selectedNote.onset + selectedNote.beats) - x(selectedNote.onset), 110); }
  const path = (record: WrittenNote[], preceding?: WrittenNote) => {
    if (!record.length) return;
    const transition = (boundaryBeat: number, fromPitch: number, toPitch: number) => {
      const fromY = y(fromPitch), toY = y(toPitch);
      // Do not clamp the endpoints in pixels. Let the canvas clip an ideal
      // beat-scaled polyline at system edges, exactly as the paper figure does.
      ctx.lineTo(x(boundaryBeat - TRANSITION_HALF_BEATS), fromY);
      ctx.lineTo(x(boundaryBeat + TRANSITION_HALF_BEATS), toY);
    };
    const first = record[0];
    if (preceding) {
      // A hold can cross a sixteen-beat system boundary. Keep drawing that
      // measured hold from the left edge until the first transition.
      ctx.moveTo(left, y(preceding.pitch));
      transition(first.onset, preceding.pitch, first.pitch);
    } else ctx.moveTo(Math.max(left, x(first.onset)), y(first.pitch));
    record.forEach((note, index) => {
      const next = record[index + 1];
      if (next) transition(next.onset, note.pitch, next.pitch);
      else ctx.lineTo(x(note.onset + note.beats), y(note.pitch));
    });
  };
  // Oldest first: fading paths are actual earlier takes only, never an ensemble
  // of unplayed possibilities.
  ctx.strokeStyle = '#658372'; ctx.lineWidth = 1.3; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  for (const take of history) { ctx.globalAlpha = take.opacity; ctx.beginPath(); path(take.notes, take.previous); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (notes.length) {
    ctx.strokeStyle = '#176345'; ctx.lineWidth = 1.85; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.beginPath(); path(notes, previous); ctx.stroke();
    const terminal = notes.find(note => note.index === terminalIndex);
    if (terminal) {
      ctx.beginPath(); ctx.arc(x(terminal.onset + terminal.beats), y(terminal.pitch), 3.2, 0, 2 * Math.PI);
      ctx.fillStyle = '#176345'; ctx.strokeStyle = '#fffefa'; ctx.lineWidth = .8; ctx.fill(); ctx.stroke();
    }
  }
  ctx.fillStyle = '#5b6860'; ctx.font = '9px Arial, sans-serif';
  ctx.fillText(notes.length ? 'Measured pitch path; horizontal length is the selected interval.' : 'Earlier played takes fade here after a fresh take begins.', 5, 129);
}
