import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MorningstarStarRating } from './types';

const CSV_PATH = path.join(process.cwd(), 'data', 'morningstar-stars.csv');

let cache: MorningstarStarRating[] | null = null;
let lastLoad = 0;

async function loadCsv() {
  const now = Date.now();
  if (cache && now - lastLoad < 60_000) return cache;

  try {
    const raw = await fs.readFile(CSV_PATH, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const data = lines.slice(1).map((line) => {
      const [symbol, stars, source, asOf] = line.split(',').map((s) => s.trim());
      return {
        symbol: symbol.toUpperCase(),
        stars: Number(stars),
        source,
        asOf,
      } as MorningstarStarRating;
    }).filter((r) => r.symbol && Number.isFinite(r.stars));

    cache = data;
    lastLoad = now;
    return data;
  } catch {
    cache = [];
    lastLoad = now;
    return [];
  }
}

export async function getMorningstarStar(symbol: string) {
  const all = await loadCsv();
  return all.find((r) => r.symbol === symbol.toUpperCase());
}

export async function getMorningstarMap() {
  const all = await loadCsv();
  return new Map(all.map((r) => [r.symbol, r]));
}
