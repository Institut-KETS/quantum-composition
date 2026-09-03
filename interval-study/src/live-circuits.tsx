'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { BASIS } from '@/lib/quantum';
import { INTERVAL_SCORES, intervalCircuit } from '@/lib/circuits';
import type { IntervalScore } from '@/lib/circuits';
import { PITCHES, SHEET_PASSAGES } from '@/lib/sheet';
import type { makeSheet, SheetPassage } from '@/lib/sheet';

type Trace = ReturnType<typeof makeSheet>['traces'][number];
type SelectorSample = { run: number; input: number; outcome: 0 | 1 };
type ControlWire = { width: number; height: number; sourceX: number; sourceY: number; elbowX: number; endY: number };
const percent = (p: number) => Number((100 * p).toFixed(2)) + '%';

function Speaker({ heard, active, label }: { heard: boolean; active: boolean; label: string }) {
  return <span className={'paper-speaker ' + (heard ? 'speaker-heard ' : '') + (active ? 'speaker-active' : '')} role="img" aria-label={label}>
    <svg viewBox="0 0 32 28" aria-hidden="true"><path d="M3 11h7l9-7v20l-9-7H3z"/><path d="M23 10c3 3 3 5 0 8"/><path d="M26 6c6 6 6 10 0 16"/></svg>
  </span>;
}

function Microphone() {
  return <span className="paper-microphone" aria-hidden="true"><svg viewBox="0 0 22 28"><rect x="7" y="2" width="8" height="14" rx="4"/><path d="M4 12a7 7 0 0 0 14 0M11 19v6M7 25h8"/></svg></span>;
}

