# MazBayID Cozy Cute Tech — Asset Manifest

**Manifest version:** 1.1  
**Status:** Implemented in the homepage

## Source reference

- `assets/assets.png` — visual asset sheet supplied in the repository.
- The sheet is a reference, not a single image to use as the website background.
- `assets/hexadecimal_dictionary_bitmap.pdf` is retained as a repository reference/document; it is not used as a homepage image.

## Production assets

| Asset | File | Purpose | Status |
|---|---|---|---|
| Octo-cat hero | `assets/mascot/octocat-hero.svg` | Mascot illustration beside the hero text | Created and used |
| Octo-cat icon | `assets/mascot/octocat-icon.svg` | Favicon and compact mascot mark | Created and used |
| UI and project icons | Inline SVG in `index.html` | Brand, navigation, clock, chip, gamepad, flask, theme and GitHub icons | Implemented |
| Background decoration | CSS in `index.html` | Pastel gradients, sparkles, rounded cards and theme surfaces | Implemented |

## Design system

- **Direction:** Cozy Cute Tech
- **Themes:** Light and Dark, with saved user preference
- **Mascot:** Simple lavender Octo-cat with cream face, laptop, books and code bubble
- **Responsive target:** Mobile-first, including Android phone screens
- **Language choices:** English, Bahasa Indonesia, Filipino, Chinese and Japanese

## What stays in CSS / HTML

Buttons, cards, gradients, borders, shadows, headings, labels, status indicators, layout, language picker, theme switcher and responsive navigation remain HTML/CSS. This keeps the site lightweight and makes both themes easier to maintain.

## Validation checklist

- [x] Remove the old Earth background from the page styling.
- [x] Add the Octo-cat hero SVG and favicon SVG.
- [x] Add Light/Dark theme switching with saved preference.
- [x] Keep the language selector and five language choices.
- [x] Keep email, Ko-fi support, project links and the CP terminal easter egg.
- [ ] Review the live GitHub Pages rendering on desktop and Android after deployment.
