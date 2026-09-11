import { tr } from './locale.js';
    (() => {
      const $ = (id) => document.getElementById(id);
      const THETA = 2 * Math.PI / 3;
      const LAMBDA = -1 / 2;
      const TEMPO = 650;
      const MOTION_DURATION = 500;
      const xPositions = [70, 180, 290, 400, 510, 620, 730, 840];
      const timers = [];
      let playing = false;
      let audioContext = null;
      let flowCount = 0;
      let state = null;
      let sphereState = null;
      const animationFrames = { prefix: null, note: null, target: null };

      const vector = {
        dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
        cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
        norm: (a) => Math.hypot(a.x, a.y, a.z),
        scale: (a, scalar) => ({ x: a.x * scalar, y: a.y * scalar, z: a.z * scalar }),
        add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
        unit: (a) => {
          const norm = Math.hypot(a.x, a.y, a.z);
          return norm < 1e-14 ? { x: 0, y: 0, z: 1 } : { x: a.x / norm, y: a.y / norm, z: a.z / norm };
        }
      };

      function rotateVectorFromTo(value, from, to) {
        const source = vector.unit(from);
        const target = vector.unit(to);
        const cross = vector.cross(source, target);
        const sine = vector.norm(cross);
        const cosine = Math.max(-1, Math.min(1, vector.dot(source, target)));
        if (sine < 1e-12) {
          if (cosine > 0) return { ...value };
          return { x: value.x, y: -value.y, z: -value.z };
        }
        const axis = vector.scale(cross, 1 / sine);
        return vector.add(
          vector.add(vector.scale(value, cosine), vector.scale(vector.cross(axis, value), sine)),
          vector.scale(axis, vector.dot(axis, value) * (1 - cosine))
        );
      }

      function computeStep(snapshot) {
        const index = snapshot.step + 1;
        const transverseSize = Math.sin(THETA);
        let readablePoint;
        let nextPrefix;
        let localDefect = 0;

        if (index === 1) {
          readablePoint = { x: -transverseSize, y: 0, z: LAMBDA };
          nextPrefix = { x: transverseSize, y: 0, z: LAMBDA };
        } else {
          const previousTransverse = { x: snapshot.prefix.x, y: snapshot.prefix.y, z: 0 };
          const transverseNorm = vector.norm(previousTransverse);
          const readableTransverse = {
            x: -previousTransverse.y * transverseSize / transverseNorm,
            y: previousTransverse.x * transverseSize / transverseNorm,
            z: 0
          };
          readablePoint = { ...readableTransverse, z: LAMBDA };
          localDefect = vector.dot(readableTransverse, previousTransverse);
          nextPrefix = vector.unit(rotateVectorFromTo(snapshot.prefix, readablePoint, { x: 0, y: 0, z: 1 }));
        }

        const nextProduct = snapshot.lambdaProduct * LAMBDA;
        const prefixDefect = nextPrefix.z - nextProduct;
        const current = Math.max(Math.abs(localDefect), Math.abs(prefixDefect));
        return { index, readablePoint: vector.unit(readablePoint), nextPrefix, nextProduct, current };
      }

      function project(point) {
        return {
          x: 220 + 112 * (0.86 * point.x - 0.46 * point.y),
          y: 155 - 112 * (0.34 * point.x + 0.34 * point.y + 0.88 * point.z)
        };
      }

      function formatCoordinates(point) {
        const clean = (value) => Math.abs(value) < 5e-7 ? 0 : value;
        return `(${clean(point.x).toFixed(3)}, ${clean(point.y).toFixed(3)}, ${clean(point.z).toFixed(3)})`;
      }

      function formatProduct(index, value) {
        if (index === 0) return '1';
        if (index <= 8) return `${index % 2 ? '−' : ''}1/${2 ** index}`;
        return value.toExponential(2).replace('-', '−');
      }

      function drawSphereVector(prefix, point) {
        const projected = project(point);
        $(`${prefix}-vector`).setAttribute('x2', projected.x.toFixed(2));
        $(`${prefix}-vector`).setAttribute('y2', projected.y.toFixed(2));
        $(`${prefix}-point`).setAttribute('cx', projected.x.toFixed(2));
        $(`${prefix}-point`).setAttribute('cy', projected.y.toFixed(2));
        $(`${prefix}-coordinates`).textContent = formatCoordinates(point);
      }

      function drawTarget(zValue) {
        const z = Math.max(-1, Math.min(1, zValue));
        const radius = Math.sqrt(Math.max(0, 1 - z * z));
        const points = [];
        for (let index = 0; index <= 72; index += 1) {
          const angle = 2 * Math.PI * index / 72;
          const projected = project({ x: radius * Math.cos(angle), y: radius * Math.sin(angle), z });
          points.push(`${projected.x.toFixed(2)},${projected.y.toFixed(2)}`);
        }
        $('target').setAttribute('points', points.join(' '));
      }

      function eased(progress) {
        return progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      }

      function animateVector(prefix, destination) {
        if (animationFrames[prefix]) window.cancelAnimationFrame(animationFrames[prefix]);
        const startPoint = { ...sphereState[prefix] };
        const startedAt = performance.now();
        const marker = $(`${prefix}-point`);
        marker.setAttribute('r', prefix === 'prefix' ? '9' : '8');

        const frame = (now) => {
          const progress = Math.min(1, (now - startedAt) / MOTION_DURATION);
          const amount = eased(progress);
          const point = {
            x: startPoint.x + (destination.x - startPoint.x) * amount,
            y: startPoint.y + (destination.y - startPoint.y) * amount,
            z: startPoint.z + (destination.z - startPoint.z) * amount
          };
          sphereState[prefix] = point;
          drawSphereVector(prefix, point);
          if (progress < 1) {
            animationFrames[prefix] = window.requestAnimationFrame(frame);
          } else {
            sphereState[prefix] = { ...destination };
            marker.setAttribute('r', '7');
            animationFrames[prefix] = null;
          }
        };
        animationFrames[prefix] = window.requestAnimationFrame(frame);
      }

      function animateTarget(destination) {
        if (animationFrames.target) window.cancelAnimationFrame(animationFrames.target);
        const startValue = sphereState.target;
        const startedAt = performance.now();
        const frame = (now) => {
          const progress = Math.min(1, (now - startedAt) / MOTION_DURATION);
          const value = startValue + (destination - startValue) * eased(progress);
          sphereState.target = value;
          drawTarget(value);
          if (progress < 1) {
            animationFrames.target = window.requestAnimationFrame(frame);
          } else {
            sphereState.target = destination;
            animationFrames.target = null;
          }
        };
        animationFrames.target = window.requestAnimationFrame(frame);
      }

      function renderStep(result, preview = false) {
        if (preview) {
          sphereState = {
            prefix: { ...state.prefix },
            note: { ...result.readablePoint },
            target: state.lambdaProduct
          };
          drawSphereVector('prefix', sphereState.prefix);
          drawSphereVector('note', sphereState.note);
          drawTarget(sphereState.target);
        } else {
          animateVector('prefix', result.nextPrefix);
          animateVector('note', result.readablePoint);
          animateTarget(result.nextProduct);
        }
        $('current').textContent = result.current < 1e-10 ? '0' : result.current.toExponential(2);
        $('prefix').textContent = preview ? tr('ready', 'prêt') : `U1 … U${result.index}`;
        $('product').textContent = preview ? '1' : formatProduct(result.index, result.nextProduct);
        $('detail').textContent = preview
          ? tr('Ready: the first Qubit Ostinato note lies on the zero set.', 'Prêt : la première note de Qubit Ostinato appartient à l’ensemble des zéros du défaut.')
          : tr(`Prefix ${result.index}: the quantum endpoint lies on the stochastic target latitude.`, `Préfixe ${result.index} : l’état quantique final se trouve sur la latitude cible stochastique.`);
      }

      function renderHistory() {
        const visible = state.history.slice(-8);
        const container = $('trajectory');
        container.replaceChildren();
        visible.forEach((entry) => {
          const step = document.createElement('div');
          step.className = 'trajectory-step';
          const label = document.createElement('span');
          label.className = 'gate-label';
          label.textContent = `U${entry.index}`;
          const dot = document.createElement('span');
          dot.className = `trajectory-dot ${entry.outcome === 0 ? 'e' : 'f'}`;
          dot.textContent = entry.outcome === 0 ? 'E' : 'F';
          step.append(label, dot);
          container.append(step);
        });
        for (let index = visible.length; index < 8; index += 1) {
          const step = document.createElement('div');
          step.className = 'trajectory-step';
          const label = document.createElement('span');
          label.className = 'gate-label';
          label.textContent = '…';
          const dot = document.createElement('span');
          dot.className = 'trajectory-dot placeholder';
          dot.textContent = '·';
          step.append(label, dot);
          container.append(step);
        }
      }

      function gaussianJitter(standardDeviation = 7) {
        const u = Math.max(Number.EPSILON, Math.random());
        const v = Math.random();
        const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        return Math.max(-2.8, Math.min(2.8, normal)) * standardDeviation;
      }

      function addFlowStep(outcome) {
        const namespace = 'http://www.w3.org/2000/svg';
        if (!state.flowPath) {
          state.flowPath = document.createElementNS(namespace, 'polyline');
          state.flowPath.setAttribute('class', 'sample-line');
          $('flow-lines').append(state.flowPath);
        }
        const stepInWindow = state.flowOutcomes.length;
        const y = outcome === 0 ? 78 : 220;
        state.flowOutcomes.push(outcome);
        state.flowPoints.push(`${xPositions[stepInWindow]} ${(y + gaussianJitter()).toFixed(2)}`);
        state.flowPath.setAttribute('points', state.flowPoints.join(' '));
        state.flowPath.classList.remove('latest-e', 'latest-f');
        state.flowPath.classList.add(outcome === 0 ? 'latest-e' : 'latest-f');
        const activePath = state.flowPath;
        window.setTimeout(() => activePath.classList.remove('latest-e', 'latest-f'), 230);

        if (state.flowOutcomes.length === 8) {
          flowCount += 1;
          $('flow-count').textContent = tr(`${flowCount} eight-note path${flowCount === 1 ? '' : 's'} sampled; Qubit Ostinato continues.`, `${flowCount} trajectoire${flowCount === 1 ? '' : 's'} de huit notes échantillonnée${flowCount === 1 ? '' : 's'} ; Qubit Ostinato continue.`);
          state.flowOutcomes = [];
          state.flowPoints = [];
          state.flowPath = null;
        } else {
          $('flow-count').textContent = tr(`Drawing path ${flowCount + 1}: ${state.flowOutcomes.length}/8 notes.`, `Tracé de la trajectoire ${flowCount + 1} : ${state.flowOutcomes.length}/8 notes.`);
        }
      }

      async function ensureAudio() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return false;
        if (!audioContext || audioContext.state === 'closed') audioContext = new Context();
        if (audioContext.state !== 'running') await audioContext.resume();
        return audioContext.state === 'running';
      }

      function playTone(outcome) {
        if (!audioContext || audioContext.state !== 'running') return;
        const oscillator = audioContext.createOscillator();
        const harmonic = audioContext.createOscillator();
        const harmonicGain = audioContext.createGain();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + 0.01;
        const frequency = outcome === 0 ? 82.407 : 87.307;
        oscillator.type = 'sawtooth';
        harmonic.type = 'triangle';
        oscillator.frequency.value = frequency;
        harmonic.frequency.value = frequency * 2;
        harmonicGain.gain.value = 0.15;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.11, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
        oscillator.connect(gain).connect(audioContext.destination);
        harmonic.connect(harmonicGain).connect(gain);
        oscillator.start(start);
        harmonic.start(start);
        oscillator.stop(start + 0.26);
        harmonic.stop(start + 0.26);
      }

      function sampleOutcome() {
        const p0 = state.outcome === 0 ? (1 + LAMBDA) / 2 : (1 - LAMBDA) / 2;
        return Math.random() < p0 ? 0 : 1;
      }

      function advance() {
        if (!playing) return;
        const result = computeStep(state);
        const outcome = sampleOutcome();
        state.step = result.index;
        state.prefix = result.nextPrefix;
        state.lambdaProduct = result.nextProduct;
        state.outcome = outcome;
        state.history.push({ index: result.index, outcome });
        addFlowStep(outcome);
        renderStep(result);
        renderHistory();
        playTone(outcome);
        $('status').textContent = tr(`Playing prefix ${result.index}; each new unitary note remains on the zero set.`, `Lecture du préfixe ${result.index} ; chaque nouvelle note unitaire reste dans l’ensemble des zéros du défaut.`);
        timers.push(window.setTimeout(advance, TEMPO));
      }

      function reset() {
        while (timers.length) window.clearTimeout(timers.pop());
        Object.keys(animationFrames).forEach((key) => {
          if (animationFrames[key]) window.cancelAnimationFrame(animationFrames[key]);
          animationFrames[key] = null;
        });
        playing = false;
        flowCount = 0;
        state = {
          step: 0,
          prefix: { x: 0, y: 0, z: 1 },
          lambdaProduct: 1,
          outcome: 0,
          history: [],
          flowOutcomes: [],
          flowPoints: [],
          flowPath: null
        };
        $('flow-lines').replaceChildren();
        $('flow-count').textContent = tr('No eight-note paths yet.', 'Aucune trajectoire de huit notes pour l’instant.');
        renderHistory();
        renderStep(computeStep(state), true);
      }

      async function toggle() {
        if (playing) {
          playing = false;
          while (timers.length) window.clearTimeout(timers.pop());
          $('play').textContent = tr('▶ Continue playing', '▶ Reprendre l’écoute');
          $('play').setAttribute('aria-pressed', 'false');
          $('status').textContent = tr(`Stopped after prefix ${state.step}.`, `Arrêt après le préfixe ${state.step}.`);
          return;
        }
        if (!await ensureAudio()) return;
        playing = true;
        $('play').textContent = tr('■ Stop', '■ Arrêter');
        $('play').setAttribute('aria-pressed', 'true');
        advance();
      }

      $('play').addEventListener('click', toggle);
      reset();
    })();
