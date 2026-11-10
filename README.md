# Open Remote Control

A free desktop remote for Roku and Android TV / Google TV. It runs on Windows, macOS and Linux, talks directly to TVs on your local network, and needs no account, ads or tracking.

The public repository keeps its historical name, `BlizzHacker/RokuControl`; the Microsoft Store product is branded **Open Remote Control**. Its Store product ID and MSIX package identity are unchanged.

## Supported TVs

- **Roku TVs and players:** automatic network discovery, manual IP setup, Roku-style directional controls, channel and app launching, keyboard typing, input selection, Limited Mode diagnostics, and wake assistance.
- **Android TV and Google TV:** manual IP pairing with the six-character code shown by Android TV Remote Service, directional controls, Back, Home, playback, volume, mute, standby and wake commands.

Android TV support requires the TV's Android TV Remote Service to be available on the local network. Pairing is approved on the TV itself. The app stores its local pairing identity in its application-data folder so it can reconnect after restart.

## Install from source

```bash
git clone https://github.com/BlizzHacker/RokuControl.git
cd RokuControl
npm ci
npm run tauri:dev
```

Build an installer for the current operating system with `npm run tauri:build`. The build workflow creates Windows, macOS and Linux installers and the Microsoft Store MSIX.

## Roku notes

Roku OS 14.1 and later can reject key presses when **Settings › System › Advanced system settings › Control by mobile apps** is Limited or disabled. Open Remote Control detects the rejection and shows the fix. For Roku TV wake from a deep sleep, enable **Fast TV start**; Wake-on-LAN only works when the TV's network hardware remains able to receive it.

## Android TV notes

Choose Android TV / Google TV in **Pair or manage TVs**, enter the TV's IP address, then type the short code displayed on the television. This uses Android TV Remote Service's local encrypted pairing and control connections, not ADB. If a TV does not expose that service, it cannot be paired by this version.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Arrow keys | Move |
| Enter | OK |
| Backspace / Esc | Back |
| H | Home |
| Space or P | Play / Pause |
| `,` / `.` | Rewind / Fast forward |
| `+` / `−` / M | Volume / Mute |
| `?` | Show shortcuts |

## Privacy

Device details and the Android TV pairing identity stay on your computer. The app does not collect telemetry or send commands through a cloud service. See [privacy.txt](privacy.txt).

## License

MIT. Roku, Android TV and Google TV are trademarks of their respective owners. Open Remote Control is independent and unaffiliated.
