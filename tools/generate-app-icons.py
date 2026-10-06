#!/usr/bin/env python3
"""Rebuild installed icons from the approved square artwork (Pillow required).

Usage: python tools/generate-app-icons.py [approved-square.png] [approved-maskable.png]
Without arguments, the two committed 512 px images are the source of truth.
This only exports sizes; it does not redraw Runner.
"""
import base64
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'app-icon-512.png'
mask_source = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'app-icon-maskable-512.png'
with Image.open(source) as image:
    if image.width != image.height or image.width < 512:
        raise ValueError('Expected approved square artwork of at least 512 px')
    artwork = image.convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)

for size in (192, 512):
    artwork.resize((size, size), Image.Resampling.LANCZOS).save(
        ROOT / f'app-icon-{size}.png', optimize=True)

# Approved Android composition: essential subjects inside the central 80% circle,
# with the blue map and decorative route continuing beyond that circle.
with Image.open(mask_source) as image:
    if image.width != image.height or image.width < 512:
        raise ValueError('Expected approved square maskable artwork of at least 512 px')
    maskable = image.convert('RGB').resize((512, 512), Image.Resampling.LANCZOS).convert('RGBA')
maskable.save(ROOT / 'app-icon-maskable-512.png', optimize=True)

# Keep the established logo path, self-contained and available offline.
encoded = base64.b64encode((ROOT / 'app-icon-512.png').read_bytes()).decode('ascii')
(ROOT / 'app-icon.svg').write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" '
    'role="img" aria-label="Store Runner">\n'
    '  <title>Store Runner</title>\n'
    f'  <image width="512" height="512" href="data:image/png;base64,{encoded}"/>\n'
    '</svg>\n', encoding='utf-8')
print('Exported PNG 192/512, Android maskable 512 and self-contained SVG.')
