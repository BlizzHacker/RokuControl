# Roku Control

A project of the [Move Weight Foundation](https://foundation.moveweight.com), a
501(c)(3).

**Cross-platform desktop remote for Roku TVs & devices.**
Linux · macOS · Windows — one codebase, native binaries.

Built with **Tauri** (Rust + React). ~5MB binary. No Electron bloat.

## Your Devices

| Device | IP | Room |
|--------|-----|------|
| Hisense 58" Roku TV | `192.168.0.126` | Wade's Room |
| onn. 32" Roku TV | `192.168.0.124` | Alyra's Room |

Pre-configured — appear instantly on launch. SSDP auto-discovery finds any additional Rokus.

## Quick Start

```bash
npm install
npm run tauri:dev      # dev mode with hot reload
```

## Build

```bash
npm run tauri:build         # build for current OS
npm run tauri:build:win     # Windows .msi
npm run tauri:build:mac     # macOS .dmg
npm run tauri:build:linux   # Linux .deb + .AppImage
```

Binaries land in `src-tauri/target/release/bundle/`.

## Windows Store

Submit as a **Win32 desktop app** via [Partner Center](https://partner.microsoft.com/).

**Cost:** $19 one-time individual registration. Free apps = zero ongoing fees.

**Steps:**
1. Register at https://partner.microsoft.com (need Microsoft account + $19)
2. Reserve the name "Roku Control"
3. Build: `npm run tauri:build:win`
4. Get the `.msi` from `src-tauri/target/release/bundle/msi/`
5. Package as MSIX using [MSIX Packaging Tool](https://learn.microsoft.com/en-us/windows/msix/packaging-tool/tool-overview) (free from Microsoft Store)
6. Upload to Partner Center with:
   - Store listing (name, description, screenshots)
   - Privacy policy URL (see below)
   - Age rating questionnaire
   - Pricing: **Free**

**Privacy policy:** Host at any URL (GitHub Pages is free). See `privacy.txt` for content.

## Privacy

Roku Control does not collect, store, or transmit any personal data. All communication is strictly between the app and Roku devices on your local network. No analytics, no telemetry, no tracking, no internet dependency.

## How It Works

Communicates directly with Roku devices via [External Control Protocol](https://developer.roku.com/docs/developer-program/dev-tools/external-control-api.md) on port 8060.

- **SSDP multicast** (`239.255.255.250:1900`) for device discovery
- **HTTP REST** for keypresses, app launching, device queries
- **Zero internet required** — everything runs on LAN

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri 2 (Rust) |
| UI | React 19 + Vite |
| Networking | reqwest (async HTTP) |
| Discovery | SSDP multicast (UDP) |

## License

MIT
