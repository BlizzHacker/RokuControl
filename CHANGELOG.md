# Changelog

## 2.1.0

Fixes for the problems people reported in Microsoft Store reviews ("didn't
work at all", "only volume works", "still doesn't work on the living room TV"),
plus keyboard control and power-on.

### Fixed
- The app opened pointed at the developer's own TVs (hard-coded IP addresses),
  so for everyone else no button did anything until they found and changed the
  device menu. Those entries are gone; the app now searches your network on
  launch and picks what it finds.
- Buttons failed silently. Every command now checks the Roku's answer and says
  what went wrong and how to fix it.
- Roku OS 14.1+ "Limited" mode (the reason only volume worked) is detected, and
  the app shows the exact setting to change.
- The fallback network scan tried 762 addresses one at a time with a 3-second
  timeout — up to ~38 minutes of spinner. It now probes your actual subnet in
  parallel in a couple of seconds.
- Discovery now asks on every network adapter, so VPNs and Hyper-V/WSL virtual
  adapters no longer swallow the search.
- A system or corporate proxy could intercept requests meant for the Roku; the
  app now always connects directly.
- The green "connected" dot was always green. Status is now a real check every
  few seconds.
- When the router gives a Roku a new IP, the app finds it again by serial number.
- The close button and window dragging were blocked by missing permissions.
- Rapid presses could arrive out of order; commands are now sent in sequence.
- Typed text now encodes spaces, symbols and accented letters correctly.
- Channel names with `&` showed as `&amp;`.

### Added
- **Turn on from off**: `PowerOn`, then Wake-on-LAN with retries.
- **Keyboard shortcuts** for every remote button, press-and-hold repeat.
- **Live typing** straight into the TV's search box.
- Real channel icons, a channel filter, "on now", and TV inputs by name.
- Add a Roku by IP, scan the whole network, forget old devices.
- Mini remote that stays on top.
- Help: troubleshooting steps, shortcut list, copy diagnostics.
- Report a problem / Suggest an idea — opens a pre-filled GitHub issue.
- MoveWeight.com and source code links in the footer.
- A one-time invitation to rate the app after ten minutes of use.
- CI (Linux + Windows) and a workflow that builds installers for all three OSes.

### Removed
- The volume slider. Rokus can't report their volume, so the slider only ever
  guessed; press-and-hold − / + is accurate.
