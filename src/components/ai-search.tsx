'use client';

import { useState } from 'react';
import type { StockSnapshot } from '@/lib/types';
import { StockCard } from './stock-card';

type AiResult = {
  explanation: string;
  provider: string;
  filters: Record<string, unknown>;
  results: StockSnapshot[];
};

export function AiSearch({ initial }: { initial: StockSnapshot[] }) {
  const [query, setQuery] = useState('Find me stocks on discounts in the industrials sector with 4+ Morningstar stars');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI screen failed');
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const results = data?.results ?? initial;

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-medium text-slate-700">AI Stock Search</p>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring"
            placeholder="e.g. find discounted industrial stocks with quality balance sheets"
          />
          <button
            disabled={loading}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {data && (
          <p className="mt-3 text-sm text-slate-700">{data.explanation}</p>
        )}
        {data && (
          <p className="mt-1 text-xs text-slate-500">Provider: {data.provider}</p>
        )}
        {data?.provider === 'heuristic' && (
          <p className="mt-1 text-xs text-amber-700">
            Ollama is unavailable, so the app used rule-based parsing. Start Ollama to re-enable full AI responses.
          </p>
        )}
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
      </form>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {results.map((stock) => <StockCard key={stock.symbol} stock={stock} />)}
      </div>
    </div>
  );
}
