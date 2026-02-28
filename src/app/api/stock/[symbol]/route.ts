import { NextResponse } from 'next/server';
import { getStockDetail } from '@/lib/screener';

export async function GET(_: Request, { params }: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await params;
    const result = await getStockDetail(symbol);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
