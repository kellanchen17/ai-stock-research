import { AiSearch } from '@/components/ai-search';
import { applyFilters, getUniverseSnapshots } from '@/lib/screener';

export const revalidate = 300;

export default async function HomePage() {
  const universe = await getUniverseSnapshots();
  const topDiscount = applyFilters(universe, { minDiscountPct: 10, limit: 9, sortBy: 'discount' });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-blue-700 text-sm uppercase tracking-wider">AI Valuation Workbench</p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-900">Stock Research with DCF + AI Carat Ratings</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Screen equities with natural language, inspect valuation gaps, and combine star ratings with internal quality/value metrics.
          </p>
        </section>

        <AiSearch initial={topDiscount} />
      </div>
    </main>
  );
}
