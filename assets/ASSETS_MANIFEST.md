# MazBayID Cozy Cute Tech — Asset Manifest

**Manifest version:** 2.0  
**Source of truth:** `assets/assets.png`  
**Image size:** 1536 × 1027 px  
**Background:** White — preserve it.

## 1. What this file is

`assets/assets.png` is the primary visual source sheet for the approved Cozy Cute Tech design. It contains a homepage composition and multiple visual samples: branding, navigation, Octo-cat mascot, icons, palette samples, project cards, information panels, floating support controls, and footer.

It is a flattened PNG, **not** a transparent sprite atlas. Do not remove its white background or use the entire sheet as the website background. The manifest records the visible elements and their approximate positions so they can be recreated or extracted deliberately.

## 2. Visual inventory

| Region | Approximate bounds (x, y, width, height) | Contents |
|---|---:|---|
| Brand identity | 55, 18, 285, 85 | Code logo tile, MazBayID wordmark, lavender dot, mascot caption |
| Primary navigation | 535, 16, 435, 95 | Home, Projects, About |
| Utility navigation | 1125, 15, 340, 95 | Language, dark mode, menu, Email me |
| Hero text and actions | 103, 112, 665, 330 | Developer label, two-line heading, description, two CTA buttons |
| Octo-cat mascot | 830, 130, 220, 145 | Cat/octopus mascot, laptop, books, code bubble, yellow accents |
| Badge/decorations | 25, 128, 1170, 230 | Star badge, left-side line and square |
| Feature icon samples | 800, 300, 670, 125 | Home, Projects, star, clock, chip, flask, external link |
| Color/social samples | 815, 445, 660, 100 | Four palette dots, cloud, Telegram, GitHub |
| Project heading | 30, 450, 500, 100 | Puzzle piece, section title and subtitle |
| Neo Clock Studio | 35, 552, 353, 175 | Clock icon, description, active status |
| ESP Clock | 398, 552, 347, 175 | Chip icon, description, development status |
| Cyber Protocol | 755, 552, 350, 175 | Gamepad, description, development status |
| Experiments | 1115, 552, 355, 175 | Flask, description, exploring status |
| Workshop/about | 33, 742, 510, 195 | Cloud icon, workshop heading, description |
| Toolbox | 550, 742, 405, 195 | Python, C++, Arduino, ESP32, GitHub, Linux, AI tools |
| Technology tag sample | 965, 742, 505, 195 | Colored technology tags and divider |
| Floating support controls | 1385, 775, 90, 215 | Two mint circular cup/mug buttons |
| Footer | 30, 955, 1385, 50 | Copyright, “Open source, always.” and GitHub |

*Coordinates are approximate visual bounds in the 1536 × 1027 reference image, not pixel-perfect crop instructions.*

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
7. Previously generated `octocat-hero.svg` and `octocat-icon.svg` are derived implementation files, not original source artwork. They remain in the repository and are currently referenced by `index.html`; compare them with the PNG before deciding whether to keep, replace, or remove them.
8. The image shows the light theme. Dark theme styling is a complementary adaptation and must be reviewed separately.
9. On mobile, reflow navigation, project cards, and information panels for narrow screens.

## 7. Current repository facts

- `assets/assets.png` — primary source sheet.
- `assets/ASSETS_MANIFEST.json` — structured manifest.
- `assets/ASSETS_MANIFEST.md` — human-readable inventory.
- `assets/hexadecimal_dictionary_bitmap.pdf` — related reference document.
- `assets/mascot/octocat-hero.svg` — legacy derived SVG; no longer used by the homepage.
- `assets/mascot/octocat-icon.svg` — derived SVG still used as the favicon.
- The current `index.html` references `assets/assets.png` as a CSS sprite sheet for the Octo-cat hero and project-section puzzle-piece decoration.
- The current `index.html` does not reference `background_earth.jpg`.

The homepage now uses CSS sprite crops from the source sheet for the hero Octo-cat and puzzle-piece decoration. This does not mean every icon or component in the reference sheet has been individually extracted or implemented.

## 8. Known gaps

- Exact font family is not identified by the reference.
- Dark theme colors are not shown.
- Exact behavior/URLs for every icon and floating support control are not specified.
- Individual source illustrations have not yet been exported as separate image files.
- A visual comparison of the current homepage against every region remains necessary.
