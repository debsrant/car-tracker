# AutoPulse — Vehicle Tracker PWA Instructions

**AutoPulse** is a zero-dependency, local-first Progressive Web App (PWA) built with pure HTML, CSS, and vanilla JavaScript. It runs on **Windows** and **Android**, works offline via IndexedDB and a Service Worker, and comes pre-loaded with the **2017 Jeep Cherokee** history from `auto tracker.xlsx`.

---

## 1. Quick Start (Running Locally on Windows)

### Option A: Open Directly (Simplest)
1. Open File Explorer and go to `c:\Users\deb\Documents\car-tracker`.
2. Double-click **`index.html`** to open it in Chrome, Edge, or Firefox.
3. All data is saved automatically to your browser's local **IndexedDB** storage (`AutoPulseDB`).

### Option B: Run as an Installable Desktop App (`localhost`)
Browser security requires `http://localhost` or `https://` to enable the offline **Service Worker** and the **📲 Install App** button.
1. Open PowerShell or Command Prompt in `c:\Users\deb\Documents\car-tracker`:
   ```powershell
   python -m http.server 8080
   ```
2. Open `http://localhost:8080` in **Microsoft Edge** or **Google Chrome**.
3. Click **📲 Install App** in the top-right header (or the install icon in the browser's address bar) to install AutoPulse to your Windows Start Menu / Taskbar as a standalone window.

---

## 2. Hosting on GitHub Pages (Free Access on Android & Windows)

Hosting on **GitHub Pages** gives you a free `https://<your-username>.github.io/car-tracker/` URL so you can install the PWA as a native-style home-screen app on your **Android phone** and **Windows PC**.

### Step-by-Step GitHub Pages Setup

1. **Create a GitHub Repository**:
   - Sign in to [github.com](https://github.com) and click **New repository** (`+` icon in the top right).
   - **Repository name**: `car-tracker`
   - **Visibility**: Choose **Public** (free GitHub accounts require public repos for GitHub Pages; see Section 3 below for keeping your synced data private).
   - Click **Create repository**.

2. **Upload or Push Your Files**:
   - **Via Web Browser (No Git CLI needed)**:
     1. On your new repository page, click **uploading an existing file**.
     2. Drag and drop these 7 files from `c:\Users\deb\Documents\car-tracker`:
        - `index.html`
        - `styles.css`
        - `app.js`
        - `db.js`
        - `seed-data.js`
        - `manifest.json`
        - `sw.js`
        - `icon.svg`
        *(Optional: You do not need to upload `auto tracker.xlsx` if you want to keep the raw spreadsheet off the repo, though `seed-data.js` contains the initial 81 logs).*
     3. Click **Commit changes**.
   - **Via Git CLI (PowerShell in `c:\Users\deb\Documents\car-tracker`)**:
     ```powershell
     git init
     git add index.html styles.css app.js db.js seed-data.js manifest.json sw.js icon.svg instructions.md
     git commit -m "Initial commit of AutoPulse PWA"
     git branch -M main
     git remote add origin https://github.com/<your-username>/car-tracker.git
     git push -u origin main
     ```

3. **Enable GitHub Pages**:
   - In your GitHub repository, click **Settings** (top tab) → **Pages** (left sidebar).
   - Under **Build and deployment** → **Branch**, select **`main`** and folder **`/ (root)`**, then click **Save**.
   - Wait ~60 seconds and refresh the page. GitHub will display your live URL:
     `https://<your-username>.github.io/car-tracker/`

4. **Install on Your Android Phone**:
   - Open `https://<your-username>.github.io/car-tracker/` in **Chrome on Android**.
   - Tap the **📲 Install App** button in the top bar (or tap the Chrome `⋮` menu → **Add to Home screen / Install app**).
   - AutoPulse will appear in your Android app drawer with its own icon and run full-screen offline!

---

## 3. Can Data Be Stored & Synced via GitHub Pages?

### How GitHub Pages Works
By itself, **GitHub Pages is a static web host**—when you visit `https://<username>.github.io/car-tracker/`, it serves the HTML/JS files to your device, and your changes are saved inside that specific device's browser (`IndexedDB`). A static web server cannot accept database writes on its own without authentication.

### YES — You Can Sync Across Devices Using GitHub's API (Built Into AutoPulse!)
Because GitHub provides a free REST API, **AutoPulse includes a built-in `☁️ GitHub Cloud Sync` feature** (under the **💾 Backup, Sync & Vehicles** tab). It lets your browser read and write your `autopulse-data.json` directly to GitHub using a **Personal Access Token (PAT)** stored only in your device's `localStorage`.

You have **two GitHub sync modes** to choose from:

| Sync Mode | How It Works | Pros & Cons |
| :--- | :--- | :--- |
| **1. Private GitHub Gist (Recommended)** | Saves `autopulse-data.json` to a **Secret Gist** on your GitHub account. | • **100% Private**: Even though your GitHub Pages app repo is public, your Secret Gist is private.<br>• **Instant**: Updates immediately without triggering a 60-second GitHub Pages site rebuild. |
| **2. GitHub Repository File** | Commits `autopulse-data.json` directly into your `username/car-tracker` repository. | • Keeps your code and latest data file in the exact same repo.<br>• Every save creates a Git commit in your repo history. |

### How to Set Up GitHub Cloud Sync (Windows ↔ Android)

1. **Create a GitHub Personal Access Token (One-Time Setup)**:
   - On GitHub, click your profile picture (top right) → **Settings** → **Developer settings** (bottom of left sidebar) → **Personal access tokens** → **Tokens (classic)** (or Fine-grained tokens).
   - Click **Generate new token (classic)**.
   - Note: `AutoPulse Sync`, Expiration: `No expiration` (or `1 year`).
   - Check the **`gist`** checkbox (for Private Gist mode) and/or **`repo`** checkbox (if you want Repository File mode).
   - Click **Generate token** and copy the `ghp_...` token.

2. **Connect Your First Device (e.g., Windows PC)**:
   - Open AutoPulse → go to **💾 Backup, Sync & Vehicles**.
   - Under **☁️ GitHub Cloud Sync**, choose **Private GitHub Gist (Recommended)** and paste your token into **GitHub Personal Access Token (PAT)**.
   - Leave **Gist ID** blank and click **⬆️ Push to GitHub**.
   - AutoPulse will automatically create a secret Gist, upload your database, and fill in your new **Gist ID**!
   - *(Optional)* Check **Auto-push to GitHub whenever I save/edit an entry** so every new fill-up pushes automatically.

3. **Connect Your Second Device (e.g., Android Phone)**:
   - Open AutoPulse on your phone → **💾 Backup, Sync & Vehicles**.
   - Paste the same **Token** and **Gist ID** (or `owner/repo` if using Repo mode).
   - Click **⬇️ Pull from GitHub** to download the latest logs onto your phone, and enable **Auto-push**!

---

## 4. Using AutoPulse Features

### Switching & Adding Vehicles (Multi-Vehicle Garage)
- **Switch Active Vehicle**: Use the vehicle dropdown in the **Top Header**, the **Dashboard Active Vehicle Bar**, the **Event History Toolbar**, or the **Service Reminders Toolbar**.
- **Add a New Vehicle**:
  - Select **`＋ Add New Vehicle...`** from any vehicle dropdown, OR
  - Click **＋ Vehicle** in the header, **＋ New Vehicle** on the Dashboard, or **＋ Add New Vehicle** directly inside the **Log Vehicle Event** popup.
- **Edit Vehicle Details**: Click **✏️ Edit Vehicle** on the Dashboard or in the **Garage** section of the Data tab.

### Logging Fuel, Maintenance, or Repairs
1. Click **＋ Log Event** (top right) or **＋ Log Fuel / Service** on the Dashboard.
2. Confirm the **Vehicle** at the top of the form (if you switch vehicles here, the default odometer automatically updates to that vehicle's latest mileage + 300 mi).
3. Choose **Event Type**:
   - **⛽ Fuel Fill-Up**: Enter Date, Odometer, Station, and any two of **Gallons**, **Price / Gal**, or **Total Cost** (the third is calculated automatically). MPG is automatically calculated from the distance since your previous fuel entry divided by gallons pumped. The Dashboard displays both **Fuel Economy Trend (MPG)** and **Fuel Operating Cost ($/Mile)** trend charts.
   - **🔧 Maintenance** or **🛠️ Repair**: Enter the Service/Part Item, Total Cost, Shop/Location, and Notes.
4. Click **Save Entry**.

### Service & Filter Reminders
- Open the **🔧 Service Reminders** tab to view intervals (such as your imported **Fuel Filter** and **Engine Oil & Filter** reminders).
- Reminders turn **amber (`Due / Expired`)** when either the target calendar date passes or the vehicle's odometer reaches the target mileage.
- Click **✓ Mark Done Today** on any reminder card to automatically advance its start date/odometer to today's values.

### Manual Backups & Excel Import
- **JSON Backup**: Click **⬇ Download Full JSON Backup** under **💾 Backup, Sync & Vehicles** to save a complete snapshot of all vehicles, logs, and reminders.
- **CSV Export**: Click **📊 Export Logs to CSV** to open your history in Excel or Google Sheets.
- **Excel Re-Import**: Use **Direct Excel Importer (`auto tracker.xlsx`)** to import `.xlsx` workbooks formatted like your original tracker.
- **Factory Reset**: Click **↺ Reset to Default Seed** to restore the original 81 Jeep Cherokee records from `seed-data.js`.
