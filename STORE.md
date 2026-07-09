# Windows Store Submission Checklist

## Cost
- **$19** — one-time Microsoft Partner Center individual registration
- **$0** — publishing free apps costs nothing
- **$0** — no ongoing fees, ever

## Step-by-step

### 1. Register Developer Account
- Go to https://partner.microsoft.com
- Sign in with Microsoft account
- Pay $19 (one-time)
- Wait for approval (usually instant)

### 2. Reserve App Name
- Partner Center → Apps & games → New product → MSIX or PWA app
- Reserve "Roku Control"

### 3. Build the App
```bash
npm run tauri:build:win
```
Output: `src-tauri/target/release/bundle/msi/`

### 4. Convert MSI to MSIX
- Install MSIX Packaging Tool from Microsoft Store (free)
- Open it → "Application package" → pick the Roku Control .msi
- The tool creates a signed .msix

### 5. Submit in Partner Center

**App identity:** (from your reserved name)
```
Publisher: CN=<your-certificate>
Package identity: <reserved-name>
```

**Store listing:**
```
Name: Roku Control
Description: Control any Roku TV or device on your local network. 
Beautiful dark theme, widget mode, app launcher. No ads. No tracking. Free.
Category: Utilities & tools
Subcategory: Remote & control
Price: Free
```

**Privacy policy URL:** 
Host `privacy.txt` at any URL (GitHub Pages, your domain, etc.)
Example: `https://moveweight.com/roku-control-privacy`

**Age rating:**
- No violence, no gambling, no user-generated content
- Answer the questionnaire honestly → will get "E for Everyone" or equivalent

**Screenshots needed (1366×768 PNG):**
1. Main remote with D-pad
2. App launcher grid
3. Widget mode floating on desktop

**Package:** Upload the .msix from step 4.

### 6. Certification
Microsoft runs automated tests (~3 hours). Common rejection reasons:
- App crashes on launch → test on clean machine
- Missing privacy policy → host it publicly
- Age rating missing → complete questionnaire
- Wrong capabilities declared → we only need `internetClientServer` + `privateNetworkClientServer`

## Free forever
- No Microsoft cut for free apps
- No renewal fee for the dev account (one-time $19)
- The app has no backend costs — it's LAN-only
