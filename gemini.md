# Gemini Rules & Project Architecture Reference (AutoPulse)

This document tracks guidelines, conventions, entity models, schema definitions, and persistent variables for the AutoPulse application to ensure consistent AI code generation and modifications.

---

## 1. Project Overview & Architecture
AutoPulse is a zero-dependency, local-first Progressive Web App (PWA) built with vanilla HTML5, modern CSS, and ES6 JavaScript.

- **Storage Engine**: Browser-native IndexedDB (`AutoPulseDB`), versioned via `db.js`.
- **Sync Mechanism**: Optional cross-device sync to GitHub (Private Gist or Repo file) via GitHub REST API without third-party servers.
- **File / Receipt Storage**: Google Drive integration (Option 4A: Google Apps Script Web App Bridge). The PWA sends base64 files directly to the user's deployed script; receipts are stored in the user's Google Drive folder, returning a public/view link stored in the log record.
- **Offline Capabilities**: Full service worker caching (`sw.js`). PWA installable on desktop and mobile.

---

## 2. UI / UX Design Guidelines
- **Minimalist Iconography**: Strictly limit the use of emojis and icons across navigation tabs, buttons, badges, tables, and alert cards. Use clean, professional typographic labels (e.g., "Fuel", "Service", "Other", "Dashboard", "Event History", "Reminders", "Data & Sync") rather than emoji prefixes.
- **Theme Support**: Dark theme by default, with light mode toggle persisted in `localStorage` under `autopulse_theme`.
- **Responsive Navigation**: Desktop sticky header + desktop navigation bar; mobile sticky header + fixed bottom navigation bar.

---

## 3. Data Schema & Variables

### 3.1 Event Log Entry Model (`logs` store in IndexedDB)
```typescript
interface LogEntry {
  id: string;                      // e.g. "log_m3abc123" or "F447"
  vehicleId: string;               // Links to vehicle id (e.g. "veh_1C4PJMCS1HW569660")
  type: "fuel" | "service" | "other"; // Standardized event category
  date: string;                    // "YYYY-MM-DD"
  odometer: number;                // Mileage at time of event
  location: string;                // Station, shop, store, or vendor name
  notes: string;                   // Optional notes, rewards info, etc.
  totalCost: number;               // Total amount paid (USD)
  
  // Type = "fuel" specific fields:
  volume?: number;                 // Gallons pumped
  pricePerGal?: number;            // Price per gallon
  fuelGrade?: string;              // e.g. "87 Gasoline"

  // Type = "service" or "other" specific fields:
  serviceItem?: string;            // Description of service, repair, or other expense (e.g., "Oil Change & Brake Pads", "Tolls", "Car Wash")

  // Receipt attachment (Option 4A Google Drive):
  receipt?: {
    name: string;                  // Clean filename e.g. "2026-11-13_26000mi_service_shop.jpg"
    url: string;                   // Google Drive webViewLink or direct URL
    driveFileId?: string;          // Google Drive file ID
    mimeType?: string;             // MIME type (image/jpeg, application/pdf, etc.)
  } | null;
}
```

### 3.2 Vehicle Model (`vehicles` store)
```typescript
interface Vehicle {
  id: string;                      // e.g. "veh_1C4PJMCS1HW569660"
  vin: string;
  brand: string;
  model: string;
  year: number;
  name: string;                    // e.g. "2017 Jeep Cherokee"
  license: string;
  purchaseDate: string;            // "YYYY-MM-DD"
  purchasePrice: number;
  purchasedFrom: string;
  initialOdometer: number;
}
```

### 3.3 Reminder Model (`reminders` store)
```typescript
interface Reminder {
  id: string;                      // e.g. "rem_71fbf8a6"
  vehicleId: string;
  title: string;                   // e.g. "Fuel Filter"
  startDate: string | null;
  dueDate: string | null;
  startOdometer: number | null;
  dueOdometer: number | null;
  intervalMiles?: number | null;
  intervalMonths?: number | null;
  notes?: string;
}
```

---

## 4. LocalStorage Keys & State Variables
- `autopulse_theme`: `"dark"` | `"light"`
- `autopulse_active_vehicle`: ID of currently selected vehicle
- `autopulse_gh_sync`: JSON stringified configuration for GitHub sync (`mode`, `token`, `gistId`, `repo`, `path`, `autoSync`, `lastSync`)
- `autopulse_gdrive_cfg`: JSON stringified configuration for Google Drive bridge (`scriptUrl`, `folderName`, `secretKey`)

---

## 5. Event Types & Consolidation Rules
1. **`fuel`**: Gas / diesel fill-ups. Requires odometer, volume (gal), price per gal, and total cost. Computes MPG against the previous fuel log.
2. **`service`**: Consolidated maintenance and repair operations. Maintenance and repairs frequently appear on the same invoice; combining them eliminates ambiguity and redundant entries.
3. **`other`**: Non-mechanical / incidental vehicle expenses such as tolls, parking fees, car washes, detailing, accessories, registration, inspections, and taxes.

*Legacy compatibility note: No need to maintain legacy functions or dual maintenance/repair structures when making changes to the codebase.*
