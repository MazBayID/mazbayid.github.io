#!/usr/bin/env python3
"""Export the two homepage images from the approved 1536x1027 source sheet.

The crop coordinates reproduce the existing CSS sprite positions exactly.
The source sheet and its white background are preserved unchanged.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "assets.png"

CROPS = {
    ROOT / "assets" / "mascot" / "octocat-hero.webp": (830, 129, 1050, 274),
    ROOT / "assets" / "icons" / "puzzle-piece.webp": (35, 479, 95, 539),
}

def main() -> None:
    with Image.open(SOURCE) as source:
        if source.size != (1536, 1027):
            raise SystemExit(f"Unexpected source dimensions: {source.size}; expected 1536x1027")
        source = source.convert("RGB")
        for destination, bounds in CROPS.items():
            destination.parent.mkdir(parents=True, exist_ok=True)
            crop = source.crop(bounds)
            crop.save(destination, "WEBP", lossless=True, method=6)
            print(f"Wrote {destination.relative_to(ROOT)}: {crop.size[0]}x{crop.size[1]}")

if __name__ == "__main__":
    main()
