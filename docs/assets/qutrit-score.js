const host = document.querySelector('#qutrit-score');
const play = document.querySelector('#qutrit-play');
const stop = document.querySelector('#qutrit-stop');
const tempo = document.querySelector('#qutrit-tempo');
const status = document.querySelector('#qutrit-status');
const sound = {
  C4: { sample: 'C4', midi: 60, y: 156 },
  E4: { sample: 'Ds4', midi: 63, y: 136 },
  G4: { sample: 'Fs4', midi: 66, y: 116 },
  C5: { sample: 'C5', midi: 72, y: 86 },
};
let score, context, cursor, frame, generation = 0;
let sources = [];
const buffers = new Map();
const x = beat => 35 + 43 * beat;

function drawScore() {
  const lines = [56, 76, 96, 116, 136].map(y =>
    `<line x1="35" y1="${y}" x2="766" y2="${y}" stroke="#b6b6b1"/>`).join('');
  const ticks = [0, 3, 6, 9, 12, 15, 16, 17].map(beat =>
    `<line x1="${x(beat)}" y1="66" x2="${x(beat)}" y2="188" stroke="#ddddda"/>
     <text x="${x(beat)}" y="214" text-anchor="middle">${beat}</text>`).join('');
  const passes = score.selectors.map((selector, i) => {
    const rhythm = ['(2,1)', '(3)', '(1,1,1)'][selector];
    return `<text x="${x(3 * i + 1.5)}" y="42" text-anchor="middle">S=${selector}: ${rhythm}</text>`;
  }).join('');
  const notes = score.events.map((event, index) => {
    const center = x(event.onset_ticks + event.duration_ticks / 2);
    const y = sound[event.pitch].y;
    return `<g><title>${event.pitch}, ${index === 0 ? 'entrance sound from the preceding endpoint' : `readout at ${event.onset_ticks}`}, held ${event.duration_ticks} beats</title>
      ${event.pitch === 'C4' ? `<line x1="${center - 9}" y1="156" x2="${center + 9}" y2="156" stroke="#20221f"/>` : ''}
      <ellipse cx="${center}" cy="${y}" rx="6" ry="4" fill="${event.duration_ticks === 1 ? '#20221f' : 'white'}" stroke="#20221f" transform="rotate(-18 ${center} ${y})"/>
      <line x1="${center + 5}" y1="${y}" x2="${center + 5}" y2="${y - 33}" stroke="#20221f"/>
      ${event.duration_ticks === 3 ? `<circle cx="${center + 13}" cy="${y - 5}" r="2"/>` : ''}
      <text x="${center}" y="237" text-anchor="middle">${event.pitch}</text></g>`;
  }).join('');
  host.innerHTML = `<svg viewBox="0 0 800 262" role="img" aria-labelledby="qutrit-title qutrit-desc">
    <title id="qutrit-title">Five-pass qutrit-selected quantum score</title>
    <desc id="qutrit-desc">An entrance sound followed by ten readout sounds over sixteen beats, then one beat of silence. The final readout is at beat fifteen. Time increases from left to right.</desc>
    <rect x="${x(16)}" y="65" width="43" height="124" fill="#f0f0ed"/>
    ${lines}${ticks}${passes}${notes}
    <text x="${x(15.5)}" y="63" text-anchor="middle">hold</text>
    <text x="${x(16.5)}" y="63" text-anchor="middle">rest</text>
    <circle cx="${x(15)}" cy="156" r="5" stroke="#176345" fill="white"/>
    <line id="qutrit-cursor" x1="35" x2="35" y1="65" y2="188" stroke="#176345" stroke-width="2" visibility="hidden"/>
  </svg>`;
  cursor = document.querySelector('#qutrit-cursor');
}

function halt(message = 'Stopped. Ready to play from the entrance sound.') {
  generation += 1;
  cancelAnimationFrame(frame);
  for (const source of sources) {
    try { source.stop(); } catch { /* A source may already have ended. */ }
    source.disconnect();
  }
  sources = [];
  cursor?.setAttribute('visibility', 'hidden');
  play.disabled = !score;
  stop.disabled = true;
  tempo.disabled = false;
  status.textContent = message;
}

async function start() {
  const bpm = Number(tempo.value);
  if (!Number.isFinite(bpm) || bpm < 48 || bpm > 180) {
    status.textContent = 'Choose a tempo from 48 to 180 beats per minute.';
    return;
  }
  halt('Loading piano sounds…');
  const token = generation;
  play.disabled = true;
  stop.disabled = false;
  tempo.disabled = true;
  try {
    context ??= new AudioContext();
    await context.resume();
    await Promise.all([...new Set(score.events.map(event => event.pitch))].map(async pitch => {
      if (buffers.has(pitch)) return;
      const response = await fetch(new URL(`../interval-study/piano/${sound[pitch].sample}.mp3`, import.meta.url));
      if (!response.ok) throw new Error('A piano recording could not load.');
      buffers.set(pitch, await context.decodeAudioData(await response.arrayBuffer()));
    }));
    if (token !== generation) return;
    const beat = 60 / bpm, beginning = context.currentTime + 0.08;
    for (const event of score.events) {
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffers.get(event.pitch);
      source.playbackRate.value = 2 ** ((event.midi - sound[event.pitch].midi) / 12);
      const onset = beginning + event.onset_ticks * beat;
      const end = onset + event.duration_ticks * beat;
      gain.gain.setValueAtTime(0, onset);
      gain.gain.linearRampToValueAtTime(0.65, onset + 0.006);
      gain.gain.setValueAtTime(0.65, end - 0.012);
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain); gain.connect(context.destination);
      source.start(onset); source.stop(end);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      sources.push(source);
    }
    cursor.setAttribute('visibility', 'visible');
    let lastEvent = -2;
    const animate = () => {
      if (token !== generation) return;
      const elapsed = Math.max(0, (context.currentTime - beginning) / beat);
      cursor.setAttribute('x1', x(Math.min(elapsed, score.beatCount)));
      cursor.setAttribute('x2', x(Math.min(elapsed, score.beatCount)));
      if (elapsed >= score.beatCount) {
        halt('Finished: final sound ended at beat 16; the silent beat ended at 17.');
        return;
      }
      const index = score.events.findIndex(event => elapsed >= event.onset_ticks && elapsed < event.onset_ticks + event.duration_ticks);
      if (index !== lastEvent) {
        lastEvent = index;
        status.textContent = index < 0 ? 'Silent beat: 16–17.' :
          `${score.events[index].pitch} · ${index === 0 ? 'entrance sound from the preceding endpoint' : `readout at beat ${score.events[index].onset_ticks}`} · hold ${score.events[index].duration_ticks} beat${score.events[index].duration_ticks === 1 ? '' : 's'}.`;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
  } catch (error) {
    if (token === generation) halt(`Playback unavailable: ${error.message}`);
  }
}

play.addEventListener('click', start);
stop.addEventListener('click', () => halt());
window.addEventListener('pagehide', () => halt());
try {
  const response = await fetch(new URL('./qutrit-score.json', import.meta.url));
  if (!response.ok) throw new Error('The score could not load.');
  score = await response.json();
  drawScore();
  play.disabled = false;
  status.textContent = 'Ready: five passes, final sound, then one silent beat.';
} catch (error) {
  status.textContent = error.message;
}
