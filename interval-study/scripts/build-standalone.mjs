import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(scriptDirectory, '../..');
const site = path.join(repository, 'docs/interval-study');
const output = path.join(repository, 'artifacts/web/quantum-music-interval-study.html');

const htmlPath = path.join(site, 'index.html');
let html = await readFile(htmlPath, 'utf8');

const scriptMatch = html.match(/<script type="module"[^>]+src="([^"]+)"[^>]*><\/script>/);
const styleMatch = html.match(/<link rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/);
if (!scriptMatch || !styleMatch) throw new Error('Built JavaScript or CSS asset was not found in index.html');

const resolveAsset = relative => path.resolve(site, relative);
let javascript = await readFile(resolveAsset(scriptMatch[1]), 'utf8');
const stylesheet = await readFile(resolveAsset(styleMatch[1]), 'utf8');

const piano = {};
for (const name of ['C4', 'C5', 'Ds4', 'Fs4']) {
  const bytes = await readFile(path.join(site, `piano/${name}.mp3`));
  piano[name] = `data:audio/mpeg;base64,${bytes.toString('base64')}`;
}
const attribution = await readFile(path.join(site, 'piano/ATTRIBUTION.txt'), 'utf8');
const attributionURL = `data:text/plain;charset=utf-8,${encodeURIComponent(attribution)}`;
javascript = javascript.replaceAll('./piano/ATTRIBUTION.txt', attributionURL);

const embeddedAudio = JSON.stringify(piano).replaceAll('</script', '<\\/script');
const embeddedJavaScript = javascript.replaceAll('</script', '<\\/script');
const loader = `<script>
window.__QUANTUM_MUSIC_PIANO__ = ${embeddedAudio};
const __quantumMusicFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const address = typeof input === 'string' ? input : input?.url ?? String(input);
  const match = address.match(/(?:^|\\/)(C4|C5|Ds4|Fs4)\\.mp3(?:[?#].*)?$/);
  return match
    ? __quantumMusicFetch(window.__QUANTUM_MUSIC_PIANO__[match[1]], init)
    : __quantumMusicFetch(input, init);
};
</script>
<script type="module">${embeddedJavaScript}</script>`;

html = html
  .replace(scriptMatch[0], () => loader)
  .replace(styleMatch[0], () => `<style>${stylesheet}</style>`)
  .replace('<meta name="theme-color"', '<meta name="artifact" content="Self-contained interactive supplement" />\n    <meta name="theme-color"');

if (html.includes(scriptMatch[0]) || html.includes(styleMatch[0])) {
  throw new Error('Standalone HTML still contains an external application asset');
}
for (const [name, dataURL] of Object.entries(piano)) {
  if (!html.includes(dataURL)) throw new Error(`${name} piano recording was not embedded`);
}
if (!html.includes('<style>') || !html.includes('<script type="module">')) {
  throw new Error('Standalone CSS or JavaScript was not embedded');
}
if (
  !html.includes('RUN MEASUREMENT') ||
  !html.includes('measurement-revealed') ||
  !html.includes('measurement-detail') ||
  !html.includes('LATEST SOUND') ||
  !html.includes('earlyOutcome') ||
  !html.includes('finalOutcome')
) {
  throw new Error('Standalone staged selector/sound measurement readout was not embedded');
}
const moduleContents = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
const styleContents = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (moduleContents !== embeddedJavaScript || styleContents !== stylesheet) {
  throw new Error('Embedded application asset changed during HTML assembly');
}

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html);
console.log(output);
