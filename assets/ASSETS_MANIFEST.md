# MazBayID Cozy Cute Tech — Asset Manifest

**Manifest version:** 1.0  
**Reference:** `1000097880.png` (uploaded visual asset sheet, 2042 × 1365 px)  
**Status:** Planning manifest — individual production assets have not yet been exported.

## 1. Important note about the reference sheet

The uploaded image is a visual reference/contact sheet, not a ready-to-use asset package. It contains several different elements arranged together, including icons, the Octo-cat illustration, UI previews, labels, and text.

The image has transparency (RGBA), which is useful as a reference. However, using the whole sheet directly on the website is not recommended: individual elements would not be independently reusable, scalable, or accessible. We should export or recreate the required elements as separate files.

**We do not need to redesign everything from scratch.** Use this sheet as the visual source of truth and extract/recreate only the elements that need to become standalone assets.

## 2. Asset inventory

| ID | Asset / filename | Intended use | Recommended format | Target size | Priority |
|---|---|---|---|---:|---|
| BRAND-01 | `mazbayid-mark.svg` | Code-window brand mark in the header | SVG | 64 × 64 viewBox | High |
| BRAND-02 | `mazbayid-wordmark.svg` | “MazBayID” header wordmark, if kept as artwork | SVG | Responsive | Medium |
| MASCOT-01 | `octocat-hero.webp` | Main Octo-cat beside the homepage hero text | WebP with transparency | 640 × 640 px | Critical |
| MASCOT-02 | `octocat-icon.svg` | Compact mascot mark / favicon source | SVG | 64 × 64 viewBox | High |
| MASCOT-03 | `octocat-small.webp` | Small mascot decoration in About or other sections | WebP with transparency | 256 × 256 px | Medium |
| MASCOT-04 | `octocat-expression-*.webp` | Optional alternate expressions for empty states or future pages | WebP with transparency | 256 × 256 px each | Low |
| ICON-01 | `icon-home.svg` | Home navigation / home-related UI | SVG | 24 × 24 viewBox | High |
| ICON-02 | `icon-projects.svg` | Projects navigation | SVG | 24 × 24 viewBox | High |
| ICON-03 | `icon-about.svg` | About navigation | SVG | 24 × 24 viewBox | High |
| ICON-04 | `icon-language.svg` | Language selector | SVG | 24 × 24 viewBox | High |
| ICON-05 | `icon-theme-dark.svg` | Dark-theme control | SVG | 24 × 24 viewBox | High |
| ICON-06 | `icon-menu.svg` | Mobile menu control | SVG | 24 × 24 viewBox | High |
| ICON-07 | `icon-email.svg` | Email action | SVG | 24 × 24 viewBox | High |
| ICON-08 | `icon-badge.svg` | Developer badge decoration | SVG | 48 × 48 viewBox | Medium |
| ICON-09 | `icon-clock.svg` | Neo Clock Studio project card | SVG | 48 × 48 viewBox | High |
| ICON-10 | `icon-chip.svg` | ESP Clock project card | SVG | 48 × 48 viewBox | High |
| ICON-11 | `icon-gamepad.svg` | Cyber Protocol project card | SVG | 48 × 48 viewBox | High |
| ICON-12 | `icon-flask.svg` | Experiments project card | SVG | 48 × 48 viewBox | High |
| ICON-13 | `icon-external-link.svg` | Project-card external link | SVG | 20 × 20 viewBox | Medium |
| ICON-14 | `icon-cloud.svg` | About / workshop decoration | SVG | 48 × 48 viewBox | Low |
| ICON-15 | `icon-telegram.svg` | Social/contact link, only if used | SVG | 24 × 24 viewBox | Medium |
| ICON-16 | `icon-github.svg` | GitHub link | SVG | 24 × 24 viewBox | High |
| ICON-17 | `icon-coffee.svg` | Floating Ko-fi/support control | SVG | 32 × 32 viewBox | High |
| DECOR-01 | `circuit-corners.svg` | Subtle technology lines around the hero | SVG | Responsive | Medium |
| DECOR-02 | `pixel-sparkles.svg` | Small decorative pixels / sparkles | SVG | Responsive | Low |
| DECOR-03 | `puzzle-decoration.svg` | Projects-section decoration, if retained | SVG | 64 × 64 viewBox | Low |

## 3. Elements that should remain CSS or HTML

These are visible in the reference but should not become image files:

- Navigation tabs, buttons, project cards, borders, shadows, and rounded corners.
- Light/dark theme backgrounds, gradients, and color swatches.
- Text, headings, project descriptions, status labels, and technology tags.
- The About and toolbox layouts.
- Simple separators and responsive spacing.

Use CSS for these so they remain responsive, accessible, easy to translate, and easy to adapt to both themes.

## 4. Suggested folder structure

```text
assets/
├── brand/
│   ├── mazbayid-mark.svg
│   └── mazbayid-wordmark.svg
├── mascot/
│   ├── octocat-hero.webp
│   ├── octocat-icon.svg
│   ├── octocat-small.webp
│   └── expressions/
├── icons/
│   ├── navigation/
│   ├── projects/
│   └── social/
└── decorations/
    ├── circuit-corners.svg
    └── pixel-sparkles.svg
```

## 5. Production rules

1. Keep the Octo-cat silhouette, face, proportions, and lavender/cream palette consistent with the approved reference.
2. Export illustrations with a transparent background; do not include the black preview background.
3. Prefer SVG for simple icons and marks. Use optimized WebP for detailed mascot illustrations.
4. Keep icon artwork centered in its viewBox with consistent visual weight and padding.
5. Do not bake labels or website text into images.
6. Provide a dark-theme-safe version only when an asset itself needs different contrast. Most icons should use `currentColor` or CSS-controlled color where practical.
7. Optimize file size and dimensions for mobile screens.
8. Use descriptive, lowercase, hyphenated filenames.

## 6. Implementation status

| Status | Meaning |
|---|---|
| Reference only | Visible in the uploaded sheet; not yet a standalone file |
| To export/recreate | Needs a separate optimized asset |
| CSS/HTML | Should be implemented in the website, not exported as an image |

At the time this manifest was written, all listed image assets are **reference only / to export or recreate**. This manifest does not claim that the individual files already exist.

## 7. Recommended production order

1. Octo-cat hero illustration and compact Octo-cat icon.
2. Brand mark and essential navigation icons.
3. Four project icons and GitHub / email / Ko-fi icons.
4. Hero circuit decoration and small decorative elements.
5. Optional alternate Octo-cat expressions.

**Acceptance check:** Before repository integration, preview the individual assets on both light and dark backgrounds and at phone-sized dimensions.
