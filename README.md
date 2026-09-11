# The Quantum Composition Project

Quantum transition probabilities do not generally compose like classical probabilities: checking a process step by step can change its final predictions. This project explains that paradox and makes it audible through interactive quantum-music examples.

**Project site:** <https://institut-kets.github.io/quantum-composition/>

**Preprint:** [The Quantum Composition Paradox — arXiv:2609.11402](https://arxiv.org/abs/2609.11402)

## Explore

- [A triad & the space between](https://institut-kets.github.io/quantum-composition/interval-study/) follows coupled circuit measurements as they write and play a four-pitch piano score.
- [Qubit Ostinato](https://institut-kets.github.io/quantum-composition/qubit-ostinato.html) builds an indefinitely continuing, prefix-consistent quantum rhythm.
- [Eight-note loop](https://institut-kets.github.io/quantum-composition/quantum-music/figure-4-eight-note-loop.mp4) shows a publication realization of the selector-controlled score.

## Repository

The public site is served from [`docs/`](docs/). The React and TypeScript source for the interval study is in [`interval-study/`](interval-study/); downloadable publication files are in [`quantum-music/`](quantum-music/).

To preview the complete site locally:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory docs
```

To rebuild the interval study, run `npm install` and then `npm run build` from `interval-study/`. The build writes to `docs/interval-study/`.

## English and French

The [French site](https://institut-kets.github.io/quantum-composition/fr/) has its own addresses. Language links retain section anchors. Both languages use the same simulation, recordings, equations, and random seeds; the published paper and reference video retain their English annotations.

Static translations are in `scripts/translations/fr-static.json`; the music interface translations are in `interval-study/src/fr.json`. After editing either language or the music interface, rebuild in this order:

```sh
cd interval-study
npm ci
npm run check
npm run build
cd ..
python3 scripts/build-french.py
node interval-study/scripts/build-standalone.mjs
python3 scripts/package-downloads.py
```

The French player shares the hosted application bundle and piano files. Each language also has a self-contained HTML download and ZIP; their EN / FR switches work offline.

## Paper and citation

Jacob Biamonte. *The Quantum Composition Paradox*. arXiv:2609.11402 [quant-ph] (2026).

The first version is dated 10 September 2026. [Read on arXiv](https://arxiv.org/abs/2609.11402), [read the PDF](https://arxiv.org/pdf/2609.11402), or [download the BibTeX citation](https://institut-kets.github.io/quantum-composition/paper/citation.bib).

## Audio attribution

The interactive example uses [Salamander Grand Piano recordings by Alexander Holm](https://github.com/Tonejs/audio/tree/master/salamander), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The recordings render circuit-generated outcomes and play no role in the probability law or circuit dynamics.
