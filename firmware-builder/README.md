# NEO_CLOCK Firmware Builder — Implementation Plan

This folder is reserved for the dedicated NEO_CLOCK firmware configurator and browser flasher.

## Agreed user flow

1. Select one of the three official firmware variants:
   - `via_wifi`
   - `via_chronos`
   - `mochi_chronos`
2. Configure GPIO assignments only. Hardware components and feature set remain fixed by the selected firmware profile.
3. Validate the GPIO map before submitting a build.
4. Show queue/build progress and a clear success or failure state.
5. On success, offer:
   - Direct browser flashing to ESP32-C3.
   - Download of the full-flash `merged.bin`.
   - Download of the Advanced BIN ZIP with component files and offsets.

## Hardware profile and GPIO fields

All variants target ESP32-C3 SuperMini. Initial configurable GPIO signals:

| Signal | via_wifi | via_chronos | mochi_chronos |
|---|---|---|---|
| OLED SDA | PIN_SDA | PIN_SDA | OLED_SDA_PIN |
| OLED SCL | PIN_SCL | PIN_SCL | OLED_SCL_PIN |
| Speaker BCLK | I2S_BCLK | I2S_BCLK | SPK_BCLK_PIN |
| Speaker LRC | I2S_LRC | I2S_LRC | SPK_LRC_PIN |
| Speaker DIN | I2S_DIN | I2S_DIN | SPK_DIN_PIN |
| Previous / Minus | PIN_PREV | PIN_PREV | BTN_MINUS_PIN |
| Next / Plus | PIN_NEXT | PIN_NEXT | BTN_PLUS_PIN |
| Mode / OK | PIN_MODE | PIN_MODE | BTN_OK_PIN |

The INMP441 microphone input is not exposed as a configurable feature in version 1. It is experimental or disabled in the current firmware profiles. For Mochi, the microphone clock macros must remain tied to the speaker BCLK/LRC pins internally.

The optional separate piezo GPIO is also not exposed in version 1. Keep the existing default feature configuration.

## GPIO validation rules

- Accept only integer GPIO numbers supported by the ESP32-C3 SuperMini profile.
- Reject GPIO8 and GPIO9 because they are strapping/boot-sensitive pins.
- Allow GPIO2 only with a prominent boot-strapping warning because the existing official pinout already uses it.
- Reserve GPIO18 and GPIO19 for native USB.
- Reject duplicate assignments between independent signals.
- OLED SDA/SCL and the three speaker signals must each be distinct.
- Keep the default pin map valid and unchanged when the user does not customize anything.
- Validate on the server as well as in the browser. Never trust browser validation alone.

Version 1 uses this explicit allow-list: GPIO0, GPIO1, GPIO2, GPIO3, GPIO4, GPIO5, GPIO6, GPIO7, GPIO10, GPIO20, and GPIO21. GPIO8/9, GPIO11–19 are not accepted. GPIO2 remains allowed only with a boot-strapping warning because it is part of the existing default speaker LRC mapping.

The generator accepts a partial JSON object with these exact keys:
```json
{
  "oled_sda": 21,
  "oled_scl": 20,
  "speaker_bclk": 1,
  "speaker_lrc": 2,
  "speaker_din": 5,
  "button_prev": 4,
  "button_next": 6,
  "button_mode": 7
}
```
Omitted keys retain the official defaults. Duplicate GPIO assignments are rejected. The same validation must run again in the Edge Function before dispatching a build.

## Build pipeline

The website is static GitHub Pages. It must not contain a GitHub token, Supabase service-role key, or other server secret.

Expected pipeline:

1. Frontend sends the firmware ID and GPIO map to a Supabase Edge Function.
2. The Edge Function validates the request against an allow-list and rate limits it.
3. The Edge Function records a build job and dispatches the matching GitHub Actions workflow.
4. The existing compiler remains separate per firmware:
   - Arduino CLI for `via_wifi`.
   - Arduino CLI for `via_chronos`.
   - PlatformIO for `mochi_chronos`.
