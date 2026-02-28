import { NextResponse } from 'next/server';
import { getStockDetailWithRange } from '@/lib/screener';

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await params;
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') ?? '6M';
    const detail = await getStockDetailWithRange(symbol, range);
    return NextResponse.json({
      symbol: detail.snapshot.symbol,
      range: range.toUpperCase(),
      candles: detail.candles,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

