import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

interface Material {
  id: string;
  name: string;
  density: number;
  pricePerKg: number;
}

interface Printer {
  id: string;
  name: string;
  powerRating: number;
  hourlyAmortization: number;
}

interface CustomSettings {
  electricityTariff: number;
  markupPercentage: number;
  prepCostFlat: number;
  failureRatePercent: number;
  postProcessingHours: number;
  postProcessingHourlyRate: number;
}

interface CalculationHistoryItem {
  id: string;
  date: string;
  fileName: string;
  printerName: string;
  materialName: string;
  weightGrams: number;
  printTimeHours: number;
  totalCostPrice: number;
  clientPrice: number;
}

interface Database {
  materials: Material[];
  printers: Printer[];
  settings: CustomSettings;
  history: CalculationHistoryItem[];
}

const DB_FILE = path.join(process.cwd(), "db.json");

const DEFAULT_MATERIALS: Material[] = [
  { id: "mat-1", name: "PLA (Standard)", density: 1.24, pricePerKg: 1500 },
  { id: "mat-2", name: "PETG (Durable)", density: 1.27, pricePerKg: 1600 },
  { id: "mat-3", name: "ABS (Rigid)", density: 1.05, pricePerKg: 1400 },
  { id: "mat-4", name: "TPU (Flexible)", density: 1.21, pricePerKg: 2400 },
  { id: "mat-5", name: "Nylon (High Impact)", density: 1.14, pricePerKg: 3500 },
  { id: "mat-6", name: "PETG Carbon Fiber", density: 1.32, pricePerKg: 4200 },
];

const DEFAULT_PRINTERS: Printer[] = [
  { id: "prn-1", name: "Bambu Lab X1-Carbon", powerRating: 220, hourlyAmortization: 60 },
  { id: "prn-2", name: "Bambu Lab A1 Mini", powerRating: 120, hourlyAmortization: 35 },
  { id: "prn-3", name: "Creality Ender 3 V3", powerRating: 250, hourlyAmortization: 20 },
  { id: "prn-4", name: "Prusa i3 MK4", powerRating: 180, hourlyAmortization: 50 },
  { id: "prn-5", name: "Voron 2.4 Custom CoreXY", powerRating: 350, hourlyAmortization: 80 },
  { id: "prn-6", name: "Flsun V400 Delta", powerRating: 220, hourlyAmortization: 65 },
  { id: "prn-7", name: "Anycubic Photon Mono M5s (SLA)", powerRating: 90, hourlyAmortization: 40 },
  { id: "prn-8", name: "Elegoo Saturn 4 Ultra", powerRating: 110, hourlyAmortization: 45 },
  { id: "prn-9", name: "Elegoo Neptune 4 Pro", powerRating: 180, hourlyAmortization: 22 },
  { id: "prn-10", name: "Artillery Sidewinder X4", powerRating: 240, hourlyAmortization: 30 },
  { id: "prn-11", name: "Picaso 3D Designer X", powerRating: 320, hourlyAmortization: 110 },
  { id: "prn-12", name: "Flying Bear Ghost 6", powerRating: 180, hourlyAmortization: 25 },
];

const DEFAULT_SETTINGS: CustomSettings = {
  electricityTariff: 5.5,
  markupPercentage: 100,
  prepCostFlat: 150,
  failureRatePercent: 10,
  postProcessingHours: 0,
  postProcessingHourlyRate: 400,
};

function readDatabase(): Database {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      const db = JSON.parse(data);
      return {
        materials: db.materials || DEFAULT_MATERIALS,
        printers: db.printers || DEFAULT_PRINTERS,
        settings: db.settings || DEFAULT_SETTINGS,
        history: db.history || [],
      };
    }
  } catch (err) {
    console.error("Error reading database file, using defaults:", err);
  }
  return {
    materials: DEFAULT_MATERIALS,
    printers: DEFAULT_PRINTERS,
    settings: DEFAULT_SETTINGS,
    history: [],
  };
}

function writeDatabase(db: Database) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing database file:", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: "50mb" }));

  // Initialize DB on server start
  if (!fs.existsSync(DB_FILE)) {
    writeDatabase({
      materials: DEFAULT_MATERIALS,
      printers: DEFAULT_PRINTERS,
      settings: DEFAULT_SETTINGS,
      history: [],
    });
  }

  // --- API Endpoints ---

  // Get full state
  app.get("/api/database", (req, res) => {
    const db = readDatabase();
    res.json(db);
  });

  // Save materials list
  app.post("/api/materials", (req, res) => {
    const { materials } = req.body;
    if (Array.isArray(materials)) {
      const db = readDatabase();
      db.materials = materials;
      writeDatabase(db);
      return res.json({ success: true, materials: db.materials });
    }
    res.status(400).json({ error: "Invalid materials list format" });
  });

  // Save printers list
  app.post("/api/printers", (req, res) => {
    const { printers } = req.body;
    if (Array.isArray(printers)) {
      const db = readDatabase();
      db.printers = printers;
      writeDatabase(db);
      return res.json({ success: true, printers: db.printers });
    }
    res.status(400).json({ error: "Invalid printers list format" });
  });

  // Save settings
  app.post("/api/settings", (req, res) => {
    const { settings } = req.body;
    if (settings && typeof settings === "object") {
      const db = readDatabase();
      db.settings = { ...db.settings, ...settings };
      writeDatabase(db);
      return res.json({ success: true, settings: db.settings });
    }
    res.status(400).json({ error: "Invalid settings format" });
  });

  // Load history list
  app.get("/api/history", (req, res) => {
    const db = readDatabase();
    res.json(db.history || []);
  });

  // Append new calculation item to history
  app.post("/api/history", (req, res) => {
    const { item } = req.body;
    if (item && typeof item === "object") {
      const db = readDatabase();
      if (!db.history) db.history = [];
      const newItem: CalculationHistoryItem = {
        id: item.id || `hist-${Date.now()}`,
        date: item.date || new Date().toISOString(),
        fileName: item.fileName || "Неизвестная модель",
        printerName: item.printerName || "Стандартный принтер",
        materialName: item.materialName || "Стандартный пластик",
        weightGrams: Number(item.weightGrams) || 0,
        printTimeHours: Number(item.printTimeHours) || 0,
        totalCostPrice: Number(item.totalCostPrice) || 0,
        clientPrice: Number(item.clientPrice) || 0,
      };
      db.history.unshift(newItem);
      // Cap history list at 100 items for tidiness
      if (db.history.length > 100) {
        db.history = db.history.slice(0, 100);
      }
      writeDatabase(db);
      return res.json({ success: true, history: db.history });
    }
    res.status(400).json({ error: "Invalid calculation item format" });
  });

  // Clear calculation history
  app.delete("/api/history", (req, res) => {
    const db = readDatabase();
    db.history = [];
    writeDatabase(db);
    res.json({ success: true, history: [] });
  });

  // --- Vite and Statics Integration ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
