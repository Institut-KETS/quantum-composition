'use client';

import { memo } from 'react';
import { BASIS } from '@/lib/quantum';
import { PITCHES, SHEET_PASSAGES } from '@/lib/sheet';
import type { SheetPassage } from '@/lib/sheet';

type LawKind = 'middle' | 'coherentEndpoint' | 'checkedEndpoint';
type Laws = Record<LawKind, number[]> & { kernelResidual: number };
type Observed = { pitch: number; kind: LawKind } | null;

const percent = (value: number) => (100 * value).toFixed(2).replace(/\.00$/, '') + '%';
const shortResidual = (value: number) => value < 1e-12 ? '< 10⁻¹²' : value.toExponential(2);
const fraction = (value: number) => {
  for (const denominator of [1, 2, 4, 8, 16, 32]) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(value - numerator / denominator) < 1e-10) return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
  }
  return value.toFixed(3);
};

function LawCell({ kind, value, selected }: { kind: LawKind; value: number; selected: boolean }) {
  return <span className={'law-cell law-' + kind + (selected ? ' law-observed' : '')} aria-label={percent(value)}>
    <i className="law-cell-marker" aria-hidden="true"/>
    <strong>{percent(value)}</strong>
    <b className="law-cell-bar" aria-hidden="true" style={{ width: `${100 * value}%` }}/>
  </span>;
}

/** Figure 4(c): distinct distributions for the internal and endpoint readouts. */
export const FigureLaws = memo(function FigureLaws({ laws, passage, entrance, observed }: { laws: Laws; passage: SheetPassage; entrance: number; observed: Observed }) {
  const residual = laws.kernelResidual;
  const blocks = SHEET_PASSAGES[passage];
  const identity = residual < 1e-12;
  return <aside className="figure-laws" aria-label="Live readout laws for the selected passage">
    <div className="figure-panel-heading"><span className="figure-letter">(c)</span><span>Step and endpoint laws</span><span className="law-live-tag">live</span></div>
    <p className="law-context"><span>|{BASIS[entrance]}⟩</span><span>{blocks.first} | {blocks.second}</span></p>
    <div className="law-grid" role="table" aria-label={`Conditional readout laws for ${blocks.first} followed by ${blocks.second} from ${BASIS[entrance]}`}>
      <span className="law-outcome-heading" role="columnheader">outcome</span>
      <span className="law-column-heading law-middle-heading" role="columnheader"><strong>Step Z</strong><small>p<sub>Z</sub>(z) = Pr(Z = z | x)</small></span>
      <span className="law-column-heading law-coherent-heading" role="columnheader"><strong>Endpoint Y</strong><small>p<sub>0</sub>(y) = Pr(Y = y | S = 0, x)</small></span>
      <span className="law-column-heading law-checked-heading" role="columnheader"><strong>Endpoint Y</strong><small>p<sub>1</sub>(y) = Pr(Y = y | S = 1, x)</small></span>
      {PITCHES.map((pitch, y) => <div className="law-grid-row" role="row" key={pitch.name}>
        <span className="law-pitch" role="rowheader">{pitch.label}</span>
        <LawCell kind="middle" value={laws.middle[y]} selected={observed?.pitch === y && observed.kind === 'middle'}/>
        <LawCell kind="coherentEndpoint" value={laws.coherentEndpoint[y]} selected={observed?.pitch === y && observed.kind === 'coherentEndpoint'}/>
        <LawCell kind="checkedEndpoint" value={laws.checkedEndpoint[y]} selected={observed?.pitch === y && observed.kind === 'checkedEndpoint'}/>
      </div>)}
    </div>
    <p className={'law-summary ' + (identity ? 'law-identity' : 'law-mismatch')}>
      {identity ? <><strong>K<sub>end</sub> = K<sub>step</sub></strong><span>|{BASIS[entrance]}⟩: p<sub>end</sub> = ({laws.coherentEndpoint.map(fraction).join(', ')})</span></> : <><strong>K<sub>end</sub> ≠ K<sub>step</sub></strong><span>Δ<sub>max</sub> {shortResidual(residual)}</span></>}
    </p>
    <p className="law-note">The third column marginalizes the step outcome Z. The kernel identity is distinct from the displayed |{BASIS[entrance]}⟩ endpoint vector.</p>
  </aside>;
});
