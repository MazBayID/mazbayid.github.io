# MazBayID Cozy Cute Tech — Asset Manifest

**Manifest version:** 2.0  
**Source of truth:** `assets/assets.png`  
**Image size:** 2512 × 1680 px  
**Background:** White — preserve it.

## 1. What this file is

`assets/assets.png` is the primary visual source sheet for the approved Cozy Cute Tech design. It contains a homepage composition and multiple visual samples: branding, navigation, Octo-cat mascot, icons, palette samples, project cards, information panels, floating support controls, and footer.

It is a flattened PNG, **not** a transparent sprite atlas. Do not remove its white background or use the entire sheet as the website background. The manifest records the visible elements and their approximate positions so they can be recreated or extracted deliberately.

## 2. Visual inventory

| Region | Approximate bounds (x, y, width, height) | Contents |
|---|---:|---|
| Brand identity | 90, 29, 466, 139 | Code logo tile, MazBayID wordmark, lavender dot, mascot caption |
| Primary navigation | 875, 26, 711, 155 | Home, Projects, About |
| Utility navigation | 1840, 25, 556, 155 | Language, dark mode, menu, Email me |
| Hero text and actions | 168, 183, 1088, 540 | Developer label, two-line heading, description, two CTA buttons |
| Octo-cat mascot | 1357, 213, 360, 237 | Cat/octopus mascot, laptop, books, code bubble, yellow accents |
| Badge/decorations | 41, 209, 1913, 376 | Star badge, left-side line and square |
| Feature icon samples | 1308, 491, 1096, 204 | Home, Projects, star, clock, chip, flask, external link |
| Color/social samples | 1333, 728, 1079, 164 | Four palette dots, cloud, Telegram, GitHub |
| Project heading | 49, 736, 818, 164 | Puzzle piece, section title and subtitle |
| Neo Clock Studio | 57, 903, 577, 286 | Clock icon, description, active status |
| ESP Clock | 651, 903, 567, 286 | Chip icon, description, development status |
| Cyber Protocol | 1235, 903, 572, 286 | Gamepad, description, development status |
| Experiments | 1823, 903, 581, 286 | Flask, description, exploring status |
| Workshop/about | 54, 1214, 834, 319 | Cloud icon, workshop heading, description |
| Toolbox | 899, 1214, 662, 319 | Python, C++, Arduino, ESP32, GitHub, Linux, AI tools |
| Technology tag sample | 1578, 1214, 826, 319 | Colored technology tags and divider |
| Floating support controls | 2265, 1268, 147, 352 | Two mint circular cup/mug buttons |
| Footer | 49, 1562, 2265, 82 | Copyright, “Open source, always.” and GitHub |

*Coordinates are approximate visual bounds in the 2512 × 1680 reference image, not pixel-perfect crop instructions.*

## 3. Octo-cat specification

- Simple, cute, rounded cat with octopus-like tentacles.
- Lavender/dark-purple body and cream face.
- Pointed cat ears, tiny facial features, and curled tentacle.
- Laptop in front, two stacked books to the side, and a small code speech bubble.
- Small yellow accent marks above the mascot.
- Keep the mascot visually simple so it fits the friendly website style.

## 4. Palette and visual language

| Token | Approximate color | Intended use |
|---|---|---|
| Deep ink | `#241743` | Main text and dark icon strokes |
| Purple | `#8060C4` | Brand accent and primary CTA |
| Lavender | `#EDE5FA` | Soft card and button surfaces |
| Mint | `#BDEFE4` | ESP Clock/about surfaces and support controls |
| Pale blue | `#DDE6FF` | Experiments surface |
| Peach | `#FBE9D9` | Cyber Protocol surface |
| Yellow | `#F7C85A` | Small highlights and accents |
| White | `#FFFFFF` | Main canvas/background |

Colors are visual estimates from the image, not extracted design tokens. The exact font family is not specified; the visual direction is a rounded, friendly sans-serif with bold, high-contrast headings.

## 5. Project and information components

- **Neo Clock Studio:** clock icon; “A creative workspace for digital clock graphics”; Active project; lavender card.
- **ESP Clock:** microchip icon; “A tiny connected clock with ESP32”; In development; mint card.
- **Cyber Protocol:** gamepad icon; “A game project inspired by systems”; In development; peach card.
- **Experiments:** flask icon; “Small ideas and prototypes for the future”; Always exploring; pale-blue card.
- **Workshop/about panel:** cloud icon; “A little about this workshop”; “Small setup. Big curiosity.”; description mentions open-source work using an Android phone and AI.
- **Toolbox:** Python, C++, Arduino, ESP32, GitHub, Linux, AI tools.
- **Floating controls:** two mint circular cup/mug icons. The screenshot does not establish their exact action or destination.

## 6. Implementation rules

1. Treat `assets/assets.png` as the primary visual source and design reference.
2. Do not remove or make its white background transparent unless explicitly requested.
3. Do not use the entire sheet as a full-page website background.
4. Rebuild text, layout, cards, buttons, and responsive behavior in HTML/CSS.
5. Use the original sheet as the reference when recreating or cropping distinctive artwork and icons.
6. Do not silently substitute newly generated SVG artwork for the source mascot.
7. The homepage uses `assets/mascot/octocat-hero.webp` and `assets/icons/puzzle-piece.webp`, both lossless crops exported from the original sheet. `assets/mascot/octocat-icon.svg` remains the favicon. The older `octocat-hero.svg` is a legacy derived file and is not used by the homepage.
8. The image shows the light theme. Dark theme styling is a complementary adaptation and must be reviewed separately.
9. On mobile, reflow navigation, project cards, and information panels for narrow screens.

## 7. Current repository facts

- `assets/assets.png` — primary source sheet.
- `assets/ASSETS_MANIFEST.json` — structured manifest.
- `assets/ASSETS_MANIFEST.md` — human-readable inventory.
- `assets/hexadecimal_dictionary_bitmap.pdf` — related reference document.
- `assets/mascot/octocat-hero.webp` — lossless 220 × 145 px crop used by the homepage.
- `assets/icons/puzzle-piece.webp` — lossless 60 × 60 px crop used by the homepage.
- `assets/mascot/octocat-hero.svg` — legacy derived SVG; not used by the homepage.
- `assets/mascot/octocat-icon.svg` — derived SVG used as the favicon.
- `scripts/extract_homepage_assets.py` and `.github/workflows/extract-homepage-assets.yml` regenerate the two crops from the unchanged source sheet.
- The homepage references the two small WebP crops, not the 4.49 MB source sheet.
- The current `index.html` does not reference `background_earth.jpg`.

Only the Octo-cat and puzzle-piece artwork have been exported as standalone image files. Other visual elements in the source sheet remain design references and have not all been individually extracted or implemented.

## 8. Known gaps

- Exact font family is not identified by the reference.
- Dark theme colors are not shown.
- Exact behavior/URLs for every icon and floating support control are not specified.
- Only the two artwork crops currently used by the homepage have been exported; other source-sheet illustrations remain unextracted.
- A visual comparison of the current homepage against every region remains necessary.

## 9. Optimized crop generation

The homepage crop script uses the existing CSS sprite crop positions from the source sheet:

- Octo-cat: x=1357, y=212, width=360, height=238 px.
- Puzzle piece: x=58, y=784, width=98, height=98 px.

The script exports lossless WebP files and preserves the original white background. The original PNG remains unchanged as the design master. GitHub Actions regenerates the crops when the source PNG or extraction script changes.
