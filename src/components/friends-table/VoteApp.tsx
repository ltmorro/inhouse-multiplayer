import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, TextField, Label, Input, TextArea, FileTrigger, Form, FieldError } from 'react-aria-components';
import { io, Socket } from 'socket.io-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Comment { id: string; text: string; at: string; }
interface Dish {
  id: string;
  name: string;
  description: string;
  secret_ingredient: string;
  order: number;
  photos: string[];
  comments: Comment[];
  vote_count: number;
}
interface FTState {
  phase: 'lobby' | 'tasting' | 'voting' | 'results';
  current_dish_index: number;
  dishes: Dish[];
  voter_count: number;
  wifi: { ssid: string; password: string };
  my_votes?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrCreateSessionId(): string {
  let id = localStorage.getItem('ft_session_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('ft_session_id', id);
  }
  return id;
}

function getHostKey(): string | null {
  return localStorage.getItem('ft_host_key');
}

function saveHostKey(key: string) {
  localStorage.setItem('ft_host_key', key);
}

function clearHostKey() {
  localStorage.removeItem('ft_host_key');
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function hostFetch(url: string, body: object, method = 'POST') {
  const key = getHostKey();
  return apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Host-Key': key || '' },
    body: JSON.stringify({ ...body, key }),
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Header({ isHost, onHostLogout }: { isHost: boolean; onHostLogout: () => void }) {
  return (
    <header className="ft-vote-header">
      <div>
        <div className="ft-vote-header-title">Friends Table</div>
        <div className="ft-vote-header-subtitle">America's 250th Dinner</div>
      </div>
      {isHost && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ft-vote-host-badge">Host</span>
          <Button className="ft-btn ft-btn-ghost ft-btn-sm" onPress={onHostLogout}>Exit</Button>
        </div>
      )}
    </header>
  );
}

function AddDishForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Give your dish a name'); return; }
    setSaving(true);
    try {
      await apiFetch('/api/ft/dishes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), secret_ingredient: secret.trim() }),
      });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ft-form" onSubmit={handleSubmit}>
      <div className="ft-form-title">Add a Dish</div>

      <div className="ft-field">
        <label className="ft-label" htmlFor="dish-name">Dish Name *</label>
        <input id="dish-name" className="ft-input" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Braised Short Rib" autoFocus />
      </div>

      <div className="ft-field">
        <label className="ft-label" htmlFor="dish-desc">Description</label>
        <textarea id="dish-desc" className="ft-textarea" value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Tell us about this dish…" rows={3} />
      </div>

      <div className="ft-field">
        <label className="ft-label" htmlFor="dish-secret">🤫 Secret Ingredient</label>
        <input id="dish-secret" className="ft-input" value={secret} onChange={e => setSecret(e.target.value)}
          placeholder="Revealed at the table…" />
      </div>

      {error && <div className="ft-field-error">{error}</div>}

      <div className="ft-form-actions">
        <Button className="ft-btn ft-btn-ghost" onPress={onCancel} isDisabled={saving}>Cancel</Button>
        <button type="submit" className="ft-btn ft-btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add Dish'}
        </button>
      </div>
    </form>
  );
}

