# Roku Control

A project of the [Move Weight Foundation](https://foundation.moveweight.com), an
Oklahoma non-profit corporation with 501(c)(3) status pending.

A desktop remote for Roku TVs and streaming devices. Every button on the
physical remote, plus channel launching and instant device switching, in a
native window on Linux, macOS or Windows — one Tauri (Rust + React) codebase,
a binary around 5 MB.

Your Rokus are found automatically: the app sends an SSDP discovery broadcast
on launch and lists every Roku that answers, and you can add one by IP if your
network blocks multicast. Everything happens on your LAN — the app never
touches the internet.

## Get it

- **Microsoft Store** — search for *Roku Control* (Windows).
- **From source** — any OS:

```bash
git clone https://github.com/BlizzHacker/RokuControl.git
cd RokuControl
npm install
npm run tauri:dev
```

That's a live dev build with hot reload. To produce a real installer:

```bash
npm run tauri:build         # current OS
npm run tauri:build:win     # Windows .msi
npm run tauri:build:mac     # macOS .dmg
npm run tauri:build:linux   # Linux .deb + .AppImage
```

Installers land in `src-tauri/target/release/bundle/`.

> Build through `npm run tauri:build`, not `cargo build` directly — the Tauri
> script builds the web frontend first. A bare cargo build packages an empty
> frontend and you get a blank window that looks like a broken app.

## How it works

Roku devices expose the
[External Control Protocol](https://developer.roku.com/docs/developer-program/dev-tools/external-control-api.md)
on port 8060: plain HTTP for keypresses, app launching and device queries. The
app discovers devices with an SSDP multicast query (`239.255.255.250:1900`) and
then talks straight to each Roku.

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri 2 (Rust) |
| UI | React 19 + Vite |
| Networking | reqwest (async HTTP) |
| Discovery | SSDP multicast (UDP) |

## Privacy

Roku Control does not collect, store, or transmit any personal data. All
communication is strictly between the app and Roku devices on your local
network. No analytics, no telemetry, no tracking, no internet dependency.

## License

MIT — see [LICENSE](LICENSE).
