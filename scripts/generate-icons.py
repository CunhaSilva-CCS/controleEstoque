#!/usr/bin/env python3
"""Gera ícones do app (favicon, .ico, .icns) a partir do logo Cortexis Tech."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public' / 'branding' / 'cortexis-logo.png'
BUILD = ROOT / 'build'
PUBLIC = ROOT / 'public'

# Fundo escuro da marca Cortexis Tech
BG = (18, 22, 27, 255)


def make_square_icon(size: int) -> Image.Image:
    logo = Image.open(SOURCE).convert('RGBA')
    canvas = Image.new('RGBA', (size, size), BG)

    padding = int(size * 0.08)
    max_w = size - padding * 2
    max_h = size - padding * 2
    ratio = min(max_w / logo.width, max_h / logo.height)
    new_size = (max(1, int(logo.width * ratio)), max(1, int(logo.height * ratio)))
    resized = logo.resize(new_size, Image.Resampling.LANCZOS)

    x = (size - new_size[0]) // 2
    y = (size - new_size[1]) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert('RGBA').save(path, format='PNG')


def build_mac_icns(master: Image.Image) -> None:
    iconset = BUILD / 'icons.iconset'
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir(parents=True)

    mapping = {
        'icon_16x16.png': 16,
        'icon_16x16@2x.png': 32,
        'icon_32x32.png': 32,
        'icon_32x32@2x.png': 64,
        'icon_128x128.png': 128,
        'icon_128x128@2x.png': 256,
        'icon_256x256.png': 256,
        'icon_256x256@2x.png': 512,
        'icon_512x512.png': 512,
        'icon_512x512@2x.png': 1024,
    }

    for name, size in mapping.items():
        save_png(master.resize((size, size), Image.Resampling.LANCZOS), iconset / name)

    icns_path = BUILD / 'icon.icns'
    subprocess.run(
        ['iconutil', '-c', 'icns', str(iconset), '-o', str(icns_path)],
        check=True,
    )
    shutil.rmtree(iconset)


def build_windows_ico(sizes: list[int]) -> None:
    tmp_dir = BUILD / 'ico-tmp'
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    png_paths: list[Path] = []
    for size in sizes:
        path = tmp_dir / f'icon-{size}.png'
        save_png(make_square_icon(size), path)
        png_paths.append(path)

    ico_path = BUILD / 'icon.ico'
    with ico_path.open('wb') as out:
        subprocess.run(
            ['npx', '--yes', 'png-to-ico', *[str(p) for p in png_paths]],
            check=True,
            stdout=out,
            cwd=ROOT,
        )

    shutil.rmtree(tmp_dir)


def main() -> int:
    if not SOURCE.exists():
        print(f'Logo não encontrado: {SOURCE}', file=sys.stderr)
        return 1

    BUILD.mkdir(parents=True, exist_ok=True)

    master = make_square_icon(1024)
    save_png(master, BUILD / 'icon.png')

    build_mac_icns(master)
    build_windows_ico([16, 24, 32, 48, 64, 128, 256])

    save_png(make_square_icon(32), PUBLIC / 'favicon-32.png')
    save_png(make_square_icon(192), PUBLIC / 'favicon-192.png')
    save_png(make_square_icon(180), PUBLIC / 'apple-touch-icon.png')
    shutil.copy2(BUILD / 'icon.ico', PUBLIC / 'favicon.ico')

    print('Ícones gerados:')
    print(f'  - {BUILD / "icon.png"}')
    print(f'  - {BUILD / "icon.ico"}')
    print(f'  - {BUILD / "icon.icns"}')
    print(f'  - {PUBLIC / "favicon.ico"}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
