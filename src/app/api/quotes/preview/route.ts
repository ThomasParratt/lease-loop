// GET /api/quotes/preview?assetId=ebike-003&quantity=1&termMonths=36&downPaymentCents=0
// The live sliders: prices on the request's day without storing anything.
import { handleRoute, ok } from '@/server/api-response';
import { todayForRequest } from '@/server/demo-clock';
import { loadPricingData, previewQuote } from '@/server/quotes';
import { previewQuoteQuerySchema } from '@/server/quote-schemas';

export const GET = handleRoute(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const query = previewQuoteQuerySchema.parse({
    assetId: searchParams.get('assetId') ?? undefined,
    quantity: searchParams.get('quantity') ?? undefined,
    termMonths: searchParams.get('termMonths') ?? undefined,
    downPaymentCents: searchParams.get('downPaymentCents') ?? undefined,
  });
  const today = await todayForRequest();
  return ok(previewQuote(await loadPricingData(), { ...query, today }));
});
