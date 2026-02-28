'use client';

import { useMemo, useState } from 'react';
import { PriceChart } from './price-chart';

const RANGES = ['1M', '3M', '6M', 'YTD', 'ALL'] as const;
type RangeKey = typeof RANGES[number];

type Point = { date: string; close: number };

function toPoints(candles: { t: number[]; c: number[] }): Point[] {
  return candles.t.map((t, i) => ({
    date: new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    close: candles.c[i],
  }));
}

export function StockChartPanel({
  symbol,
  initialCandles,
}: {
  symbol: string;
  initialCandles: { t: number[]; c: number[] };
}) {
  const [range, setRange] = useState<RangeKey>('6M');
  const [candles, setCandles] = useState(initialCandles);
  const [loading, setLoading] = useState(false);

  const points = useMemo(() => toPoints(candles), [candles]);

  async function changeRange(next: RangeKey) {
    if (next === range) return;
    setRange(next);
    setLoading(true);
    try {
      const res = await fetch(`/api/stock/${symbol}/chart?range=${next}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load chart');
      setCandles(json.candles ?? { t: [], c: [] });
    } catch {
      setCandles({ t: [], c: [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Price Chart</p>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => changeRange(r)}
              className={`rounded-lg px-3 py-1 text-xs font-medium border ${
                range === r
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-blue-300'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {loading ? <p className="text-xs text-slate-500">Loading {range} chart…</p> : null}
      <PriceChart points={points} />
    </section>
  );
}

