import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStockDetail } from '@/lib/screener';
import { formatCurrency } from '@/lib/utils';

export const revalidate = 300;

export default async function StockDcfPage({
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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <Link href={backHref} className="text-blue-700 hover:text-blue-600">← Back to {s.symbol}</Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">DCF Assumptions · {s.symbol}</h1>
          <p className="mt-1 text-sm text-slate-500">{s.name}</p>

          <ul className="mt-5 space-y-2 text-sm text-slate-700">
            <li>Base FCF: {formatCurrency(s.dcf.assumptions.baseFcf, 0)}</li>
            <li>Discount rate (WACC proxy): {(s.dcf.assumptions.discountRate * 100).toFixed(1)}%</li>
            <li>Terminal growth: {(s.dcf.assumptions.terminalGrowth * 100).toFixed(1)}%</li>
            <li>Forecast years: {s.dcf.assumptions.forecastYears}</li>
            <li>Shares outstanding: {Intl.NumberFormat('en-US').format(Math.round(s.dcf.assumptions.sharesOutstanding))}</li>
          </ul>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-800">Year-by-year growth assumptions</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.dcf.assumptions.growthRates.map((g, i) => (
                <span key={`${i}-${g}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  Y{i + 1}: {(g * 100).toFixed(1)}%
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

