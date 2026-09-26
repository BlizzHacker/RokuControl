# Roku Control

A free desktop remote for Roku TVs and streaming players. Every button on the
physical remote, your keyboard as a remote, live typing into search boxes,
channel launching with real channel art, and a Turn on button that can wake a
TV from standby — in a native window on Windows, macOS or Linux. One Tauri
(Rust + React) codebase, a binary around 5 MB.

No ads, no accounts, no tracking. The app only ever talks to the Rokus on your
own network.

## Get it

- **Microsoft Store** — search for *Roku Control* (Windows).
- **Installers** — Windows, macOS and Linux downloads are on the
  [latest release](https://github.com/BlizzHacker/RokuControl/releases/latest).
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

## What it does

- **Finds your Rokus by itself** on launch — SSDP on every network adapter, and
  a direct scan of your subnet when multicast is blocked. Add one by IP if you
  need to. Devices are remembered by serial number, so when your router hands a
  Roku a new address the app follows it.
- **Honest status** — the dot next to your Roku reflects a real check every few
  seconds: connected, screen off, not responding, or Limited mode.
- **Turn on from off** — sends `PowerOn`, and if the TV has dropped off the
  network, Wake-on-LAN to every MAC address it has seen for it, then keeps
  knocking until the TV answers.
- **Your keyboard is a remote** (see below), with press-and-hold repeat on the
  arrows and volume.
- **Live typing** — type into the app and the letters appear in the TV's
  search box as you type, including accents and symbols. Fix a typo anywhere
  and the TV follows.
- **Channels** with their real icons, a filter, and "on now"; **TV inputs** by
  the names you gave them on the TV.
- **Mini remote** (📌) — a compact remote that stays on top of other windows.
- **Straight-to-GitHub feedback** — *Report a problem* and *Suggest an idea*
  open a pre-filled GitHub issue (Roku model and software version only — never
  IPs, names or serials). Nothing is sent until you press Submit.

## Keyboard shortcuts

| Key | Does |
|-----|------|
| ↑ ↓ ← → | Move |
| Enter | OK |
| Backspace / Esc | Back |
| H | Home |
| Space or P | Play / Pause |
| `,` / `.` (or `[` / `]`) | Rewind / Fast forward |
| R | Instant replay |
| I or `*` | Options |
| S | Search |
| `+` / `−` / M | Volume up / down / mute |
| Page Up / Page Down | Channel up / down |
| `/` or T | Start typing on the TV (Esc to stop) |
| `?` | Show all shortcuts |

## If something doesn't work

**Only volume works, or the app says your Roku is blocking it.** Roku OS 14.1
and later ship in *Limited* mode. On the Roku open
**Settings › System › Advanced system settings › Control by mobile apps** and
choose **Enabled** (or set **Network access** to **Permissive**).

**Turn on doesn't wake the TV.** A Roku TV that is fully off switches its
network off too. Turn on **Settings › System › Power › Fast TV start**.

**No Roku found.** Put the computer on the same network as the Roku (not a
guest network). On Windows, set that network to *Private*. You can always add a
Roku by IP — it's under **Settings › Network › About** on the Roku.

Still stuck? Use **Report a problem** in the app, or
[open an issue](https://github.com/BlizzHacker/RokuControl/issues/new/choose).

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
| Networking | reqwest (plain HTTP, no proxy) |
| Discovery | SSDP multicast + subnet probe |
| Wake | Wake-on-LAN magic packets |

Run the Rust tests (they include a fake Roku to talk to) with
`cd src-tauri && cargo test`.

## Privacy

Roku Control does not collect or transmit any personal data. All
communication is strictly between the app and Roku devices on your local
network. No analytics, no telemetry, no tracking. See [privacy.txt](privacy.txt).

## Credits

Made ad-free by [MoveWeight.com](https://moveweight.com). If the app helps
you, a rating in the Microsoft Store or a star here is how other people find it.

## License

MIT — see [LICENSE](LICENSE).
