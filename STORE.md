# Publishing to the Microsoft Store

Roku Control is an MSIX product in Partner Center (Store ID `9MTNNGZKJ1WK`,
package identity `MOVEWEIGHT.RokuControl`). The *Build installers* workflow
builds the app and packs the Store `.msix` with the Windows SDK's `makeappx`
from `msix/AppxManifest.xml`. Partner Center signs the package on upload.

## Before every release

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/tauri.conf.json` and `msix/AppxManifest.xml` (`2.1.0` → `2.1.0.0`).
   The Store only accepts a version higher than the one it has.
2. Update `CHANGELOG.md` and the "What's new" block in `STORE-LISTING.txt`.

## Build and publish the release

Actions → **Build installers** → **Run workflow** on `master`:

- **release:** the tag to publish, e.g. `v2.1.0`. The installers and the
  `.msix` are attached to a GitHub release with that tag.
- **store:** tick it to also submit the `.msix` to the Store (see below).

## Submit to the Store

### Option A — automatically from GitHub (one-time setup)

1. Partner Center → **Account settings** → **User management** →
   **Azure AD applications** → **Add Azure AD application** (create a new one),
   role **Manager**. Create a **key** for it.
2. Note the **Tenant ID**, **Client ID** and the key (client secret), and your
   **Seller ID** (Account settings → Legal info → Developer tab).
3. GitHub → repository **Settings** → **Secrets and variables** → **Actions**,
   add: `PARTNER_CENTER_TENANT_ID`, `PARTNER_CENTER_CLIENT_ID`,
   `PARTNER_CENTER_CLIENT_SECRET`, `PARTNER_CENTER_SELLER_ID`.

From then on, running the workflow with **store** ticked uploads the package
and submits it for certification using Microsoft's `msstore` CLI.

### Option B — by hand

1. Download `RokuControl_<version>_x64.msix` from the GitHub release.
2. Partner Center → Apps and games → **Roku Control** → **Start update**.
3. **Packages:** upload the `.msix`; remove the previous version's package.
4. **Store listings:** paste the description and "What's new" from
   `STORE-LISTING.txt`; refresh screenshots if the UI changed.
5. **Properties:** privacy policy URL
   `https://github.com/BlizzHacker/RokuControl/blob/master/privacy.txt`.
6. **Submit for certification.**

## Certification notes

- Capabilities: `runFullTrust` (restricted — it's a desktop app; the
  justification is "Tauri desktop app, runs as a full-trust Win32 process"),
  `privateNetworkClientServer` (talking to Rokus on the LAN) and
  `internetClient`.
- Common rejections: the app must launch on a clean machine, the privacy
  policy URL must load, and the listing must only describe features the app
  has.
- Screenshots (1366×768 PNG, at least 1): main remote, channels grid, mini
  remote, help/shortcuts.

## Cost

$19 one-time Partner Center registration for individuals. Publishing free apps
costs nothing, and the app has no backend.
