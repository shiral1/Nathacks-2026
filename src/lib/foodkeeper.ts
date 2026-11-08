import data from '../data/foodkeeper.json';

type Product = {
  id: number;
  name: string;
  keywords: string[];
  pantry: number | null;
  fridge: number | null;
  freezer: number | null;
};

const PRODUCTS = data as Product[];

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/(es|s)$/, '')); // onions -> onion

// Pre-compute word sets once
const INDEX = PRODUCTS.map((p) => ({
  product: p,
  words: new Set([...words(p.name), ...p.keywords.flatMap(words)]),
}));

export function findFoodKeeper(name: string): Product | null {
  const target = words(name);
  if (target.length === 0) return null;

  let best: Product | null = null;
  let bestScore = 0;
  for (const { product, words: pw } of INDEX) {
    const hits = target.filter((w) => pw.has(w)).length;
    const score = hits / target.length;
    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

// Picks the storage that makes sense for the category
export function shelfLifeDays(name: string, category: string): number | null {
  const p = findFoodKeeper(name);
  if (!p) return null;
  if (category === 'frozen') return p.freezer ?? p.fridge ?? p.pantry;
  const fridgeFirst = ['produce', 'meat', 'seafood', 'dairy'].includes(category);
  return (fridgeFirst ? p.fridge ?? p.pantry : p.pantry ?? p.fridge) ?? p.freezer;
}