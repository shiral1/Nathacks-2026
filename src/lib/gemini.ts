const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

// Check AI Studio for the current Flash model name if this one errors
const MODEL = 'gemini-3.6-flash';

export type ReceiptItem = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
};

const PROMPT = `You are reading a grocery receipt.
Extract ONLY food and grocery items. Ignore store info, payment, card numbers, totals, taxes, and discounts.
For each item:
- Expand abbreviations into a plain, common ingredient name (e.g. "GRN ONION" -> "green onion", "ORG BNLS CHKN BRST" -> "chicken breast").
- quantity: number of units bought (default 1). If sold by weight, use the weight.
- unit: "item", "kg", "g", "lb", "L", "mL", etc.
- category: one of produce, meat, seafood, dairy, bakery, pantry, frozen, beverages, other.
If the image is not a receipt, return an empty list.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unit: { type: 'STRING' },
          category: { type: 'STRING' },
        },
        required: ['name', 'quantity', 'unit', 'category'],
      },
    },
  },
  required: ['items'],
};

export async function parseReceipt(base64: string, mimeType = 'image/jpeg'): Promise<ReceiptItem[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY ?? '',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
        },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? 'Gemini request failed');

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"items":[]}';
  return JSON.parse(text).items ?? [];
}