"""Generate the static French pages without changing equations or circuit code."""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://institut-kets.github.io/quantum-composition/'
CATALOG = json.loads((ROOT / 'scripts/translations/fr-static.json').read_text())

def translate(text):
    core = text.strip()
    if core not in CATALOG:
        return text
    start = len(text) - len(text.lstrip())
    end = len(text) - len(text.rstrip())
    return text[:start] + CATALOG[core] + (text[-end:] if end else '')

class FrenchPage(HTMLParser):
    def __init__(self, name):
        super().__init__(convert_charrefs=True)
        self.name, self.out, self.raw = name, [], 0

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in ('script', 'style'):
            self.raw += 1
        translated = []
        for key, value in attrs:
            if value is None:
                translated.append(key)
                continue
            if tag == 'html' and key == 'lang':
                value = 'fr'
            if key in ('aria-label', 'title', 'alt') or (tag == 'meta' and key == 'content' and values.get('name', values.get('property')) in ('description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt')):
                value = translate(value)
            if key in ('href', 'src', 'poster'):
                if value.startswith(('assets/', 'paper/')):
                    value = '../' + value
                elif value.startswith('quantum-music/') and not value.endswith(('.html', '.zip')):
                    value = '../' + value
                if values.get('data-language'):
                    value = ('../' if values['data-language'] == 'en' else '') + self.name
                if values.get('rel') == 'canonical':
                    value = BASE + 'fr/' + ('' if self.name == 'index.html' else self.name)
            if tag == 'meta' and values.get('property') == 'og:url' and key == 'content':
                value = BASE + 'fr/' + ('' if self.name == 'index.html' else self.name)
            if key == 'aria-current' and values.get('data-language') == 'en':
                continue
            translated.append(f'{key}="{escape(value, quote=True)}"')
        if values.get('data-language') == 'fr':
            translated.append('aria-current="page"')
        self.out.append('<' + tag + (' ' + ' '.join(translated) if translated else '') + '>')

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.raw -= 1
        self.out.append(f'</{tag}>')

    def handle_data(self, data):
        self.out.append(data if self.raw else escape(translate(data), quote=False))

    def handle_comment(self, data):
        self.out.append('<!--' + data + '-->')

    def handle_decl(self, data):
        self.out.append('<!' + data + '>')

for name in ('index.html', 'qubit-ostinato.html'):
    page = FrenchPage(name)
    page.feed((ROOT / 'docs' / name).read_text())
    html = ''.join(page.out)
    # Preserve the published paper's actual English title in its citation entry.
    if name == 'index.html':
        html = html.replace('<h3>Le paradoxe de la composition quantique</h3>', '<h3 lang="en">The Quantum Composition Paradox</h3>')
    output = ROOT / 'docs/fr' / name
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    print(output.relative_to(ROOT))

# One shared application bundle and one set of recordings for both languages.
demo = ROOT / 'docs/interval-study/index.html'
if demo.exists():
    page = FrenchPage('interval-study/')
    page.feed(demo.read_text())
    html = ''.join(page.out).replace('<html lang="fr">', '<html lang="fr" data-asset-root="../../interval-study/">')
    html = html.replace('src="./assets/', 'src="../../interval-study/assets/').replace('href="./assets/', 'href="../../interval-study/assets/')
    output = ROOT / 'docs/fr/interval-study/index.html'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    print(output.relative_to(ROOT))
