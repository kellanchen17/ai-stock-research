import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStockDetail } from '@/lib/screener';

export const revalidate = 300;

export default async function StockCaratPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { symbol } = await params;
  const { q } = await searchParams;

  let detail;
  try {
    detail = await getStockDetail(symbol);
  } catch {
    return notFound();
  }

  const s = detail.snapshot;
  const backHref = q ? `/stocks/${s.symbol}?q=${encodeURIComponent(q)}` : `/stocks/${s.symbol}`;
  const clarityExplanation =
    s.clarityLabel === 'High Clarity'
      ? 'High Clarity means cleaner fundamentals and steadier earnings patterns.'
      : 'Low Clarity means higher earnings volatility or balance-sheet noise that can reduce confidence.';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <Link href={backHref} className="text-blue-700 hover:text-blue-600">← Back to {s.symbol}</Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Carat Rating System</h1>
          <p className="mt-2 text-sm text-slate-700">
            Carat rating is a premium-style score built from a 0-100 composite. Higher carats represent rarer, stronger
            opportunities across business quality, growth, financial strength, valuation, and momentum.
          </p>
          <ul className="mt-3 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Composite score 0-100 is calculated from weighted fundamentals + market behavior.</li>
            <li>Composite score is converted into a 1.0-5.0 carat scale.</li>
            <li>Clarity modifier explains the reliability of accounting/earnings quality.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{s.name} ({s.symbol})</h2>
          <p className="mt-3 text-sm text-slate-700">
            <span className="font-semibold">Rating:</span> 💎 {s.caratRating.toFixed(1)} ct
            {' · '}
            <span className="font-semibold">{s.clarityLabel}</span>
          </p>
          <p className="mt-2 text-sm text-slate-700">{clarityExplanation}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Composite: <span className="font-semibold">{s.compositeScore}</span></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Clarity Score: <span className="font-semibold">{s.clarityScore}</span></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Quality: <span className="font-semibold">{s.qualityScore}</span></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Growth: <span className="font-semibold">{s.growthScore}</span></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Financial Strength: <span className="font-semibold">{s.financialStrengthScore}</span></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Valuation: <span className="font-semibold">{s.valueScore}</span></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Momentum: <span className="font-semibold">{s.momentumScore}</span></div>
          </div>
        </section>
      </div>
    </main>
  );
}
