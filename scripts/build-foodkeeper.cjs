const fs = require('fs');

const [, , input = 'foodkeeper-raw.json', output = 'src/data/foodkeeper.json'] = process.argv;
const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const sheet = raw.sheets.find((s) => s.name === 'Product');
if (!sheet) throw new Error('No "Product" sheet found in file');

// Each row is a list of single-key objects: [{ID: 1}, {Name: "Butter"}, ...]
const toObj = (row) => Object.assign({}, ...row);

const UNIT_DAYS = { day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30, year: 365, years: 365 };

const days = (o, prefix) => {
  const amount = o[`${prefix}_Max`] ?? o[`${prefix}_Min`];
  const metric = String(o[`${prefix}_Metric`] ?? '').trim().toLowerCase();
  if (!amount || !UNIT_DAYS[metric]) return null;
  return Math.round(Number(amount) * UNIT_DAYS[metric]);
};

const products = sheet.data
  .map(toObj)
  .map((o) => ({
    id: o.ID,
    name: [o.Name, o.Name_subtitle].filter(Boolean).join(', ').toLowerCase(),
    keywords: String(o.Keywords ?? '')
      .toLowerCase()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    pantry: days(o, 'Pantry') ?? days(o, 'DOP_Pantry'),
    fridge: days(o, 'Refrigerate') ?? days(o, 'DOP_Refrigerate'),
    freezer: days(o, 'Freeze') ?? days(o, 'DOP_Freeze'),
  }))
  .filter((p) => p.pantry || p.fridge || p.freezer);

fs.mkdirSync(require('path').dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(products));
console.log(`Wrote ${products.length} products to ${output}`);