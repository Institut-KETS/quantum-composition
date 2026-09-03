import type { Event } from './quantum';

/** Local Web Audio synthesizer. Rest / absent checks never create a sound node. */
export class ScoreAudio {
  context: AudioContext;
  private nodes: OscillatorNode[] = [];
  private analyser: AnalyserNode;
  private samples = new Float32Array(1024);
  peak = 0;
  constructor(context: AudioContext) {
    this.context = context;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.connect(context.destination);
  }
  level() {
    this.analyser.getFloatTimeDomainData(this.samples);
    const rms = Math.sqrt(this.samples.reduce((sum, v) => sum + v * v, 0) / this.samples.length);
    this.peak = Math.max(this.peak, rms);
    return rms;
  }
  stop() { this.nodes.forEach(node => { try { node.stop(); } catch { /* already ended */ } }); this.nodes = []; }
  play(events: Event[], bpm: number, volume = 0.7) {
    if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Invalid audio settings');
    this.stop();
    this.peak = 0;
    const beat = 60 / bpm, start = this.context.currentTime + 0.08;
    for (const event of events) {
      if (event.outcome === null || event.outcome === 3 || volume === 0) continue;
      const frequency = [261.6255653005986, 329.6275569128699, 391.99543598174927][event.outcome];
      const when = start + event.tick * beat;
      const duration = beat * 0.72;
      for (const [ratio, level] of [[1, 0.17], [2, 0.035], [3, 0.012]]) {
        const osc = this.context.createOscillator(), gain = this.context.createGain();
        osc.type = 'sine'; osc.frequency.value = frequency * ratio;
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(level * volume, when + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        osc.connect(gain); gain.connect(this.analyser);
        osc.start(when); osc.stop(when + duration + 0.02);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        this.nodes.push(osc);
      }
    }
    const lastTick = Math.max(0, ...events.map(event => event.tick));
    return { start, end: start + (lastTick + 0.85) * beat, beat };
  }
}
