import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function getApiBase() {
  const base = process.env.API_BASE_URL || '';
  if (!base) throw new Error('Missing API_BASE_URL');
  return base.replace(/\/$/, '');
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const user_token = String(form.get('user_token') || '');
    const thread_id = String(form.get('thread_id') || '');
    if (!user_token) return NextResponse.json({ ok: false, error: 'user_token required' }, { status: 400 });

    const files = form.getAll('files').filter(Boolean) as File[];
    if (!files.length) return NextResponse.json({ ok: false, error: 'files required' }, { status: 400 });

    const apiBase = getApiBase();

    // Proxy the request to backend. Preserve thread context so uploads stay attached to the active flow.
    const upstreamForm = new FormData();
    upstreamForm.set('user_token', user_token);
    if (thread_id) upstreamForm.set('thread_id', thread_id);
    for (const f of files) {
      upstreamForm.append('files', f, f.name || 'upload');
    }

    const upstream = await fetch(`${apiBase}/lalocal/v1/chat/upload`, {
      method: 'POST',
      body: upstreamForm
    });

    const raw = await upstream.text();
    const data = raw ? JSON.parse(raw) : null;

    return NextResponse.json(data, { status: upstream.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