/** Panel (a) of the paper figure, driven by the live controller and latest sound trace. */
export const LiveCircuits = memo(function LiveCircuits({ passage, entrance, family, trace, selectorSamples, sounding, heldBeat = 0, restartAtEnd = false, takeSeed }: { passage: SheetPassage; entrance: number; family: IntervalScore; trace: Trace | null; selectorSamples: SelectorSample[]; sounding: boolean; heldBeat?: number; restartAtEnd?: boolean; takeSeed: number }) {
  const stageRef = useRef<HTMLDivElement>(null), selectorReadoutRef = useRef<HTMLSpanElement>(null), optionalReadoutRef = useRef<HTMLSpanElement>(null);
  const [controlWire, setControlWire] = useState<ControlWire | null>(null);
  useEffect(() => {
    const stage = stageRef.current, selector = selectorReadoutRef.current, optional = optionalReadoutRef.current;
    if (!stage || !selector || !optional) return;
    const sync = () => {
      const frame = stage.getBoundingClientRect(), source = selector.getBoundingClientRect(), target = optional.getBoundingClientRect();
      const next = { width: frame.width, height: frame.height, sourceX: source.right - frame.left, sourceY: source.top + source.height / 2 - frame.top, elbowX: target.left + target.width / 2 - frame.left, endY: target.top - frame.top };
      setControlWire(previous => previous && Object.entries(next).every(([key, value]) => Math.abs(previous[key as keyof ControlWire] - value) < .25) ? previous : next);
    };
    const observer = new ResizeObserver(sync);
    observer.observe(stage); observer.observe(selector); observer.observe(optional); sync();
    return () => observer.disconnect();
  }, [takeSeed, trace?.source.run, trace?.source.check]);
  // The paper/video latches the last revealed run measurement. After an
  // endpoint the hidden next controller drives A→B, but its S is not surfaced
  // until the next audible readout. This prevents leaking a future outcome.
  const score = INTERVAL_SCORES[family], interval = trace?.sourceInterval ?? intervalCircuit(1, score.lambda, 0, score.fixed);
  const blocks = SHEET_PASSAGES[passage], early = trace?.source.check === 'step';
  const s = trace?.source.selector;
  const soundRun = trace?.source.run ?? interval.step;
  const sourceZ = trace?.source.earlyOutcome;
  const sourceY = trace?.source.finalOutcome;
  const intermediateHeard = Boolean(trace && early), endpointHeard = Boolean(trace && !early);
  const selectorProbability = interval.probabilities[interval.input];
  // Preserve the original discrete playback motion: B is active after a real
  // middle Z; an endpoint Y starts the following A interval, and a bypassed
  // two-beat Y visibly advances from A to B during its held note.
  const aCurrent = Boolean(sounding && trace && !early && heldBeat < 1);
  const bCurrent = Boolean(sounding && trace && (early || heldBeat >= 1));
  const selectorFresh = Boolean(trace && (early || s === 0));
  const latestZ = !trace ? 'Z = ?' : s === 0 ? 'Z = bypassed' : sourceZ == null ? 'Z = ?' : `Z = |${BASIS[sourceZ]}⟩`;
  const latestY = !trace || early ? 'Y = pending' : `Y = |${BASIS[sourceY!]}⟩`;
  const optionalState = !trace ? 'measurement-pending' : early ? 'measurement-current' : s === 0 ? 'measurement-bypassed' : 'measurement-held';
  const endpointState = trace && !early ? 'measurement-current' : 'measurement-pending';
  const optionalLabel = trace && s === 1 && sourceZ != null ? `Z = |${BASIS[sourceZ]}⟩` : s === 0 ? 'Z = —' : 'Z = ?';
  return <section className={'live-circuits figure-four-circuit ' + (sounding ? 'circuits-sounding' : '')} aria-label="Figure 4 selector-controlled circuit">
    <div className="figure-panel-heading"><span className="figure-letter">(a)</span><span>Selector-controlled circuit</span><span className="figure-panel-detail">{trace ? `readout ${trace.note.index + 1}${sounding ? ' · sounding now' : ''}` : 'ready · outcomes appear with the piano'}</span></div>
    <div key={`banner-${takeSeed}-${soundRun}-${trace?.source.check ?? 'ready'}`} className={'selector-measurement-banner ' + (trace ? 'measurement-revealed measurement-event' : 'measurement-pending')} data-source-run={trace?.source.run} data-next-run={trace?.interval.step} role="status" aria-live="polite" aria-atomic="true">
      <span className="measurement-kicker">RUN MEASUREMENT</span>
      <strong>{trace ? `S = ${s}` : 'S = —'}</strong>
      <span className="measurement-detail">{trace ? <>run {soundRun} · |{interval.input}⟩ → |{s}⟩ · check {s === 1 ? 'ON' : 'OFF'} · {latestZ}; {latestY}</> : 'Selector and sound measurements appear with the first piano readout.'}</span>
    </div>
    <div className="paper-circuit-scroll"><div className="paper-circuit-stage" ref={stageRef}>
      {controlWire && <svg className="paper-control-wire" viewBox={`0 0 ${controlWire.width} ${controlWire.height}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="control-wire-double" d={`M ${controlWire.sourceX} ${controlWire.sourceY} H ${controlWire.elbowX} V ${controlWire.endY}`}/>
        <path className="control-wire-gap" d={`M ${controlWire.sourceX} ${controlWire.sourceY} H ${controlWire.elbowX} V ${controlWire.endY}`}/>
        <circle className="control-wire-dot" cx={controlWire.elbowX} cy={controlWire.sourceY} r="2.45"/>
      </svg>}
      <div className="paper-history"><span>history <i>m</i></span><Microphone/></div>
      <div className="paper-selector-row paper-wire">
        <span className="paper-input">s : |{interval.input}⟩</span>
        <span key={`selector-gate-${takeSeed}-${soundRun}`} className={'paper-gate circuit-stage circuit-stage-selector-gate ' + (trace ? 'gate-complete measurement-reveal' : '')}>{score.fixed ? <>V<sup>sel</sup></> : <>U<sub>{interval.step}</sub></>}<small>{score.fixed ? <>fixed selector<br/><b>run {soundRun}</b> · input |{interval.input}⟩</> : score.name}</small></span>
        <span key={`selector-readout-${takeSeed}-${soundRun}`} ref={selectorReadoutRef} data-measurement-state={trace ? selectorFresh ? 'current' : 'held' : 'pending'} className={'paper-measure selector-readout circuit-stage circuit-stage-selector-readout ' + (trace ? `readout-complete ${selectorFresh ? 'measurement-current' : 'measurement-held'}` : 'measurement-pending')} aria-label={trace ? `Selector readout for run ${soundRun}, S equals ${s}` : 'Selector readout S pending'}>
          <span className="selector-output-label">{trace ? `S = ${s}` : 'S = ?'}</span>
          𝓜<sub>C</sub><small>{trace ? `run ${soundRun} · ${s === 1 ? 'insert check' : 'bypass check'}` : 'selector readout'}</small>
        </span>
      </div>
      <div className="paper-sound-row paper-wire">
        <span className="paper-input data-input">D : |{BASIS[entrance]}⟩<small>2 qubits</small></span>
        <span className={'paper-gate data-gate circuit-stage circuit-stage-a ' + (aCurrent ? 'gate-active circuit-stage-current' : '')}>A<small>{blocks.first} · beat 1</small></span>
        <span key={`optional-${takeSeed}-${soundRun}-${trace?.source.check ?? 'ready'}`} ref={optionalReadoutRef} data-measurement-state={optionalState.replace('measurement-', '')} className={'paper-measure optional-readout circuit-stage circuit-stage-optional ' + optionalState + (s === 0 ? ' readout-skipped' : s === 1 ? ' readout-enabled' : '')} aria-label={trace ? early ? `Sound-circuit middle measurement Z for run ${soundRun} equals ${BASIS[sourceZ!]}` : s === 0 ? `Sound-circuit middle measurement for run ${soundRun} bypassed` : `Sound-circuit middle measurement Z for run ${soundRun} retained as ${BASIS[sourceZ!]}` : 'Sound-circuit middle measurement pending'}>
          <span className="sound-output-label">{optionalLabel}</span>
          𝓜<sub>C</sub><sup>(S)</sup><small>{trace && early ? `run ${soundRun} · measured` : s === 0 ? `run ${soundRun} · bypassed` : s === 1 ? `run ${soundRun} · retained` : 'if S = 1'}</small>
        </span>
        <Speaker heard={intermediateHeard} active={Boolean(sounding && early)} label={intermediateHeard ? 'Intermediate audible note' : 'No intermediate audible note'}/>
        <span className={'paper-gate data-gate circuit-stage circuit-stage-b ' + (bCurrent ? 'gate-active circuit-stage-current' : '')}>B<small>{blocks.second} · beat 2</small></span>
        <span key={`endpoint-${takeSeed}-${soundRun}-${trace?.source.check ?? 'ready'}`} data-measurement-state={endpointState.replace('measurement-', '')} className={'paper-measure endpoint-readout circuit-stage circuit-stage-endpoint ' + endpointState} aria-label={trace && !early ? `Sound-circuit endpoint measurement Y for run ${soundRun} equals ${BASIS[sourceY!]}` : `Sound-circuit endpoint measurement for run ${soundRun} pending`}>
          <span className="sound-output-label">{trace && !early ? `Y = |${BASIS[sourceY!]}⟩` : 'Y = ?'}</span>
          𝓜<sub>C</sub><small>{trace && !early ? `run ${soundRun} · measured` : `run ${soundRun} · pending`}</small>
        </span>
        <Speaker heard={endpointHeard} active={Boolean(sounding && !early)} label={endpointHeard ? 'Endpoint audible note' : 'Endpoint audible note pending'}/>
      </div>
    </div></div>
    <div className="paper-circuit-footer">
      <div className="selector-law"><span>S = 1 · check <b>{percent(interval.probabilities[1])}</b></span><span>S = 0 · bypass <b>{percent(interval.probabilities[0])}</b></span><span>Pr(stay) = <b>{percent(selectorProbability)}</b></span></div>
      <div className="heard-readout" data-measurement-key={`${takeSeed}:${soundRun}:${trace?.source.check ?? 'ready'}`}>{trace ? <><span className="latest-measurement-label">LATEST SOUND · run {soundRun}</span><span className={'latest-measurement ' + (s === 0 ? 'bypassed' : '')}>{latestZ}</span><span className={'latest-measurement ' + (early ? 'pending' : 'current')}>{latestY}</span><Speaker heard active={false} label={intermediateHeard ? 'Intermediate output' : 'Endpoint output'}/><strong className="latest-pitch">{PITCHES[trace.note.pitch].label}</strong></> : <>The middle speaker sounds only on S = 1; the endpoint speaker always sounds.</>}</div>
      <div className="selector-tape" aria-label="Revealed interval selector measurements"><span className="selector-tape-label">REVEALED S</span>{selectorSamples.length ? selectorSamples.slice(-5).map(sample => <span key={sample.run} className={'selector-sample ' + (soundRun === sample.run ? 'current' : '')}><small>run {sample.run} · |{sample.input}⟩</small><strong>S = {sample.outcome}</strong></span>) : <span className="selector-empty">No selector outcome revealed yet.</span>}</div>
    </div>
    <p className="circuit-link">{trace ? early
      ? `Run ${soundRun}: S = 1 inserted the internal check; Z was measured and B now receives |${BASIS[sourceZ!]}⟩.`
      : `Run ${soundRun}: Y = |${BASIS[sourceY!]}⟩ was measured at the endpoint. ${heldBeat >= 1 ? 'The next hidden run has moved from A to B while this key remains held.' : 'A has started the next hidden run while this endpoint key is held.'}`
      : 'The selector is sampled first; its bit decides whether the internal measurement becomes audible.'}{restartAtEnd && ' The next check closes this excerpt, so its pitch remains hidden.'}</p>
  </section>;
});
