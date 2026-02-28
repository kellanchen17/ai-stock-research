const FINNHUB_BASE = 'https://finnhub.io/api/v1';

type Query = Record<string, string | number | boolean | undefined>;

function getApiKey() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('Missing FINNHUB_API_KEY');
  return key;
}

async function finnhubGet<T>(path: string, query: Query = {}): Promise<T> {
  const key = getApiKey();
  const url = new URL(`${FINNHUB_BASE}/${path}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  url.searchParams.set('token', key);

  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error(`Finnhub request failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
}

export async function getQuote(symbol: string) {
  return finnhubGet<{ c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number }>('quote', { symbol });
}

export async function getProfile(symbol: string) {
  return finnhubGet<Record<string, unknown>>('stock/profile2', { symbol });
}

export async function getMetrics(symbol: string) {
  return finnhubGet<{ metric?: Record<string, number> }>('stock/metric', { symbol, metric: 'all' });
}

export async function getCandles(symbol: string, fromUnix: number, toUnix: number, resolution = 'D') {
  return finnhubGet<{ c: number[]; t: number[]; s: string }>('stock/candle', {
    symbol,
    from: fromUnix,
    to: toUnix,
    resolution,
  });
}

export async function getStooqCandles(symbol: string, fromUnix: number, toUnix: number) {
  const stooqSymbol = `${symbol.toLowerCase().replace('.', '-')}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  const res = await fetch(url, { next: { revalidate: 60 * 60 } });
  if (!res.ok) throw new Error(`Stooq request failed (${res.status})`);

  const csv = await res.text();
  const lines = csv.trim().split('\n');
  if (lines.length <= 1) return { c: [], t: [], s: 'no_data' };

  const fromMs = fromUnix * 1000;
  const toMs = toUnix * 1000;
  const t: number[] = [];
  const c: number[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const [date, , , , close] = lines[i].split(',');
    if (!date || !close || close === 'N/D') continue;
    const ms = Date.parse(`${date}T00:00:00Z`);
    const closeNum = Number(close);
    if (!Number.isFinite(ms) || !Number.isFinite(closeNum)) continue;
    if (ms < fromMs || ms > toMs) continue;
    t.push(Math.floor(ms / 1000));
    c.push(closeNum);
  }

  return { c, t, s: c.length > 0 ? 'ok' : 'no_data' };
}
