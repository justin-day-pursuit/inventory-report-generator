/**
 * ============================================================================
 * DATA FILE HELPERS (lib/data-store.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Reads and writes the JSON data files that currently stand in for department
 * API integrations. Every "Load" button on the webpage eventually reaches here.
 *
 * FOLDER MAP (do not rename without updating the paths below):
 *   data/inventory/inventory.json       → current warehouse stock (writable by Update)
 *   data/inventory/inventory.seed.json  → baseline snapshot — restore with npm run restore:inventory
 *   data/sales/sales.json               → sold products from sales
 *   data/incoming/incoming.json         → deliveries from receiving / suppliers
 *
 * DEPLOYMENT:
 * - On Docker/VM hosts, mount a persistent volume at /app/data so inventory
 *   updates survive redeploys (see Dockerfile / README).
 * - Ephemeral serverless filesystems will lose writes; use an external DB/API then.
 * ============================================================================
 */

import { promises as fs } from "fs";
import path from "path";
import type { IncomingItem, InventoryItem, SalesItem } from "./inventory";

/** Absolute paths to the three JSON data folders / files. */
const DATA_ROOT = path.join(process.cwd(), "data");

export const DATA_PATHS = {
  inventoryDir: path.join(DATA_ROOT, "inventory"),
  salesDir: path.join(DATA_ROOT, "sales"),
  incomingDir: path.join(DATA_ROOT, "incoming"),
  inventoryFile: path.join(DATA_ROOT, "inventory", "inventory.json"),
  inventorySeedFile: path.join(DATA_ROOT, "inventory", "inventory.seed.json"),
  salesFile: path.join(DATA_ROOT, "sales", "sales.json"),
  incomingFile: path.join(DATA_ROOT, "incoming", "incoming.json"),
} as const;

/**
 * Reads a JSON file and returns parsed content.
 * If the file is missing or empty, returns the provided fallback (usually []).
 */
async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    return JSON.parse(trimmed) as T;
  } catch (error) {
    // ENOENT = file does not exist yet — treat as empty data, not a crash.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

/** Load current inventory list from data/inventory/inventory.json */
export async function readInventory(): Promise<InventoryItem[]> {
  return readJsonFile<InventoryItem[]>(DATA_PATHS.inventoryFile, []);
}

/** Load sales feed from data/sales/sales.json */
export async function readSales(): Promise<SalesItem[]> {
  return readJsonFile<SalesItem[]>(DATA_PATHS.salesFile, []);
}

/** Load incoming supplies from data/incoming/incoming.json */
export async function readIncoming(): Promise<IncomingItem[]> {
  return readJsonFile<IncomingItem[]>(DATA_PATHS.incomingFile, []);
}

/**
 * Saves the updated inventory list after sales/supplies are applied.
 * Pretty-prints with 2-space indent so a non-developer can open and review it.
 */
export async function writeInventory(items: InventoryItem[]): Promise<void> {
  await fs.mkdir(DATA_PATHS.inventoryDir, { recursive: true });
  await fs.writeFile(
    DATA_PATHS.inventoryFile,
    `${JSON.stringify(items, null, 2)}\n`,
    "utf8"
  );
}
