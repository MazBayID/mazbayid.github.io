# NEO_CLOCK Firmware Builder — Current Implementation

The NEO_CLOCK Firmware Builder is the static GitHub Pages configurator and browser flasher for the ESP32-C3 SuperMini.

- Production route: https://mazbayid.github.io/firmware-builder/
- Firmware source: https://github.com/MazBayID/esp_clock
- Website source: https://github.com/MazBayID/mazbayid.github.io

## Supported firmware variants

- `via_wifi` — Arduino CLI build.
- `via_chronos` — Arduino CLI build.
- `mochi_chronos` — PlatformIO build.

These are independent firmware targets, not interchangeable feature profiles.

## GPIO configuration

Builder v1 exposes eight independent signals:

| Signal | Default |
|---|---:|
| OLED SDA | GPIO21 |
| OLED SCL | GPIO20 |
| Speaker BCLK | GPIO1 |
| Speaker LRC | GPIO2 |
| Speaker DIN | GPIO5 |
| Button PREV / MINUS | GPIO4 |
| Button NEXT / PLUS | GPIO6 |
| Button MODE / OK | GPIO7 |

Allowed pins are GPIO0, 1, 2, 3, 4, 5, 6, 7, 10, 20, and 21. Each exposed signal must use a unique pin. GPIO8/9 and GPIO11–19 are rejected. GPIO2 is allowed because it is in the official default map, but it is a strapping pin and attached circuitry can affect boot. The INMP441 data pin and optional piezo are not configurable in Builder v1.

The frontend, Edge Function, and GitHub Actions configuration script all validate the GPIO map. Server-side validation is authoritative.

## Build and artifact flow

1. The browser sends the selected variant and GPIO map to the `firmware-build` Edge Function.
2. The Edge Function validates the request, reserves a queue slot, and dispatches the matching GitHub Actions workflow.
3. GitHub Actions compiles the firmware, runs GPIO tests, and packages:
   - `merged.bin` — exactly 4 MiB, written at flash address `0x0000`.
   - `advanced-bin.zip` — component BIN files, exact offsets, and flash instructions.
   - `build-info.json` — variant, board, source SHA, and image hashes.
4. The authenticated `firmware-build-callback` downloads the workflow artifact, validates required files and the merged-image SHA-256, and uploads the three files to the private `firmware-artifacts` bucket.
5. The browser polls build status and receives signed download URLs when the build succeeds.

The current browser flasher uses `esptool-js@0.7.1`, detects the chip before writing, verifies the downloaded image's 4 MiB size and SHA-256, then writes the image at `0x0000` with DIO / 80 MHz / 4 MB settings. A full merged-image flash erases the board's 4 MB flash, including saved settings. Flashing starts only after the user confirms.

## Backend controls

The isolated Supabase project uses:

- Edge Functions: `firmware-build` (active version 7) and `firmware-build-callback` (active version 5).
- Private Storage bucket: `firmware-artifacts`, maximum 20 MiB per object.
- Tables: `firmware_builds`, `firmware_build_artifacts`, and `firmware_build_rate_limits`; RLS is enabled and no public policies are configured.
- Build quota: three requests per client fingerprint per hour.
- Queue limit: five active jobs.
- Stale build timeout: 45 minutes.
- Signed download URL lifetime: 300 seconds.
- Build records currently carry an `expires_at` timestamp seven days after creation; status requests after expiry are rejected.

GitHub Actions artifacts have a separate `retention-days: 30` setting. This is not the same as Supabase Storage retention.

**Important storage lifecycle note:** the current deployed database does not have a `cron.job` relation / configured pg_cron cleanup job, and the deployed callback does not remove successful artifacts after the build-record expiry. The expiry check prevents status access; it does not delete Storage objects. Files in the private bucket remain until a separate cleanup process removes them. No Firmware Cache or 15-minute auto-delete has been implemented.

## Verified status

- Website source commit: `20ab13266c3fda394269d293827536dc2a4acc8d`; GitHub Pages deployment run #24 completed successfully.
- Firmware source commit: `c157e3f9907880a09cfbbbe9649cb92b15b6099f`.
- CI and API-dispatched builds for all three variants completed successfully at that firmware commit.
- The project owner has reported a successful end-to-end physical test: website deployed, build completed, flashing succeeded, and firmware ran on the board. The exact tested variant was not recorded, so this must not be interpreted as physical validation of all three variants.

## Open audit items — not yet changed

1. **Client fingerprint header trust:** the active `firmware-build` source currently checks `x-forwarded-for` first, then `cf-connecting-ip`, then `x-real-ip`. This differs from the earlier intended fail-closed design that trusted only a verified proxy header. Confirm which header is reliably set by the deployed edge proxy, then correct the implementation and test spoofed-header cases before relying on the fingerprint as a security boundary.
2. **Callback processing lease:** migration `20261120113000_callback_processing_lease.sql` exists in the website repository but is absent from the currently applied database migration list. The active callback source does not call `claim_firmware_build_callback`. Do not claim duplicate-callback race protection until both the migration and callback implementation are deployed and tested.
3. **Callback provenance:** current callback checks the expected GitHub run ID against artifact metadata and checks build ID / variant in `build-info.json`. It does not currently demonstrate full independent validation of repository, workflow identity, source commit SHA, and run attempt. Keep the security claim limited until those fields are explicitly cross-checked.
4. **Storage cleanup:** choose and implement a retention/cleanup policy separately. Do not confuse signed-URL expiry or build-record expiry with object deletion.

## Related documentation

- Firmware hardware and default pin map: [HARDWARE_BASELINE.md](https://github.com/MazBayID/esp_clock/blob/main/docs/HARDWARE_BASELINE.md)
- Regression procedure: [REGRESSION_TEST_CHECKLIST.md](https://github.com/MazBayID/esp_clock/blob/main/docs/REGRESSION_TEST_CHECKLIST.md)
- Repository overview: https://github.com/MazBayID/esp_clock/blob/main/README.md
- Firmware Builder page source: `firmware-builder/index.html`
- Database migrations: `firmware-builder/supabase/migrations/`
