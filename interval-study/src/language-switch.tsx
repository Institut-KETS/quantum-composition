import { french, languageURL, standalone } from './i18n';

export function LanguageSwitch() {
  const project = standalone
    ? 'https://institut-kets.github.io/quantum-composition/' + (french ? 'fr/' : '')
    : '../';
  return <nav className="demo-navigation" aria-label={french ? 'Projet et langue' : 'Project and language'}>
    <a href={project}>{french ? 'Composition quantique' : 'Quantum Composition'}</a>
    <span className="language-switch">
      {(['en', 'fr'] as const).map(language => <a key={language} lang={language} href={languageURL(language)} hrefLang={language}
        aria-current={(language === 'fr') === french ? 'page' : undefined}
        onClick={event => { event.currentTarget.href = languageURL(language); }}>
        {language.toUpperCase()}
      </a>)}
    </span>
  </nav>;
}
