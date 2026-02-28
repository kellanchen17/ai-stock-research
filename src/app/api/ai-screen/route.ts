import { NextRequest, NextResponse } from 'next/server';
import { runAiScreen } from '@/lib/ai';
import { getUniverseSnapshots } from '@/lib/screener';
import { DEFAULT_SCREEN_SYMBOLS } from '@/lib/universe';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body?.query || '').trim();
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

    const universe = await getUniverseSnapshots(DEFAULT_SCREEN_SYMBOLS);
    const result = await runAiScreen(query, universe);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
