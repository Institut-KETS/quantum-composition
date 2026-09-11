export const french = document.documentElement.lang === 'fr';
export const tr = (en, fr) => french ? fr : en;
