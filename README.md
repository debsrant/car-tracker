# AutoPulse (`car-tracker`)

AutoPulse is a zero-dependency, local-first Progressive Web App (PWA) for tracking vehicle fuel economy, service and repair visits, incidental vehicle expenses, maintenance interval reminders, and Google Drive receipt attachments. It runs offline in desktop and mobile browsers using IndexedDB (`AutoPulseDB`) and a Service Worker (`sw.js`), with optional GitHub cloud sync and Google Apps Script receipt uploads.

- **Live Deployment (GitHub Pages):** https://debsrant.github.io/car-tracker/
- **Repository:** https://github.com/debsrant/car-tracker
- **Runtime / Build Model:** Zero-dependency Vanilla HTML5, CSS3, and ES6 JavaScript (no `package.json`, Node build step, or bundler required). SheetJS (`0.20.3`) is loaded optionally via CDN (`defer` in `index.html`) for `.xlsx` imports when online.

---

## Site Stage (`LIVE` vs. `TEST`)

Configured via `config.js` (`window.AutoPulseConfig`), defaulting to **`LIVE`** mode:

| Mode | Header Badge | IndexedDB Name | Behavior |
| :--- | :--- | :--- | :--- |
| **`LIVE`** (default) | `LIVE SITE · AutoPulseDB` (green) | `AutoPulseDB` | Production data protection enabled: destructive factory reset UI is hidden and blocked (`App.resetToFactorySeed()`); backwards compatibility and non-destructive schema updates are required. |
| **`TEST`** (override) | `TEST SITE · AutoPulseDB_Test` (amber) | `AutoPulseDB_Test` | Isolated sandbox database; prefixes browser tab title with `[TEST] ` and enables the **Reset to Default Seed** control under **Data & Sync**. |

### Switching to `TEST` Mode Locally
- **URL query override:** Append `?stage=TEST` (e.g., `http://localhost:8080/?stage=TEST`)
- **`localStorage` override:** Set `localStorage.setItem("car-tracker:siteStage", "TEST")` in browser DevTools and reload (remove it or set `"LIVE"` to return to production).

---

## Quick Start & Verification

### Run Locally
1. **Direct file open:** Double-click `index.html` to run locally using IndexedDB (Service Worker and PWA install require `http://localhost` or `https://`).
2. **Local HTTP server (PWA / Service Worker enabled):**
   ```powershell
   python -m http.server 8080
   ```
   Open `http://localhost:8080` in Chrome or Microsoft Edge.

### Syntax Verification
No `package.json` scripts are required. Validate all JavaScript modules directly with Node.js:
```powershell
node --check config.js; node --check seed-data.js; node --check db.js; node --check app.js; node --check sw.js
```

---

## Architecture & Folder Structure

```text
car-tracker/
├── index.html                        # App shell, 5 view sections (Dashboard, Service Records, All History, Reminders, Data & Sync), and modals
├── styles.css                        # Dark/light theme variables, responsive layout, header stage badge, and print/table styles
├── config.js                         # Site stage detector (LIVE vs TEST), header badge mode, and IndexedDB isolation (AutoPulseDB vs AutoPulseDB_Test)
├── seed-data.js                      # Default baseline dataset (1 vehicle, 10 maintenance reminders, 103 chronological logs)
├── db.js                             # Browser-native IndexedDB wrapper (AutoPulseDB) with seed, export, and backup import helpers
├── app.js                            # Main application controller (KPIs, SVG charts, service checklist, reminder sync, GitHub & GDrive sync)
├── sw.js                             # Offline Service Worker cache shell (autopulse-pwa-v9)
├── manifest.json                     # PWA install manifest
├── icon.svg                          # App icon (SVG)
├── gemini.md                         # AI governance rules, data schemas, and event consolidation conventions
├── instructions.md                   # User setup guide for GitHub Pages, GitHub PAT sync, Google Apps Script Drive bridge, and usage
├── car-tracker.code-workspace        # Multi-root VS Code workspace pairing car-tracker with ../dev-hub
├── .gitignore                        # Ignores .env*, build artifacts, local backups, and raw office documents
├── autopulse-backup-2026-11-13.json  # Historical JSON export snapshot retained for reference
└── service history.docx              # Source dealership/DMV service history document parsed into seed-data.js
```

---

## Data, Sync & Integrations

- **Local Storage (`IndexedDB`):** Stores `vehicles`, `logs` (`fuel`, `service`, `other`), and `reminders` locally in `AutoPulseDB` (`AutoPulseDB_Test` when in `TEST` mode).
- **GitHub Cloud Sync:** Cross-device sync of `autopulse-data.json` via the GitHub REST API using either a Private GitHub Gist or a Repository file (`Data & Sync`).
- **Google Drive Receipt Uploads:** Sends receipt photos and PDFs as Base64 payloads to a user-deployed Google Apps Script Web App Bridge, storing files in Google Drive (`AutoPulse Receipts`) and attaching the view URL to the log record.
- **Import / Export:** Supports full JSON backup/merge, CSV export, direct `.xlsx` workbook import (`SheetJS`), and exporting the live IndexedDB directly as a formatted `seed-data.js` snapshot.

---

## Tracked `localStorage` Keys

| Key | Purpose |
| :--- | :--- |
| `car-tracker:siteStage` | Optional `"LIVE"` \| `"TEST"` stage override (`autopulse_site_stage` also supported) |
| `autopulse_theme` | UI theme preference (`"dark"` \| `"light"`) |
| `autopulse_active_vehicle` | Currently selected vehicle ID |
| `autopulse_gh_sync` | GitHub sync settings (`mode`, `token`, `gistId`, `repo`, `path`, `autoSync`, `lastSync`) |
| `autopulse_gdrive_cfg` | Google Drive Apps Script bridge settings (`scriptUrl`, `folderName`, `secretKey`) |
