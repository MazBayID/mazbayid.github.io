# NekOS Skin Manager

Public contribution page: https://mazbayid.github.io/skin-manager/

## Flow

1. Contributor uploads a NekOS skin ZIP, preview thumbnail, and price.
2. The `skin-manager` Supabase Edge Function validates the ZIP central directory, safe paths, allowed file types, manifest, referenced assets, JSON indexes, and image dimensions.
3. A valid package is uploaded to a private package bucket and its preview to the public preview bucket.
4. The `public.skins` row is created with `status = published`; no manual approval step exists.

## Supabase

Project: `vizmufbfaghqucsoukne`

Function: `skin-manager`

Storage buckets created automatically on the first valid upload:
- `skin-previews` — public image previews
- `skin-packages-free` — private ZIPs for free skins
- `skin-packages-premium` — private ZIPs for paid skins

The Edge Function uses the platform-provided server credential. Never add a service-role or secret key to this repository or to the GitHub Pages frontend.

## Package contract

The ZIP keeps the existing NekOS skin package format: `skin.json` at archive root and the existing `icons/`, `components/`, and `motifs/` paths. Skin IDs are treated as opaque strings (non-empty, up to 255 characters); they are not restricted to a slug pattern. Names are unique case-insensitively. A valid upload is published immediately.

The current manager accepts PNG/WebP thumbnails only, up to 3 MB. ZIPs are limited to 32 MB compressed/uncompressed, 400 files, 8 MB per file, and the existing allowed asset locations and image dimensions.

## Endpoints

- `GET /functions/v1/skin-manager` — published catalogue for the manager page
- `POST /functions/v1/skin-manager` — multipart upload: `package`, `thumbnail`, `price`, `currency`

The browser page only talks to this Edge Function; privileged database and Storage credentials are never shipped to the browser.
