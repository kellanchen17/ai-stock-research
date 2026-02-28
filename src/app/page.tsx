import { AiSearch } from '@/components/ai-search';
import { applyFilters, getUniverseSnapshots } from '@/lib/screener';
import Image from 'next/image';

export const revalidate = 300;

export default async function HomePage() {
  const universe = await getUniverseSnapshots();
  const topDiscount = applyFilters(universe, { minDiscountPct: 10, limit: 9, sortBy: 'discount' });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <Image src="/stock-lab-logo.svg" alt="Stock Lab logo" width={40} height={40} />
            <p className="text-blue-700 text-sm uppercase tracking-wider">Stock Lab</p>
          </div>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-900">AI Powered Stock Research</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Screen equities with natural language, inspect fair-value gaps, and combine DCF + AI carat scoring to find opportunities.
          </p>
        </section>

        <AiSearch initial={topDiscount} />
      </div>
    </main>
  );
}
