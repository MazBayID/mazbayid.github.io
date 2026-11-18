#!/usr/bin/env python3
"""Export the two homepage images from the approved 2512x1680 source sheet.

The crop coordinates reproduce the existing CSS sprite positions exactly.
The source sheet and its white background are preserved unchanged.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "assets.png"

CROPS = {
    ROOT / "assets" / "mascot" / "octocat-hero.webp": (1357, 212, 1717, 450),
    ROOT / "assets" / "icons" / "puzzle-piece.webp": (58, 784, 156, 882),
}

def main() -> None:
    with Image.open(SOURCE) as source:
        if source.size != (2512, 1680):
            raise SystemExit(f"Unexpected source dimensions: {source.size}; expected 2512x1680")
        source = source.convert("RGB")
        for destination, bounds in CROPS.items():
            destination.parent.mkdir(parents=True, exist_ok=True)
            crop = source.crop(bounds)
            crop.save(destination, "WEBP", lossless=True, method=6)
            print(f"Wrote {destination.relative_to(ROOT)}: {crop.size[0]}x{crop.size[1]}")

if __name__ == "__main__":
    main()
