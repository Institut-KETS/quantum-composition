'use client';

import { memo, useEffect, useRef } from 'react';
import { drawLiveFlow, FLOW_HEIGHT } from '@/lib/live-flow';
import type { FlowTrail } from '@/lib/live-flow';
import { liveBeatX, SCORE_BEATS_PER_SYSTEM } from '@/lib/live';
import type { WrittenNote } from '@/lib/sheet';

export const NoteFlow = memo(function NoteFlow({ notes, previous, startBeat, selected, terminalIndex, playing, onSelect, history = [] }: { notes: WrittenNote[]; previous?: WrittenNote; startBeat: number; selected: number | null; terminalIndex: number | null; playing: boolean; onSelect: (index: number) => void; history?: FlowTrail[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const width = element.getBoundingClientRect().width;
      if (!width) return;
      const scale = window.devicePixelRatio || 1;
      element.width = Math.round(width * scale); element.height = Math.round(FLOW_HEIGHT * scale);
      const ctx = element.getContext('2d'); if (!ctx) return;
      ctx.scale(scale, scale);
      drawLiveFlow(ctx, width, notes, startBeat, selected, terminalIndex, previous, history);
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(element);
    return () => observer.disconnect();
  }, [notes, previous, startBeat, selected, terminalIndex, history]);
  return <canvas ref={canvas} className="note-flow" style={{ height: FLOW_HEIGHT }} role="img" aria-label={(notes.length ? 'Live circuit-sampled pitch path for this sixteen-beat score system.' : 'Earlier played takes, fading behind the new score.') + ' Faint lines are earlier played takes, not future outcomes.'} onClick={event => {
    if (playing || !notes.length) return;
    const rect = event.currentTarget.getBoundingClientRect(), target = event.clientX - rect.left;
    let nearest = notes[0];
    notes.forEach(note => { if (Math.abs(liveBeatX(rect.width, note.onset + note.beats / 2, startBeat, SCORE_BEATS_PER_SYSTEM) - target) < Math.abs(liveBeatX(rect.width, nearest.onset + nearest.beats / 2, startBeat, SCORE_BEATS_PER_SYSTEM) - target)) nearest = note; });
    onSelect(nearest.index);
  }}>Select a played note on the score above for keyboard access.</canvas>;
});
