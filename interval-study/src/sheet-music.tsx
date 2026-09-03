'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { PITCHES } from '@/lib/sheet';
import type { WrittenNote } from '@/lib/sheet';
import { trailOpacity } from '@/lib/takes';
import type { HeardTake } from '@/lib/takes';
import { liveBeat, SCORE_BEATS_PER_SYSTEM, staffPitchY } from '@/lib/live';
import { NoteFlow } from './note-flow';

const endBeat = (note?: WrittenNote) => note ? note.onset + note.beats : 0;

/** Figure 4(b,d): fixed beat systems keep real holds visible at their exact
 * duration while the live path below retains only heard, sampled takes. */
export const SheetMusic = memo(function SheetMusic({ notes, selected, playing, onSelect, showFlow, totalCount, history = [], fadeProgress = 0 }: { notes: WrittenNote[]; selected: number | null; playing: boolean; onSelect: (index: number) => void; showFlow: boolean; totalCount: number; history?: HeardTake[]; fadeProgress?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const extent = Math.max(endBeat(notes.at(-1)), ...(showFlow ? history.map(take => endBeat(take.notes.at(-1))) : [0]));
    const count = extent ? Math.ceil(extent / SCORE_BEATS_PER_SYSTEM) : 0;
    return Array.from({ length: count }, (_, index) => {
      const startBeat = index * SCORE_BEATS_PER_SYSTEM, end = startBeat + SCORE_BEATS_PER_SYSTEM;
      const slice = (record: WrittenNote[]) => record.filter(note => note.onset >= startBeat && note.onset < end);
      const before = (record: WrittenNote[]) => record.filter(note => note.onset < startBeat).at(-1);
      return { startBeat, notes: slice(notes), previous: before(notes),
        history: history.map((take, age) => ({ seed: take.seed, notes: slice(take.notes), previous: before(take.notes), opacity: trailOpacity(history.length - 1 - age, fadeProgress) })) };
    });
  }, [notes, history, showFlow, fadeProgress]);
  useEffect(() => {
    const viewport = container.current;
    if (!viewport) return;
    if (!notes.length) { viewport.scrollTop = 0; return; }
    if (!playing) return;
    const current = viewport.querySelector<HTMLElement>('[data-current="true"]');
    const system = current?.closest<HTMLElement>('.score-system');
    if (system && (system.offsetTop < viewport.scrollTop || system.offsetTop + system.offsetHeight > viewport.scrollTop + viewport.clientHeight)) viewport.scrollTop = system.offsetTop;
  }, [selected, playing, notes.length]);
  return <div ref={container} className="sheet-music live-score-window" tabIndex={0} aria-label="Live treble-clef score on a sixteen-beat ruler. Only notes that have sounded are shown.">
    {rows.length === 0 ? <div className="empty-score">
      <div className="staff"><div className="staff-lines" aria-hidden="true"/><span className="treble-clef" aria-hidden="true">𝄞</span><div className="beat-ruler" aria-hidden="true">{Array.from({ length: SCORE_BEATS_PER_SYSTEM + 1 }, (_, beat) => <span className={beat % 4 === 0 ? 'major-beat' : ''} style={{ left: liveBeat(beat, 0).left }} key={beat}>{beat % 4 === 0 ? beat : ''}</span>)}</div><p>Press Play piano. Each note will be written at its measured beat.</p></div>
      {showFlow && <p className="empty-flow">The sampled path will grow beneath the score. No future outcomes are drawn.</p>}
    </div> : rows.map((row, rowIndex) => <div className="score-system" key={row.startBeat} aria-label={`Score beats ${row.startBeat} to ${row.startBeat + SCORE_BEATS_PER_SYSTEM}`}><div className="staff">
      <div className="staff-lines" aria-hidden="true"/>
      <span className="treble-clef" aria-hidden="true">𝄞</span>
      <span className="staff-counter">beat {row.startBeat}</span>
      <div className="beat-ruler" aria-hidden="true">{Array.from({ length: SCORE_BEATS_PER_SYSTEM + 1 }, (_, beat) => <span className={beat % 4 === 0 ? 'major-beat' : ''} style={{ left: liveBeat(row.startBeat + beat, row.startBeat).left }} key={beat}>{beat % 4 === 0 ? row.startBeat + beat : ''}</span>)}</div>
      {showFlow && row.history.flatMap(take => take.notes.map(note => {
        const y = staffPitchY[note.pitch], down = note.pitch === 3;
        return <span key={`${take.seed}-${note.index}`} className={'staff-note-ghost ' + (note.beats === 2 ? 'half-note ' : 'quarter-note ') + (down ? 'stem-down ' : '')} style={{ left: liveBeat(note.onset + note.beats / 2, row.startBeat).left, opacity: Math.max(.08, take.opacity) }} aria-hidden="true">
          {note.pitch === 0 && <span className="ledger-line" style={{ top: y }}/>}<span className="note-head" style={{ top: y - 4 }}/><span className="note-stem" style={{ top: down ? y : y - 31 }}/>
        </span>;
      }))}
      {row.notes.map(note => {
        const pitch = PITCHES[note.pitch], y = staffPitchY[note.pitch], down = note.pitch === 3;
        return <button key={note.index} data-current={note.index === selected} data-note-index={note.index} className={'staff-note ' + (note.beats === 2 ? 'half-note ' : 'quarter-note ') + (down ? 'stem-down ' : '') + (selected === note.index ? 'selected ' : '') + (playing && selected === note.index ? 'sounding' : '')} style={{ left: liveBeat(note.onset + note.beats / 2, row.startBeat).left }} aria-label={'Note ' + (note.index + 1) + ', ' + pitch.name + ', ' + (note.beats === 1 ? 'one beat' : 'two beats')} aria-pressed={selected === note.index} disabled={playing} onClick={() => onSelect(note.index)}>
          {note.pitch === 0 && <span className="ledger-line" style={{ top: y }} aria-hidden="true"/>}
          <span className="note-head" style={{ top: y - 4 }} aria-hidden="true"/>
          <span className="note-stem" style={{ top: down ? y : y - 31 }} aria-hidden="true"/>
          <span className="staff-note-label" aria-hidden="true">{pitch.label}</span>
        </button>;
      })}
      {notes.length === totalCount && rowIndex === rows.length - 1 && <span className="staff-end" style={{ left: liveBeat(endBeat(notes.at(-1)), row.startBeat).left }} aria-hidden="true"/>}
    </div>{showFlow && <NoteFlow notes={row.notes} previous={row.previous} startBeat={row.startBeat} selected={selected} terminalIndex={notes.at(-1)?.index ?? null} playing={playing} onSelect={onSelect} history={row.history}/>}</div>)}
  </div>;
});
