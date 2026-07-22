import type { InventoryItem } from "./inventory";

export const sampleInventory: InventoryItem[] = [
  { sku: "SKU-001", name: "USB-C Cable 1m", quantity: 120, reorderThreshold: 40, unitPrice: 6.5 },
  { sku: "SKU-002", name: "Wireless Mouse", quantity: 18, reorderThreshold: 25, unitPrice: 21.0 },
  { sku: "SKU-003", name: "Mechanical Keyboard", quantity: 0, reorderThreshold: 10, unitPrice: 79.99 },
  { sku: "SKU-004", name: "27in Monitor", quantity: 7, reorderThreshold: 5, unitPrice: 199.0 },
  { sku: "SKU-005", name: "Laptop Stand", quantity: 54, reorderThreshold: 20, unitPrice: 34.5 },
  { sku: "SKU-006", name: "Webcam 1080p", quantity: 3, reorderThreshold: 8, unitPrice: 45.0 },
];

export const sampleCsv = `sku,name,quantity,reorderThreshold,unitPrice
SKU-001,USB-C Cable 1m,120,40,6.5
SKU-002,Wireless Mouse,18,25,21.0
SKU-003,Mechanical Keyboard,0,10,79.99
SKU-004,27in Monitor,7,5,199.0
SKU-005,Laptop Stand,54,20,34.5
SKU-006,Webcam 1080p,3,8,45.0`;
