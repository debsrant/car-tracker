// Main Application Controller for AutoPulse Local-First PWA
window.App = {
  vehicles: [],
  logs: [],
  reminders: [],
  activeVehicleId: null,
  computedLogs: [],
  deferredInstallPrompt: null,
  returnToLogModalAfterVehicleAdd: false,
  pendingReceiptFile: null,

  async init() {
    this.initTheme();
    this.initServiceWorkerAndInstall();
    this.loadGhSettings();
    this.loadDriveSettings();
    await AutoPulseDB.init();
    await this.reloadAllData();
  },

  initTheme() {
    const saved = localStorage.getItem("autopulse_theme") || "dark";
    if (saved === "light") {
      document.documentElement.classList.add("light");
    }
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
      btn.textContent = document.documentElement.classList.contains("light") ? "Dark Mode" : "Light Mode";
      btn.addEventListener("click", () => {
        document.documentElement.classList.toggle("light");
        const isLight = document.documentElement.classList.contains("light");
        localStorage.setItem("autopulse_theme", isLight ? "light" : "dark");
        btn.textContent = isLight ? "Dark Mode" : "Light Mode";
      });
    }
  },

  initServiceWorkerAndInstall() {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    const installBtn = document.getElementById("installPwaBtn");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      if (installBtn) installBtn.style.display = "inline-flex";
    });

    if (installBtn) {
      installBtn.addEventListener("click", async () => {
        if (!this.deferredInstallPrompt) return;
        this.deferredInstallPrompt.prompt();
        await this.deferredInstallPrompt.userChoice;
        this.deferredInstallPrompt = null;
        installBtn.style.display = "none";
      });
    }
  },

  async reloadAllData() {
    this.vehicles = await AutoPulseDB.getAll("vehicles");
    this.logs = await AutoPulseDB.getAll("logs");
    this.reminders = await AutoPulseDB.getAll("reminders");

    const savedVehId = localStorage.getItem("autopulse_active_vehicle");
    if (savedVehId && this.vehicles.some((v) => v.id === savedVehId)) {
      this.activeVehicleId = savedVehId;
    } else if (this.vehicles.length > 0) {
      this.activeVehicleId = this.vehicles[0].id;
    }

    this.renderVehicleSelectors();
    this.computeAndRenderActiveVehicle();
  },

  getActiveVehicle() {
    return this.vehicles.find((v) => v.id === this.activeVehicleId) || this.vehicles[0] || null;
  },

  renderVehicleSelectors() {
    const optionsHtml =
      this.vehicles
        .map((v) => `<option value="${v.id}" ${v.id === this.activeVehicleId ? "selected" : ""}>${this.escape(v.name)} (${this.escape(v.license || "No Plate")})</option>`)
        .join("") + `<option value="__new__">+ Add New Vehicle...</option>`;

    const selectorIds = ["vehicleSelect", "dashboardVehicleSelect", "logsVehicleSelect", "remindersVehicleSelect"];
    selectorIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = optionsHtml;
      el.value = this.activeVehicleId || "";
      el.onchange = (e) => {
        if (e.target.value === "__new__") {
          e.target.value = this.activeVehicleId || "";
          this.openVehicleModal(false);
          return;
        }
        this.activeVehicleId = e.target.value;
        localStorage.setItem("autopulse_active_vehicle", this.activeVehicleId);
        this.renderVehicleSelectors();
        this.computeAndRenderActiveVehicle();
      };
    });
  },

  populateModalVehicleSelect(selectId, selectedVehicleId) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const targetId = selectedVehicleId || this.activeVehicleId || (this.vehicles[0] && this.vehicles[0].id);
    el.innerHTML =
      this.vehicles
        .map((v) => `<option value="${v.id}" ${v.id === targetId ? "selected" : ""}>${this.escape(v.name)} (${this.escape(v.license || "No Plate")})</option>`)
        .join("") + `<option value="__new__">+ Add New Vehicle...</option>`;
    el.value = targetId || "";
  },

  getLatestOdometerForVehicle(vehicleId) {
    const veh = this.vehicles.find((v) => v.id === vehicleId);
    const initOdo = veh ? Number(veh.initialOdometer) || 0 : 0;
    const vehLogs = this.logs.filter((l) => l.vehicleId === vehicleId);
    if (vehLogs.length === 0) return initOdo;
    return Math.max(initOdo, ...vehLogs.map((l) => Number(l.odometer) || 0));
  },

  computeAndRenderActiveVehicle() {
    const vehicle = this.getActiveVehicle();
    if (!vehicle) return;

    const vehLogs = this.logs
      .filter((l) => l.vehicleId === vehicle.id)
      .sort((a, b) => Number(a.odometer) - Number(b.odometer) || String(a.date || "").localeCompare(String(b.date || "")));

    const initOdo = Number(vehicle.initialOdometer) || 0;
    let lastFuelOdo = initOdo;

    this.computedLogs = vehLogs.map((log, idx) => {
      const prevOdo = idx === 0 ? initOdo : Number(vehLogs[idx - 1].odometer);
      const delta = Math.max(0, Number(log.odometer) - prevOdo);
      let mpg = null;
      let costPerMile = null;

      if (log.type === "fuel") {
        const vol = Number(log.volume) || 0;
        const fuelCost = Number(log.totalCost) || 0;
        const fuelDist = Number(log.odometer) - lastFuelOdo;
        if (vol > 0 && fuelDist > 0) {
          mpg = fuelDist / vol;
          costPerMile = fuelCost / fuelDist;
        }
        lastFuelOdo = Number(log.odometer);
      }

      return { ...log, delta, mpg, costPerMile };
    });

    const latestOdo = this.computedLogs.length > 0
      ? this.computedLogs[this.computedLogs.length - 1].odometer
      : initOdo;

    // Header updates
    document.getElementById("headerPlate").textContent = vehicle.license || "NO PLATE";
    document.getElementById("headerVin").textContent = vehicle.vin || "—";
    document.getElementById("headerOdo").textContent = Number(latestOdo).toLocaleString() + " mi";
    document.getElementById("logCountBadge").textContent = this.computedLogs.length;

    this.populateYearFilter();
    this.renderDashboard(vehicle, latestOdo);
    this.renderLogsTable();
    this.renderReminders(vehicle, latestOdo);
    this.renderGarage();
  },

  populateYearFilter() {
    const sel = document.getElementById("logYearFilter");
    const currentVal = sel.value || "all";
    const years = Array.from(new Set(this.computedLogs.map((l) => (l.date || "").slice(0, 4)).filter(Boolean))).sort().reverse();
    sel.innerHTML = `<option value="all">All Years (${years.length ? years[years.length - 1] + "–" + years[0] : "All"})</option>` +
      years.map((y) => `<option value="${y}">${y}</option>`).join("");
    if (years.includes(currentVal)) sel.value = currentVal;
  },

  renderDashboard(vehicle, latestOdo) {
    const fuelLogs = this.computedLogs.filter((l) => l.type === "fuel");
    const totalFuelCost = fuelLogs.reduce((s, l) => s + (Number(l.totalCost) || 0), 0);
    const totalAllCost = this.computedLogs.reduce((s, l) => s + (Number(l.totalCost) || 0), 0);
    const totalGallons = fuelLogs.reduce((s, l) => s + (Number(l.volume) || 0), 0);
    const totalDist = Math.max(0, latestOdo - (Number(vehicle.initialOdometer) || 0));

    const avgMpg = totalGallons > 0 ? totalDist / totalGallons : 0;
    const validMpgs = fuelLogs.filter((l) => l.mpg && l.mpg >= 1 && l.mpg <= 99).map((l) => l.mpg);
    const bestMpg = validMpgs.length > 0 ? Math.max(...validMpgs) : 0;
    const costPerMile = totalDist > 0 ? totalAllCost / totalDist : 0;
    const avgPpg = totalGallons > 0 ? totalFuelCost / totalGallons : 0;

    document.getElementById("kpiAvgMpg").textContent = avgMpg > 0 ? avgMpg.toFixed(1) + " MPG" : "—";
    document.getElementById("kpiBestMpg").textContent = bestMpg > 0 ? bestMpg.toFixed(1) + " MPG" : "—";
    document.getElementById("kpiTotalSpend").textContent = "$" + totalAllCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById("kpiFuelSub").textContent = `${totalGallons.toFixed(1)} gal across ${fuelLogs.length} fill-ups`;
    document.getElementById("kpiCostPerMile").textContent = costPerMile > 0 ? "$" + costPerMile.toFixed(3) + " / mi" : "—";
    document.getElementById("kpiAvgPpg").textContent = avgPpg > 0 ? "$" + avgPpg.toFixed(2) + "/gal" : "—";
    document.getElementById("kpiDistance").textContent = totalDist.toLocaleString() + " mi";
    document.getElementById("kpiDistanceSub").textContent = vehicle.purchaseDate ? `Since ${vehicle.purchaseDate}` : `Initial Odometer: ${vehicle.initialOdometer} mi`;

    // Charts
    const mpgPoints = fuelLogs
      .filter((l) => l.mpg && l.mpg > 0 && isFinite(l.mpg))
      .map((l) => ({ date: l.date, val: l.mpg, label: `${l.mpg.toFixed(1)} MPG (${l.date})` }));
    this.renderSvgChart("mpgChartSvg", mpgPoints, "#10b981", "");

    const cpmPoints = fuelLogs
      .filter((l) => l.costPerMile && l.costPerMile > 0 && isFinite(l.costPerMile))
      .map((l) => ({ date: l.date, val: l.costPerMile, label: `$${l.costPerMile.toFixed(3)}/mi (${l.date})` }));
    this.renderSvgChart("cpmChartSvg", cpmPoints, "#f59e0b", "$");

    const pricePoints = fuelLogs
      .filter((l) => l.pricePerGal > 0)
      .map((l) => ({ date: l.date, val: Number(l.pricePerGal), label: `$${Number(l.pricePerGal).toFixed(3)}/gal (${l.date})` }));
    this.renderSvgChart("priceChartSvg", pricePoints, "#3b82f6", "$");

    // Profile list
    const profileEl = document.getElementById("vehicleProfileList");
    profileEl.innerHTML = `
      <div class="kv-row"><span class="kv-key">Vehicle Name</span><span class="kv-val">${this.escape(vehicle.name)}</span></div>
      <div class="kv-row"><span class="kv-key">Year / Make / Model</span><span class="kv-val">${vehicle.year} ${this.escape(vehicle.brand)} ${this.escape(vehicle.model)}</span></div>
      <div class="kv-row"><span class="kv-key">VIN</span><span class="kv-val mono">${this.escape(vehicle.vin || "—")}</span></div>
      <div class="kv-row"><span class="kv-key">License Plate</span><span class="kv-val mono">${this.escape(vehicle.license || "—")}</span></div>
      <div class="kv-row"><span class="kv-key">Purchased</span><span class="kv-val">${this.escape(vehicle.purchaseDate || "—")} (${Number(vehicle.initialOdometer || 0).toLocaleString()} mi)</span></div>
      <div class="kv-row"><span class="kv-key">Purchase Price</span><span class="kv-val">${vehicle.purchasePrice ? "$" + Number(vehicle.purchasePrice).toLocaleString() : "—"} (${this.escape(vehicle.purchasedFrom || "—")})</span></div>
    `;

    // Insights & Alerts
    const stationCounts = {};
    fuelLogs.forEach((l) => {
      const st = (l.location || "Unknown").trim();
      stationCounts[st] = (stationCounts[st] || 0) + 1;
    });
    const topStation = Object.entries(stationCounts).sort((a, b) => b[1] - a[1])[0];

    const vehReminders = this.reminders.filter((r) => r.vehicleId === vehicle.id);
    const today = new Date().toISOString().slice(0, 10);

    let alertsHtml = "";
    vehReminders.forEach((r) => {
      const isDateDue = r.dueDate && r.dueDate < today;
      const isOdoDue = r.dueOdometer && latestOdo >= r.dueOdometer;
      const overdue = isDateDue || isOdoDue;
      alertsHtml += `
        <div style="padding:12px; border-radius:12px; border:1px solid ${overdue ? "rgba(245,158,11,0.45)" : "var(--border)"}; background:${overdue ? "var(--warning-soft)" : "var(--bg)"};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="font-size:0.84rem;">${overdue ? "[Due] " : ""}${this.escape(r.title)}</strong>
            <span class="badge ${overdue ? "badge-warning" : "badge-success"}">${overdue ? "Due / Expired" : "Active"}</span>
          </div>
          <div style="font-size:0.78rem; color:var(--text-muted);">
            ${r.dueDate ? `Target Date: <strong class="mono">${r.dueDate}</strong><br/>` : ""}
            ${r.dueOdometer ? `Target Odometer: <strong class="mono">${Number(r.dueOdometer).toLocaleString()} mi</strong> (${(r.dueOdometer - latestOdo).toLocaleString()} mi left)` : ""}
          </div>
        </div>
      `;
    });

    if (topStation && fuelLogs.length > 0) {
      alertsHtml += `
        <div style="padding:12px; border-radius:12px; border:1px solid var(--border); background:var(--bg);">
          <div style="font-weight:700; font-size:0.84rem; margin-bottom:4px;">Preferred Station</div>
          <div style="font-size:0.78rem; color:var(--text-muted);">
            <strong>${this.escape(topStation[0])}</strong> accounts for <strong>${topStation[1]} of ${fuelLogs.length}</strong> fill-ups (${((topStation[1] / fuelLogs.length) * 100).toFixed(1)}%).
          </div>
        </div>
      `;
    }

    const receiptsCount = this.computedLogs.filter((l) => l.receipt && l.receipt.url).length;
    alertsHtml += `
      <div style="padding:12px; border-radius:12px; border:1px solid var(--border); background:var(--bg);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="font-size:0.84rem;">Receipts Attached</strong>
          <span class="badge ${receiptsCount > 0 ? "badge-success" : "badge-primary"}">${receiptsCount} / ${this.computedLogs.length}</span>
        </div>
        <div style="font-size:0.78rem; color:var(--text-muted);">
          ${receiptsCount > 0 ? `<strong>${receiptsCount}</strong> event${receiptsCount === 1 ? "" : "s"} linked to Google Drive receipts.` : "Attach photos or PDFs in any log entry to store them in Google Drive."}
        </div>
      </div>
    `;

    document.getElementById("dashboardAlerts").innerHTML = alertsHtml || `<div style="color:var(--text-muted); font-size:0.82rem;">No active reminders or insights yet for this vehicle.</div>`;
  },

  renderSvgChart(svgId, points, color, prefix) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    if (points.length < 2) {
      svg.innerHTML = `<text x="270" y="90" text-anchor="middle" fill="var(--text-muted)" font-size="13">Log at least 2 fill-ups to view trend chart</text>`;
      return;
    }

    const w = 540, h = 180, padL = 42, padR = 14, padT = 14, padB = 26;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const vals = points.map((p) => p.val);
    const minVal = Math.floor(Math.min(...vals) * 0.92 * 10) / 10;
    const maxVal = Math.ceil(Math.max(...vals) * 1.05 * 10) / 10;
    const range = Math.max(0.1, maxVal - minVal);

    const coords = points.map((p, i) => {
      const x = padL + (i / (points.length - 1)) * plotW;
      const y = padT + plotH - ((p.val - minVal) / range) * plotH;
      return { x, y, ...p };
    });

    const poly = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const area = `${coords[0].x.toFixed(1)},${padT + plotH} ${poly} ${coords[coords.length - 1].x.toFixed(1)},${padT + plotH}`;

    let html = "";
    [minVal, (minVal + maxVal) / 2, maxVal].forEach((gv) => {
      const y = padT + plotH - ((gv - minVal) / range) * plotH;
      html += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="3,3" stroke-width="1"/>`;
      html += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="11">${prefix}${prefix ? gv.toFixed(2) : gv.toFixed(0)}</text>`;
    });

    html += `<polygon points="${area}" fill="${color}" fill-opacity="0.14"/>`;
    html += `<polyline fill="none" stroke="${color}" stroke-width="2.2" points="${poly}"/>`;

    [0, Math.floor(coords.length / 2), coords.length - 1].forEach((idx) => {
      const c = coords[idx];
      html += `<text x="${c.x}" y="${h - 4}" text-anchor="middle" fill="var(--text-muted)" font-size="11">${(c.date || "").slice(0, 7)}</text>`;
    });

    svg.innerHTML = html;
  },

  renderLogsTable() {
    const q = (document.getElementById("logSearchInput").value || "").toLowerCase().trim();
    const typeFilter = document.getElementById("logTypeFilter").value;
    const yearFilter = document.getElementById("logYearFilter").value;
    const receiptFilterEl = document.getElementById("logReceiptFilter");
    const receiptFilter = receiptFilterEl ? receiptFilterEl.value : "all";
    const tbody = document.getElementById("logsTableBody");

    if (receiptFilterEl) {
      const attachedTotal = this.computedLogs.filter((l) => l.receipt && l.receipt.url).length;
      const missingTotal = this.computedLogs.length - attachedTotal;
      receiptFilterEl.options[0].textContent = `All Receipts (${this.computedLogs.length})`;
      receiptFilterEl.options[1].textContent = `Has Receipt (${attachedTotal})`;
      receiptFilterEl.options[2].textContent = `No Receipt (${missingTotal})`;
    }

    const rows = [...this.computedLogs].reverse().filter((r) => {
      if (typeFilter !== "all") {
        if (typeFilter === "service") {
          if (r.type !== "service" && r.type !== "maintenance" && r.type !== "repair") return false;
        } else if (r.type !== typeFilter) {
          return false;
        }
      }
      if (yearFilter !== "all" && !(r.date || "").startsWith(yearFilter)) return false;
      const hasReceipt = !!(r.receipt && r.receipt.url);
      if (receiptFilter === "attached" && !hasReceipt) return false;
      if (receiptFilter === "missing" && hasReceipt) return false;
      if (q) {
        const receiptName = r.receipt && r.receipt.name ? r.receipt.name : "";
        const hay = `${r.date} ${r.odometer} ${r.location || ""} ${r.notes || ""} ${r.serviceItem || ""} ${r.fuelGrade || ""} ${receiptName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:24px; color:var(--text-muted);">No matching log entries found for this vehicle.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((r) => {
        let typeBadge = `<span class="badge badge-primary">Fuel</span>`;
        if (r.type === "service" || r.type === "maintenance" || r.type === "repair") {
          typeBadge = `<span class="badge badge-success">Service</span>`;
        } else if (r.type === "other") {
          typeBadge = `<span class="badge badge-warning">Other</span>`;
        }

        const details =
          r.type === "fuel"
            ? `${Number(r.volume || 0).toFixed(3)} gal @ $${Number(r.pricePerGal || 0).toFixed(3)}`
            : this.escape(r.serviceItem || (r.type === "other" ? "Expense" : "Service"));

        const mpgCell =
          r.type === "fuel" && r.mpg
            ? `<span class="badge badge-success">${r.mpg.toFixed(1)}</span>`
            : "—";

        const hasReceipt = !!(r.receipt && r.receipt.url);
        const receiptCell = hasReceipt
          ? `<a href="${this.escape(r.receipt.url)}" target="_blank" rel="noopener noreferrer" class="receipt-badge attached" title="View Receipt: ${this.escape(r.receipt.name || "Open in Google Drive")}">Attached ↗</a>`
          : `<button type="button" onclick="App.openLogModal('${r.id}')" class="receipt-badge missing" title="No receipt attached — click to attach one">+ Attach</button>`;

        return `
          <tr>
            <td class="mono" style="white-space:nowrap;">${this.escape(r.date)}</td>
            <td class="mono" style="font-weight:700;">${Number(r.odometer).toLocaleString()} mi</td>
            <td class="mono" style="color:var(--text-muted);">+${Number(r.delta).toLocaleString()} mi</td>
            <td>${typeBadge}</td>
            <td>${this.escape(r.location || r.serviceItem || "—")}</td>
            <td class="mono text-right" style="white-space:nowrap;">${details}</td>
            <td class="mono text-right" style="font-weight:700;">$${Number(r.totalCost || 0).toFixed(2)}</td>
            <td class="mono text-right">${mpgCell}</td>
            <td style="white-space:nowrap;">${receiptCell}</td>
            <td style="color:var(--text-muted); max-width:220px;">${this.escape(r.notes || "—")}</td>
            <td class="text-right" style="white-space:nowrap;">
              <button onclick="App.openLogModal('${r.id}')" class="btn" style="padding:4px 8px; font-size:0.74rem;">Edit</button>
              <button onclick="App.deleteLog('${r.id}')" class="btn btn-danger" style="padding:4px 8px; font-size:0.74rem;">Delete</button>
            </td>
          </tr>
        `;
      })
      .join("");
  },

  renderReminders(vehicle, latestOdo) {
    const grid = document.getElementById("remindersGrid");
    const vehRems = this.reminders.filter((r) => r.vehicleId === vehicle.id);
    const today = new Date().toISOString().slice(0, 10);

    if (vehRems.length === 0) {
      grid.innerHTML = `<div class="card"><p style="color:var(--text-muted); font-size:0.85rem;">No reminders configured for ${this.escape(vehicle.name)} yet. Click "＋ New Reminder" to add one.</p></div>`;
      return;
    }

    grid.innerHTML = vehRems
      .map((r) => {
        const isDateDue = r.dueDate && r.dueDate < today;
        const isOdoDue = r.dueOdometer && latestOdo >= r.dueOdometer;
        const overdue = isDateDue || isOdoDue;

        let pct = 50;
        if (r.dueOdometer && r.startOdometer) {
          pct = Math.min(100, Math.max(5, ((latestOdo - r.startOdometer) / (r.dueOdometer - r.startOdometer)) * 100));
        } else if (overdue) {
          pct = 100;
        }

        let intervalDisplay = "";
        if (r.intervalMiles && r.intervalMonths) {
          intervalDisplay = `Every ${Number(r.intervalMiles).toLocaleString()} mi / ${r.intervalMonths} mo`;
        } else if (r.intervalMiles) {
          intervalDisplay = `Every ${Number(r.intervalMiles).toLocaleString()} mi`;
        } else if (r.intervalMonths) {
          intervalDisplay = `Every ${r.intervalMonths} mo`;
        }

        return `
          <div class="card" style="border-color:${overdue ? "rgba(245,158,11,0.5)" : "var(--border)"};">
            <div class="card-header">
              <div class="card-title">${this.escape(r.title)}</div>
              <span class="badge ${overdue ? "badge-warning" : "badge-success"}">${overdue ? "Due / Expired" : "On Track"}</span>
            </div>
            <div class="kv-list">
              ${intervalDisplay ? `<div class="kv-row"><span class="kv-key">Frequency Interval</span><span class="kv-val" style="color:var(--primary); font-weight:700;">${this.escape(intervalDisplay)}</span></div>` : ""}
              <div class="kv-row"><span class="kv-key">Start Date</span><span class="kv-val mono">${this.escape(r.startDate || "—")}</span></div>
              <div class="kv-row"><span class="kv-key">Target Due Date</span><span class="kv-val mono" style="color:${isDateDue ? "var(--warning)" : "inherit"}">${this.escape(r.dueDate || "—")}</span></div>
              <div class="kv-row"><span class="kv-key">Target Odometer</span><span class="kv-val mono">${r.dueOdometer ? Number(r.dueOdometer).toLocaleString() + " mi" : "—"}</span></div>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${pct}%; background:${overdue ? "var(--warning)" : "var(--success)"};"></div>
            </div>
            <p style="font-size:0.76rem; color:var(--text-muted); margin-top:10px;">${this.escape(r.notes || "")}</p>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
              <button onclick="App.completeReminderNow('${r.id}')" class="btn" style="padding:4px 10px; font-size:0.75rem;">Mark Done Today</button>
              <button onclick="App.openReminderModal('${r.id}')" class="btn" style="padding:4px 10px; font-size:0.75rem;">Edit</button>
              <button onclick="App.deleteReminder('${r.id}')" class="btn btn-danger" style="padding:4px 10px; font-size:0.75rem;">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");
  },

  renderGarage() {
    const el = document.getElementById("garageList");
    el.innerHTML = this.vehicles
      .map(
        (v) => `
        <div style="padding:14px; border-radius:12px; border:1px solid ${v.id === this.activeVehicleId ? "var(--primary)" : "var(--border)"}; background:var(--bg);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${this.escape(v.name)}</strong>
            <span class="plate-badge">${this.escape(v.license || "—")}</span>
          </div>
          <div class="mono" style="font-size:0.76rem; color:var(--text-muted); margin-top:4px;">VIN: ${this.escape(v.vin || "—")}</div>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button onclick="App.selectVehicle('${v.id}')" class="btn ${v.id === this.activeVehicleId ? "btn-primary" : ""}" style="padding:4px 10px; font-size:0.75rem;">
              ${v.id === this.activeVehicleId ? "Active" : "Switch To"}
            </button>
            <button onclick="App.openVehicleModal(true, '${v.id}')" class="btn" style="padding:4px 10px; font-size:0.75rem;">Edit</button>
          </div>
        </div>
      `
      )
      .join("");
  },

  selectVehicle(id) {
    this.activeVehicleId = id;
    localStorage.setItem("autopulse_active_vehicle", id);
    this.renderVehicleSelectors();
    this.computeAndRenderActiveVehicle();
    this.showToast("Switched active vehicle");
  },

  switchView(view) {
    ["dashboard", "logs", "reminders", "data"].forEach((v) => {
      document.getElementById("view-" + v).classList.toggle("active", v === view);
      const dtab = document.getElementById("dtab-" + v);
      const mtab = document.getElementById("mtab-" + v);
      if (dtab) dtab.classList.toggle("active", v === view);
      if (mtab) mtab.classList.toggle("active", v === view);
    });
  },

  // Modals & Forms
  openLogModal(editId = null) {
    const modal = document.getElementById("logModal");
    const today = new Date().toISOString().slice(0, 10);
    this.pendingReceiptFile = null;
    const fileInput = document.getElementById("logReceiptFileInput");
    if (fileInput) fileInput.value = "";

    if (editId) {
      const item = this.logs.find((l) => l.id === editId);
      if (!item) return;
      document.getElementById("logModalTitle").textContent = "Edit Vehicle Event";
      document.getElementById("logId").value = item.id;
      this.populateModalVehicleSelect("logVehicleId", item.vehicleId);
      let logType = item.type || "fuel";
      if (logType === "maintenance" || logType === "repair") logType = "service";
      document.getElementById("logType").value = logType;
      document.getElementById("logDate").value = item.date || today;
      document.getElementById("logOdometer").value = item.odometer || "";
      document.getElementById("logLocation").value = item.location || "";
      document.getElementById("logVolume").value = item.volume || "";
      document.getElementById("logPpg").value = item.pricePerGal || "";
      document.getElementById("logTotalCost").value = item.totalCost || "";
      document.getElementById("logFuelGrade").value = item.fuelGrade || "87 Gasoline";
      document.getElementById("logServiceItem").value = item.serviceItem || "";
      document.getElementById("logServiceCost").value = item.totalCost || "";
      document.getElementById("logNotes").value = item.notes || "";
      this.setModalReceiptFields(item.receipt || null);
    } else {
      const latestOdo = this.getLatestOdometerForVehicle(this.activeVehicleId);
      document.getElementById("logModalTitle").textContent = "Log Vehicle Event";
      document.getElementById("logId").value = "";
      this.populateModalVehicleSelect("logVehicleId", this.activeVehicleId);
      document.getElementById("logType").value = "fuel";
      document.getElementById("logDate").value = today;
      document.getElementById("logOdometer").value = latestOdo + 300;
      document.getElementById("logLocation").value = "7 Eleven";
      document.getElementById("logVolume").value = "";
      document.getElementById("logPpg").value = "";
      document.getElementById("logTotalCost").value = "";
      document.getElementById("logFuelGrade").value = "87 Gasoline";
      document.getElementById("logServiceItem").value = "";
      document.getElementById("logServiceCost").value = "";
      document.getElementById("logNotes").value = "";
      this.setModalReceiptFields(null);
    }

    this.toggleLogTypeFields();
    modal.classList.add("open");
  },

  setModalReceiptFields(receipt) {
    const urlInput = document.getElementById("logReceiptUrl");
    const nameInput = document.getElementById("logReceiptName");
    const driveIdInput = document.getElementById("logReceiptDriveId");
    const mimeInput = document.getElementById("logReceiptMime");

    if (receipt && receipt.url) {
      urlInput.value = receipt.url || "";
      nameInput.value = receipt.name || "Google Drive Receipt";
      driveIdInput.value = receipt.driveFileId || "";
      mimeInput.value = receipt.mimeType || "";
    } else {
      urlInput.value = "";
      nameInput.value = "";
      driveIdInput.value = "";
      mimeInput.value = "";
    }
    this.updateLogReceiptUi();
  },

  updateLogReceiptUi() {
    const panel = document.getElementById("logReceiptPanel");
    const badge = document.getElementById("logReceiptStatusBadge");
    const uploadBtn = document.getElementById("logReceiptUploadNowBtn");
    const infoRow = document.getElementById("logReceiptInfoRow");
    const infoIcon = document.getElementById("logReceiptInfoIcon");
    const infoName = document.getElementById("logReceiptInfoName");
    const openLink = document.getElementById("logReceiptOpenLink");
    const urlVal = (document.getElementById("logReceiptUrl").value || "").trim();
    const nameVal = (document.getElementById("logReceiptName").value || "").trim();

    if (this.pendingReceiptFile) {
      panel.className = "receipt-panel queued-receipt";
      badge.className = "badge badge-warning";
      badge.textContent = "Ready to Upload";
      uploadBtn.style.display = "inline-flex";
      infoRow.style.display = "flex";
      infoIcon.textContent = "[File]";
      const kb = Math.max(1, Math.round(this.pendingReceiptFile.size / 1024));
      infoName.textContent = `${this.pendingReceiptFile.name} (${kb} KB — uploads on Save)`;
      openLink.style.display = "none";
    } else if (urlVal) {
      panel.className = "receipt-panel has-receipt";
      badge.className = "badge badge-success";
      badge.textContent = "Receipt Attached";
      uploadBtn.style.display = "none";
      infoRow.style.display = "flex";
      infoIcon.textContent = "[Attached]";
      infoName.textContent = nameVal || "Attached Google Drive Receipt";
      openLink.href = urlVal;
      openLink.style.display = "inline-flex";
    } else {
      panel.className = "receipt-panel";
      badge.className = "badge badge-primary";
      badge.textContent = "No Receipt";
      uploadBtn.style.display = "none";
      infoRow.style.display = "none";
      openLink.style.display = "none";
    }
  },

  onReceiptFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    this.pendingReceiptFile = file;
    this.updateLogReceiptUi();
  },

  onReceiptUrlManualInput() {
    const urlVal = (document.getElementById("logReceiptUrl").value || "").trim();
    if (urlVal && !document.getElementById("logReceiptName").value) {
      document.getElementById("logReceiptName").value = "Linked Receipt";
    }
    if (!urlVal) {
      document.getElementById("logReceiptName").value = "";
      document.getElementById("logReceiptDriveId").value = "";
      document.getElementById("logReceiptMime").value = "";
    }
    this.updateLogReceiptUi();
  },

  clearLogReceipt() {
    this.pendingReceiptFile = null;
    const fileInput = document.getElementById("logReceiptFileInput");
    if (fileInput) fileInput.value = "";
    this.setModalReceiptFields(null);
  },

  buildCleanReceiptFileName(originalName) {
    const date = document.getElementById("logDate").value || new Date().toISOString().slice(0, 10);
    const odo = document.getElementById("logOdometer").value || "0";
    const type = document.getElementById("logType").value || "event";
    const locRaw = document.getElementById("logLocation").value || document.getElementById("logServiceItem").value || "";
    const cleanLoc = locRaw.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
    const extMatch = String(originalName || "").match(/(\.[a-zA-Z0-9]{1,6})$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : ".jpg";
    return `${date}_${odo}mi_${type}${cleanLoc ? "_" + cleanLoc : ""}${ext}`;
  },

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const commaIdx = result.indexOf(",");
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  },

  async uploadPendingReceiptToDrive() {
    if (!this.pendingReceiptFile) return null;
    const gdCfg = this.getDriveSettingsFromInputs();
    if (!gdCfg.scriptUrl) {
      alert("Google Drive upload is not configured yet.\n\nGo to '💾 Backup, Sync & Vehicles' → '🧾 Google Drive Receipt Uploads' to paste your Google Apps Script Web App URL (or paste a receipt link directly).");
      return null;
    }

    const file = this.pendingReceiptFile;
    const badge = document.getElementById("logReceiptStatusBadge");
    const uploadBtn = document.getElementById("logReceiptUploadNowBtn");
    const saveBtn = document.getElementById("logSaveSubmitBtn");

    try {
      badge.className = "badge badge-warning";
      badge.textContent = "Uploading to Drive...";
      if (uploadBtn) uploadBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;

      const base64 = await this.fileToBase64(file);
      const cleanName = this.buildCleanReceiptFileName(file.name);

      const payload = {
        action: "upload",
        secret: gdCfg.secretKey || "",
        folderName: gdCfg.folderName || "AutoPulse Receipts",
        fileName: cleanName,
        mimeType: file.type || "application/octet-stream",
        base64
      };

      const res = await fetch(gdCfg.scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Apps Script returned an error");
      }

      this.pendingReceiptFile = null;
      const fileInput = document.getElementById("logReceiptFileInput");
      if (fileInput) fileInput.value = "";

      const receiptObj = {
        name: data.fileName || cleanName,
        url: data.url,
        driveFileId: data.fileId || "",
        mimeType: file.type || ""
      };
      this.setModalReceiptFields(receiptObj);
      this.showToast("Receipt uploaded to Google Drive!");
      return receiptObj;
    } catch (err) {
      badge.className = "badge badge-danger";
      badge.textContent = "Upload Failed";
      alert("Google Drive Upload Failed: " + err.message);
      return null;
    } finally {
      if (uploadBtn) uploadBtn.disabled = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  },

  onLogModalVehicleChange() {
    const sel = document.getElementById("logVehicleId");
    if (sel.value === "__new__") {
      this.openVehicleFromLogModal();
      return;
    }
    if (!document.getElementById("logId").value) {
      const latestOdo = this.getLatestOdometerForVehicle(sel.value);
      document.getElementById("logOdometer").value = latestOdo + 300;
    }
  },

  openVehicleFromLogModal() {
    this.returnToLogModalAfterVehicleAdd = true;
    this.closeModal("logModal");
    this.openVehicleModal(false);
  },

  toggleLogTypeFields() {
    const t = document.getElementById("logType").value;
    const isFuel = t === "fuel";
    document.getElementById("fuelFieldsWrap").style.display = isFuel ? "block" : "none";
    document.getElementById("serviceFieldsWrap").style.display = isFuel ? "none" : "block";
    document.getElementById("logTotalCost").required = isFuel;

    const serviceItemLabel = document.getElementById("logServiceItemLabel");
    const serviceItemInput = document.getElementById("logServiceItem");
    if (t === "other") {
      if (serviceItemLabel) serviceItemLabel.textContent = "Expense Description";
      if (serviceItemInput) serviceItemInput.placeholder = "e.g. Tolls, Car Wash, Parking, Accessories";
    } else {
      if (serviceItemLabel) serviceItemLabel.textContent = "Service & Repair Description";
      if (serviceItemInput) serviceItemInput.placeholder = "e.g. Oil Change, Brake Pads, Fuel Filter";
    }
  },

  autoCalcFuelCost(changed) {
    const vol = parseFloat(document.getElementById("logVolume").value);
    const ppg = parseFloat(document.getElementById("logPpg").value);
    const cost = parseFloat(document.getElementById("logTotalCost").value);

    if ((changed === "vol" || changed === "ppg") && !isNaN(vol) && !isNaN(ppg)) {
      document.getElementById("logTotalCost").value = (vol * ppg).toFixed(2);
    } else if (changed === "cost" && !isNaN(cost) && !isNaN(ppg) && ppg > 0 && isNaN(vol)) {
      document.getElementById("logVolume").value = (cost / ppg).toFixed(3);
    }
  },

  async saveLogForm(e) {
    e.preventDefault();

    // If the user selected a receipt file and hasn't clicked "Upload to Drive" yet, upload it now
    if (this.pendingReceiptFile) {
      const uploaded = await this.uploadPendingReceiptToDrive();
      if (!uploaded) {
        return; // Stop save so user can fix Drive settings or remove file
      }
    }

    const id = document.getElementById("logId").value || "log_" + Date.now().toString(36);
    const selectedVehicleId = document.getElementById("logVehicleId").value || this.activeVehicleId;
    const type = document.getElementById("logType").value;
    const isFuel = type === "fuel";

    const receiptUrl = (document.getElementById("logReceiptUrl").value || "").trim();
    const receiptName = (document.getElementById("logReceiptName").value || "").trim();
    const receiptDriveId = (document.getElementById("logReceiptDriveId").value || "").trim();
    const receiptMime = (document.getElementById("logReceiptMime").value || "").trim();

    const entry = {
      id,
      vehicleId: selectedVehicleId,
      type,
      date: document.getElementById("logDate").value,
      odometer: Number(document.getElementById("logOdometer").value),
      location: document.getElementById("logLocation").value.trim(),
      notes: document.getElementById("logNotes").value.trim(),
      totalCost: Number(isFuel ? document.getElementById("logTotalCost").value : document.getElementById("logServiceCost").value) || 0,
      receipt: receiptUrl
        ? {
            name: receiptName || "Google Drive Receipt",
            url: receiptUrl,
            driveFileId: receiptDriveId,
            mimeType: receiptMime
          }
        : null
    };

    if (isFuel) {
      entry.volume = Number(document.getElementById("logVolume").value) || 0;
      entry.pricePerGal = Number(document.getElementById("logPpg").value) || 0;
      entry.fuelGrade = document.getElementById("logFuelGrade").value.trim() || "87 Gasoline";
    } else {
      entry.serviceItem = document.getElementById("logServiceItem").value.trim() || (type === "other" ? "Expense" : "Service");
    }

    this.activeVehicleId = selectedVehicleId;
    localStorage.setItem("autopulse_active_vehicle", selectedVehicleId);

    await AutoPulseDB.put("logs", entry);
    this.closeModal("logModal");
    await this.reloadAllData();
    this.showToast("Event saved to device storage");
    this.triggerAutoSyncIfEnabled();
  },

  async deleteLog(id) {
    if (!confirm("Delete this log entry?")) return;
    await AutoPulseDB.delete("logs", id);
    await this.reloadAllData();
    this.showToast("Entry deleted");
    this.triggerAutoSyncIfEnabled();
  },

  onReminderIntervalChange() {
    const miles = Number(document.getElementById("remIntervalMiles").value);
    const months = Number(document.getElementById("remIntervalMonths").value);
    const startOdo = Number(document.getElementById("remStartOdo").value);
    const startDateVal = document.getElementById("remStartDate").value;

    if (miles > 0 && startOdo > 0) {
      document.getElementById("remDueOdo").value = startOdo + miles;
    }
    if (months > 0 && startDateVal) {
      const d = new Date(startDateVal + "T00:00:00");
      d.setMonth(d.getMonth() + months);
      document.getElementById("remDueDate").value = d.toISOString().slice(0, 10);
    }
  },

  openReminderModal(editId = null) {
    const modal = document.getElementById("reminderModal");
    const today = new Date().toISOString().slice(0, 10);
    if (editId) {
      const r = this.reminders.find((x) => x.id === editId);
      if (!r) return;
      document.getElementById("remId").value = r.id;
      this.populateModalVehicleSelect("remVehicleId", r.vehicleId);
      document.getElementById("remTitle").value = r.title || "";
      document.getElementById("remIntervalMiles").value = r.intervalMiles || "";
      document.getElementById("remIntervalMonths").value = r.intervalMonths || "";
      document.getElementById("remStartDate").value = r.startDate || "";
      document.getElementById("remDueDate").value = r.dueDate || "";
      document.getElementById("remStartOdo").value = r.startOdometer || "";
      document.getElementById("remDueOdo").value = r.dueOdometer || "";
      document.getElementById("remNotes").value = r.notes || "";
    } else {
      document.getElementById("remId").value = "";
      this.populateModalVehicleSelect("remVehicleId", this.activeVehicleId);
      document.getElementById("remTitle").value = "";
      document.getElementById("remIntervalMiles").value = "5000";
      document.getElementById("remIntervalMonths").value = "12";
      document.getElementById("remStartDate").value = today;
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      document.getElementById("remDueDate").value = nextYear.toISOString().slice(0, 10);
      const curOdo = this.getLatestOdometerForVehicle(this.activeVehicleId) || 0;
      document.getElementById("remStartOdo").value = curOdo;
      document.getElementById("remDueOdo").value = curOdo + 5000;
      document.getElementById("remNotes").value = "";
    }

    const remVehSel = document.getElementById("remVehicleId");
    remVehSel.onchange = (e) => {
      if (e.target.value === "__new__") {
        this.closeModal("reminderModal");
        this.openVehicleModal(false);
      }
    };

    modal.classList.add("open");
  },

  async saveReminderForm(e) {
    e.preventDefault();
    const id = document.getElementById("remId").value || "rem_" + Date.now().toString(36);
    const selectedVehicleId = document.getElementById("remVehicleId").value || this.activeVehicleId;
    const intervalMiles = Number(document.getElementById("remIntervalMiles").value) || null;
    const intervalMonths = Number(document.getElementById("remIntervalMonths").value) || null;
    const rem = {
      id,
      vehicleId: selectedVehicleId,
      title: document.getElementById("remTitle").value.trim(),
      intervalMiles,
      intervalMonths,
      startDate: document.getElementById("remStartDate").value || null,
      dueDate: document.getElementById("remDueDate").value || null,
      startOdometer: Number(document.getElementById("remStartOdo").value) || null,
      dueOdometer: Number(document.getElementById("remDueOdo").value) || null,
      notes: document.getElementById("remNotes").value.trim()
    };
    this.activeVehicleId = selectedVehicleId;
    localStorage.setItem("autopulse_active_vehicle", selectedVehicleId);
    await AutoPulseDB.put("reminders", rem);
    this.closeModal("reminderModal");
    await this.reloadAllData();
    this.showToast("Reminder saved");
    this.triggerAutoSyncIfEnabled();
  },

  async completeReminderNow(id) {
    const r = this.reminders.find((x) => x.id === id);
    if (!r) return;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const latestOdo = this.computedLogs.length ? this.computedLogs[this.computedLogs.length - 1].odometer : 0;

    r.startDate = todayStr;
    r.startOdometer = latestOdo;

    const months = r.intervalMonths || 12;
    const nextDate = new Date(today);
    nextDate.setMonth(nextDate.getMonth() + months);
    r.dueDate = nextDate.toISOString().slice(0, 10);

    if (r.intervalMiles) {
      r.dueOdometer = latestOdo + r.intervalMiles;
    } else if (r.dueOdometer) {
      r.dueOdometer = latestOdo + 5000;
    }

    await AutoPulseDB.put("reminders", r);
    await this.reloadAllData();
    this.showToast(`Reset ${r.title} interval from today`);
    this.triggerAutoSyncIfEnabled();
  },

  async seedStandardRemindersForVehicle() {
    const veh = this.getActiveVehicle();
    if (!veh) return;
    if (!confirm(`Add standard OEM recommended maintenance intervals for ${veh.name}? (Existing reminders will be preserved)`)) return;

    const standardReminders = [
      {
        title: "Engine Oil & Filter",
        intervalMiles: 5000,
        intervalMonths: 12,
        notes: "OEM Spec: Change oil and filter every 5,000-7,500 mi or 12 months (Max 10,000 mi)."
      },
      {
        title: "Tire Rotation & Brake Inspection",
        intervalMiles: 5000,
        intervalMonths: 12,
        notes: "Rotate tires at every oil change interval; inspect brake linings, drums, and pads."
      },
      {
        title: "Cabin Air Filter (A/C)",
        intervalMiles: 20000,
        intervalMonths: 24,
        notes: "OEM Spec: Replace cabin air / particulate filter every 20,000 mi or 24 months."
      },
      {
        title: "Engine Air Cleaner Filter",
        intervalMiles: 30000,
        intervalMonths: 36,
        notes: "OEM Spec: Replace engine air cleaner filter every 30,000 mi or 36 months."
      },
      {
        title: "Brake Fluid Flush",
        intervalMiles: 20000,
        intervalMonths: 24,
        notes: "Inspect and flush moisture-sensitive DOT 3 / DOT 4 brake fluid every 24 months."
      },
      {
        title: "Spark Plugs (2.4L / 3.2L)",
        intervalMiles: 100000,
        intervalMonths: 120,
        notes: "OEM Spec: Replace spark plugs at 100,000 miles or 10 years (30k mi if 2.4L PZEV)."
      },
      {
        title: "Engine Coolant Flush (OAT 10-Yr)",
        intervalMiles: 150000,
        intervalMonths: 120,
        notes: "OEM Mopar OAT Coolant: Flush and replace at 150,000 miles or 10 years."
      },
      {
        title: "Transfer Case / PTU / RDM Fluid (4WD)",
        intervalMiles: 60000,
        intervalMonths: 72,
        notes: "Inspect & service Power Transfer Unit (PTU) and Rear Drive Module (RDM) fluid under severe/frequent 4WD use."
      },
      {
        title: "State Safety & Emissions Inspection",
        intervalMiles: null,
        intervalMonths: 12,
        notes: "Annual state safety and emissions inspection (New York DMV)."
      },
      {
        title: "Windshield & Rear Wiper Blades",
        intervalMiles: null,
        intervalMonths: 12,
        notes: "Replace front (26-in driver, 18-in passenger) and rear (14-in) wiper blades annually or when streaking."
      }
    ];

    const curOdo = this.getLatestOdometerForVehicle(veh.id) || 0;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    for (const item of standardReminders) {
      const exists = this.reminders.some((r) => r.vehicleId === veh.id && r.title.toLowerCase() === item.title.toLowerCase());
      if (exists) continue;

      const dueD = new Date(today);
      if (item.intervalMonths) dueD.setMonth(dueD.getMonth() + item.intervalMonths);

      await AutoPulseDB.put("reminders", {
        id: "rem_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
        vehicleId: veh.id,
        title: item.title,
        intervalMiles: item.intervalMiles,
        intervalMonths: item.intervalMonths,
        startDate: todayStr,
        dueDate: item.intervalMonths ? dueD.toISOString().slice(0, 10) : null,
        startOdometer: curOdo,
        dueOdometer: item.intervalMiles ? curOdo + item.intervalMiles : null,
        notes: item.notes
      });
    }

    await this.reloadAllData();
    this.showToast(`Standard maintenance schedule added for ${veh.name}!`);
    this.triggerAutoSyncIfEnabled();
  },

  async deleteReminder(id) {
    if (!confirm("Delete this reminder?")) return;
    await AutoPulseDB.delete("reminders", id);
    await this.reloadAllData();
    this.showToast("Reminder deleted");
    this.triggerAutoSyncIfEnabled();
  },

  openVehicleModal(isEdit = false, vehId = null) {
    const modal = document.getElementById("vehicleModal");
    const v = isEdit ? this.vehicles.find((x) => x.id === (vehId || this.activeVehicleId)) : null;

    if (v) {
      document.getElementById("vehModalTitle").textContent = "Edit Vehicle";
      document.getElementById("vehId").value = v.id;
      document.getElementById("vehName").value = v.name || "";
      document.getElementById("vehYear").value = v.year || "";
      document.getElementById("vehBrand").value = v.brand || "";
      document.getElementById("vehModel").value = v.model || "";
      document.getElementById("vehLicense").value = v.license || "";
      document.getElementById("vehVin").value = v.vin || "";
      document.getElementById("vehPurchaseDate").value = v.purchaseDate || "";
      document.getElementById("vehPurchasePrice").value = v.purchasePrice || "";
      document.getElementById("vehDealer").value = v.purchasedFrom || "";
      document.getElementById("vehInitOdo").value = v.initialOdometer || 0;
    } else {
      document.getElementById("vehModalTitle").textContent = "Add New Vehicle";
      document.getElementById("vehId").value = "";
      document.getElementById("vehName").value = "";
      document.getElementById("vehYear").value = new Date().getFullYear();
      document.getElementById("vehBrand").value = "";
      document.getElementById("vehModel").value = "";
      document.getElementById("vehLicense").value = "";
      document.getElementById("vehVin").value = "";
      document.getElementById("vehPurchaseDate").value = "";
      document.getElementById("vehPurchasePrice").value = "";
      document.getElementById("vehDealer").value = "";
      document.getElementById("vehInitOdo").value = 0;
    }
    modal.classList.add("open");
  },

  async saveVehicleForm(e) {
    e.preventDefault();
    const id = document.getElementById("vehId").value || "veh_" + Date.now().toString(36);
    const veh = {
      id,
      name: document.getElementById("vehName").value.trim(),
      year: Number(document.getElementById("vehYear").value),
      brand: document.getElementById("vehBrand").value.trim(),
      model: document.getElementById("vehModel").value.trim(),
      license: document.getElementById("vehLicense").value.trim(),
      vin: document.getElementById("vehVin").value.trim(),
      purchaseDate: document.getElementById("vehPurchaseDate").value,
      purchasePrice: Number(document.getElementById("vehPurchasePrice").value) || 0,
      purchasedFrom: document.getElementById("vehDealer").value.trim(),
      initialOdometer: Number(document.getElementById("vehInitOdo").value) || 0
    };
    await AutoPulseDB.put("vehicles", veh);
    this.activeVehicleId = id;
    localStorage.setItem("autopulse_active_vehicle", id);
    this.closeModal("vehicleModal");
    await this.reloadAllData();
    this.showToast("Vehicle saved");
    this.triggerAutoSyncIfEnabled();

    if (this.returnToLogModalAfterVehicleAdd) {
      this.returnToLogModalAfterVehicleAdd = false;
      this.openLogModal();
    }
  },

  // GitHub Cloud Sync (Gist or Repo Contents API)
  loadGhSettings() {
    try {
      const raw = localStorage.getItem("autopulse_gh_sync");
      if (!raw) return;
      const cfg = JSON.parse(raw);
      document.getElementById("ghSyncMode").value = cfg.mode || "gist";
      document.getElementById("ghToken").value = cfg.token || "";
      document.getElementById("ghGistId").value = cfg.gistId || "";
      document.getElementById("ghRepoName").value = cfg.repo || "";
      document.getElementById("ghFilePath").value = cfg.path || "autopulse-data.json";
      document.getElementById("ghAutoSync").checked = !!cfg.autoSync;
      this.toggleGhSyncFields();
      this.updateGhBadge(cfg.token ? (cfg.lastSync ? `Synced ${cfg.lastSync}` : "Ready") : "Not Configured", !!cfg.token);
    } catch (_) {}
  },

  toggleGhSyncFields() {
    const mode = document.getElementById("ghSyncMode").value;
    document.getElementById("ghGistFields").style.display = mode === "gist" ? "flex" : "none";
    document.getElementById("ghRepoFields").style.display = mode === "repo" ? "flex" : "none";
  },

  getGhSettingsFromInputs() {
    return {
      mode: document.getElementById("ghSyncMode").value,
      token: document.getElementById("ghToken").value.trim(),
      gistId: document.getElementById("ghGistId").value.trim(),
      repo: document.getElementById("ghRepoName").value.trim(),
      path: document.getElementById("ghFilePath").value.trim() || "autopulse-data.json",
      autoSync: document.getElementById("ghAutoSync").checked
    };
  },

  saveGhSettings(notify = false) {
    const cfg = this.getGhSettingsFromInputs();
    localStorage.setItem("autopulse_gh_sync", JSON.stringify(cfg));
    this.updateGhBadge(cfg.token ? "Ready" : "Not Configured", !!cfg.token);
    if (notify) this.showToast("GitHub sync settings saved on device");
    return cfg;
  },

  updateGhBadge(text, ok = false) {
    const b = document.getElementById("ghSyncStatusBadge");
    if (!b) return;
    b.textContent = text;
    b.className = "badge " + (ok ? "badge-success" : "badge-primary");
  },

  triggerAutoSyncIfEnabled() {
    const cfg = this.getGhSettingsFromInputs();
    if (cfg.autoSync && cfg.token) {
      this.pushToGitHub(true);
    }
  },

  async pushToGitHub(silent = false) {
    const cfg = this.saveGhSettings(false);
    if (!cfg.token) {
      if (!silent) alert("Please enter a GitHub Personal Access Token first.");
      return;
    }

    try {
      this.updateGhBadge("Pushing...", false);
      const payload = await AutoPulseDB.exportFullBackup();
      const jsonStr = JSON.stringify(payload, null, 2);
      const headers = {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json"
      };

      if (cfg.mode === "gist") {
        const body = {
          description: "AutoPulse Vehicle Tracker Sync Data",
          public: false,
          files: { "autopulse-data.json": { content: jsonStr } }
        };
        const url = cfg.gistId ? `https://api.github.com/gists/${cfg.gistId}` : "https://api.github.com/gists";
        const method = cfg.gistId ? "PATCH" : "POST";
        const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
        const data = await res.json();
        document.getElementById("ghGistId").value = data.id;
      } else {
        if (!cfg.repo) throw new Error("Please specify your repository (e.g. username/car-tracker).");
        const apiUrl = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path}`;
        let sha = null;
        const getRes = await fetch(apiUrl, { headers });
        if (getRes.ok) {
          const existing = await getRes.json();
          sha = existing.sha;
        }
        const utf8Bytes = new TextEncoder().encode(jsonStr);
        let binary = "";
        utf8Bytes.forEach((b) => (binary += String.fromCharCode(b)));
        const body = {
          message: `Sync AutoPulse data (${new Date().toISOString().slice(0, 16)})`,
          content: btoa(binary)
        };
        if (sha) body.sha = sha;
        const putRes = await fetch(apiUrl, { method: "PUT", headers, body: JSON.stringify(body) });
        if (!putRes.ok) throw new Error(`GitHub API ${putRes.status}: ${await putRes.text()}`);
      }

      const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const updatedCfg = this.getGhSettingsFromInputs();
      updatedCfg.lastSync = nowStr;
      localStorage.setItem("autopulse_gh_sync", JSON.stringify(updatedCfg));
      this.updateGhBadge(`Synced ${nowStr}`, true);
      if (!silent) this.showToast("Pushed data to GitHub!");
    } catch (err) {
      this.updateGhBadge("Sync Error", false);
      if (!silent) alert("GitHub Push Failed: " + err.message);
    }
  },

  async pullFromGitHub() {
    const cfg = this.saveGhSettings(false);
    if (!cfg.token) {
      alert("Please enter your GitHub Personal Access Token first.");
      return;
    }

    try {
      this.updateGhBadge("Pulling...", false);
      const headers = {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`
      };

      let jsonStr = "";
      if (cfg.mode === "gist") {
        if (!cfg.gistId) throw new Error("Please enter your Gist ID to pull from.");
        const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, { headers });
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const fileObj = data.files["autopulse-data.json"] || Object.values(data.files)[0];
        if (!fileObj) throw new Error("No JSON file found in Gist.");
        jsonStr = fileObj.content;
      } else {
        if (!cfg.repo) throw new Error("Please enter your Repository (owner/repo).");
        const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${cfg.path}`, { headers });
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const binary = atob(data.content.replace(/\s/g, ""));
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        jsonStr = new TextDecoder().decode(bytes);
      }

      const parsed = JSON.parse(jsonStr);
      await AutoPulseDB.importFullBackup(parsed, false);
      await this.reloadAllData();
      const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      this.updateGhBadge(`Pulled ${nowStr}`, true);
      this.showToast("Pulled latest data from GitHub!");
    } catch (err) {
      this.updateGhBadge("Sync Error", false);
      alert("GitHub Pull Failed: " + err.message);
    }
  },

  // Google Drive Receipt Uploads (Option 4A: Apps Script Bridge)
  loadDriveSettings() {
    try {
      const raw = localStorage.getItem("autopulse_gdrive_cfg");
      if (!raw) return;
      const cfg = JSON.parse(raw);
      const urlEl = document.getElementById("gdScriptUrl");
      const folderEl = document.getElementById("gdFolderName");
      const secretEl = document.getElementById("gdSecretKey");
      if (urlEl) urlEl.value = cfg.scriptUrl || "";
      if (folderEl) folderEl.value = cfg.folderName || "AutoPulse Receipts";
      if (secretEl) secretEl.value = cfg.secretKey || "";
      this.updateDriveBadge(cfg.scriptUrl ? "Configured" : "Not Configured", !!cfg.scriptUrl);
    } catch (_) {}
  },

  getDriveSettingsFromInputs() {
    const urlEl = document.getElementById("gdScriptUrl");
    const folderEl = document.getElementById("gdFolderName");
    const secretEl = document.getElementById("gdSecretKey");
    return {
      scriptUrl: urlEl ? urlEl.value.trim() : "",
      folderName: (folderEl ? folderEl.value.trim() : "") || "AutoPulse Receipts",
      secretKey: secretEl ? secretEl.value.trim() : ""
    };
  },

  saveDriveSettings(notify = false) {
    const cfg = this.getDriveSettingsFromInputs();
    localStorage.setItem("autopulse_gdrive_cfg", JSON.stringify(cfg));
    this.updateDriveBadge(cfg.scriptUrl ? "Configured" : "Not Configured", !!cfg.scriptUrl);
    if (notify) this.showToast("Google Drive receipt settings saved");
    return cfg;
  },

  updateDriveBadge(text, ok = false) {
    const b = document.getElementById("gdStatusBadge");
    if (!b) return;
    b.textContent = text;
    b.className = "badge " + (ok ? "badge-success" : "badge-primary");
  },

  async testDriveConnection() {
    const cfg = this.saveDriveSettings(false);
    if (!cfg.scriptUrl) {
      alert("Please paste your Google Apps Script Web App URL first.");
      return;
    }

    try {
      this.updateDriveBadge("Testing...", false);
      const res = await fetch(cfg.scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "test",
          secret: cfg.secretKey || "",
          folderName: cfg.folderName || "AutoPulse Receipts"
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Apps Script returned an error");
      this.updateDriveBadge(`Ready (${data.folderName || cfg.folderName})`, true);
      this.showToast(`Connected! Folder "${data.folderName || cfg.folderName}" is ready in Google Drive.`);
    } catch (err) {
      this.updateDriveBadge("Connection Error", false);
      alert("Google Drive Test Failed: " + err.message);
    }
  },

  getAppsScriptTemplate() {
    return [
      "// AutoPulse — Google Drive Receipt Upload Bridge (Option 4A)",
      "// Paste this into https://script.google.com and click Deploy -> New deployment -> Web app",
      "const SECRET_KEY = ''; // Optional: set a passphrase here and in AutoPulse settings",
      "",
      "function getOrCreateFolder_(folderNameOrId) {",
      "  const target = (folderNameOrId || 'AutoPulse Receipts').trim();",
      "  // If it looks like a Drive Folder ID (no spaces, 25+ chars), try opening by ID first",
      "  if (/^[a-zA-Z0-9_-]{25,}$/.test(target)) {",
      "    try { return DriveApp.getFolderById(target); } catch (e) {}",
      "  }",
      "  const iter = DriveApp.getFoldersByName(target);",
      "  if (iter.hasNext()) return iter.next();",
      "  return DriveApp.createFolder(target);",
      "}",
      "",
      "function doPost(e) {",
      "  try {",
      "    const data = JSON.parse(e.postData.contents);",
      "    if (SECRET_KEY && data.secret !== SECRET_KEY) {",
      "      return jsonOut_({ ok: false, error: 'Invalid secret passphrase' });",
      "    }",
      "    const folder = getOrCreateFolder_(data.folderName);",
      "    if (data.action === 'test') {",
      "      return jsonOut_({ ok: true, folderName: folder.getName(), folderId: folder.getId() });",
      "    }",
      "    const bytes = Utilities.base64Decode(data.base64);",
      "    const blob = Utilities.newBlob(bytes, data.mimeType || 'application/octet-stream', data.fileName || 'receipt');",
      "    const file = folder.createFile(blob);",
      "    return jsonOut_({",
      "      ok: true,",
      "      fileId: file.getId(),",
      "      fileName: file.getName(),",
      "      url: file.getUrl(),",
      "      folderName: folder.getName()",
      "    });",
      "  } catch (err) {",
      "    return jsonOut_({ ok: false, error: String(err) });",
      "  }",
      "}",
      "",
      "function jsonOut_(obj) {",
      "  return ContentService.createTextOutput(JSON.stringify(obj))",
      "    .setMimeType(ContentService.MimeType.JSON);",
      "}"
    ].join("\n");
  },

  async copyAppsScriptCode() {
    const code = this.getAppsScriptTemplate();
    try {
      await navigator.clipboard.writeText(code);
      this.showToast("Apps Script code copied to clipboard!");
    } catch (_) {
      prompt("Copy the Google Apps Script code below:", code);
    }
  },

  closeModal(id) {
    document.getElementById(id).classList.remove("open");
  },

  // Export & Import Utilities
  async exportJsonBackup() {
    const payload = await AutoPulseDB.exportFullBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autopulse-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    this.showToast("JSON Backup downloaded");
  },

  exportCsvLogs() {
    const headers = ["VehicleID", "Date", "Odometer", "DeltaMiles", "Type", "Location", "FuelGrade", "Gallons", "PricePerGal", "TotalCost", "CalculatedMPG", "ReceiptAttached", "ReceiptName", "ReceiptURL", "Notes"];
    const lines = [headers.join(",")];
    this.computedLogs.forEach((r) => {
      const hasReceipt = !!(r.receipt && r.receipt.url);
      const row = [
        r.vehicleId,
        r.date,
        r.odometer,
        r.delta,
        r.type,
        `"${(r.location || "").replace(/"/g, '""')}"`,
        `"${(r.fuelGrade || "").replace(/"/g, '""')}"`,
        r.volume || "",
        r.pricePerGal || "",
        r.totalCost || "",
        r.mpg ? r.mpg.toFixed(2) : "",
        hasReceipt ? "Yes" : "No",
        `"${((r.receipt && r.receipt.name) || "").replace(/"/g, '""')}"`,
        `"${((r.receipt && r.receipt.url) || "").replace(/"/g, '""')}"`,
        `"${(r.notes || "").replace(/"/g, '""')}"`
      ];
      lines.push(row.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autopulse-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    this.showToast("CSV exported");
  },

  async handleJsonImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await AutoPulseDB.importFullBackup(data, true);
      await this.reloadAllData();
      this.showToast("JSON backup imported & merged!");
    } catch (err) {
      alert("Could not parse JSON file: " + err.message);
    }
    event.target.value = "";
  },

  async handleXlsxImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof XLSX === "undefined") {
      alert("SheetJS library requires an internet connection on first load, or use JSON import.");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const fmtDate = (v) => {
        if (!v) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v).slice(0, 10);
      };

      // 1. Vehicles
      if (wb.Sheets["Vehicles"]) {
        const vRows = XLSX.utils.sheet_to_json(wb.Sheets["Vehicles"]);
        for (const r of vRows) {
          if (!r.VIN) continue;
          await AutoPulseDB.put("vehicles", {
            id: "veh_" + r.VIN,
            vin: String(r.VIN),
            brand: r.Brand || "",
            model: r.Model || "",
            year: Number(r.Year) || 2017,
            name: r.Name || `${r.Year} ${r.Brand} ${r.Model}`,
            license: r.License || "",
            purchaseDate: fmtDate(r["Purchase Date"]),
            purchasePrice: Number(r["Purchase Price"]) || 0,
            purchasedFrom: r["Purchased From"] || "",
            initialOdometer: Number(r.Odometer) || 0
          });
        }
      }

      // 2. Events + Fuel + Maintenance/Repair
      const eventMap = {};
      if (wb.Sheets["Events"]) {
        const eRows = XLSX.utils.sheet_to_json(wb.Sheets["Events"]);
        eRows.forEach((r) => {
          if (r.Odometer) eventMap[String(r.Odometer)] = r;
        });
      }

      if (wb.Sheets["Fuel"]) {
        const fRows = XLSX.utils.sheet_to_json(wb.Sheets["Fuel"]);
        for (const f of fRows) {
          const odo = Number(f["Event ID"]);
          if (!odo) continue;
          const ev = eventMap[String(odo)] || {};
          const vehVin = ev["Vehicle ID"] || "1C4PJMCS1HW569660";
          await AutoPulseDB.put("logs", {
            id: String(f.ID || "F" + odo),
            vehicleId: "veh_" + vehVin,
            type: "fuel",
            date: fmtDate(ev.Date || f.Date),
            odometer: odo,
            location: ev.Location || "7 Eleven",
            notes: ev.Notes || "",
            fuelGrade: f.Fuel || "87 Gasoline",
            pricePerGal: Number(f["Price / Gal"]) || 0,
            totalCost: Number(f["Total Cost"]) || 0,
            volume: Number(f.Volume) || 0
          });
        }
      }

      // Check for Maintenance or Repair sheets in workbook and import as combined "service"
      for (const sheetName of ["Maintenance", "Repair", "Service"]) {
        if (wb.Sheets[sheetName]) {
          const sRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
          for (const s of sRows) {
            const odo = Number(s["Event ID"] || s.Odometer);
            if (!odo) continue;
            const ev = eventMap[String(odo)] || {};
            const vehVin = ev["Vehicle ID"] || "1C4PJMCS1HW569660";
            await AutoPulseDB.put("logs", {
              id: String(s.ID || "S" + odo + "_" + (s["Item"] || sheetName)),
              vehicleId: "veh_" + vehVin,
              type: "service",
              date: fmtDate(ev.Date || s.Date),
              odometer: odo,
              location: ev.Location || s.Shop || s.Location || "Service Shop",
              notes: ev.Notes || s.Notes || "",
              serviceItem: s.Item || s.Description || sheetName,
              totalCost: Number(s.Cost || s["Total Cost"] || s.Amount) || 0
            });
          }
        }
      }

      // 3. Filters
      if (wb.Sheets["Filters"]) {
        const flRows = XLSX.utils.sheet_to_json(wb.Sheets["Filters"]);
        for (const fl of flRows) {
          if (!fl["Filter Title"]) continue;
          await AutoPulseDB.put("reminders", {
            id: "rem_" + (fl.ID || Date.now().toString(36)),
            vehicleId: this.activeVehicleId || "veh_1C4PJMCS1HW569660",
            title: fl["Filter Title"],
            startDate: fmtDate(fl["Start Date"]),
            dueDate: fmtDate(fl["End Date"]),
            notes: "Imported from Excel Filters sheet"
          });
        }
      }

      await this.reloadAllData();
      this.showToast("Excel workbook imported!");
    } catch (err) {
      alert("Error importing Excel file: " + err.message);
    }
    event.target.value = "";
  },

  async resetToFactorySeed() {
    if (!confirm("Reset all local data back to the original 81 records from auto tracker.xlsx?")) return;
    await AutoPulseDB.clearAll();
    await AutoPulseDB.seedInitialData(window.SEED_DATA);
    await this.reloadAllData();
    this.showToast("Reset to original auto tracker.xlsx dataset");
  },

  showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  },

  escape(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
