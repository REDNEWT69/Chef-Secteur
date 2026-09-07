#!/usr/bin/env python3
"""Build the compressed application fragments loaded by index.html."""
from __future__ import annotations

import base64
import gzip
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "chef-secteur.html"
OUTPUT = ROOT / "payload"
CHUNK_SIZE = 8_000


def main() -> None:
    encoded = base64.b64encode(gzip.compress(SOURCE.read_bytes(), compresslevel=9, mtime=0)).decode("ascii")
    chunks = [encoded[i : i + CHUNK_SIZE] for i in range(0, len(encoded), CHUNK_SIZE)]
    for old_chunk in OUTPUT.glob("part*.txt"):
        old_chunk.unlink()
    for number, chunk in enumerate(chunks, 1):
        (OUTPUT / f"part{number:02}.txt").write_text(chunk + "\n", encoding="ascii")
    print(f"Built {len(chunks)} payload chunks from {SOURCE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
