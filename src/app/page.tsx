'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ChatRole = 'user' | 'assistant' | 'system';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
};

type UploadResult = {
  ok: boolean;
  uploaded?: Array<{ name?: string; path_display?: string }>;
  error?: string;
};

function uid(prefix = 'm') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function Home() {
  const [token, setToken] = useState<string>('');
  const [tokenInput, setTokenInput] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = window.localStorage.getItem('lalocal_user_token') || '';
    if (t) {
      setToken(t);
      setTokenInput(t);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const isAuthed = useMemo(() => token.trim().length > 0, [token]);

  function push(role: ChatRole, msgText: string) {
    setMessages((m) => [...m, { id: uid(role), role, text: msgText, ts: Date.now() }]);
  }

  async function saveToken() {
    const t = tokenInput.trim();
    if (!t) return;
    setToken(t);
    window.localStorage.setItem('lalocal_user_token', t);

    if (messages.length === 0) {
      push('assistant',
        'Hola, soy LocalBot. Te ayudo con la gestión de locaciones.\n\n¿Quieres crear, actualizar o consultar?'
      );
    }
  }

  async function sendMessage() {
    const t = text.trim();
    if (!t || busy) return;

    setBusy(true);
    setText('');
    push('user', t);

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_token: token, text: t })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const reply = String(data?.reply || '');
      if (reply) push('assistant', reply);

      if (data?.request_upload === true) {
        push('assistant', 'Puedes adjuntar 5–10 fotos aquí y luego presionar “Subir fotos”.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      push('assistant', `Error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos() {
    if (busy) return;
    if (!pendingFiles.length) {
      push('assistant', 'No veo fotos seleccionadas.');
      return;
    }

    setBusy(true);
    setUploadProgress({ done: 0, total: pendingFiles.length });

    try {
      // We upload via our own API route (server-side proxy). It will loop and upload one-by-one.
      const form = new FormData();
      form.set('user_token', token);
      for (const f of pendingFiles) form.append('files', f, f.name);

      const res = await fetch('/api/chat/upload', { method: 'POST', body: form });
      const data: UploadResult = await res.json().catch(() => ({ ok: false, error: 'invalid_json' }));
      if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      push('assistant', `Listo: subí ${data.uploaded?.length || pendingFiles.length} archivo(s).`);
      setPendingFiles([]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      push('assistant', `Error subiendo fotos: ${msg}`);
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  }

  if (!isAuthed) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.h1}>LaLocal Chat (MVP)</h1>
          <p style={styles.p}>
            Pega tu <b>token de usuario</b> para continuar.
          </p>
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Token"
            style={styles.input}
            autoFocus
          />
          <button onClick={saveToken} style={styles.button}>Entrar</button>
          <p style={styles.small}>
            Nota: el token se guarda en tu navegador (localStorage).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.title}>LocalBot</div>
            <div style={styles.subtitle}>Gestión de locaciones (Crear / Actualizar / Consultar)</div>
          </div>
          <button
            style={styles.linkButton}
            onClick={() => {
              window.localStorage.removeItem('lalocal_user_token');
              setToken('');
              setTokenInput('');
              setMessages([]);
            }}
            disabled={busy}
          >
            Cambiar token
          </button>
        </header>

        <section style={styles.chat}>
          {messages.map((m) => (
            <div key={m.id} style={{ ...styles.bubbleRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                ...styles.bubble,
                background: m.role === 'user' ? '#1f2937' : '#111827',
                borderColor: m.role === 'user' ? '#374151' : '#1f2937'
              }}>
                <pre style={styles.pre}>{m.text}</pre>
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </section>

        <section style={styles.composer}>
          <div style={styles.row}>
            {/* Hidden file input + explicit button to trigger it (more reliable across browsers/embeds) */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => setPendingFiles(Array.from(e.target.files || []))}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={styles.secondaryButton}
              disabled={busy}
              type="button"
            >
              Adjuntar fotos
            </button>

            <div style={styles.small}>
              {pendingFiles.length ? `${pendingFiles.length} archivo(s) seleccionado(s)` : 'Sin archivos seleccionados'}
            </div>

            <button onClick={uploadPhotos} style={styles.secondaryButton} disabled={busy || pendingFiles.length === 0} type="button">
              Subir fotos
            </button>
            {uploadProgress && (
              <div style={styles.small}>Subiendo…</div>
            )}
          </div>

          <div style={styles.row}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe tu mensaje…"
              style={styles.textarea}
              rows={3}
              disabled={busy}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendMessage();
              }}
            />
            <button onClick={sendMessage} style={styles.button} disabled={busy || text.trim().length === 0}>
              Enviar
            </button>
          </div>

          <div style={styles.hint}>
            Tip: Ctrl/⌘ + Enter para enviar.
          </div>
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    padding: 24,
    background: '#0b1020',
    color: '#e5e7eb',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  },
  shell: {
    maxWidth: 980,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 48px)',
    border: '1px solid #1f2937',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#0b1227'
  },
  header: {
    padding: '14px 16px',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: { fontWeight: 700, fontSize: 16 },
  subtitle: { fontSize: 12, color: '#9ca3af' },
  chat: {
    padding: 16,
    overflowY: 'auto',
    flex: 1
  },
  bubbleRow: {
    display: 'flex',
    marginBottom: 10
  },
  bubble: {
    maxWidth: '85%',
    padding: '10px 12px',
    border: '1px solid',
    borderRadius: 12
  },
  pre: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: 1.35
  },
  composer: {
    borderTop: '1px solid #1f2937',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  },
  row: {
    display: 'flex',
    gap: 10,
    alignItems: 'center'
  },
  textarea: {
    flex: 1,
    borderRadius: 10,
    border: '1px solid #374151',
    background: '#0b1020',
    color: '#e5e7eb',
    padding: 10,
    resize: 'vertical'
  },
  input: {
    width: '100%',
    borderRadius: 10,
    border: '1px solid #374151',
    background: '#0b1020',
    color: '#e5e7eb',
    padding: 10
  },
  button: {
    borderRadius: 10,
    border: '1px solid #374151',
    background: '#2563eb',
    color: 'white',
    padding: '10px 14px',
    cursor: 'pointer'
  },
  secondaryButton: {
    borderRadius: 10,
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    padding: '8px 12px',
    cursor: 'pointer'
  },
  linkButton: {
    borderRadius: 10,
    border: '1px solid #374151',
    background: 'transparent',
    color: '#e5e7eb',
    padding: '8px 12px',
    cursor: 'pointer'
  },
  hint: { fontSize: 12, color: '#9ca3af' },
  card: {
    maxWidth: 520,
    margin: '10vh auto 0',
    padding: 18,
    borderRadius: 12,
    border: '1px solid #1f2937',
    background: '#0b1227'
  },
  h1: { margin: '0 0 8px', fontSize: 22 },
  p: { margin: '0 0 14px', color: '#cbd5e1' },
  small: { marginTop: 10, color: '#9ca3af', fontSize: 12 }
};