function LobbyPhase({ state, isHost }: { state: FTState; isHost: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [wifiSsid, setWifiSsid] = useState(state.wifi.ssid);
  const [wifiPwd, setWifiPwd] = useState(state.wifi.password);
  const [wifiSaving, setWifiSaving] = useState(false);

  async function moveUp(i: number) {
    if (i === 0) return;
    const ids = state.dishes.map(d => d.id);
    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    await hostFetch('/api/ft/dishes/reorder', { ordered_ids: ids });
  }

  async function moveDown(i: number) {
    if (i === state.dishes.length - 1) return;
    const ids = state.dishes.map(d => d.id);
    [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
    await hostFetch('/api/ft/dishes/reorder', { ordered_ids: ids });
  }

  async function deleteDish(id: string) {
    if (!confirm('Remove this dish?')) return;
    await hostFetch(`/api/ft/dishes/${id}?key=${getHostKey()}`, {}, 'DELETE');
  }

  async function startTasting() {
    if (state.dishes.length === 0) { alert('Add at least one dish first!'); return; }
    if (!confirm(`Start tasting with ${state.dishes.length} dish${state.dishes.length > 1 ? 'es' : ''}?`)) return;
    await hostFetch('/api/ft/phase', { phase: 'tasting' });
  }

  async function saveWifi() {
    setWifiSaving(true);
    try { await hostFetch('/api/ft/wifi', { ssid: wifiSsid, password: wifiPwd }); }
    finally { setWifiSaving(false); }
  }

  return (
    <div>
      {isHost && (
        <div className="ft-host-controls">
          <div className="ft-host-controls-label">Host Controls</div>

          <div className="ft-wifi-row">
            <div className="ft-field">
              <label className="ft-label" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>WiFi SSID</label>
              <input className="ft-input" value={wifiSsid} onChange={e => setWifiSsid(e.target.value)} placeholder="Network name" />
            </div>
            <div className="ft-field">
              <label className="ft-label" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Password</label>
              <input className="ft-input" value={wifiPwd} onChange={e => setWifiPwd(e.target.value)} placeholder="WiFi password" />
            </div>
            <Button className="ft-btn ft-btn-ghost ft-btn-sm" onPress={saveWifi} isDisabled={wifiSaving}
              style={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-end' }}>
              {wifiSaving ? '…' : 'Save'}
            </Button>
          </div>

          <div className="ft-host-row">
            <button className="ft-host-btn ft-host-btn-start" onClick={startTasting}>
              ▶ Start Tasting
            </button>
          </div>
        </div>
      )}

      <div className="ft-vote-body">
        <div className="ft-lobby-section-title">Tonight's Tasting Menu</div>
        <div className="ft-lobby-section-sub">
          {state.dishes.length === 0
            ? 'Add the dishes you\'re bringing tonight'
            : `${state.dishes.length} dish${state.dishes.length !== 1 ? 'es' : ''} on the menu`}
        </div>

        {showForm ? (
          <AddDishForm onDone={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
        ) : (
          <Button className="ft-btn ft-btn-gold ft-btn-full" style={{ marginBottom: 20 }} onPress={() => setShowForm(true)}>
            + Add a Dish
          </Button>
        )}

        <div className="ft-dish-list">
          {state.dishes.map((dish, i) => (
            <div key={dish.id} className="ft-dish-row">
              <div className="ft-dish-row-index">{i + 1}</div>
              <div className="ft-dish-row-info">
                <div className="ft-dish-row-name">{dish.name}</div>
                {dish.description && (
                  <div className="ft-dish-row-desc">{dish.description}</div>
                )}
              </div>
              {isHost && (
                <div className="ft-dish-row-actions">
                  <Button className="ft-order-btn" onPress={() => moveUp(i)} isDisabled={i === 0}>↑</Button>
                  <Button className="ft-order-btn" onPress={() => moveDown(i)} isDisabled={i === state.dishes.length - 1}>↓</Button>
                </div>
              )}
              {isHost && (
                <Button className="ft-order-btn" onPress={() => deleteDish(dish.id)}
                  style={{ color: '#c0392b', borderColor: '#f8d7da', marginLeft: 4 }}>✕</Button>
              )}
            </div>
          ))}
        </div>

        {state.dishes.length === 0 && !showForm && (
          <div className="ft-empty-state">
            <div className="ft-empty-icon">🍽</div>
            <div className="ft-empty-text">Be the first to add a dish!<br />Everyone can contribute to tonight's menu.</div>
          </div>
        )}

        {!isHost && (
          <div className="ft-notice" style={{ marginTop: 8 }}>
            The host will start tasting once all dishes are added.
          </div>
        )}
      </div>
    </div>
  );
}

function TastingPhase({ state, sessionId }: { state: FTState; sessionId: string }) {
  const dish = state.dishes[state.current_dish_index];
  const [uploading, setUploading] = useState(false);
  const [comment, setComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [flashMsg, setFlashMsg] = useState('');

  const flash = (msg: string) => {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(''), 3000);
  };

  async function handlePhoto(files: FileList | null) {
    if (!files || files.length === 0 || !dish) return;
    const file = files[0];
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      await apiFetch(`/api/ft/dishes/${dish.id}/photos`, { method: 'POST', body: fd });
      flash('Photo uploaded!');
    } catch (err: any) {
      flash('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim() || !dish) return;
    setSubmittingComment(true);
    try {
      await apiFetch(`/api/ft/dishes/${dish.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: comment.trim() }),
      });
      setComment('');
    } catch (err: any) {
      flash(err.message);
    } finally {
      setSubmittingComment(false);
    }
  }

  if (!dish) return (
    <div className="ft-vote-body ft-empty-state">
      <div className="ft-empty-text">No dish found. Waiting for host…</div>
    </div>
  );

  return (
    <div>
      <div className="ft-vote-body" style={{ paddingTop: 20 }}>
        {flashMsg && <div className="ft-success-banner" style={{ marginBottom: 16 }}>{flashMsg}</div>}

        <div className="ft-tasting-card">
          <div className="ft-tasting-card-header">
            <div className="ft-tasting-counter">
              Dish {state.current_dish_index + 1} of {state.dishes.length}
            </div>
            <div className="ft-tasting-dish-name">{dish.name}</div>
            {dish.description && (
              <div className="ft-tasting-dish-desc">{dish.description}</div>
            )}
            {dish.secret_ingredient && (
              <div className="ft-tasting-secret">🤫 {dish.secret_ingredient}</div>
            )}
          </div>

          <div className="ft-tasting-body">
            <div>
              <div className="ft-section-label">📸 Photos ({dish.photos.length})</div>
              {dish.photos.length > 0 && (
                <div className="ft-photo-row" style={{ marginBottom: 12 }}>
                  {dish.photos.slice(-6).map((f, i) => (
                    <div key={i} className="ft-photo-thumb">
                      <img src={`/ft-uploads/${f}`} alt="" loading="lazy" />
                    </div>
                  ))}
                  {uploading && <div className="ft-uploading-thumb">📤</div>}
                </div>
              )}
              <FileTrigger acceptedFileTypes={['image/*']} onSelect={handlePhoto}>
                <Button className="ft-upload-btn" isDisabled={uploading}>
                  {uploading ? '⏳ Uploading…' : '📷 Add Your Photo'}
                </Button>
              </FileTrigger>
            </div>

            <div>
              <div className="ft-section-label">💬 Comments ({dish.comments.length})</div>
              {dish.comments.length > 0 && (
                <div className="ft-comments-list">
                  {dish.comments.map(c => (
                    <div key={c.id} className="ft-comment-item">"{c.text}"</div>
                  ))}
                </div>
              )}
              <form className="ft-comment-form" onSubmit={handleComment}>
                <input className="ft-input" value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Your thoughts on this dish…" />
                <button type="submit" className="ft-btn ft-btn-primary" disabled={submittingComment || !comment.trim()}>
                  {submittingComment ? '…' : 'Post'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="ft-notice">
          Share your photos and comments as you taste. The host will move to the next dish when ready.
        </div>
      </div>
    </div>
  );
}

function VotingPhase({ state, sessionId, myVotes }: { state: FTState; sessionId: string; myVotes: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(myVotes));
  const [submitted, setSubmitted] = useState(myVotes.length > 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggle(id: string) {
    if (submitted) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  }

  async function submitVotes() {
    if (selected.size === 0) { setError('Choose at least 1 dish'); return; }
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/ft/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, dish_ids: [...selected] }),
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ft-vote-body" style={{ paddingTop: 24 }}>
      <div className="ft-lobby-section-title">Cast Your Votes</div>
      <div className="ft-voting-instr">
        {submitted ? '✅ Your votes are in! Waiting for everyone else…' : 'Choose up to 2 of your favorites.'}
      </div>

      {!submitted && (
        <div className="ft-vote-tally">
          Selected: <span>{selected.size}</span> / 2
        </div>
      )}

      <div className="ft-vote-grid">
        {state.dishes.map(dish => {
          const isSelected = selected.has(dish.id);
          const coverPhoto = dish.photos[0];
          return (
            <button
              key={dish.id}
              className="ft-vote-card"
              data-selected={isSelected ? '' : undefined}
              onClick={() => toggle(dish.id)}
              disabled={submitted}
              style={{ opacity: submitted && !isSelected ? 0.5 : 1 }}
            >
              <div className="ft-vote-card-check">
                {isSelected && <span style={{ fontSize: 14, fontWeight: 700 }}>✓</span>}
              </div>
              <div className="ft-vote-card-name">{dish.name}</div>
              {coverPhoto && (
                <div className="ft-vote-card-photo">
                  <img src={`/ft-uploads/${coverPhoto}`} alt="" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && <div className="ft-field-error" style={{ marginBottom: 16 }}>{error}</div>}

      {!submitted && (
        <Button className="ft-btn ft-btn-primary ft-btn-full" onPress={submitVotes} isDisabled={submitting || selected.size === 0}>
          {submitting ? 'Submitting…' : 'Submit Votes'}
        </Button>
      )}

      <div className="ft-vote-tally" style={{ marginTop: 20, textAlign: 'center' }}>
        <span>{state.voter_count}</span> {state.voter_count === 1 ? 'person has' : 'people have'} voted
      </div>
    </div>
  );
}

function ResultsPhase({ state }: { state: FTState }) {
  const sorted = [...state.dishes].sort((a, b) => b.vote_count - a.vote_count);
  const maxVotes = sorted[0]?.vote_count || 1;

  return (
    <div className="ft-vote-root">
      <div className="ft-results-header">
        <div className="ft-results-title">The Verdict Is In!</div>
        <div className="ft-results-sub">{state.voter_count} voters · {state.dishes.length} dishes</div>
      </div>

      <div className="ft-results-list">
        {sorted.map((dish, i) => (
          <div key={dish.id} className={`ft-result-item${i === 0 ? ' ft-result-winner' : ''}`}>
            <div className="ft-result-item-header">
              <div className="ft-result-rank">{i === 0 ? '🏆' : `${i + 1}`}</div>
              <div className="ft-result-name">{dish.name}</div>
              <div className="ft-result-votes"><span>{dish.vote_count}</span> vote{dish.vote_count !== 1 ? 's' : ''}</div>
            </div>
            {dish.photos.length > 0 && (
              <div className="ft-result-photos">
                {dish.photos.slice(0, 4).map((f, j) => (
                  <div key={j} className="ft-result-photo"><img src={`/ft-uploads/${f}`} alt="" loading="lazy" /></div>
                ))}
              </div>
            )}
            {dish.comments.length > 0 && (
              <div className="ft-result-comments">
                {dish.comments.slice(0, 3).map(c => (
                  <div key={c.id} className="ft-result-comment">"{c.text}"</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="ft-result-prize">
        The prize: a <span>Stained Glass Cheeseburger 🍔</span>
      </div>
    </div>
  );
}

function HostAuthGate({ onAuth }: { onAuth: (key: string) => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function tryAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetch('/api/ft/state', { headers: { 'X-Host-Key': key } });
      // Verify key by trying a no-op host action
      const res = await fetch('/api/ft/wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Host-Key': key },
        body: JSON.stringify({ ssid: '', password: '' }),
      });
      if (res.status === 401) {
        setError('Incorrect host code');
      } else {
        saveHostKey(key);
        onAuth(key);
      }
    } catch {
      setError('Could not connect');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ft-auth-wrap">
      <div className="ft-auth-title">Host Mode</div>
      <div className="ft-auth-sub">Enter the host code to unlock phase controls and dish ordering.</div>
      <form className="ft-auth-form" onSubmit={tryAuth}>
        <input className="ft-input" type="password" value={key} onChange={e => setKey(e.target.value)}
          placeholder="Host code" autoFocus />
        {error && <div className="ft-field-error">{error}</div>}
        <button type="submit" className="ft-btn ft-btn-primary" disabled={loading || !key.trim()}>
          {loading ? 'Checking…' : 'Unlock Host Mode'}
        </button>
        <Button className="ft-btn ft-btn-ghost" onPress={() => history.back()}>Cancel</Button>
      </form>
    </div>
  );
}

function HostControls({ state, isHost }: { state: FTState; isHost: boolean }) {
  if (!isHost) return null;

  const dish = state.dishes[state.current_dish_index];
  const isLastDish = state.current_dish_index >= state.dishes.length - 1;

  async function doPhase(phase: string) { await hostFetch('/api/ft/phase', { phase }); }
  async function doNextDish() { await hostFetch('/api/ft/next-dish', {}); }

  return (
    <div className="ft-host-controls">
      <div className="ft-host-controls-label">Host Controls — {state.phase}</div>
      <div className="ft-host-row">
        {state.phase === 'tasting' && (
          <>
            <button className="ft-host-btn ft-host-btn-next" onClick={doNextDish}>
              {isLastDish ? '→ Go to Voting' : `→ Next Dish`}
            </button>
          </>
        )}
        {state.phase === 'voting' && (
          <button className="ft-host-btn ft-host-btn-result" onClick={() => doPhase('results')}>
            Show Results
          </button>
        )}
        {state.phase === 'results' && (
          <button className="ft-host-btn ft-host-btn-vote"
            onClick={() => { if (confirm('Reset the whole evening?')) hostFetch('/api/ft/reset', {}); }}>
            Reset Evening
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function VoteApp() {
  const [state, setState] = useState<FTState | null>(null);
  const [sessionId] = useState(getOrCreateSessionId);
  const [isHost, setIsHost] = useState(!!getHostKey());
  const [showHostAuth, setShowHostAuth] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/ft/state?session_id=${sessionId}`);
      setState(data);
    } catch { /* retry on next socket event */ }
  }, [sessionId]);

  useEffect(() => {
    fetchState();

    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('ft_state', (newState: FTState) => {
      setState(prev => ({ ...newState, my_votes: prev?.my_votes ?? [] }));
      // Re-fetch to get my_votes for this session
      apiFetch(`/api/ft/state?session_id=${sessionId}`).then(setState).catch(() => {});
    });

    return () => { socket.disconnect(); };
  }, [fetchState, sessionId]);

  if (showHostAuth) {
    return (
      <div className="ft-vote-root">
        <HostAuthGate onAuth={() => { setIsHost(true); setShowHostAuth(false); }} />
      </div>
    );
  }

  if (!state) {
    return <div className="ft-vote-root ft-loading">Loading…</div>;
  }

  const myVotes = state.my_votes || [];

  return (
    <div className="ft-vote-root">
      <Header isHost={isHost} onHostLogout={() => { clearHostKey(); setIsHost(false); }} />

      <HostControls state={state} isHost={isHost} />

      {state.phase === 'lobby' && (
        <>
          <LobbyPhase state={state} isHost={isHost} />
          {!isHost && (
            <div style={{ padding: '0 24px 24px', maxWidth: 540, margin: '0 auto' }}>
              <Button className="ft-btn ft-btn-ghost ft-btn-sm" onPress={() => setShowHostAuth(true)}>
                🔑 Host? Enter code
              </Button>
            </div>
          )}
        </>
      )}

      {state.phase === 'tasting' && (
        <TastingPhase state={state} sessionId={sessionId} />
      )}

      {state.phase === 'voting' && (
        <VotingPhase state={state} sessionId={sessionId} myVotes={myVotes} />
      )}

      {state.phase === 'results' && (
        <ResultsPhase state={state} />
      )}
    </div>
  );
}
