import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function getApiBase() {
  const base = process.env.API_BASE_URL || '';
  if (!base) throw new Error('Missing API_BASE_URL');
  return base.replace(/\/$/, '');
}

export async function POST(req: Request) {
  try {
    const { user_token, text } = (await req.json()) as { user_token?: string; text?: string };
    if (!user_token) return NextResponse.json({ ok: false, error: 'user_token required' }, { status: 400 });
    if (!text) return NextResponse.json({ ok: false, error: 'text required' }, { status: 400 });

    const apiBase = getApiBase();

    // This endpoint will be implemented inside lalocal-webhook.
    const upstream = await fetch(`${apiBase}/lalocal/v1/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_token, text })
    });

    const raw = await upstream.text();
    const data = raw ? JSON.parse(raw) : null;

    return NextResponse.json(data, { status: upstream.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
