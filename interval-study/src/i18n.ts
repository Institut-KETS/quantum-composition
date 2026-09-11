import translations from './fr.json';

const requested = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('lang');
export const french = requested === 'fr' || (requested !== 'en' && typeof document !== 'undefined' && document.documentElement.lang === 'fr');
export const assetRoot = typeof document === 'undefined' ? './' : document.documentElement.dataset.assetRoot || './';
export const attributionURL = typeof document === 'undefined' ? './piano/ATTRIBUTION.txt' : document.documentElement.dataset.attributionUrl || assetRoot + 'piano/ATTRIBUTION.txt';
export const standalone = typeof document !== 'undefined' && !!document.querySelector('meta[name="artifact"]');
if (typeof document !== 'undefined') document.documentElement.lang = french ? 'fr' : 'en';

export function tr(message: string, ...values: unknown[]): string {
  const translated = french ? (translations as Record<string, string>)[message] ?? message : message;
  return translated.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? `{${index}}`));
}

export function languageURL(language: 'en' | 'fr'): string {
  const url = new URL(location.href);
  if (standalone) {
    url.searchParams.set('lang', language);
  } else {
    const project = new URL(french ? '../../' : '../', location.href);
    url.pathname = project.pathname + (language === 'fr' ? 'fr/' : '') + 'interval-study/';
    url.searchParams.delete('lang');
  }
  const section = [...document.querySelectorAll('main section[id], main details[id]')]
    .filter(node => node.getBoundingClientRect().top <= 160).at(-1);
  if (section) url.hash = section.id;
  return url.href;
}
