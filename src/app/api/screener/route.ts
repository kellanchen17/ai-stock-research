import { NextRequest, NextResponse } from 'next/server';
import { applyFilters, getUniverseSnapshots } from '@/lib/screener';
import { DEFAULT_SCREEN_SYMBOLS } from '@/lib/universe';
import type { ScreenFilters } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const filters: ScreenFilters = {
      sector: q.get('sector') || undefined,
      minDiscountPct: q.get('minDiscountPct') ? Number(q.get('minDiscountPct')) : undefined,
      minStarRating: q.get('minStarRating') ? Number(q.get('minStarRating')) : undefined,
      minQualityScore: q.get('minQualityScore') ? Number(q.get('minQualityScore')) : undefined,
      maxPeTtm: q.get('maxPeTtm') ? Number(q.get('maxPeTtm')) : undefined,
      limit: q.get('limit') ? Number(q.get('limit')) : 20,
      sortBy: (q.get('sortBy') as ScreenFilters['sortBy']) || 'discount',
    };

    const snapshots = await getUniverseSnapshots(DEFAULT_SCREEN_SYMBOLS);
    const results = applyFilters(snapshots, filters);

    return NextResponse.json({ filters, count: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
