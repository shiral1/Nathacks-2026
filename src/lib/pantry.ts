import AsyncStorage from '@react-native-async-storage/async-storage';
import { shelfLifeDays } from './foodkeeper';

const PANTRY_KEY = 'pantry';
const RECEIPTS_KEY = 'receipts';

export type PantryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  addedAt: string; // ISO timestamp (last restocked)
  receiptId?: string;
  shelfDays?: number; // from USDA FoodKeeper when matched
};

export type ReceiptLine = { name: string; quantity: number; unit: string; category: string };

export type Receipt = {
  id: string;
  scannedAt: string;
  items: ReceiptLine[];
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const norm = (s: string) => s.trim().toLowerCase();
const round = (n: number) => Math.round(n * 100) / 100;

// ---------- Pantry ----------
export async function loadPantry(): Promise<PantryItem[]> {
  const raw = await AsyncStorage.getItem(PANTRY_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function savePantry(items: PantryItem[]) {
  await AsyncStorage.setItem(PANTRY_KEY, JSON.stringify(items));
}

export async function removeFromPantry(id: string) {
  const pantry = await loadPantry();
  await savePantry(pantry.filter((item) => item.id !== id));
}

export async function updatePantryItem(id: string, patch: Partial<PantryItem>) {
  const pantry = await loadPantry();
  await savePantry(pantry.map((it) => (it.id === id ? { ...it, ...patch } : it)));
}

export async function clearPantry() {
  await AsyncStorage.removeItem(PANTRY_KEY);
}

// Subtract used amounts after cooking (never below 0). Used by the Recipes tab.
export async function useIngredients(used: { id: string; amount: number }[]) {
  const pantry = await loadPantry();
  for (const u of used) {
    const item = pantry.find((p) => p.id === u.id);
    if (item) item.quantity = Math.max(0, round(item.quantity - u.amount));
  }
  await savePantry(pantry);
}

// ---------- Receipts ----------
export async function loadReceipts(): Promise<Receipt[]> {
  const raw = await AsyncStorage.getItem(RECEIPTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function deleteReceipt(id: string) {
  const receipts = await loadReceipts();
  await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts.filter((r) => r.id !== id)));
}

// Saves ONE receipt: merges items into the pantry and records the receipt
export async function addToPantry(newItems: ReceiptLine[]) {
  if (newItems.length === 0) return;
  const now = new Date().toISOString();
  const receiptId = newId();

  // Merge duplicate lines within this receipt
  const lines: ReceiptLine[] = [];
  for (const item of newItems) {
    const same = lines.find((l) => norm(l.name) === norm(item.name) && norm(l.unit) === norm(item.unit));
    if (same) same.quantity = round(same.quantity + item.quantity);
    else lines.push({ ...item, name: norm(item.name) });
  }

  // Merge into pantry: same name + unit → add quantity, refresh date and shelf life
  const pantry = await loadPantry();
  for (const line of lines) {
    const shelfDays = shelfLifeDays(line.name, line.category) ?? undefined;
    const existing = pantry.find(
      (p) => norm(p.name) === norm(line.name) && norm(p.unit) === norm(line.unit)
    );

    if (existing) {
      existing.quantity = round(Math.max(0, existing.quantity) + line.quantity);
      existing.addedAt = now;
      existing.receiptId = receiptId;
      existing.shelfDays = shelfDays;
    } else {
      pantry.push({ ...line, id: newId(), addedAt: now, receiptId, shelfDays });
    }
  }
  await savePantry(pantry);

  const receipts = await loadReceipts();
  await AsyncStorage.setItem(
    RECEIPTS_KEY,
    JSON.stringify([{ id: receiptId, scannedAt: now, items: lines }, ...receipts])
  );
}

// ---------- Expiry ----------
// Fallback shelf life in days per category, used when no FoodKeeper match is found.
const SHELF_DAYS: Record<string, number> = {
  produce: 7,
  meat: 3,
  seafood: 2,
  dairy: 10,
  bakery: 5,
  frozen: 90,
  pantry: 180,
  beverages: 30,
  other: 30,
};

export const PERISHABLE = ['produce', 'meat', 'seafood', 'dairy', 'bakery'];

export const isPerishable = (item: PantryItem) => PERISHABLE.includes(item.category);

export function daysLeft(item: PantryItem): number {
  const since = Math.floor((Date.now() - new Date(item.addedAt).getTime()) / 86_400_000);
  return (item.shelfDays ?? SHELF_DAYS[item.category] ?? 30) - since;
}

export type Status = 'fresh' | 'soon' | 'expired' | 'out';

export function getStatus(item: PantryItem): Status {
  if (item.quantity <= 0) return 'out';
  const d = daysLeft(item);
  if (d < 0) return 'expired';
  if (d <= 2 && isPerishable(item)) return 'soon';
  return 'fresh';
}