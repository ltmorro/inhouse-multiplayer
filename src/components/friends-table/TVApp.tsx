import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Comment { id: string; text: string; at: string; }
interface Dish {
  id: string;
  name: string;
  description: string;
  secret_ingredient: string;
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
}
interface LocalIPData {
  local_ip: string;
  port: number;
}

// ─── Phases ──────────────────────────────────────────────────────────────────

function LobbyTV({ state, voteUrl, wifiQr }: { state: FTState; voteUrl: string; wifiQr: string }) {
  return (
    <div className="ft-tv-lobby">
      <div className="ft-tv-hero">
        <div className="ft-tv-hero-eyebrow">An Evening of Fine Food &amp; Friendly Competition</div>
        <div className="ft-tv-hero-title">Friends Table</div>
        <div className="ft-tv-divider" />
        <div className="ft-tv-hero-subtitle">Scan to join the table</div>
      </div>

      <div className="ft-tv-qr-row">
        <div className="ft-tv-qr-block">
          <div className="ft-tv-qr-frame">
            <QRCodeSVG value={voteUrl} size={180} bgColor="#ffffff" fgColor="#0C0B09" />
          </div>
          <div className="ft-tv-qr-label">Scan to Join</div>
          <div className="ft-tv-qr-url">{voteUrl.replace('http://', '')}</div>
        </div>

        {wifiQr && (
          <div className="ft-tv-qr-block">
            <div className="ft-tv-qr-frame">
              <QRCodeSVG value={wifiQr} size={180} bgColor="#ffffff" fgColor="#0C0B09" />
            </div>
            <div className="ft-tv-qr-label">Join WiFi</div>
            <div className="ft-tv-qr-url">{state.wifi.ssid}</div>
          </div>
        )}
      </div>

      {state.dishes.length > 0 && (
        <div className="ft-tv-menu">
          <div className="ft-tv-menu-title">Tonight's Menu</div>
          <ul className="ft-tv-menu-list">
            {state.dishes.map(d => (
              <li key={d.id} className="ft-tv-menu-item">{d.name}</li>
            ))}
          </ul>
        </div>
      )}

      {state.dishes.length === 0 && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 20 }}>
          Guests are adding their dishes…
        </div>
      )}
    </div>
  );
}

function TastingTV({ state }: { state: FTState }) {
  const dish = state.dishes[state.current_dish_index];
  if (!dish) return null;

  return (
    <div className="ft-tv-tasting">
      <div className="ft-tv-tasting-header">
        <div>
          <div className="ft-tv-tasting-counter">
            Dish {state.current_dish_index + 1} of {state.dishes.length}
          </div>
          <div className="ft-tv-tasting-dish-name">{dish.name}</div>
          {dish.description && (
            <div className="ft-tv-tasting-desc">{dish.description}</div>
          )}
          {dish.secret_ingredient && (
            <div className="ft-tv-tasting-secret">
              <span>🤫</span> Secret Ingredient: <em>{dish.secret_ingredient}</em>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--sans)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
          {dish.photos.length} photo{dish.photos.length !== 1 ? 's' : ''}<br />
          {dish.comments.length} note{dish.comments.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 40, overflow: 'hidden', minHeight: 0 }}>
        {dish.photos.length > 0 ? (
          <div className="ft-tv-photos-grid" style={{ flex: 2 }}>
            {dish.photos.slice(-12).map((f, i) => (
              <div key={i} className="ft-tv-photo">
                <img src={`/ft-uploads/${f}`} alt="" loading="lazy" />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'rgba(255,255,255,0.15)', fontSize: 24 }}>
            Photographs will appear here
          </div>
        )}

        {dish.comments.length > 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
              Notes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {dish.comments.slice(-8).map(c => (
                <div key={c.id} className="ft-tv-comment-bubble">"{c.text}"</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VotingTV({ state }: { state: FTState }) {
  return (
    <div className="ft-tv-voting">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, width: '100%', maxWidth: 1100 }}>
        <div className="ft-tv-phase-title">Cast Your Vote</div>
        <div className="ft-tv-voter-count">{state.voter_count} {state.voter_count === 1 ? 'ballot' : 'ballots'} received · two votes per guest</div>

        <div className="ft-tv-dish-grid">
          {state.dishes.map(dish => (
            <div key={dish.id} className="ft-tv-dish-card">
              <div className="ft-tv-dish-card-img">
                {dish.photos[0] && <img src={`/ft-uploads/${dish.photos[0]}`} alt="" />}
                {!dish.photos[0] && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.08)', fontFamily: 'var(--sans)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                    No photo
                  </div>
                )}
              </div>
              <div className="ft-tv-dish-card-body">
                <div className="ft-tv-dish-card-name">{dish.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultsTV({ state }: { state: FTState }) {
  const sorted = [...state.dishes].sort((a, b) => b.vote_count - a.vote_count);
  const winner = sorted[0];

  return (
    <div className="ft-tv-results">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 48, width: '100%', maxWidth: 900 }}>
        <div className="ft-tv-phase-title">The Verdict</div>

        {winner && (
          <div className="ft-tv-winner-block">
            <div className="ft-tv-winner-crown">Winner</div>
            <div className="ft-tv-winner-name">{winner.name}</div>
            <div className="ft-tv-winner-votes">{winner.vote_count} vote{winner.vote_count !== 1 ? 's' : ''}</div>
            {winner.secret_ingredient && (
              <div style={{ marginTop: 16, fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18, color: 'rgba(255,255,255,0.35)' }}>
                Secret: {winner.secret_ingredient}
              </div>
            )}
            <div className="ft-tv-prize">The prize: a stained glass cheeseburger</div>
          </div>
        )}

        <div className="ft-tv-rankings">
          {sorted.map((dish, i) => (
            <div key={dish.id} className="ft-tv-rank-row">
              <div className="ft-tv-rank-num">{i + 1}</div>
              <div className="ft-tv-rank-name">{dish.name}</div>
              <div className="ft-tv-rank-bar-bg">
                <div className="ft-tv-rank-bar" style={{ width: `${(dish.vote_count / maxVotes) * 100}%` }} />
              </div>
              <div className="ft-tv-rank-votes">{dish.vote_count} vote{dish.vote_count !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>

        <div style={{ fontFamily: 'var(--sans)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
          {state.voter_count} voters total
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function TVApp() {
  const [state, setState] = useState<FTState | null>(null);
  const [voteUrl, setVoteUrl] = useState('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetch('/api/ft/state').then(r => r.json()).then(setState).catch(() => {});
    fetch('/api/local-ip').then(r => r.json()).then((d: LocalIPData) => {
      setVoteUrl(`http://${d.local_ip}:${d.port}/friends-table/vote`);
    }).catch(() => setVoteUrl(window.location.origin + '/friends-table/vote'));

    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('ft_state', setState);
    return () => { socket.disconnect(); };
  }, []);

  if (!state) {
    return <div className="ft-tv-root ft-loading" style={{ color: 'rgba(244,233,211,0.5)' }}>Loading…</div>;
  }

  const wifiQr = state.wifi.ssid && state.wifi.password
    ? `WIFI:T:WPA;S:${state.wifi.ssid};P:${state.wifi.password};;`
    : '';

  return (
    <div className="ft-tv-root">
      {state.phase === 'lobby'   && <LobbyTV   state={state} voteUrl={voteUrl} wifiQr={wifiQr} />}
      {state.phase === 'tasting' && <TastingTV state={state} />}
      {state.phase === 'voting'  && <VotingTV  state={state} />}
      {state.phase === 'results' && <ResultsTV state={state} />}
    </div>
  );
}
