import { getCandles, getMetrics, getProfile, getQuote, getStooqCandles } from './finnhub';
import { buildAdaptiveDcfInputs, calculateDcf, normalizeRatio } from './dcf';
import { getMorningstarMap, getMorningstarStar } from './morningstar';
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

export async function buildSnapshot(symbol: string): Promise<StockSnapshot> {
  const key = symbol.toUpperCase();
  const cached = snapshotCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const [quote, profile, metricResp, star] = await Promise.all([
    getQuote(key),
    getProfile(key),
    getMetrics(key),
    getMorningstarStar(key),
  ]);

  const metrics = metricResp.metric ?? {};
  const price = quote.c ?? 0;

  const sharesOutstandingRaw =
    getMetric(metrics, 'shareOutstanding') ??
    (typeof profile.shareOutstanding === 'number' ? profile.shareOutstanding : undefined) ??
    1;
  // Finnhub profile/metric shareOutstanding is typically in millions.
  const sharesOutstanding = sharesOutstandingRaw < 10_000_000 ? sharesOutstandingRaw * 1_000_000 : sharesOutstandingRaw;

  const freeCashFlowAnnual = getMetric(metrics, 'freeCashFlowAnnual');
  const freeCashFlowTtm = getMetric(metrics, 'freeCashFlowTTM');
  const cashFlowPerShareTtm = getMetric(metrics, 'cashFlowPerShareTTM');
  const marketCapRaw =
    getMetric(metrics, 'marketCapitalization') ??
    (typeof profile.marketCapitalization === 'number' ? profile.marketCapitalization : undefined);
  // Finnhub market cap is generally in millions.
  const marketCap = marketCapRaw !== undefined && marketCapRaw < 10_000_000 ? marketCapRaw * 1_000_000 : marketCapRaw;

  const fcfFromTotal = freeCashFlowAnnual ?? freeCashFlowTtm;
  const normalizedFcfFromTotal =
    fcfFromTotal !== undefined ? (Math.abs(fcfFromTotal) < 1_000_000 ? fcfFromTotal * 1_000_000 : fcfFromTotal) : undefined;
  const fcfFromPerShare =
    cashFlowPerShareTtm !== undefined && sharesOutstanding > 0 ? cashFlowPerShareTtm * sharesOutstanding : undefined;

  const baseFcf = Math.max(
    normalizedFcfFromTotal ??
      fcfFromPerShare ??
      // Last-resort proxy if FCF metrics are missing: assume 3% FCF yield on market cap.
      ((marketCap ?? Math.max(price * sharesOutstanding, 1)) * 0.03),
    1,
  );

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

  const dcf = calculateDcf({
    currentPrice: price,
    baseFcf,
    sharesOutstanding,
    growthRates: adaptiveDcfInputs.growthRates,
    discountRate: adaptiveDcfInputs.discountRate,
    terminalGrowth: adaptiveDcfInputs.terminalGrowth,
  });

  const fcfYield = dcf.fairValue > 0 ? (baseFcf / dcf.fairValue) * 100 : undefined;
  const growthQualityScore = scoreFromRange(normalizeRatio(revenueGrowth), 0.01, 0.15);
  const valueScore =
    scoreFromRange(dcf.upsidePct, -30, 60) * 0.5 +
    inverseScore(peTtm, 10, 35) * 0.2 +
    inverseScore(dcf.assumptions.discountRate, 0.08, 0.14) * 0.15 +
    scoreFromRange(fcfYield, 2, 8) * 0.15;
  const qualityScore =
    scoreFromRange(roeTtm, 0.05, 0.30) * 0.3 +
    scoreFromRange(operatingMarginTtm, 0.05, 0.30) * 0.25 +
    inverseScore(debtToEquity, 0.3, 2.5) * 0.2 +
    growthQualityScore * 0.15 +
    inverseScore(dcf.assumptions.discountRate, 0.08, 0.14) * 0.1;
  const moatProxyScore = scoreFromRange(normalizeRatio(getMetric(metrics, 'grossMarginTTM')), 0.2, 0.6);

  const snapshot: StockSnapshot = {
    symbol: key,
    name: (typeof profile.name === 'string' && profile.name) || key,
    sector: (typeof profile.finnhubIndustry === 'string' && profile.finnhubIndustry) || 'Unknown',
    price,
    changePct: quote.dp ?? 0,
    marketCap: typeof profile.marketCapitalization === 'number' ? profile.marketCapitalization : undefined,
    peTtm,
    roeTtm,
    operatingMarginTtm,
    debtToEquity,
    morningstarStars: star?.stars,
    morningstarSource: star?.source,
    morningstarAsOf: star?.asOf,
    dcf,
    valueScore: Math.round(clamp(valueScore, 0, 100)),
    qualityScore: Math.round(clamp(qualityScore, 0, 100)),
    moatProxyScore: Math.round(clamp(moatProxyScore, 0, 100)),
  };

  snapshotCache.set(key, { ts: Date.now(), data: snapshot });
  return snapshot;
}

export async function getUniverseSnapshots(symbols: string[] = DEFAULT_SCREEN_SYMBOLS) {
  const stars = await getMorningstarMap();
  const tasks = symbols.map(async (symbol) => {
    try {
      const s = await buildSnapshot(symbol);
      const star = stars.get(symbol.toUpperCase());
      if (star) {
        s.morningstarStars = star.stars;
        s.morningstarAsOf = star.asOf;
        s.morningstarSource = star.source;
      }
      return s;
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
    if (filters.minStarRating !== undefined && (s.morningstarStars ?? 0) < filters.minStarRating) return false;
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
  const key = symbol.toUpperCase();
  const snapshot = await buildSnapshot(key);
  const [profile, metricResp, candles] = await Promise.all([
    getProfile(key),
    getMetrics(key),
    (async () => {
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 60 * 60 * 24 * 180;
      try {
        const primary = await getCandles(key, sixMonthsAgo, now, 'D');
        if ((primary.c?.length ?? 0) > 0 && (primary.t?.length ?? 0) > 0) return primary;
      } catch {
        // fall through to no-key fallback
      }

      try {
        return await getStooqCandles(key, sixMonthsAgo, now);
      } catch {
        return { t: [], c: [] };
      }
    })(),
  ]);

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
