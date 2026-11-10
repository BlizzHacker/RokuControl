# Changelog

## 2.1.2 — Open Remote Control

### Added
- Android TV / Google TV pairing with the code displayed by Android TV Remote Service.
- Core Android TV remote controls for navigation, playback, volume, mute, wake and standby.
- A unified TV list and platform-aware controls for Roku and Android TV.

### Changed
- Rebranded the app display name and Microsoft Store listing to **Open Remote Control**.
- Preserved the existing Store product ID and package identity.
- Updated the Store listing, privacy policy and help content for both supported TV families.

### Retained
- Roku automatic discovery, manual IP setup, ECP response checking, Limited Mode guidance, Wake-on-LAN and Fast TV Start instructions.
- Roku app/channel launch, input switching, keyboard shortcuts and live text entry.

## 2.1.0

Fixes for the problems people reported in Microsoft Store reviews ("didn't work at all", "only volume works", "still doesn't work on the living room TV"), plus keyboard control and power-on.

### Fixed
- Removed hard-coded household TVs; the app now searches the network on launch.
- Commands check the Roku response and explain failures, including Roku OS 14.1+ Limited mode.
- Discovery scans each network adapter and probes the subnet in parallel when SSDP is blocked.
- Requests connect directly instead of going through a system proxy.
- Status checks report the actual connection, and saved Roku devices follow DHCP address changes by serial number.
- Rapid presses are sent in sequence; typed text handles spaces, symbols and accented letters.

### Added
- Power On and Wake-on-LAN retries for Roku TVs, keyboard shortcuts, live typing, channel icons, TV inputs, mini remote, help and diagnostics.
- Add a Roku by IP, scan the network and manage saved devices.
- CI and installer workflows for Windows, macOS and Linux.

### Removed
- The volume slider; Roku does not report volume, so the previous slider could only guess.
