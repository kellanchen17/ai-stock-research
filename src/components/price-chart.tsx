'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function PriceChart({ points }: { points: { date: string; close: number }[] }) {
  if (points.length === 0) {
    return (
      <div className="h-72 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-center text-sm text-slate-500">
        Price history is temporarily unavailable for this symbol.
      </div>
    );
  }

  return (
    <div className="h-72 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748b" minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} stroke="#64748b" domain={['auto', 'auto']} />
          <Tooltip />
          <Line type="monotone" dataKey="close" stroke="#2563eb" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
