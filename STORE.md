# Microsoft Store recovery and release notes

## Existing product identity

- Store product ID: `9MTNNGZKJ1WK`
- Current MSIX identity name: `MOVEWEIGHT.RokuControl`
- Publisher: `CN=6375D74B-5E4F-45B4-B246-B29507C1332A`
- Product name for the English Store listing: **Open Remote Control**

Keep the Store ID, MSIX Identity Name, publisher certificate identity, and Tauri `identifier` unchanged. The rebrand changes the display name and app content only. Do not create a new Store product.

## Why Microsoft removed the product

The October 10, 2026 certification report rejected the Store product name under policy 10.1.1.1, **Inaccurate Representation**: the name “Roku Control” was found to contain the title of another software or service. The September 24 report gave a deadline to submit a name update by October 8. The product was removed after that deadline. The draft submission still listed Store listings as unchanged, even though the package was updated to 2.1.1.

Partner Center now says the removed product cannot be submitted until the publisher contacts its Microsoft representative. Include product ID `9MTNNGZKJ1WK` in that request. Once Microsoft re-enables submission for this same product, update the Store listing name and text, upload version 2.1.2, review the existing submission, and submit for certification.

## Package build

The package workflow builds the app for Windows, macOS and Linux, then packs the Windows executable with `msix/AppxManifest.xml`. Microsoft signs the MSIX after upload.

1. Bump the version consistently in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `msix/AppxManifest.xml`. The current version is 2.1.2.
2. Run `npm ci`, `npm run build`, and `cd src-tauri && cargo test`.
3. Run the **Build installers** GitHub Actions workflow. It attaches the MSIX and desktop installers.
4. Do not run automatic Store publishing while Partner Center marks this product removed. After Microsoft restores the existing product, the existing package can be uploaded to the same listing.

## Partner Center update checklist

After Microsoft restores the product for submission:

1. Open product `9MTNNGZKJ1WK` and resume its existing draft.
2. In **Store listings**, set English **Product name** to exactly `Open Remote Control`; update the description, features and What's new from `STORE-LISTING.txt`.
3. Keep the existing listing languages and product identity.
4. In **Packages**, replace the draft package with `OpenRemoteControl_2.1.2.0_x64.msix`. The MSIX identity remains `MOVEWEIGHT.RokuControl`.
5. Review screenshots and privacy URL, confirm the age ratings and submission options remain valid, then inspect the final review page.
6. Submit only after the listing title and package show the new values.

## Store package identity

`msix/AppxManifest.xml` uses the Store identity `MOVEWEIGHT.RokuControl` and publisher certificate specified above. The app's Tauri identifier remains `com.moveweight.roku-control` so existing app-data and local preferences continue to resolve.

## Certification notes

- Required capabilities: `runFullTrust` (Tauri desktop process), `privateNetworkClientServer` (LAN TV control) and `internetClient` (links the user chooses to open).
- Android TV support uses Android TV Remote Service over local TLS. The user authorizes pairing by entering the code displayed on the TV. Its client certificate and private key are stored only in the user's app-data folder.
- Store listing must describe only Roku and Android TV / Google TV features implemented by this package.
- Privacy policy: `https://github.com/BlizzHacker/RokuControl/blob/master/privacy.txt`.
