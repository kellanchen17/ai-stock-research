import { z } from 'zod';
import type { ScreenFilters, StockSnapshot } from './types';
import { applyFilters } from './screener';

const ParsedSchema = z.object({
  sector: z.string().optional(),
  minDiscountPct: z.number().min(-100).max(300).optional(),
  minStarRating: z.number().min(1).max(5).optional(),
  minQualityScore: z.number().min(0).max(100).optional(),
  maxPeTtm: z.number().min(1).max(200).optional(),
  limit: z.number().min(1).max(50).optional(),
  sortBy: z.enum(['discount', 'quality', 'value']).optional(),
});

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
  }
  if (q.includes('high quality') || q.includes('quality')) {
    filters.minQualityScore = 65;
    filters.sortBy = 'quality';
  }
  if (q.includes('morningstar') || q.includes('star')) {
    filters.minStarRating = 4;
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
  const text = await callOllama(
    'Convert the user query to JSON stock screener filters only. Return one JSON object only with no markdown. Allowed keys: sector, minDiscountPct, minStarRating, minQualityScore, maxPeTtm, limit, sortBy.',
    `Query: ${query}`,
    true,
    0,
  );

  if (!text) return null;

  try {
    const parsed = JSON.parse(normalizeJsonText(text));
    return ParsedSchema.parse(parsed);
  } catch {
    return null;
  }
}

async function explainWithOllama(query: string, filters: ScreenFilters, results: StockSnapshot[]): Promise<string | null> {
  const compact = results.slice(0, 8).map((s) => ({
    symbol: s.symbol,
    sector: s.sector,
    price: s.price,
    dcfUpsidePct: Number(s.dcf.upsidePct.toFixed(1)),
    stars: s.morningstarStars ?? null,
    quality: s.qualityScore,
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
  const { filters, provider } = await parseScreenQuery(query);
  let results = applyFilters(universe, filters);

  let usedFilters = filters;
  if (results.length === 0) {
    const relaxed: ScreenFilters = {
      ...filters,
      minDiscountPct: filters.minDiscountPct !== undefined ? Math.max(filters.minDiscountPct - 15, 0) : undefined,
      minStarRating: filters.minStarRating !== undefined ? Math.max(filters.minStarRating - 1, 1) : undefined,
      limit: filters.limit ?? 12,
    };
    const retry = applyFilters(universe, relaxed);
    if (retry.length > 0) {
      results = retry;
      usedFilters = relaxed;
    }
  }

  const llmExplanation = provider === 'ollama' ? await explainWithOllama(query, usedFilters, results) : null;

  const explanation = llmExplanation ?? buildScreenExplanation(query, usedFilters, results, provider);

  return { filters: usedFilters, provider, results, explanation };
}
