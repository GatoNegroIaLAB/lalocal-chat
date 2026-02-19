import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function getApiBase() {
  const base = process.env.API_BASE_URL || '';
  if (!base) throw new Error('Missing API_BASE_URL');
  return base.replace(/\/$/, '');
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const apiBase = getApiBase();
    const upstream = await fetch(`${apiBase}/lalocal/v1/chat/history/${encodeURIComponent(id)}`, { method: 'GET' });
    const raw = await upstream.text();
    const data = raw ? JSON.parse(raw) : null;
    return NextResponse.json(data, { status: upstream.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
