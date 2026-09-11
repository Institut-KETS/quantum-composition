import { tr } from './locale.js';
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
    return `<g><title>${event.pitch}, ${index === 0 ? tr('entrance sound from the preceding endpoint', 'son d’entrée issu de l’extrémité précédente') : tr(`readout at ${event.onset_ticks}`, `lecture au temps ${event.onset_ticks}`)}, ${tr(`held ${event.duration_ticks} beats`, `tenu ${event.duration_ticks} temps`)}</title>
      ${event.pitch === 'C4' ? `<line x1="${center - 9}" y1="156" x2="${center + 9}" y2="156" stroke="#20221f"/>` : ''}
      <ellipse cx="${center}" cy="${y}" rx="6" ry="4" fill="${event.duration_ticks === 1 ? '#20221f' : 'white'}" stroke="#20221f" transform="rotate(-18 ${center} ${y})"/>
      <line x1="${center + 5}" y1="${y}" x2="${center + 5}" y2="${y - 33}" stroke="#20221f"/>
      ${event.duration_ticks === 3 ? `<circle cx="${center + 13}" cy="${y - 5}" r="2"/>` : ''}
      <text x="${center}" y="237" text-anchor="middle">${event.pitch}</text></g>`;
  }).join('');
  host.innerHTML = `<svg viewBox="0 0 800 262" role="img" aria-labelledby="qutrit-title qutrit-desc">
    <title id="qutrit-title">${tr("Five-pass qutrit-selected quantum score", "Partition quantique en cinq passages sélectionnés par un qutrit")}</title>
    <desc id="qutrit-desc">${tr("An entrance sound followed by ten readout sounds over sixteen beats, then one beat of silence. The final readout is at beat fifteen. Time increases from left to right.", "Un son d’entrée suivi de dix sons de lecture sur seize temps, puis un temps de silence. La dernière lecture a lieu au quinzième temps. Le temps progresse de gauche à droite.")}</desc>
    <rect x="${x(16)}" y="65" width="43" height="124" fill="#f0f0ed"/>
    ${lines}${ticks}${passes}${notes}
    <text x="${x(15.5)}" y="63" text-anchor="middle">${tr('hold', 'tenue')}</text>
    <text x="${x(16.5)}" y="63" text-anchor="middle">${tr('rest', 'silence')}</text>
    <circle cx="${x(15)}" cy="156" r="5" stroke="#176345" fill="white"/>
    <line id="qutrit-cursor" x1="35" x2="35" y1="65" y2="188" stroke="#176345" stroke-width="2" visibility="hidden"/>
  </svg>`;
  cursor = document.querySelector('#qutrit-cursor');
}

function halt(message = tr("Stopped. Ready to play from the entrance sound.", "Arrêt. Prêt à reprendre depuis le son d’entrée.")) {
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
    status.textContent = tr("Choose a tempo from 48 to 180 beats per minute.", "Choisissez un tempo entre 48 et 180 temps par minute.");
    return;
  }
  halt(tr("Loading piano sounds…", "Chargement des sons de piano…"));
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
      if (!response.ok) throw new Error(tr("A piano recording could not load.", "Un enregistrement de piano n’a pas pu être chargé."));
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
        halt(tr("Finished: final sound ended at beat 16; the silent beat ended at 17.", "Terminé : le dernier son s’est achevé au temps 16 et le temps de silence au temps 17."));
        return;
      }
      const index = score.events.findIndex(event => elapsed >= event.onset_ticks && elapsed < event.onset_ticks + event.duration_ticks);
      if (index !== lastEvent) {
        lastEvent = index;
        status.textContent = index < 0 ? tr("Silent beat: 16–17.", "Temps de silence : 16–17.") :
          `${score.events[index].pitch} · ${index === 0 ? tr('entrance sound from the preceding endpoint', 'son d’entrée issu de l’extrémité précédente') : tr(`readout at beat ${score.events[index].onset_ticks}`, `lecture au temps ${score.events[index].onset_ticks}`)} · ${tr(`hold ${score.events[index].duration_ticks} beat${score.events[index].duration_ticks === 1 ? '' : 's'}`, `tenue de ${score.events[index].duration_ticks} temps`)}.`;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
  } catch (error) {
    if (token === generation) halt(tr(`Playback unavailable: ${error.message}`, `Lecture indisponible : ${error.message}`));
  }
}

play.addEventListener('click', start);
stop.addEventListener('click', () => halt());
window.addEventListener('pagehide', () => halt());
try {
  const response = await fetch(new URL('./qutrit-score.json', import.meta.url));
  if (!response.ok) throw new Error(tr("The score could not load.", "La partition n’a pas pu être chargée."));
  score = await response.json();
  drawScore();
  play.disabled = false;
  status.textContent = tr("Ready: five passes, final sound, then one silent beat.", "Prêt : cinq passages, un dernier son, puis un temps de silence.");
} catch (error) {
  status.textContent = error.message;
}
