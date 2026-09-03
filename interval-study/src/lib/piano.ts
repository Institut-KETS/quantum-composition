import { PITCHES } from './sheet.ts';
import type { WrittenNote } from './sheet';
import { scoreTakeAt } from './live.ts';
import type { ScoreClock } from './live';
import { TRAIL_LIMIT } from './takes.ts';

/** Recorded piano, one key attack per written note; release begins at note-off. */
export class PianoAudio {
  readonly context: AudioContext;
  private buffers: AudioBuffer[] = [];
  private loading: Promise<void> | null = null;
  private nodes = new Map<AudioBufferSourceNode, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private clock: ScoreClock | null = null;
  private nextTake: ((pass: number) => WrittenNote[]) | null = null;
  private volume = .65;
  private analyser: AnalyserNode;
  private samples = new Float32Array(1024);
  private capture: { processor: ScriptProcessorNode; sink: GainNode; chunks: Float32Array[][] } | null = null;
  peak = 0;
  constructor(context: AudioContext) {
    this.context = context;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.connect(context.destination);
  }
  async load() {
    if (this.buffers.length === PITCHES.length) return;
    if (!this.loading) this.loading = Promise.all(PITCHES.map(async pitch => {
      const response = await fetch(import.meta.env.BASE_URL + 'piano/' + pitch.sample + '.mp3');
      if (!response.ok) throw new Error('Piano sample could not load');
      return this.context.decodeAudioData(await response.arrayBuffer());
    })).then(buffers => { this.buffers = buffers; }).catch(error => { this.loading = null; throw error; });
    await this.loading;
  }
  level() {
    this.analyser.getFloatTimeDomainData(this.samples);
    const rms = Math.sqrt(this.samples.reduce((s, v) => s + v * v, 0) / this.samples.length);
    this.peak = Math.max(this.peak, rms);
    return rms;
  }
  /** Capture-mode PCM tap. It records the exact analyser signal that reaches
   * the speakers, including scheduled silence and release envelopes. */
  startCapture() {
    this.endCapture();
    const processor = this.context.createScriptProcessor(2048, 2, 2), sink = this.context.createGain();
    const chunks: Float32Array[][] = [[], []];
    sink.gain.value = 0;
    processor.onaudioprocess = event => {
      for (let channel = 0; channel < 2; channel++) {
        const source = event.inputBuffer.getChannelData(Math.min(channel, event.inputBuffer.numberOfChannels - 1));
        chunks[channel].push(new Float32Array(source));
      }
    };
    this.analyser.connect(processor); processor.connect(sink); sink.connect(this.context.destination);
    this.capture = { processor, sink, chunks };
    return { channels: 2, sampleRate: this.context.sampleRate };
  }
  captureWav(stop = false) {
    if (!this.capture) throw new Error('Piano capture has not started');
    const { chunks } = this.capture, channels = chunks.length;
    const frames = chunks[0].reduce((total, chunk) => total + chunk.length, 0);
    const bytes = new ArrayBuffer(44 + frames * channels * 2), view = new DataView(bytes);
    const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, this.context.sampleRate, true); view.setUint32(28, this.context.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * channels * 2, true);
    const positions = new Array(channels).fill(0), offsets = new Array(channels).fill(0);
    let cursor = 44;
    for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++) {
      while (frame - offsets[channel] >= chunks[channel][positions[channel]].length) {
        offsets[channel] += chunks[channel][positions[channel]].length; positions[channel]++;
      }
      const sample = Math.max(-1, Math.min(1, chunks[channel][positions[channel]][frame - offsets[channel]]));
      view.setInt16(cursor, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); cursor += 2;
    }
    if (stop) this.endCapture();
    return new Uint8Array(bytes);
  }
  endCapture() {
    if (!this.capture) return;
    const { processor, sink } = this.capture;
    processor.onaudioprocess = null;
    try { this.analyser.disconnect(processor); } catch { /* Already disconnected. */ }
    processor.disconnect(); sink.disconnect(); this.capture = null;
  }
  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null; this.clock = null; this.nextTake = null;
    this.nodes.forEach((_, node) => { try { node.stop(); } catch { /* Already ended. */ } });
    this.nodes.clear();
  }
  play(notes: WrittenNote[], bpm: number, volume = 0.65, loop = false, nextTake?: (pass: number) => WrittenNote[], loopPasses?: number): ScoreClock {
    if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Invalid piano settings');
    if (loopPasses !== undefined && (!Number.isSafeInteger(loopPasses) || loopPasses < 1)) throw new Error('Invalid loop pass count');
    if (this.buffers.length !== PITCHES.length) throw new Error('Piano is not loaded');
    const beat = 60 / bpm, start = this.context.currentTime + 0.08, release = 0.08;
    const totalBeats = this.validate(notes, beat);
    this.stop(); this.peak = 0;
    this.nextTake = nextTake ?? (() => notes); this.volume = volume;
    const end = start + totalBeats * beat;
    this.clock = { start, beat, period: totalBeats * beat, end: end + release, lastPass: 0, takes: [{ pass: 0, start, end, notes }] };
    for (const note of notes) this.schedule(note, start + note.onset * beat, 0);
    if (loop) {
      this.setLoop(true);
      if (loopPasses !== undefined) { this.clock.lastPass = loopPasses - 1; this.pump(); }
    }
    return this.clock;
  }
  private validate(notes: WrittenNote[], beat: number) {
    if (!notes.length) throw new Error('Empty piano score');
    let totalBeats = 0;
    for (const note of notes) {
      if (!Number.isInteger(note.pitch) || !PITCHES[note.pitch] || (note.beats !== 1 && note.beats !== 2) || note.onset !== totalBeats) throw new Error('Invalid written note');
      const pitch = PITCHES[note.pitch], rate = 2 ** ((pitch.midi - pitch.sampleMidi) / 12);
      if (this.buffers[note.pitch].duration / rate < note.beats * beat + .08) throw new Error('Piano recording is too short for this tempo');
      totalBeats += note.beats;
    }
    return totalBeats;
  }
  setLoop(enabled: boolean) {
    if (!this.clock || this.context.currentTime >= this.clock.end) return;
    const current = scoreTakeAt(this.context.currentTime, this.clock);
    this.clock.lastPass = enabled ? Infinity : current.pass;
    this.clock.end = enabled ? Infinity : current.end + .08;
    if (!enabled) {
      // Lookahead may already have queued the next pass. Finish only the pass
      // that is actually sounding, not the pass reached by the scheduler.
      this.nodes.forEach((scheduledPass, node) => {
        if (scheduledPass > current.pass) { try { node.stop(); } catch { /* Already ended. */ } this.nodes.delete(node); }
      });
      this.clock.takes = this.clock.takes.filter(take => take.pass <= current.pass);
    }
    if (this.timer === null) this.timer = setInterval(() => this.pump(), 50);
    this.pump();
  }
  private pump() {
    if (!this.clock || !this.nextTake) return;
    const now = this.context.currentTime;
    let last = this.clock.takes.at(-1)!;
    while (last.pass < this.clock.lastPass && last.end <= now + 2) {
      const pass = last.pass + 1, notes = this.nextTake(pass);
      const totalBeats = this.validate(notes, this.clock.beat);
      // Queue the whole finite take once its boundary enters the lookahead.
      // If a suspended tab exhausts the queue, resume at a fresh take now:
      // do not invent generations that never sounded or burst missed attacks.
      const start = Math.max(last.end, now), end = start + totalBeats * this.clock.beat;
      last = { pass, start, end, notes }; this.clock.takes.push(last);
      for (const note of notes) this.schedule(note, start + note.onset * this.clock.beat, pass);
    }
    const current = scoreTakeAt(now, this.clock);
    this.clock.takes = this.clock.takes.filter(take => take.pass >= current.pass - TRAIL_LIMIT);
    if (last.pass >= this.clock.lastPass && this.timer !== null) {
      if (Number.isFinite(this.clock.lastPass)) this.clock.end = last.end + .08;
      clearInterval(this.timer); this.timer = null;
    }
  }
  private schedule(note: WrittenNote, when: number, pass: number) {
    if (!this.clock || this.volume === 0) return;
    const release = .08, noteOff = when + note.beats * this.clock.beat;
    const actualStart = Math.max(when, this.context.currentTime);
    if (actualStart >= noteOff + release) return;
    const pitch = PITCHES[note.pitch], rate = 2 ** ((pitch.midi - pitch.sampleMidi) / 12);
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = this.buffers[note.pitch]; source.playbackRate.value = rate;
    if (actualStart < noteOff) {
      gain.gain.setValueAtTime(0, actualStart);
      gain.gain.linearRampToValueAtTime(this.volume, Math.min(actualStart + .003, noteOff));
      gain.gain.setValueAtTime(this.volume, noteOff);
    } else gain.gain.setValueAtTime(this.volume * (noteOff + release - actualStart) / release, actualStart);
    gain.gain.linearRampToValueAtTime(0, noteOff + release);
    source.connect(gain); gain.connect(this.analyser);
    if (actualStart === when) source.start(when);
    else source.start(actualStart, (actualStart - when) * rate);
    source.stop(noteOff + release);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.nodes.delete(source); };
    this.nodes.set(source, pass);
  }
}
