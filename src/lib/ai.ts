import { z } from 'zod';
import type { ScreenFilters, StockSnapshot } from './types';
import { applyFilters } from './screener';

const ParsedSchema = z.object({
  sector: z.string().optional(),
  minDiscountPct: z.number().min(-100).max(300).optional(),
  minFairValueGapPct: z.number().min(-100).max(300).optional(),
  minCarat: z.number().min(1).max(5).optional(),
  minQualityScore: z.number().min(0).max(100).optional(),
  minGrowthScore: z.number().min(0).max(100).optional(),
  maxPeTtm: z.number().min(1).max(200).optional(),
  limit: z.number().min(1).max(50).optional(),
  sortBy: z.enum(['discount', 'quality', 'value']).optional(),
});

const StockInsightsSchema = z.object({
  companySummary: z.string().min(20).max(600),
  relevantIdeas: z.array(z.string().min(8).max(240)).min(2).max(5),
});

function sanitizeFiltersInput(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const numericKeys = ['minDiscountPct', 'minFairValueGapPct', 'minCarat', 'minQualityScore', 'minGrowthScore', 'maxPeTtm', 'limit'] as const;

  for (const key of ['sector', ...numericKeys, 'sortBy'] as const) {
    const value = input[key];
    if (value === null || value === undefined || value === '') continue;

    if (numericKeys.includes(key as (typeof numericKeys)[number])) {
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(n)) continue;
      if (key === 'maxPeTtm' && n < 1) continue;
      if (key === 'limit' && n < 1) continue;
      if (key === 'minDiscountPct' || key === 'minFairValueGapPct') out[key] = Math.min(n, 60);
      else if (key === 'minGrowthScore') out[key] = Math.min(n, 95);
      else if (key === 'limit') out[key] = n < 3 ? 12 : n;
      else out[key] = n;
      continue;
    }

    if (key === 'sortBy') {
      const s = String(value).toLowerCase();
      if (s === 'discount' || s === 'quality' || s === 'value') out[key] = s;
      else if (s === 'growth' || s === 'upside' || s === 'fairvalue') out[key] = 'discount';
      continue;
    }

    if (key === 'sector') out[key] = String(value).trim();
  }

  return out;
}

function heuristicParse(query: string): ScreenFilters {
  const q = query.toLowerCase();
  const filters: ScreenFilters = { limit: 12, sortBy: 'discount' };

  const sectors = ['industrials', 'technology', 'energy', 'financial', 'healthcare', 'consumer'];
  for (const sector of sectors) {
    if (q.includes(sector)) {
      filters.sector = sector;
      break;
    }
  }

  if (q.includes('discount') || q.includes('undervalued') || q.includes('cheap') || q.includes('margin of safety')) {
    filters.minDiscountPct = 15;
    filters.minFairValueGapPct = 15;
  }
  if (q.includes('high quality') || q.includes('quality')) {
    filters.minQualityScore = 65;
    filters.sortBy = 'quality';
  }
  if (q.includes('high upside') || q.includes('upside') || q.includes('projected growth') || q.includes('high growth') || q.includes('growth')) {
    filters.minFairValueGapPct = Math.max(filters.minFairValueGapPct ?? 0, 20);
    filters.minGrowthScore = 65;
    filters.sortBy = 'discount';
  }
  if (q.includes('carat') || q.includes('diamond')) {
    filters.minCarat = 4;
  }
  return filters;
}

