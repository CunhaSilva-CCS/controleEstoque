#!/usr/bin/env python3
"""Publica a logo Cortexis Tech em public/branding sem recortes."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = [
    ROOT / 'cortexis-tech-logo.png',
    ROOT / 'logo-original.jpeg',
]
OUT_PNG = ROOT / 'public' / 'branding' / 'cortexis-logo.png'


def main() -> None:
    src = next((path for path in CANDIDATES if path.exists()), None)
    if src is None:
        raise SystemExit('Nenhuma logo encontrada (cortexis-tech-logo.png ou logo-original.jpeg)')

    im = Image.open(src)
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT_PNG, format='PNG')
    print(f'Logo publicada: {im.size[0]}x{im.size[1]} ← {src.name}')


if __name__ == '__main__':
    main()
