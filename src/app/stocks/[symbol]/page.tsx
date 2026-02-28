import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StockChartPanel } from '@/components/stock-chart-panel';
import { getStockDetail } from '@/lib/screener';
import { formatCurrency, formatPct } from '@/lib/utils';

export const revalidate = 300;

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;

  let detail;
  try {
    detail = await getStockDetail(symbol);
  } catch {
    return notFound();
  }

  const s = detail.snapshot;
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
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-slate-500 text-sm">DCF Fair Value / Share</p>
            <p className="text-2xl font-semibold text-blue-700">{formatCurrency(s.dcf.valuePerShare)}</p>
          </div>
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
          <h2 className="text-xl font-semibold">DCF Assumptions</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>Base FCF: {formatCurrency(s.dcf.assumptions.baseFcf, 0)}</li>
            <li>Discount rate (WACC proxy): {(s.dcf.assumptions.discountRate * 100).toFixed(1)}%</li>
            <li>Terminal growth: {(s.dcf.assumptions.terminalGrowth * 100).toFixed(1)}%</li>
            <li>Forecast years: {s.dcf.assumptions.forecastYears}</li>
            <li>Shares outstanding: {Intl.NumberFormat('en-US').format(Math.round(s.dcf.assumptions.sharesOutstanding))}</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
