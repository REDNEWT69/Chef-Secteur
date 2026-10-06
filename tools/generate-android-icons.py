#!/usr/bin/env python3
"""Export the Android launcher resources from the approved PWA icons (Pillow required).

Usage: python tools/generate-android-icons.py
Sources of truth: app-icon-512.png (standard) and app-icon-maskable-512.png (maskable).
Only resizes and masks them; Runner is not redrawn and Bubblewrap is not involved.
Writes android/app/src/main/res/{mipmap-*,drawable-*/splash.png} and android/store_icon.png
with the sizes Bubblewrap 1.25.0 originally produced, so the shell layout is unchanged.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
DENSITIES = ('mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')
LAUNCHER = dict(zip(DENSITIES, (48, 72, 96, 144, 192)))    # legacy launcher (< API 26)
MASKABLE = dict(zip(DENSITIES, (82, 123, 164, 246, 328)))  # adaptive-icon layer (>= API 26)
SPLASH = dict(zip(DENSITIES, (300, 450, 600, 900, 1200)))  # TWA splash canvas
SPLASH_SHARE = 0.66  # share of the canvas taken by the logo, as in the previous splash
RADIUS = 0.22        # rounded-square corner radius, as a share of the icon size


def load(name):
    with Image.open(ROOT / name) as image:
        if image.width != image.height or image.width < 512:
            raise ValueError(f'{name}: expected square artwork of at least 512 px')
        return image.convert('RGBA')


def rounded(image, size):
    """Resize with LANCZOS and round the corners (4x supersampled mask, no jagged edge)."""
    scaled = image.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * 4 - 1, size * 4 - 1), radius=size * 4 * RADIUS, fill=255)
    scaled.putalpha(mask.resize((size, size), Image.Resampling.LANCZOS))
    return scaled


standard = load('app-icon-512.png')
maskable = load('app-icon-maskable-512.png')

for density in DENSITIES:
    folder = RES / f'mipmap-{density}'
    rounded(standard, LAUNCHER[density]).save(folder / 'ic_launcher.png', optimize=True)
    size = MASKABLE[density]
    maskable.resize((size, size), Image.Resampling.LANCZOS).save(folder / 'ic_maskable.png', optimize=True)

    canvas = SPLASH[density]
    logo = rounded(standard, round(canvas * SPLASH_SHARE))
    splash = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    offset = (canvas - logo.width) // 2
    splash.paste(logo, (offset, offset), logo)
    splash.save(RES / f'drawable-{density}' / 'splash.png', optimize=True)

# Play Store listing reference (512 px, full square: Google applies its own mask).
standard.convert('RGB').save(ROOT / 'android' / 'store_icon.png', optimize=True)
print('Exported Android launcher, adaptive layer, splash and store_icon from the approved PWA icons.')
