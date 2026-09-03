# The Quantum Composition Project

Quantum transition probabilities do not generally compose like classical probabilities: checking a process step by step can change its final predictions. This project explains that paradox and makes it audible through interactive quantum-music examples.

**Project site:** <https://institut-kets.github.io/quantum-composition/>

**Preprint:** arXiv link forthcoming

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

## Publication status

The manuscript link and full citation will be added after the public arXiv identifier is available.

## Audio attribution

The interactive example uses [Salamander Grand Piano recordings by Alexander Holm](https://github.com/Tonejs/audio/tree/master/salamander), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The recordings render circuit-generated outcomes and play no role in the probability law or circuit dynamics.
