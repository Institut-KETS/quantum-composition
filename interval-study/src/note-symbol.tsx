/** Font-independent quarter/half-note symbol. Pitch is supplied by its staff
 * position or adjacent label; the hollow head denotes two beats.
 */
export function NoteSymbol({ beats }: { beats: 1 | 2 }) {
  return <span className={'duration-symbol ' + (beats === 2 ? 'half-symbol' : 'quarter-symbol')} role="img" aria-label={beats === 2 ? 'half note, two beats' : 'quarter note, one beat'}><i/><b/></span>;
}
