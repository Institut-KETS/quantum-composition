import { tr, attributionURL } from './i18n';
import { LanguageSwitch } from './language-switch';
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BASIS, DEFAULTS } from '@/lib/quantum';
import type { Parameters } from '@/lib/quantum';
import type { IntervalScore } from '@/lib/circuits';
import { makeSheet, PITCHES, SHEET_PASSAGES } from '@/lib/sheet';
import type { SheetPassage } from '@/lib/sheet';
import { PianoAudio } from '@/lib/piano';
import { scorePlaybackFrame, scoreTakeAt, visibleSelection } from '@/lib/live';
import type { ScoreClock } from '@/lib/live';
import { createTakeSource, rememberTake } from '@/lib/takes';
import type { GeneratedTake, HeardTake } from '@/lib/takes';
import { PUBLICATION_CAPTURE } from '@/lib/publication-capture';
import { SheetMusic } from './sheet-music';
import { LiveCircuits } from './live-circuits';
import { FigureLaws } from './figure-laws';
import { NoteSymbol } from './note-symbol';
const percent = (p: number) => Number((100 * p).toFixed(3)) + '%';
const VIDEO_CAPTURE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('capture') === 'video';
export default function Home() {
    const [seed, setSeed] = useState(VIDEO_CAPTURE ? PUBLICATION_CAPTURE.firstSeed : 1729), [count, setCount] = useState(VIDEO_CAPTURE ? PUBLICATION_CAPTURE.noteCount : 128);
    const [intervalScore, setIntervalScore] = useState<IntervalScore>('publication');
    const [passage, setPassage] = useState<SheetPassage>('internal'), [entrance, setEntrance] = useState(0);
    const [parameters, setParameters] = useState<Parameters>(DEFAULTS);
    const [tempo, setTempo] = useState<number>(PUBLICATION_CAPTURE.bpm), [volume, setVolume] = useState<number>(PUBLICATION_CAPTURE.volumePercent);
    const [playing, setPlaying] = useState(false), [loading, setLoading] = useState(false);
    const [active, setActive] = useState(-1), [inspected, setInspected] = useState(0);
    const [heldBeat, setHeldBeat] = useState(0);
    const [revealed, setRevealed] = useState(0), [showFlow, setShowFlow] = useState(true);
    const [error, setError] = useState('');
    const [loop, setLoop] = useState(VIDEO_CAPTURE), [passNumber, setPassNumber] = useState(1);
    const [liveTake, setLiveTake] = useState<GeneratedTake | null>(null);
    const [history, setHistory] = useState<HeardTake[]>([]), [fadeProgress, setFadeProgress] = useState(0);
    const historyRef = useRef<HeardTake[]>([]);
    const loopEnabled = useRef(VIDEO_CAPTURE);
    const audio = useRef<PianoAudio | null>(null), request = useRef(0), frame = useRef(0);
    const run = useRef<{
        clock: ScoreClock;
        source: ReturnType<typeof createTakeSource>;
        archivedPass: number;
    } | null>(null);
    const initialSheet = useMemo(() => makeSheet(passage, parameters, entrance, intervalScore, seed, count), [passage, parameters, entrance, intervalScore, seed, count]);
    const sheet = liveTake?.sheet ?? initialSheet, currentSeed = liveTake?.seed ?? seed;
    const heardNotes = useMemo(() => sheet.notes.slice(0, revealed), [sheet.notes, revealed]);
    const selected = visibleSelection(revealed, active, inspected, playing);
    const trace = selected === null ? null : sheet.traces[selected], note = trace?.note;
    const observedLaw = trace ? { pitch: trace.note.pitch, kind: trace.source.check === 'step' ? 'middle' as const : trace.source.selector === 0 ? 'coherentEndpoint' as const : 'checkedEndpoint' as const } : null;
    const joint = trace?.joint ?? sheet.firstJoint;
    const selectorSamples = useMemo(() => {
        const seen = new Set<number>();
        return sheet.traces.slice(0, revealed).flatMap(record => {
            if (seen.has(record.source.run))
                return [];
            seen.add(record.source.run);
            return [{ run: record.source.run, input: record.sourceInterval.input, outcome: record.source.selector }];
        });
    }, [sheet.traces, revealed]);
    function showProgress(now: number) {
        const current = run.current;
        if (!current)
            return null;
        const progress = scorePlaybackFrame(now, current.clock), timed = scoreTakeAt(now, current.clock);
        const record = current.source.get(progress.pass);
        let trails = historyRef.current;
        for (const take of current.clock.takes) {
            if (take.pass <= current.archivedPass || take.pass >= progress.pass || take.end > now)
                continue;
            trails = rememberTake(trails, current.source.get(take.pass).seed, take.notes, take.notes.length);
            current.archivedPass = take.pass;
        }
        if (trails !== historyRef.current) {
            historyRef.current = trails;
            setHistory(trails);
        }
        setLiveTake(record);
        setRevealed(progress.revealed);
        setActive(progress.active);
        setPassNumber(progress.pass + 1);
        setHeldBeat(progress.active < 0 ? 0 : Math.floor(Math.max(0, (now - timed.start) / current.clock.beat - record.sheet.notes[progress.active].onset)));
        setFadeProgress(Math.max(0, Math.min(1, (now - timed.start) / (timed.end - timed.start))));
        if (progress.latest !== null)
            setInspected(progress.latest);
        return { ...record, ...progress };
    }
    function stop(clear = false) {
        // Capture the actual heard prefix before stopping, including a take boundary
        // crossed since the last animation frame. Never archive prequeued takes.
        const latest = audio.current && run.current ? showProgress(audio.current.context.currentTime) : null;
        const previous = latest ?? { seed: currentSeed, sheet, revealed };
        request.current++;
        audio.current?.stop();
        cancelAnimationFrame(frame.current);
        run.current = null;
        setPlaying(false);
        setLoading(false);
        setActive(-1);
        if (clear) {
            setRevealed(0);
            setInspected(0);
            setPassNumber(1);
            setLiveTake(null);
            setFadeProgress(0);
            historyRef.current = [];
            setHistory([]);
        }
        return previous;
    }
    function keepHeard(previous: {
        seed: number;
        sheet: ReturnType<typeof makeSheet>;
        revealed: number;
    }) {
        historyRef.current = rememberTake(historyRef.current, previous.seed, previous.sheet.notes, previous.revealed);
        setHistory(historyRef.current);
    }
    function newTake() {
        const previous = stop();
        keepHeard(previous);
        setSeed((previous.seed + 1) >>> 0);
        setLiveTake(null);
        setRevealed(0);
        setInspected(0);
        setPassNumber(1);
        setFadeProgress(0);
    }
    async function play() {
        const previous = stop();
        keepHeard(previous);
        const nextSeed = previous.revealed ? (previous.seed + 1) >>> 0 : previous.seed;
        const source = createTakeSource(passage, parameters, entrance, intervalScore, nextSeed, count), first = source.get(0);
        setSeed(nextSeed);
        setLiveTake(first);
        setRevealed(0);
        setInspected(0);
        setPassNumber(1);
        setFadeProgress(0);
        const id = ++request.current;
        setPlaying(true);
        setLoading(true);
        setError('');
        try {
            if (!audio.current)
                audio.current = new PianoAudio(new AudioContext());
            await Promise.all([audio.current.context.resume(), audio.current.load()]);
            if (id !== request.current)
                return;
            if (audio.current.context.state !== 'running')
                throw new Error('Audio suspended');
            if (VIDEO_CAPTURE) {
                audio.current.startCapture();
                const startedAt = performance.now();
                document.documentElement.dataset.figure4CaptureStarted = startedAt.toFixed(3);
                delete document.documentElement.dataset.figure4AudioReady;
                document.getElementById('figure4-capture-audio')?.remove();
            }
            setLoading(false);
            const timing = audio.current.play(first.sheet.notes, tempo, volume / 100, loopEnabled.current, pass => source.get(pass).sheet.notes, VIDEO_CAPTURE ? PUBLICATION_CAPTURE.takes : undefined);
            run.current = { clock: timing, source, archivedPass: -1 };
            const animate = () => {
                if (id !== request.current || !audio.current)
                    return;
                const now = audio.current.context.currentTime;
                const progress = showProgress(now);
                if (progress?.complete) {
                    setPlaying(false);
                    setActive(-1);
                    audio.current.stop();
                    run.current = null;
                    return;
                }
                frame.current = requestAnimationFrame(animate);
            };
            animate();
        }
        catch {
            if (id === request.current) {
                stop();
                setError(tr("The piano could not load or start. Allow browser audio, then try Play again."));
            }
        }
    }
    useEffect(() => () => {
        request.current++;
        cancelAnimationFrame(frame.current);
        audio.current?.stop();
        audio.current?.endCapture();
        delete document.documentElement.dataset.figure4CaptureStarted;
        delete document.documentElement.dataset.figure4AudioReady;
        document.getElementById('figure4-capture-audio')?.remove();
        void audio.current?.context.close();
    }, []);
    function phase(name: keyof Parameters, value: string) {
        const n = Number(value);
        if (!value.trim() || !Number.isFinite(n) || Math.abs(n) > 2)
            return;
        stop(true);
        setParameters(p => ({ ...p, [name]: n }));
    }
    function exportCapturedAudio() {
        try {
            const bytes = audio.current?.captureWav(true);
            if (!bytes)
                throw new Error('No capture is running');
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000)
                binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            const output = document.createElement('script');
            output.id = 'figure4-capture-audio';
            output.type = 'application/octet-stream';
            output.textContent = btoa(binary);
            document.body.append(output);
            document.documentElement.dataset.figure4AudioReady = 'true';
        }
        catch {
            document.documentElement.dataset.figure4AudioReady = 'error';
        }
    }
    return <main className={'page live-page ' + (VIDEO_CAPTURE ? 'video-capture ' : '') + (VIDEO_CAPTURE && playing ? 'capture-running' : '')}>
    {!VIDEO_CAPTURE && <LanguageSwitch/>}
    {VIDEO_CAPTURE && !playing && revealed === 0 && <button className="capture-start" onClick={() => void play()}>{tr("Start video capture")}</button>}
    {VIDEO_CAPTURE && !playing && revealed > 0 && <button className="capture-export" onClick={exportCapturedAudio}>{tr("Export synchronized audio")}</button>}
    <header className="masthead"><a href="#score" className="wordmark">{tr("QUANTUM MUSIC")}<span>{" " + tr("/ INTERVAL STUDY 01")}</span></a><span className="edition">{tr("Four pitches \u00D7 two durations")}</span></header>
    <section className="intro"><h1>{tr("A triad &") + " "}<em>{tr("the space between.")}</em></h1><p className="lede">{tr("Watch a two-interval circuit write a piano score with one- and two-beat holds.")}</p></section>
    <section className="player sheet-player" id="score" aria-label={tr("Live quantum-generated piano sheet music")}>
      <div className="player-heading"><h2>{tr("The score, as it sounds.")}</h2><span className="small">{revealed} / {count}{" " + tr("notes written \u00B7 take") + " "}{currentSeed}{passNumber > 1 ? tr(" \u00B7 generation ") + passNumber : ''}</span></div>
      <div className="transport">
        <button className="primary" onClick={() => playing ? stop() : void play()}>{playing ? tr("\u25A0 Stop") : revealed ? tr("\u25B6 Play next take") : tr("\u25B6 Play piano")}</button>
        <button onClick={newTake}>{tr("New take")}</button>
        <label className="score-length">{tr("Length")}<select aria-label={tr("Score length")} value={count} onChange={e => { stop(true); setCount(Number(e.currentTarget.value)); }}>{[2, 4, 8, 16, 32, 64, 128, 256, 512].map(n => <option key={n} value={n}>{n} notes</option>)}</select></label>
        <label className="flow-toggle" title={tr("Generate a fresh take at every boundary, with earlier played paths fading behind. Turn off to finish the current take.")}><input aria-label={tr("Loop new takes")} type="checkbox" checked={loop} onChange={e => { const enabled = e.currentTarget.checked; loopEnabled.current = enabled; setLoop(enabled); if (playing)
        audio.current?.setLoop(enabled); }}/>{" " + tr("Loop new takes")}</label>
        <label className="range-label">Tempo <output>{tempo} BPM</output><input aria-label="Tempo" type="range" min="48" max="180" value={tempo} onInput={e => { stop(true); setTempo(Number(e.currentTarget.value)); }}/></label>
        <label className="range-label volume-control">Volume <output>{volume}%</output><input aria-label="Volume" type="range" min="0" max="100" value={volume} onInput={e => { stop(true); setVolume(Number(e.currentTarget.value)); }}/></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="figure-four-live" aria-label={tr("Animated two-interval selector-controlled quantum score")}>
        <div className="figure-four-title"><span>{tr("TWO INTERVALS \u00B7 LIVE")}</span><span>{tr("Selector-controlled realization of a cue-stable two-qubit passage")}</span></div>
        <div className="figure-four-top">
          <LiveCircuits passage={passage} entrance={entrance} family={intervalScore} trace={trace} selectorSamples={selectorSamples} sounding={active >= 0} heldBeat={heldBeat} restartAtEnd={selected === count - 1} takeSeed={currentSeed}/>
          <FigureLaws laws={sheet.laws} passage={passage} entrance={entrance} observed={observedLaw}/>
        </div>
        <div className="figure-four-score">
          <div className="live-score-heading"><div className="figure-panel-heading"><span className="figure-letter">(b)</span><span>{tr("Circuit-generated score aligned to the beat ruler")}</span></div><label className="flow-toggle"><input type="checkbox" checked={showFlow} onChange={e => setShowFlow(e.currentTarget.checked)}/>{" " + tr("Live realization paths")}</label></div>
          <div className="notation-key"><span><NoteSymbol beats={1}/>{tr("1 beat")}</span><span><NoteSymbol beats={2}/>{tr("2 beats")}</span><span className="small">C₄ · E₄ · G₄ · C₅</span></div>
          <SheetMusic notes={heardNotes} selected={selected} playing={playing && !loading} onSelect={setInspected} showFlow={showFlow} totalCount={count} history={history} fadeProgress={fadeProgress}/>
          {showFlow && <div className="figure-flow-caption"><span className="figure-letter">(d)</span><span>{tr("Circuit-sampled score realization \u00B7 seed") + " "}{currentSeed}{tr("; the reference video uses seed 1985.")}</span></div>}
        </div>
      </section>
      <div className="score-readout" aria-live="off">
        {note ? <><span>{active >= 0 ? tr("NOW PLAYING") : tr("PLAYED NOTE")} {note.index + 1}</span><NoteSymbol beats={note.beats}/><strong>{PITCHES[note.pitch].label}</strong><span>{note.beats === 1 ? tr("Quarter note") : tr("Half note")} · {note.beats} {note.beats === 1 ? tr("beat") : tr("beats")} · {(note.beats * 60 / tempo).toFixed(2)} s</span></> : <span>{loading ? tr("Loading the sampled grand piano\u2026") : tr("Ready. No notes or measurement outcomes revealed yet.")}</span>}
        <span className="small">{playing ? passNumber > 1 ? tr("Fresh take \u00B7 generation ") + passNumber : tr("Writing from the piano clock") : revealed ? tr("Select a played note to inspect its check and hold") : tr("Press Play piano to begin")}</span>
      </div>
      <p className="score-caption">{tr("A real check plays a pitch; skipping the next middle check holds that pitch for two beats, without a new attack. A hollow notehead is that two-beat hold. The green path follows the current take; earlier played paths fade behind it. Line breaks never reset the selector circuit.")}</p>
    </section>

    <details id="settings" className="settings"><summary>{tr("Choose the circuits and entrance")}</summary><div className="sheet-settings">
      <label>{tr("Checking schedule")}<select aria-label={tr("Checking schedule")} value={intervalScore} onChange={e => { stop(true); setIntervalScore(e.currentTarget.value as IntervalScore); }}><option value="publication">{tr("Fixed Vsel \u00B7 stay 87.5%, switch 12.5%")}</option><option value="ostinato">{tr("Qubit Ostinato \u00B7 stay 75%, switch 25%")}</option><option value="jaws">{tr("Qubit Jaws \u00B7 stay 25%, switch 75%")}</option></select></label>
      <label>{tr("Sound passage")}<select aria-label={tr("Sound passage")} value={passage} onChange={e => { stop(true); setPassage(e.currentTarget.value as SheetPassage); }}>{Object.entries(SHEET_PASSAGES).map(([key, p]) => <option key={key} value={key}>{tr(p.title)}</option>)}</select></label>
      <label>{tr("Fresh sound input")}<select aria-label={tr("Fresh sound input")} value={entrance} onChange={e => { stop(true); setEntrance(Number(e.currentTarget.value)); }}>{BASIS.map((x, i) => <option key={x} value={i}>|{x}⟩</option>)}</select></label>
      <div className="phase-controls">{(['xi', 'eta', 'zeta'] as const).map((key, i) => <label key={key}>{['ξ', 'η', 'ζ'][i]}<input aria-label={'Phase ' + key} type="number" min="-2" max="2" step="any" value={Number(parameters[key].toFixed(6))} onChange={e => phase(key, e.target.value)}/></label>)}</div>
    </div><p className="small">{tr("Default \u03BE = \u03B7 = 1/6, \u03B6 = 0, in units of \u03C0. Changing a setting clears the take and its trails. Each new take starts at S\u2080 = 0 and uses a fresh reproducible draw.")}</p></details>

    <details id="probabilities" className="record probability-details"><summary>{tr("Next readout: pitch and waiting time")}</summary>
      <p className="small">{trace ? trace.source.check === 'step' ? tr("After middle readout Z = {0} in run {1}: B acts on |Z\u27E9; the endpoint check is mandatory in one beat.", BASIS[trace.note.pitch], trace.source.run) : tr("After the endpoint of run {0}: the next selector starts from |{1}\u27E9 and the sound register is freshly prepared in |{2}\u27E9.", trace.source.run, trace.interval.input, BASIS[entrance]) : tr("Before the first run, given |{0}\u27E9 and selector input |0\u27E9. Waiting time is measured from preparation; playback begins at the first readout.", BASIS[entrance])}</p>
      <div className="probability-table"><table><thead><tr><th>{tr("Next pitch")}</th><th>{tr("Readout after 1 beat")}</th><th>{tr("Readout after 2 beats")}</th></tr></thead><tbody>{PITCHES.map((p, y) => <tr key={p.name}><th>{p.label} <small>|{BASIS[y]}⟩</small></th>{joint[y].map((v, d) => <td key={d}>{percent(v)}</td>)}</tr>)}</tbody></table></div>
      <p className="small">{tr("These are next-pitch / waiting-time probabilities, not probabilities for the next written pitch / duration pair. The wait is the current note\u2019s hold. At a run boundary the table averages over the upcoming selector draw; after a middle check, only B remains.")}</p>
      {trace && <p className="small">{tr("Given the selected schedule, the next pitch law is") + " "}{PITCHES.map((p, y) => `${p.label} ${percent(trace.nextProbabilities[y])}`).join(' · ')}{tr(". Its sampled pitch remains hidden until it sounds.")}</p>}
      <p className="small">{tr("The graph keeps eight pitch / hold symbols. Predicting its next edge also needs the run phase and selector state, so those eight symbols alone are not assigned a closed transition matrix.")}</p>
    </details>

    <details id="record" className="record"><summary>{tr("The played record \u00B7") + " "}{revealed} notes</summary>{revealed ? <div className="record-scroll"><table className="record-table"><thead><tr><th>Note</th><th>{tr("Written pitch")}</th><th>{tr("Source check")}</th><th>{tr("Run selector")}</th><th>{tr("Next check")}</th><th>{tr("Onset")}</th><th>{tr("Hold")}</th><th>{tr("Readout probability")}</th></tr></thead><tbody>{sheet.traces.slice(0, revealed).map(t => <tr key={t.note.index}><td>{t.note.index + 1}</td><td><NoteSymbol beats={t.note.beats}/> {PITCHES[t.note.pitch].label}</td><td>{tr("Run") + " "}{t.source.run} · {tr(t.source.check)}</td><td>S = {t.source.selector}</td><td>{t.source.check === 'step' ? tr("Mandatory endpoint") : tr("Run {0} \u00B7 {1} \u2192 S = {2}", t.interval.step, t.interval.input, t.controlSelector)}</td><td>{t.note.onset}{" " + tr("beats")}</td><td>{t.note.beats} {t.note.beats === 1 ? tr("beat") : tr("beats")}</td><td>{percent(t.source.probabilities[t.note.pitch])}</td></tr>)}</tbody></table></div> : <p className="small">{tr("This record fills as the piano plays.")}</p>}</details>

    <details id="model" className="technical"><summary>{tr("The circuit model, notation, and piano")}</summary><div className="technical-content">
      <h3>{tr("One circuit controls the other\u2019s checks")}</h3>
      <p>{tr("Before each two-interval sound run, the selected controller acts on the previous measured selector bit. The default realization repeats the fixed Vsel operation with Born kernel K(3/4). Its sampled S controls the middle check. Prepare the sound register in |x\u27E9 and apply A. For S = 1, measure Z, play that pitch, and apply B to the collapsed state |Z\u27E9. For S = 0, do not measure or sample a middle pitch: B acts on A|x\u27E9 coherently, while the previous piano key stays held. Both branches measure and play Y at the endpoint.")}</p>
      <p>{tr("Write q\u209B = |\u27E8s|U\u2096|b\u27E9|\u00B2. The branch laws are Pr(S = 0, Y = y | x,b) = q\u2080 |\u27E8y|BA|x\u27E9|\u00B2 and Pr(S = 1, Z = z, Y = y | x,b) = q\u2081 |\u27E8z|A|x\u27E9|\u00B2 |\u27E8y|B|z\u27E9|\u00B2. There is one selector measurement per run, not one per audible note. A middle note lasts one beat until its endpoint; an endpoint note lasts one or two beats according to the next run\u2019s selector.")}</p>
      <p>{tr("Each block takes one base interval, even when it contains more than one sound gate. The chosen cut defines A and B. The two full-passage cuts retain the same coherent endpoint law but need not give the same intermediate readouts or sound correlations.")}</p>
      <h3>{tr("Ostinato and Jaws: continuing selectors")}</h3>
      <div className="formulas"><p>θ = arccos λ · U₁ = Ry(θ) · Uₖ = Rz(αₖ) Rx(θ), k ≥ 2</p><p>tan αₖ = λ<sup>k−1</sup> √(1 − λ²) / √(1 − λ<sup>2(k−1)</sup>)</p><p>{tr("Ostinato: \u03BB = 1/2 \u00B7 Jaws companion: \u03BB = \u22121/2")}</p></div>
      <p>{tr("Each U\u2096 has Born kernel K(\u03BB) = \u00BD [[1 + \u03BB, 1 \u2212 \u03BB], [1 \u2212 \u03BB, 1 + \u03BB]]. Its measured bit carries forward; it is not reset for every sound. The phases depend on gate index, not the measured result. A separate unmeasured-prefix calculation checks Q(U\u2096\u22EFU\u2081) = K(\u03BB\u1D4F) = K(\u03BB)\u1D4F; it does not supply the sampled duration input.")}</p>
      {trace && intervalScore !== 'publication' && <p>{tr("For selector prefix") + " "}{trace.interval.step}{tr(", the coherent probability of outcome 1 is") + " "}{percent(trace.prefixProbabilities[1])}{tr("; the stepwise-checked marginal is") + " "}{percent(trace.checkedPrefixProbabilities[1])}{tr(". Their largest kernel-entry residual is") + " "}{trace.prefixResidual.toExponential(2)}{tr(". These are unconditional prefix marginals, unlike the conditional probabilities above.")}</p>}
      <p>{tr("The interval sequence is prefix-consistent but can fail after an internal restart. This player takes a finite initial segment of the infinite construction; a staff line break is not a restart.")}</p>
      <h3>{tr("The two-qubit sound gates")}</h3>
      <p>W = H ⊗ H, Φ(a,b,c) = diag(1, e<sup>iπa</sup>, e<sup>iπb</sup>, e<sup>iπc</sup>{tr("), with the first qubit controlling CNOT. Rightmost factors act first.")}</p>
      <div className="formulas"><p>Q₁ = W Φ(ξ,0,ξ) W Φ(½,0,½) W</p><p>Q₂ = W Φ(−½,½,−1) W Φ(½−ξ,½,−ξ) W</p><p>Q₃ = W Φ(½,0,½) W Φ(η,ζ,ζ−η) W</p><p>U₁ = CNOT Q₁ · U₂ = CNOT Q₂ CNOT · U₃ = CNOT Q₃ CNOT</p></div>
      <p>{tr("The sound register is freshly prepared for each run, not each note; a checked run supplies both a middle and an endpoint readout. The held piano pitch is classical output memory, not the next run\u2019s quantum input. Both circuits are simulated with complex amplitudes and reproducible pseudorandom measurement sampling, not quantum hardware.")}</p>
      <h3>{tr("Live notation and playback")}</h3>
      <p>{tr("A take is an excerpt of N consecutive enabled sound readouts, starting at the first real readout rather than an invented initial pitch. One additional check fixes the last note\u2019s hold; its pitch lies outside the excerpt and stays hidden. The excerpt is sampled ahead so the piano can schedule its attacks accurately. Pitch outcomes appear only at their scheduled onsets, using the audio clock; a controlling selector is already known when its run begins. Stop keeps the heard prefix; Play next take starts a fresh generation.")}</p>
      <p>{tr("Loop new takes generates a fresh excerpt at each written boundary, without adding a pause. Each take uses the same circuit laws with a new seed and the initial preparation S\u2080 = 0; the selector bit carries within that take. Short scores can coincide by chance and are never rejected or reweighted. Up to four earlier heard paths fade progressively behind the current one; no unplayed background ensemble is drawn. The last-to-first preparation reset is not a simulated transition between takes. Turn Loop off to finish the current take, or press Stop to stop immediately.")}</p>
      <p>{tr("The unmetered staff has no imposed time signature. Filled noteheads are quarter notes; hollow noteheads with stems are half notes. All four outcomes sound: 00 \u2192 C\u2084, 01 \u2192 E\u2084, 10 \u2192 G\u2084, 11 \u2192 C\u2085. The score and realization graph share a beat ruler, with each notehead centered in its actual one- or two-beat hold. A key is held for one or two full beats, with the recording\u2019s natural decay and an 80 ms release after note-off. Repeated pitches receive separate attacks.")}</p>
      <p>{tr("The growing path follows the actual enabled checks and the holds between them. Skipped checks create no nodes or attacks. Only heard nodes and their connecting edges are drawn; earlier heard takes fade behind the current realization. The four pitch labels and two hold lengths do not by themselves encode the run phase or selector memory.")}</p>
      <p>{tr("Audio rendering only: the circuits generate the pitch outcomes and checking times;") + " "}<a href="https://github.com/Tonejs/audio/blob/master/salamander/README">{tr("Salamander Grand Piano recordings by Alexander Holm")}</a>{tr(", licensed under") + " "}<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>{tr(", render those selected pitches. The recordings play no role in the probability law or circuit dynamics. Samples are bundled with the player; D\u266F4 and F\u266F4 are transposed one semitone to E4 and G4.") + " "}<a href={attributionURL}>{tr("Full attribution")}</a>.</p>
    </div></details>
    <footer><span>{tr("Four pitches, two durations \u00B7 classical circuit simulation \u00B7 interactive research demonstration.")}</span><span>{tr("Audio only \u00B7 Salamander Grand Piano recordings \u00B7 Alexander Holm \u00B7 CC BY 3.0")}</span></footer>
  </main>;
}
