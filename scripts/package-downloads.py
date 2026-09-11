"""Package the current English and French offline players with the reference video."""
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
for language in ('en', 'fr'):
    source = root / ('quantum-music' if language == 'en' else 'quantum-music/fr')
    published = root / ('docs/quantum-music' if language == 'en' else 'docs/fr/quantum-music')
    data = BytesIO()
    with ZipFile(data, 'w', ZIP_DEFLATED) as archive:
        archive.write(source / 'quantum-music-interval-study.html', 'quantum-music-interval-study.html')
        for name in ('figure-4-eight-note-loop.mp4', 'figure-4-eight-note-loop.mov'):
            archive.write(root / 'quantum-music' / name, name)
    with ZipFile(BytesIO(data.getvalue())) as archive:
        assert archive.testzip() is None
    for directory in (source, published):
        output = directory / 'quantum-music-interval-study-supplement.zip'
        output.write_bytes(data.getvalue())
        print(output.relative_to(root))
