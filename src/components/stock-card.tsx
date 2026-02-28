import Link from 'next/link';
import type { StockSnapshot } from '@/lib/types';
import { formatCurrency, formatPct } from '@/lib/utils';

export function StockCard({ stock }: { stock: StockSnapshot }) {
  const good = stock.dcf.upsidePct >= 0;

  return (
    <Link
      href={`/stocks/${stock.symbol}`}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{stock.sector}</p>
          <h3 className="text-lg font-semibold text-slate-900">{stock.symbol}</h3>
          <p className="text-sm text-slate-600 line-clamp-1">{stock.name}</p>
        </div>
        <div className="text-right">
          <p className="text-slate-900 font-semibold">{formatCurrency(stock.price)}</p>
          <p className={stock.changePct >= 0 ? 'text-emerald-600 text-sm' : 'text-rose-600 text-sm'}>{formatPct(stock.changePct)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-slate-500">DCF Upside</p>
          <p className={good ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>{formatPct(stock.dcf.upsidePct)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-slate-500">Morningstar</p>
          <p className="text-amber-500 font-medium">{stock.morningstarStars ? '★'.repeat(stock.morningstarStars) : '—'}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-slate-500">Value Score</p>
          <p className="text-blue-700 font-medium">{stock.valueScore}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-slate-500">Quality</p>
          <p className="text-indigo-700 font-medium">{stock.qualityScore}</p>
        </div>
      </div>
    </Link>
  );
}
