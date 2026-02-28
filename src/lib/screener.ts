import { getCandles, getMetrics, getProfile, getQuote, getStooqCandles } from './finnhub';
import { buildAdaptiveDcfInputs, calculateDcf, normalizeRatio } from './dcf';
import type { ScreenFilters, StockDetail, StockSnapshot } from './types';
import { DEFAULT_SCREEN_SYMBOLS } from './universe';

const CACHE_TTL_MS = 5 * 60 * 1000;
const snapshotCache = new Map<string, { ts: number; data: StockSnapshot }>();

function getMetric(metrics: Record<string, unknown>, key: string): number | undefined {
  const v = metrics[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}

function scoreFromRange(value: number | undefined, min: number, max: number) {
  if (value === undefined) return 50;
  if (value <= min) return 0;
  if (value >= max) return 100;
  return ((value - min) / (max - min)) * 100;
}

function inverseScore(value: number | undefined, min: number, max: number) {
  if (value === undefined) return 50;
  if (value <= min) return 100;
  if (value >= max) return 0;
  return (1 - (value - min) / (max - min)) * 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeMarketCap(raw: number | undefined) {
  if (raw === undefined) return undefined;
  // Finnhub market cap is generally in millions.
  return raw < 10_000_000 ? raw * 1_000_000 : raw;
}

function inferSharesOutstanding(params: {
  sharesRaw?: number;
  marketCap?: number;
  price: number;
}) {
  const { sharesRaw, marketCap, price } = params;
  if (!sharesRaw || !Number.isFinite(sharesRaw) || sharesRaw <= 0) {
    if (marketCap && price > 0) return Math.max(marketCap / price, 1);
    return 1;
  }

  const candidates = [sharesRaw, sharesRaw * 1_000, sharesRaw * 1_000_000, sharesRaw * 1_000_000_000];
  const valid = candidates.filter((n) => Number.isFinite(n) && n > 0);
  if (!marketCap || price <= 0) return valid[valid.length - 1] ?? 1;

  const target = marketCap / price;
  let best = valid[0];
  let bestErr = Math.abs(best - target);
  for (const c of valid.slice(1)) {
    const err = Math.abs(c - target);
    if (err < bestErr) {
      best = c;
      bestErr = err;
    }
  }
  return Math.max(best, 1);
}

export async function buildSnapshot(symbol: string): Promise<StockSnapshot> {
  const key = symbol.toUpperCase();
  const cached = snapshotCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const [quote, profile, metricResp] = await Promise.all([
    getQuote(key),
    getProfile(key),
    getMetrics(key),
  ]);

  const metrics = metricResp.metric ?? {};
  const price = quote.c ?? 0;

  const sharesOutstandingRaw =
    getMetric(metrics, 'shareOutstanding') ??
    (typeof profile.shareOutstanding === 'number' ? profile.shareOutstanding : undefined);

  const freeCashFlowAnnual = getMetric(metrics, 'freeCashFlowAnnual');
  const freeCashFlowTtm = getMetric(metrics, 'freeCashFlowTTM');
  const cashFlowPerShareTtm = getMetric(metrics, 'cashFlowPerShareTTM');
  const marketCap = normalizeMarketCap(
    getMetric(metrics, 'marketCapitalization') ??
      (typeof profile.marketCapitalization === 'number' ? profile.marketCapitalization : undefined),
  );

  const sharesOutstanding = inferSharesOutstanding({
    sharesRaw: sharesOutstandingRaw,
    marketCap,
    price,
  });

  const fcfFromTotal = freeCashFlowAnnual ?? freeCashFlowTtm;
  const normalizedFcfFromTotal =
    fcfFromTotal !== undefined ? (Math.abs(fcfFromTotal) < 1_000_000 ? fcfFromTotal * 1_000_000 : fcfFromTotal) : undefined;
  const fcfFromPerShare =
    cashFlowPerShareTtm !== undefined && sharesOutstanding > 0 ? cashFlowPerShareTtm * sharesOutstanding : undefined;

  const baseFcfRaw =
    normalizedFcfFromTotal ??
    fcfFromPerShare ??
    // Last-resort proxy if FCF metrics are missing: assume 3% FCF yield on market cap.
    ((marketCap ?? Math.max(price * sharesOutstanding, 1)) * 0.03);
  const baseFcf = Math.max(baseFcfRaw, 1);
  const baseFcfConstrained =
    marketCap && marketCap > 0
      ? clamp(baseFcf, marketCap * 0.005, marketCap * 0.20)
      : baseFcf;

  const peTtm = getMetric(metrics, 'peTTM');
  const roeTtm = normalizeRatio(getMetric(metrics, 'roeTTM'));
  const operatingMarginTtm = normalizeRatio(getMetric(metrics, 'operatingMarginTTM'));
  const debtToEquity = getMetric(metrics, 'totalDebt/totalEquityAnnual');
  const revenueGrowth = getMetric(metrics, 'revenueGrowthTTMYoy');
  const epsGrowth = getMetric(metrics, 'epsGrowthTTMYoy');
  const beta = getMetric(metrics, 'beta');

  const adaptiveDcfInputs = buildAdaptiveDcfInputs({
    revenueGrowth,
    epsGrowth,
    roe: roeTtm,
    operatingMargin: operatingMarginTtm,
    debtToEquity,
    beta,
  });
  const maxGrowthCap = marketCap && marketCap > 1_000_000_000_000 ? 0.08 : marketCap && marketCap > 300_000_000_000 ? 0.10 : 0.14;
  const adjustedGrowthRates = adaptiveDcfInputs.growthRates.map((g, i) =>
    clamp(g, adaptiveDcfInputs.terminalGrowth + 0.005, Math.max(maxGrowthCap - i * 0.0075, adaptiveDcfInputs.terminalGrowth + 0.005)),
  );

  const dcf = calculateDcf({
    currentPrice: price,
    baseFcf: baseFcfConstrained,
    sharesOutstanding,
    growthRates: adjustedGrowthRates,
    discountRate: adaptiveDcfInputs.discountRate,
    terminalGrowth: adaptiveDcfInputs.terminalGrowth,
  });
  const anchorPerShare = marketCap && sharesOutstanding > 0 ? marketCap / sharesOutstanding : dcf.valuePerShare;
  const blendedValuePerShare = (dcf.valuePerShare * 0.35) + (anchorPerShare * 0.65);
  const blendedUpside = price > 0 ? ((blendedValuePerShare - price) / price) * 100 : 0;
  const normalizedDcf = {
    ...dcf,
    fairValue: blendedValuePerShare * sharesOutstanding,
    valuePerShare: blendedValuePerShare,
    upsidePct: clamp(blendedUpside, -80, 150),
  };

  const fcfYield = normalizedDcf.fairValue > 0 ? (baseFcfConstrained / normalizedDcf.fairValue) * 100 : undefined;
  const growthQualityScore = scoreFromRange(normalizeRatio(revenueGrowth), 0.01, 0.15);
  const valueScoreRaw =
    scoreFromRange(normalizedDcf.upsidePct, -30, 60) * 0.5 +
    inverseScore(peTtm, 10, 35) * 0.2 +
    inverseScore(normalizedDcf.assumptions.discountRate, 0.08, 0.14) * 0.15 +
    scoreFromRange(fcfYield, 2, 8) * 0.15;
  const qualityScoreRaw =
    scoreFromRange(roeTtm, 0.05, 0.30) * 0.3 +
    scoreFromRange(operatingMarginTtm, 0.05, 0.30) * 0.25 +
    inverseScore(debtToEquity, 0.3, 2.5) * 0.2 +
    growthQualityScore * 0.15 +
    inverseScore(normalizedDcf.assumptions.discountRate, 0.08, 0.14) * 0.1;
  const moatProxyScoreRaw = scoreFromRange(normalizeRatio(getMetric(metrics, 'grossMarginTTM')), 0.2, 0.6);
  const qualityScore = clamp(qualityScoreRaw, 0, 100);
  const valueScore = clamp(valueScoreRaw, 0, 100);
  const moatProxyScore = clamp(moatProxyScoreRaw, 0, 100);
  const growthScore = clamp(
    scoreFromRange(normalizeRatio(revenueGrowth), -0.05, 0.20) * 0.5 +
      scoreFromRange(normalizeRatio(epsGrowth), -0.05, 0.25) * 0.5,
    0,
    100,
  );
  const financialStrengthScore = clamp(
    inverseScore(debtToEquity, 0.2, 2.5) * 0.4 +
      scoreFromRange(roeTtm, 0.05, 0.35) * 0.35 +
      scoreFromRange(operatingMarginTtm, 0.05, 0.35) * 0.25,
    0,
    100,
  );
  const momentumScore = clamp(scoreFromRange(quote.dp, -20, 20), 0, 100);
  const compositeScore = clamp(
    qualityScore * 0.25 +
      growthScore * 0.20 +
      financialStrengthScore * 0.20 +
      valueScore * 0.20 +
      momentumScore * 0.15,
    0,
    100,
  );
  const caratRating = Math.round(clamp(2 + (compositeScore / 100) * 3, 2, 5) * 10) / 10;
  const clarityScore = clamp(
    inverseScore(beta, 0.8, 1.8) * 0.25 +
      scoreFromRange(operatingMarginTtm, 0.05, 0.30) * 0.3 +
      scoreFromRange(roeTtm, 0.05, 0.30) * 0.25 +
      inverseScore(debtToEquity, 0.2, 2.5) * 0.2,
    0,
    100,
  );
  const clarityLabel = clarityScore >= 85 ? 'FL' : clarityScore >= 70 ? 'VVS' : clarityScore >= 55 ? 'VS' : clarityScore >= 40 ? 'SI' : 'I';

  const snapshot: StockSnapshot = {
    symbol: key,
    name: (typeof profile.name === 'string' && profile.name) || key,
    sector: (typeof profile.finnhubIndustry === 'string' && profile.finnhubIndustry) || 'Unknown',
    price,
    changePct: quote.dp ?? 0,
    marketCap,
    peTtm,
    roeTtm,
    operatingMarginTtm,
    debtToEquity,
    dcf: normalizedDcf,
    valueScore: Math.round(valueScore),
    qualityScore: Math.round(qualityScore),
    moatProxyScore: Math.round(moatProxyScore),
    growthScore: Math.round(growthScore),
    financialStrengthScore: Math.round(financialStrengthScore),
    momentumScore: Math.round(momentumScore),
    compositeScore: Math.round(compositeScore),
    caratRating,
    clarityScore: Math.round(clarityScore),
    clarityLabel,
  };

  snapshotCache.set(key, { ts: Date.now(), data: snapshot });
  return snapshot;
}

export async function getUniverseSnapshots(symbols: string[] = DEFAULT_SCREEN_SYMBOLS) {
  const tasks = symbols.map(async (symbol) => {
    try {
      return await buildSnapshot(symbol);
    } catch {
      return null;
    }
  });

  const results = await Promise.all(tasks);
  return results.filter(Boolean) as StockSnapshot[];
}

function normalizeSectorTerm(sector?: string) {
  if (!sector) return undefined;
  const s = sector.toLowerCase().trim();
  const aliases: Record<string, string[]> = {
    industrials: ['industrial', 'industrials', 'capital goods'],
    technology: ['technology', 'tech', 'software', 'semiconductor'],
    financial: ['financial', 'bank', 'insurance'],
    healthcare: ['healthcare', 'pharma', 'biotech', 'medical'],
    energy: ['energy', 'oil', 'gas'],
    consumer: ['consumer', 'retail', 'beverage', 'restaurant'],
  };
  return aliases[s] ?? [s];
}

export function applyFilters(stocks: StockSnapshot[], filters: ScreenFilters): StockSnapshot[] {
  const sectorTerms = normalizeSectorTerm(filters.sector);
  const filtered = stocks.filter((s) => {
    if (sectorTerms && !sectorTerms.some((term) => s.sector.toLowerCase().includes(term))) return false;
    if (filters.minDiscountPct !== undefined && s.dcf.upsidePct < filters.minDiscountPct) return false;
    if (filters.minCarat !== undefined && s.caratRating < filters.minCarat) return false;
    if (filters.minQualityScore !== undefined && s.qualityScore < filters.minQualityScore) return false;
    if (filters.maxPeTtm !== undefined && (s.peTtm ?? 999) > filters.maxPeTtm) return false;
    return true;
  });

  const sortBy = filters.sortBy ?? 'discount';
  const out = [...filtered];
  if (sortBy === 'quality') out.sort((a, b) => b.qualityScore - a.qualityScore);
  else if (sortBy === 'value') out.sort((a, b) => b.valueScore - a.valueScore);
  else out.sort((a, b) => b.dcf.upsidePct - a.dcf.upsidePct);

  return out.slice(0, filters.limit ?? 20);
}

export async function getStockDetail(symbol: string): Promise<StockDetail> {
  return getStockDetailWithRange(symbol, '6M');
}

function getRangeStartUnix(range: string, ipo?: string) {
  const now = new Date();
  const upper = range.toUpperCase();

  if (upper === '1M') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return Math.floor(d.getTime() / 1000);
  }
  if (upper === '3M') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    return Math.floor(d.getTime() / 1000);
  }
  if (upper === '6M') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 6);
    return Math.floor(d.getTime() / 1000);
  }
  if (upper === 'YTD') {
    const d = new Date(now.getFullYear(), 0, 1);
    return Math.floor(d.getTime() / 1000);
  }
  if (upper === 'ALL') {
    if (ipo) {
      const ipoMs = Date.parse(`${ipo}T00:00:00Z`);
      if (Number.isFinite(ipoMs)) return Math.floor(ipoMs / 1000);
    }
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 20);
    return Math.floor(d.getTime() / 1000);
  }

  const d = new Date(now);
  d.setMonth(d.getMonth() - 6);
  return Math.floor(d.getTime() / 1000);
}

export async function getStockDetailWithRange(symbol: string, range: string = '6M'): Promise<StockDetail> {
  const key = symbol.toUpperCase();
  const snapshot = await buildSnapshot(key);
  const [profile, metricResp] = await Promise.all([getProfile(key), getMetrics(key)]);
  const now = Math.floor(Date.now() / 1000);
  const fromUnix = getRangeStartUnix(range, typeof profile.ipo === 'string' ? profile.ipo : undefined);

  let candles: { t: number[]; c: number[] };
  try {
    const primary = await getCandles(key, fromUnix, now, 'D');
    if ((primary.c?.length ?? 0) > 0 && (primary.t?.length ?? 0) > 0) candles = primary;
    else candles = await getStooqCandles(key, fromUnix, now);
  } catch {
    try {
      candles = await getStooqCandles(key, fromUnix, now);
    } catch {
      candles = { t: [], c: [] };
    }
  }

  return {
    snapshot,
    profile,
    metrics: metricResp.metric ?? {},
    candles: {
      t: candles.t ?? [],
      c: candles.c ?? [],
    },
  };
}
