import { getOpenAI } from '@/lib/openai'

export type ReceiptExtraction = {
  vendor: string | null
  amountCents: number | null
  taxCents: number | null
  date: string | null // YYYY-MM-DD
  category: string | null
}

const CATEGORIES = ['materials', 'fuel', 'meals', 'travel', 'equipment', 'office', 'utilities', 'uncategorized']

// First vision-input AI call in this codebase (lib/imageGen.ts's
// openai.images.generate() is text-in/image-out; this is the reverse).
// Reuses getOpenAI()'s client instantiation, same as every other AI
// feature in this app. Never throws — a failed/garbled extraction just
// means the expense row gets inserted with blank fields and
// status='needs_review', matching the "AI proposes, human confirms"
// pattern (see lib/amberTools.ts) at a lighter weight: worst case is an
// empty form for the user to fill in, not a failed upload.
export async function parseReceiptImage(imageUrl: string): Promise<{ extraction: ReceiptExtraction; raw: string }> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract structured data from photos of paper receipts for a small-business expense tracker. ' +
            `Respond ONLY with JSON: {"vendor": string|null, "amountCents": number|null (total paid, in cents), ` +
            `"taxCents": number|null (tax portion, in cents), "date": string|null (YYYY-MM-DD), "category": one of ${JSON.stringify(CATEGORIES)} or null}. ` +
            'If a field is not legible or not present, use null. Never guess a number you cannot read.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the vendor, total amount, tax, date, and best-fit category from this receipt.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw)
    return {
      raw,
      extraction: {
        vendor: typeof parsed.vendor === 'string' ? parsed.vendor : null,
        amountCents: Number.isFinite(parsed.amountCents) ? Math.round(parsed.amountCents) : null,
        taxCents: Number.isFinite(parsed.taxCents) ? Math.round(parsed.taxCents) : null,
        date: typeof parsed.date === 'string' ? parsed.date : null,
        category: CATEGORIES.includes(parsed.category) ? parsed.category : null,
      },
    }
  } catch (err: any) {
    return { raw: JSON.stringify({ error: err?.message ?? 'extraction failed' }), extraction: { vendor: null, amountCents: null, taxCents: null, date: null, category: null } }
  }
}