5. GitHub Actions packages the standardized `merged.bin`, `advanced-bin.zip`, and build metadata.
6. A trusted backend step transfers the artifact to a private Supabase Storage bucket.
7. The frontend polls build status and receives short-lived download/flash URLs after success.

No arbitrary source code, shell commands, workflow names, or build paths may be accepted from the browser.

## Direct browser flasher

Use Espressif's `esptool-js` as the flashing engine, with a NEO_CLOCK-owned interface.

- Connect through Web Serial.
- Detect the ESP32-C3 before writing.
- Fetch the generated merged image directly from private Storage using a short-lived signed URL.
- Flash the single merged image at address `0x0000`.
- Use the metadata from the build package: DIO, 80 MHz, 4 MB.
- Show connection, erase/write progress, verification, reset, success, and recoverable errors.
- Warn clearly that a full merged image is a clean install and resets saved flash data.
- Do not begin flashing until the user explicitly presses the Flash button.

### PC and Android

PC Chrome/Edge is the primary reference environment.

Android is a first-version target and must be tested with:
- The user's proven [WebSerial USB Android APK v1.8](https://github.com/SchoepsLabs/webserial-android/releases/download/v1.8/WebSerialUSB-1.8.apk).
- USB OTG and the user's actual ESP32-C3 board.
- Native USB CDC and USB-to-serial bridges where available.

The APK is a supported test environment, not a mandatory app dependency for every visitor. If browser/USB compatibility is unavailable, keep merged and Advanced BIN downloads available.

The WebSerial USB project currently documents CDC-ACM as hardware-verified while CP210x, CH34x, and FTDI paths are not yet verified on physical hardware. Test the exact board/USB bridge before declaring Android compatibility broadly.

## Download guidance

### merged.bin

One 4 MB image written at flash address `0x0000`. It is the simplest clean-install option for PC tools and compatible Android flashing apps.

### Advanced BIN ZIP

Contains the separate bootloader, partition table, application, per-variant flash instructions, and build metadata. The Arduino variants also include `boot_app0.bin` at `0xE000`. Mochi uses a factory-app partition layout and does not require that file in its current merged image.

The exact offsets are validated against each merged image by the packaging script in `esp_clock/tools/package_firmware.py`. Never guess or share offsets between unrelated firmware packages.

## Backend isolation

The existing Supabase project `mazbayid-guestbook` remains untouched. A separate project now exists:

- Project: `neo-clock-firmware-builder`
- Project ref: `ymjhfaplponxbjhpvhuq`
- Region: `ap-southeast-1` (Singapore)
- Private Storage bucket: `firmware-artifacts`
- Database tables: `firmware_builds`, `firmware_build_artifacts`, and `firmware_build_rate_limits`

All three tables have RLS enabled and no public policies. Backend service-role access is required. The Storage bucket is private and limited to 20 MB per object.

## Delivery phases

1. Standardize and validate build artifacts in `MazBayID/esp_clock` (in progress in PR #8).
2. Implement GPIO validation and generated build configuration (generator and workflow inputs now added in PR #8; server-side validation remains to be wired).
3. Establish the isolated Supabase project, build-job tables, and private artifact bucket (completed); deploy Edge Functions and configure secrets next.
5. Build the dedicated GitHub Pages route and responsive configurator UI.
6. Integrate `esptool-js` and test on PC.
7. Test Android using WebSerial USB v1.8 and the user's ESP32-C3.
8. Publish only after all three variants pass clean-install flashing tests.

## Security and operational rules

- Keep GitHub credentials only in Supabase Edge Function secrets.
- Keep firmware artifacts private; return expiring signed URLs.
- Enforce variant, GPIO, file-size, and build-concurrency allow-lists on the server.
- Add per-client rate limiting and a bounded build queue.
- Preserve the official default GPIO map and firmware behavior when no customization is supplied.
- Never expose experimental microphone configuration in version 1.
