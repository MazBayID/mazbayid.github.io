# NekOS Skin Manager

Public contribution page: https://mazbayid.github.io/skin-manager/

## Admin access

- The manager requires Supabase Auth email/password login.
- Only confirmed accounts listed in `public.skin_manager_admins` can access upload/publish.
- The initial allowlisted email is `limited.corporated@gmail.com`.
- The frontend uses a public publishable key only. The Edge Function validates the access token with Supabase Auth and checks the allowlist using its server-side service credential.
- The catalogue GET endpoint remains public. Upload POST and `GET ?admin=1` require admin authentication.
- The migration is located at `skin-manager/supabase/migrations/20261126090000_skin_manager_admin_allowlist.sql` (also applied to the connected Supabase project). Create the admin user in Supabase Auth and set its password privately; do not place passwords in source control.

## Flow

1. Admin signs in and uploads a NekOS skin ZIP, preview thumbnail, and price.
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

The official `default` template ID is automatically rewritten to a unique `nekos_default_<id>` community ID before publishing, so the built-in launcher skin remains reserved. The official nested Markdown icon indexes (`icons/tag/icons_index.md` and `icons/ui/ui_index.md`) are accepted; other paths remain allowlisted. The manager accepts PNG/WebP thumbnails up to 3 MB. ZIPs are limited to 32 MB compressed/uncompressed, 400 files, 8 MB per file, and 4096 px per image side. ZIP-slip paths, symlinks, unsupported file types, executable code, and network-required skins remain blocked for security.

## Endpoints

- `GET /functions/v1/skin-manager` — published catalogue for the manager page
- `GET /functions/v1/skin-manager?admin=1` — admin permission check (Bearer token required)
- `POST /functions/v1/skin-manager` — admin-only multipart upload: `package`, `thumbnail`, `price`, `currency`
- `PATCH /functions/v1/skin-manager?id=<skin-uuid>` — admin-only JSON price update: `{ "price_amount": 15000 }`
- `DELETE /functions/v1/skin-manager?id=<skin-uuid>` — admin-only soft delete (archives the skin)

The browser page only talks to this Edge Function; privileged database and Storage credentials are never shipped to the browser.
