# Connectome IDE MSIX packaging

This folder packages the production Electron layout as an x64 MSIX for the Microsoft Store. The source project and GitHub product remain **Connectome**; **Connectome IDE** is the Store-facing display name.

The `Assets` folder includes target-size `altform-unplated` and `altform-lightunplated` variants of the Connectome icon. These variants prevent Windows from adding a colored square or rounded plate around the icon in Start, the taskbar, Alt+Tab, and Task View. Keep these files alongside `Square44x44Logo.png` when changing the product icon.

## Partner Center identity

Before creating a Store submission package, open the reserved **Connectome IDE** product in Partner Center, then go to **Product management → Product identity**. Copy these values exactly into `store-identity.json`:

- `Package/Identity/Name` → `identityName`
- `Package/Identity/Publisher` → `publisher`
- `Package/Properties/PublisherDisplayName` → `publisherDisplayName`

The build intentionally stops while any `REPLACE_WITH_...` value remains. The reserved display name is not necessarily the package identity name.

## Build

From the repository root:

```powershell
.\scripts\package-msix.ps1
```

This rebuilds the unpacked production application and writes an unsigned Store package beneath `artifacts/msix/`. To reuse a current `applications/desktop/dist/win-unpacked` directory:

```powershell
.\scripts\package-msix.ps1 -SkipBuild
```

Partner Center signs the accepted Store package. For local installation only, pass a test certificate whose subject exactly matches the configured publisher:

```powershell
.\scripts\package-msix.ps1 -SkipBuild -CertificatePath C:\path\to\test.pfx
```

Do not commit certificates or passwords. App launch, Store association, installation, and Windows App Certification Kit testing are user-owned validation steps.
