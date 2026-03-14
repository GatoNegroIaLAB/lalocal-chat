'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import stylesCss from './chat.module.css';

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

  const [threads, setThreads] = useState<Array<{ id: string; title: string; updatedAt: number }>>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const refreshThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/history', { headers: { 'X-User-Token': token } });
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      const list = Array.isArray(data?.threads) ? data.threads : [];
      setThreads(list.map((t: unknown) => {
        const obj = (t && typeof t === 'object') ? (t as Record<string, unknown>) : {};
        return {
          id: String(obj.id || ''),
          title: String(obj.title || 'Chat'),
          updatedAt: Number(obj.updatedAt || 0)
        };
      }));
    } catch {}
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void refreshThreads();
  }, [token, refreshThreads]);

  async function loadThread(threadId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/chat/history/${encodeURIComponent(threadId)}`, { headers: { 'X-User-Token': token } });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const t = data?.thread;
      const msgs = Array.isArray(t?.messages) ? t.messages : [];
      setActiveThreadId(threadId);
      setDrawerOpen(false);
      setMessages(
        msgs.map((m: unknown) => {
          const obj = (m && typeof m === 'object') ? (m as Record<string, unknown>) : {};
          const roleRaw = String(obj.role || 'assistant');
          const role = (roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system') ? (roleRaw as ChatRole) : 'assistant';
          return {
            id: uid(role),
            role,
            text: String(obj.text || ''),
            ts: Number(obj.ts || Date.now())
          };
        })
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      push('assistant', `Error cargando historial: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function newChat() {
    setBusy(true);
    try {
      const res = await fetch('/api/chat/new', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Token': token }, body: JSON.stringify({ title: 'Chat' }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const id = String(data?.thread?.id || '');
      setActiveThreadId(id || null);
      setMessages([]);
      await refreshThreads();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      push('assistant', `Error creando chat: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteThread(threadId: string) {
    if (!threadId || busy) return;
    const ok = window.confirm('¿Borrar este chat?');
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/chat/history/${encodeURIComponent(threadId)}`, {
        method: 'DELETE',
        headers: { 'X-User-Token': token }
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
      await refreshThreads();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      push('assistant', `Error borrando chat: ${msg}`);
    } finally {
      setBusy(false);
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
        body: JSON.stringify({ user_token: token, text: t, thread_id: activeThreadId })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      if (data?.thread_id && !activeThreadId) setActiveThreadId(String(data.thread_id));

      const reply = String(data?.reply || '');
      if (reply) push('assistant', reply);

      if (data?.request_upload === true) {
        push('assistant', 'Puedes adjuntar fotos o videos aquí y luego presionar “Subir archivos”.');
      }

      await refreshThreads();
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
      // We upload via our own API route (server-side proxy) and preserve active thread context.
      const form = new FormData();
      form.set('user_token', token);
      if (activeThreadId) form.set('thread_id', activeThreadId);
      for (const f of pendingFiles) form.append('files', f, f.name);

      const res = await fetch('/api/chat/upload', { method: 'POST', body: form });
      const data: UploadResult = await res.json().catch(() => ({ ok: false, error: 'invalid_json' }));
      if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      push('assistant', `Listo: subí ${data.uploaded?.length || pendingFiles.length} archivo(s).`);
      setPendingFiles([]);

      // Auto-continue the flow after upload
      try {
        const cont = await fetch('/api/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_token: token, text: 'listo', thread_id: activeThreadId })
        });
        const contData = await cont.json().catch(() => null);
        if (cont.ok && contData?.reply) {
          push('assistant', String(contData.reply));
        }
      } catch {
        // best-effort; user can type "listo" manually
      }
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
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }} htmlFor="token">
            Token
          </label>
          <input
            id="token"
            name="token"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Pega tu token…"
            style={styles.input}
            autoFocus
            autoComplete="off"
          />
          <button onClick={saveToken} style={styles.button} type="button">Entrar</button>
          <p style={styles.small}>
            Nota: el token se guarda en tu navegador (localStorage).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={stylesCss.app} style={styles.main}>
      <div className={stylesCss.shell}>
        {/* Left sidebar: history */}
        <aside className={stylesCss.sidebar} aria-label="Historial">
          <div className={stylesCss.sidebarHeader}>
            <div style={styles.sidebarTitle}>Historial</div>
            <button style={styles.sidebarButton} onClick={() => void newChat()} disabled={busy} type="button">
              Nuevo
            </button>
          </div>

          <div className={stylesCss.threadList}>
            {threads.length === 0 ? (
              <div style={styles.sidebarEmpty}>Sin chats aún.</div>
            ) : (
              threads.slice(0, 20).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void loadThread(t.id)}
                  style={{
                    ...styles.threadItem,
                    background: t.id === activeThreadId ? '#111827' : 'transparent',
                    color: t.id === activeThreadId ? 'white' : '#111827',
                    borderColor: t.id === activeThreadId ? '#111827' : 'transparent'
                  }}
                >
                  <div style={styles.threadTitle}>{t.title || 'Chat'}</div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Main column */}
        <div className={stylesCss.mainCol}>
          <header className={stylesCss.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <button
                className={stylesCss.mobileMenuButton}
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Abrir historial"
                disabled={busy}
              >
                <svg className={stylesCss.mobileMenuIcon} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M3 5.5H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M3 10H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M3 14.5H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={styles.title}>LocalBot</div>
                <div style={styles.subtitle}>Gestión de locaciones (Crear / Actualizar / Consultar)</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {activeThreadId && (
                <button
                  style={styles.dangerButton}
                  onClick={() => void deleteThread(activeThreadId)}
                  disabled={busy}
                  type="button"
                >
                  Borrar chat actual
                </button>
              )}
              <button
                style={styles.linkButton}
                onClick={() => {
                  window.localStorage.removeItem('lalocal_user_token');
                  setToken('');
                  setTokenInput('');
                  setMessages([]);
                  setThreads([]);
                  setActiveThreadId(null);
                  setDrawerOpen(false);
                }}
                disabled={busy}
                type="button"
              >
                Cambiar token
              </button>
            </div>
          </header>

          {/* Mobile drawer */}
          {drawerOpen && (
            <>
              <div className={stylesCss.drawerOverlay} onClick={() => setDrawerOpen(false)} aria-hidden="true" />
              <aside className={stylesCss.drawer} aria-label="Historial">
                <div className={stylesCss.sidebarHeader}>
                  <div style={styles.sidebarTitle}>Historial</div>
                  <button style={styles.sidebarButton} onClick={() => void newChat()} disabled={busy} type="button">
                    Nuevo
                  </button>
                </div>
                <div className={stylesCss.threadList}>
                  {threads.length === 0 ? (
                    <div style={styles.sidebarEmpty}>Sin chats aún.</div>
                  ) : (
                    threads.slice(0, 20).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => void loadThread(t.id)}
                        style={{
                          ...styles.threadItem,
                          background: t.id === activeThreadId ? '#111827' : 'transparent',
                          color: t.id === activeThreadId ? 'white' : '#111827',
                          borderColor: t.id === activeThreadId ? '#111827' : 'transparent'
                        }}
                      >
                        <div style={styles.threadTitle}>{t.title || 'Chat'}</div>
                      </button>
                    ))
                  )}
                </div>
              </aside>
            </>
          )}

          <section className={stylesCss.chat}>
            {messages.map((m) => (
              <div key={m.id} style={{ ...styles.bubbleRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    ...styles.bubble,
                    background: m.role === 'user' ? '#111827' : '#f3f4f6',
                    color: m.role === 'user' ? 'white' : '#111827',
                    borderColor: m.role === 'user' ? '#111827' : '#e5e7eb'
                  }}
                >
                  <pre style={styles.pre}>{m.text}</pre>
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </section>

          <section className={stylesCss.composer}>
            <div style={styles.row}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => setPendingFiles(Array.from(e.target.files || []))}
                style={{ display: 'none' }}
                aria-label="Adjuntar fotos"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={styles.secondaryButton}
                disabled={busy}
                type="button"
              >
                Adjuntar archivos
              </button>

              <div style={styles.small}>
                {pendingFiles.length ? `${pendingFiles.length} archivo(s) seleccionado(s)` : 'Sin archivos seleccionados'}
              </div>

              <button onClick={uploadPhotos} style={styles.secondaryButton} disabled={busy || pendingFiles.length === 0} type="button">
                Subir archivos
              </button>
              {uploadProgress && <div style={styles.small}>Subiendo…</div>}
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
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <button onClick={sendMessage} style={styles.button} disabled={busy || text.trim().length === 0} type="button">
                Enviar
              </button>
            </div>

            <div style={styles.hint}>Enter para enviar • Shift+Enter para nueva línea</div>
          </section>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    padding: 0,
    background: '#f7f7f8',
    color: '#111827',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  },
  // Layout is handled in chat.module.css for correct mobile behavior
  shell: {},
  sidebar: {},
  sidebarHeader: {},
  threadList: {},
  mainCol: {},
  header: {},

  sidebarTitle: { fontWeight: 650, fontSize: 13, color: '#111827' },
  sidebarButton: {
    borderRadius: 10,
    border: '1px solid #d1d5db',
    background: 'white',
    color: '#111827',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: 12
  },
  threadItem: {
    textAlign: 'left',
    borderRadius: 10,
    border: '1px solid transparent',
    padding: '8px 10px',
    cursor: 'pointer',
    width: '100%',
    minWidth: 0,
    overflow: 'hidden'
  },
  threadTitle: {
    fontSize: 13,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  sidebarEmpty: { color: '#6b7280', fontSize: 12, padding: '8px 2px' },

  title: { fontWeight: 650, fontSize: 15, letterSpacing: 0.2 },
  subtitle: { fontSize: 12, color: '#6b7280' },

  bubbleRow: {
    display: 'flex',
    marginBottom: 12
  },
  bubble: {
    maxWidth: '85%',
    padding: '10px 12px',
    border: '1px solid',
    borderRadius: 14
  },
  pre: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: 1.45
  },
  composer: {
    borderTop: '1px solid #e5e7eb',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    background: '#f7f7f8'
  },
  row: {
    display: 'flex',
    gap: 10,
    alignItems: 'center'
  },
  textarea: {
    flex: 1,
    borderRadius: 12,
    border: '1px solid #d1d5db',
    background: 'white',
    color: '#111827',
    padding: '10px 12px',
    resize: 'none',
    outline: 'none',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    fontSize: 16
  },
  input: {
    width: '100%',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    background: 'white',
    color: '#111827',
    padding: '10px 12px',
    outline: 'none',
    fontSize: 16
  },
  button: {
    borderRadius: 12,
    border: '1px solid #111827',
    background: '#111827',
    color: 'white',
    padding: '10px 14px',
    cursor: 'pointer'
  },
  secondaryButton: {
    borderRadius: 12,
    border: '1px solid #d1d5db',
    background: 'white',
    color: '#111827',
    padding: '8px 12px',
    cursor: 'pointer'
  },
  linkButton: {
    borderRadius: 12,
    border: '1px solid #d1d5db',
    background: 'white',
    color: '#111827',
    padding: '8px 12px',
    cursor: 'pointer'
  },
  dangerButton: {
    borderRadius: 12,
    border: '1px solid #fecaca',
    background: '#fff1f2',
    color: '#b91c1c',
    padding: '8px 12px',
    cursor: 'pointer'
  },
  hint: { fontSize: 12, color: '#6b7280' },
  card: {
    maxWidth: 520,
    margin: '10vh auto 0',
    padding: 18,
    borderRadius: 16,
    border: '1px solid #e5e7eb',
    background: 'white',
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
  },
  h1: { margin: '0 0 8px', fontSize: 22 },
  p: { margin: '0 0 14px', color: '#374151' },
  small: { marginTop: 10, color: '#6b7280', fontSize: 12 }
};