function normalizeJsonText(raw: string): string {
  const text = raw.trim();
  if (text.startsWith('{')) return text;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

function scoreDirectMatch(query: string, stock: StockSnapshot) {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const symbol = stock.symbol.toLowerCase();
  const name = stock.name.toLowerCase();

  if (symbol === q) return 100;
  if (name === q) return 95;
  if (name.startsWith(q)) return 90;
  if (symbol.startsWith(q)) return 85;
  if (name.includes(q)) return 75;
  return 0;
}

function findDirectStockMatches(query: string, universe: StockSnapshot[]) {
  const scored = universe
    .map((s) => ({ stock: s, score: scoreDirectMatch(query, s) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.stock.valueScore - a.stock.valueScore)
    .map((x) => x.stock);

  return scored.slice(0, 12);
}

function shouldPreferDirectMatch(query: string, matches: StockSnapshot[]) {
  if (matches.length === 0) return false;
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const broadTerms = [
    'sector', 'stocks', 'stock', 'undervalued', 'cheap', 'discount', 'quality', 'carat', 'diamond', 'pe',
    'industrials', 'technology', 'financial', 'healthcare', 'energy', 'consumer',
  ];
  const hasBroadTerm = broadTerms.some((t) => q.includes(t));
  const top = matches[0];
  const topScore = scoreDirectMatch(query, top);
  return topScore >= 90 || (!hasBroadTerm && words.length <= 4);
}

async function callOllama(system: string, user: string, jsonMode = false, temperature = 0): Promise<string | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: jsonMode ? 'json' : undefined,
        options: { temperature },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const text = data?.message?.content;
    return typeof text === 'string' ? text.trim() : null;
  } catch {
    return null;
  }
}

async function parseWithOllama(query: string): Promise<ScreenFilters | null> {
  const system =
    'Convert the user query to JSON stock screener filters only. Return one JSON object only with no markdown. Allowed keys: sector, minDiscountPct, minFairValueGapPct, minCarat, minQualityScore, minGrowthScore, maxPeTtm, limit, sortBy.';

  for (const jsonMode of [true, false]) {
    const text = await callOllama(system, `Query: ${query}`, jsonMode, 0);
    if (!text) continue;
    try {
      const parsed = JSON.parse(normalizeJsonText(text));
      return ParsedSchema.parse(sanitizeFiltersInput(parsed));
    } catch {
      // retry once with alternate mode
    }
  }
  return null;
}

async function explainWithOllama(query: string, filters: ScreenFilters, results: StockSnapshot[]): Promise<string | null> {
  const compact = results.slice(0, 8).map((s) => ({
    symbol: s.symbol,
    sector: s.sector,
    price: s.price,
    dcfUpsidePct: Number(s.dcf.upsidePct.toFixed(1)),
    fairValuePerShare: Number(s.dcf.valuePerShare.toFixed(2)),
    carat: s.caratRating,
    composite: s.compositeScore,
    quality: s.qualityScore,
    growth: s.growthScore,
    value: s.valueScore,
  }));

  return callOllama(
    'You are a concise equity research assistant. Explain results clearly in plain English in 3-5 short sentences.',
    `User query: "${query}"\nApplied filters: ${JSON.stringify(filters)}\nTop results: ${JSON.stringify(compact)}\nExplain why these match and mention caveats if data is limited.`,
    false,
    0.2,
  );
}

export async function parseScreenQuery(query: string): Promise<{ filters: ScreenFilters; provider: string }> {
  const ollama = await parseWithOllama(query);
  if (ollama) return { filters: { limit: 12, sortBy: 'discount', ...ollama }, provider: 'ollama' };

  return { filters: heuristicParse(query), provider: 'heuristic' };
}

export function buildScreenExplanation(query: string, filters: ScreenFilters, results: StockSnapshot[], provider: string) {
  const top = results
    .slice(0, 3)
    .map((s) => `${s.symbol} (${s.dcf.upsidePct.toFixed(1)}% upside est.)`)
    .join(', ');
  return `Using ${provider}. Applied filters ${JSON.stringify(filters)}. Top matches: ${top || 'none'} for "${query}".`;
}

export async function runAiScreen(query: string, universe: StockSnapshot[]) {
  const directMatches = findDirectStockMatches(query, universe);
  if (shouldPreferDirectMatch(query, directMatches)) {
    const directFilters: ScreenFilters = { limit: 12, sortBy: 'value' };
    const explanation =
      (await explainWithOllama(query, directFilters, directMatches)) ??
      `Direct match for "${query}": ${directMatches.map((s) => s.symbol).join(', ')}.`;

    return { filters: directFilters, provider: 'direct-match', results: directMatches, explanation };
  }

  const { filters, provider } = await parseScreenQuery(query);
  let results = applyFilters(universe, filters);

  let usedFilters = filters;
  if (results.length === 0) {
    const relaxed1: ScreenFilters = {
      ...filters,
      minDiscountPct: filters.minDiscountPct !== undefined ? Math.max(filters.minDiscountPct - 15, 0) : undefined,
      minFairValueGapPct: filters.minFairValueGapPct !== undefined ? Math.max(filters.minFairValueGapPct - 15, 0) : undefined,
      minCarat: filters.minCarat !== undefined ? Math.max(filters.minCarat - 0.5, 1) : undefined,
      minGrowthScore: filters.minGrowthScore !== undefined ? Math.max(filters.minGrowthScore - 10, 0) : undefined,
      limit: filters.limit ?? 12,
    };
    const retry1 = applyFilters(universe, relaxed1);
    if (retry1.length > 0) {
      results = retry1;
      usedFilters = relaxed1;
    } else {
      const relaxed2: ScreenFilters = {
        ...relaxed1,
        minDiscountPct: undefined,
        minFairValueGapPct: undefined,
        minGrowthScore: undefined,
      };
      const retry2 = applyFilters(universe, relaxed2);
      if (retry2.length > 0) {
        results = retry2;
        usedFilters = relaxed2;
      } else if (filters.sector) {
        const relaxed3: ScreenFilters = {
          ...relaxed2,
          sector: undefined,
          sortBy: 'value',
          limit: filters.limit ?? 12,
        };
        const retry3 = applyFilters(universe, relaxed3);
        if (retry3.length > 0) {
          results = retry3;
          usedFilters = relaxed3;
        }
      }
    }
  }

  const llmExplanation = provider === 'ollama' ? await explainWithOllama(query, usedFilters, results) : null;

  const explanation = llmExplanation ?? buildScreenExplanation(query, usedFilters, results, provider);

  return { filters: usedFilters, provider, results, explanation };
}

function fallbackStockInsights(stock: StockSnapshot, searchContext?: string) {
  const contextLine = searchContext ? ` for "${searchContext}"` : '';
  return {
    companySummary: `${stock.name} (${stock.symbol}) operates in the ${stock.sector} sector. It is currently trading around ${stock.price.toFixed(2)} with an estimated DCF upside of ${stock.dcf.upsidePct.toFixed(1)}%.`,
    relevantIdeas: [
      `Compare ${stock.symbol}'s value score (${stock.valueScore}) and quality score (${stock.qualityScore})${contextLine}.`,
      `Stress-test the DCF assumptions, especially discount rate (${(stock.dcf.assumptions.discountRate * 100).toFixed(1)}%) and terminal growth (${(stock.dcf.assumptions.terminalGrowth * 100).toFixed(1)}%).`,
      `Track whether recent price moves change the margin of safety versus fair value (${stock.dcf.valuePerShare.toFixed(2)}).`,
    ],
  };
}

export async function generateStockInsights(stock: StockSnapshot, searchContext?: string) {
  const text = await callOllama(
    'You are an equity research assistant. Return ONLY valid JSON with keys: companySummary (string), relevantIdeas (array of short strings). No markdown.',
    `Stock snapshot: ${JSON.stringify({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      price: stock.price,
      dcfUpsidePct: Number(stock.dcf.upsidePct.toFixed(2)),
      fairValuePerShare: Number(stock.dcf.valuePerShare.toFixed(2)),
      valueScore: stock.valueScore,
      qualityScore: stock.qualityScore,
      moatProxyScore: stock.moatProxyScore,
      caratRating: stock.caratRating,
      clarityLabel: stock.clarityLabel,
    })}\nUser search context: ${searchContext || 'none provided'}\nGive 2-4 relevant ideas tailored to this context if available.`,
    true,
    0.2,
  );

  if (!text) return fallbackStockInsights(stock, searchContext);

  try {
    const parsed = JSON.parse(normalizeJsonText(text));
    return StockInsightsSchema.parse(parsed);
  } catch {
    return fallbackStockInsights(stock, searchContext);
  }
}
