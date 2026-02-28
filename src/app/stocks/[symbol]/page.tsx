import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StockChartPanel } from '@/components/stock-chart-panel';
import { generateStockInsights } from '@/lib/ai';
import { getStockDetail } from '@/lib/screener';
import { formatCurrency, formatPct } from '@/lib/utils';

export const revalidate = 300;

export default async function StockPage({
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
  const insights = await generateStockInsights(s, q);
  const dcfHref = q ? `/stocks/${s.symbol}/dcf?q=${encodeURIComponent(q)}` : `/stocks/${s.symbol}/dcf`;
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <Link href="/" className="text-blue-700 hover:text-blue-600">← Back to dashboard</Link>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">{s.sector}</p>
              <h1 className="text-4xl font-bold">{s.symbol}</h1>
              <p className="text-slate-600">{s.name}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold">{formatCurrency(s.price)}</p>
              <p className={s.changePct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatPct(s.changePct)}</p>
              <p className="text-amber-600 text-sm mt-1">Morningstar Stars: {s.morningstarStars ? '★'.repeat(s.morningstarStars) : 'N/A'}</p>
            </div>
          </div>
        </section>

        <StockChartPanel symbol={s.symbol} initialCandles={detail.candles} />

        <section className="grid gap-4 md:grid-cols-3">
          <Link href={dcfHref} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300 transition">
            <p className="text-slate-500 text-sm">DCF Fair Value / Share</p>
            <p className="text-2xl font-semibold text-blue-700">{formatCurrency(s.dcf.valuePerShare)}</p>
            <p className="mt-1 text-xs text-blue-700">Open DCF assumptions →</p>
          </Link>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-slate-500 text-sm">Implied Discount / Upside</p>
            <p className={s.dcf.upsidePct >= 0 ? 'text-2xl font-semibold text-emerald-600' : 'text-2xl font-semibold text-rose-600'}>{formatPct(s.dcf.upsidePct)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-slate-500 text-sm">Quality / Value / Moat Proxy</p>
            <p className="text-2xl font-semibold text-indigo-700">{s.qualityScore} / {s.valueScore} / {s.moatProxyScore}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">AI Company Summary (Ollama)</h2>
          <p className="mt-3 text-sm text-slate-700">{insights.companySummary}</p>
          {q ? <p className="mt-3 text-xs text-slate-500">Context from your search: “{q}”</p> : null}
          <h3 className="mt-4 text-sm font-semibold text-slate-800">Relevant ideas</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-slate-700">
            {insights.relevantIdeas.map((idea) => <li key={idea}>{idea}</li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}
