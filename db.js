// Native IndexedDB Wrapper for AutoPulse Local-First PWA
const DB_NAME = "AutoPulseDB";
const DB_VERSION = 1;

window.AutoPulseDB = {
  db: null,

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("vehicles")) {
          db.createObjectStore("vehicles", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("logs")) {
          const logStore = db.createObjectStore("logs", { keyPath: "id" });
          logStore.createIndex("vehicleId", "vehicleId", { unique: false });
          logStore.createIndex("odometer", "odometer", { unique: false });
        }
        if (!db.objectStoreNames.contains("reminders")) {
          const remStore = db.createObjectStore("reminders", { keyPath: "id" });
          remStore.createIndex("vehicleId", "vehicleId", { unique: false });
        }
      };

      req.onsuccess = async (e) => {
        this.db = e.target.result;
        const vehicles = await this.getAll("vehicles");
        if (vehicles.length === 0 && window.SEED_DATA) {
          await this.seedInitialData(window.SEED_DATA);
        }
        resolve(this.db);
      };

      req.onerror = (e) => reject(e.target.error);
    });
  },

  async seedInitialData(seed) {
    for (const v of seed.vehicles || []) {
      await this.put("vehicles", v);
    }
    for (const l of seed.logs || []) {
      await this.put("logs", l);
    }
    for (const r of seed.reminders || []) {
      await this.put("reminders", r);
    }
  },

  async getAll(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async put(storeName, item) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async delete(storeName, id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async clearAll() {
    await this.init();
    for (const name of ["vehicles", "logs", "reminders"]) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(name, "readwrite");
        const req = tx.objectStore(name).clear();
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    }
  },

  async exportFullBackup() {
    const [vehicles, logs, reminders] = await Promise.all([
      this.getAll("vehicles"),
      this.getAll("logs"),
      this.getAll("reminders")
    ]);
    return {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      vehicles,
      reminders,
      logs
    };
  },

  async importFullBackup(payload, merge = true) {
    if (!merge) {
      await this.clearAll();
    }
    for (const v of payload.vehicles || []) {
      await this.put("vehicles", v);
    }
    for (const r of payload.reminders || []) {
      await this.put("reminders", r);
    }
    for (const l of payload.logs || []) {
      await this.put("logs", l);
    }
  }
};
