import { useState, useEffect, useCallback } from 'react';
import {
  Beer, Wine, Trophy, Users, Settings, Plus, Minus, Check, X,
  ChevronRight, RotateCcw, Home, User as UserIcon, Utensils,
  ArrowLeft, LogOut, AlertTriangle, Calendar,
} from 'lucide-react';
import { sset, sget, sdel, lset, lget, ldel } from './storage.js';
import './App.css';

// ============================================================
// Constants & helpers
// ============================================================

const EMOJI_AVATARS = ['🦁','🐻','🐺','🦊','🐯','🦅','🦍','🐂','🐉','🦈','⚔️','🔥','💪','🍺','🎸','🏍️','⚡','💀','🍻','🐗','🐲','🥃','🎯','🤘'];

const DEFAULT_EVENT = {
  name: 'Boiz Weekend',
  date: '2026-06-05',
  beerLabel: 'Bier',
  drinkLabel: 'Mische',
  pointsPerBeer: 1,
  pointsPerMische: 1,
  createdAt: Date.now(),
};

const uid = () => Math.random().toString(36).slice(2, 10);

// ============================================================
// Root App
// ============================================================

export default function App() {
  const [booted, setBooted] = useState(false);
  const [event, setEvent] = useState(DEFAULT_EVENT);
  const [users, setUsers] = useState([]);
  const [statsMap, setStatsMap] = useState({});
  const [myId, setMyId] = useState(null);
  const [view, setView] = useState('dashboard');
  const [authView, setAuthView] = useState('pick');
  const [toast, setToast] = useState(null);

  const loadAll = useCallback(async (silent = false) => {
    const [ev, usersList, mine] = await Promise.all([
      sget('event', null),
      sget('users', []),
      lget('myUserId', null),
    ]);
    if (ev) setEvent(ev); else { await sset('event', DEFAULT_EVENT); }
    setUsers(usersList || []);
    setMyId(mine);

    const ids = (usersList || []).map(u => u.id);
    const statsArr = await Promise.all(
      ids.map(id => sget(`stats_${id}`, { beer: 0, mische: 0, points: 0 }))
    );
    const m = {};
    ids.forEach((id, i) => { m[id] = statsArr[i] || { beer: 0, mische: 0, points: 0 }; });
    setStatsMap(m);

    if (!silent) setBooted(true);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!booted || !myId) return;
    if (view !== 'dashboard' && view !== 'crew') return;
    const iv = setInterval(() => { loadAll(true); }, 4000);
    return () => clearInterval(iv);
  }, [booted, myId, view, loadAll]);

  const showToast = (msg) => {
    setToast({ msg, id: Date.now() });
    setTimeout(() => setToast(t => (t && Date.now() - t.id >= 1800) ? null : t), 2000);
  };

  const joinAsNew = async (profile) => {
    const id = uid();
    const newUser = { id, ...profile, joinedAt: Date.now() };
    const updated = [...users, newUser];
    setUsers(updated);
    await sset('users', updated);
    await sset(`stats_${id}`, { beer: 0, mische: 0, points: 0 });
    await lset('myUserId', id);
    setStatsMap(s => ({ ...s, [id]: { beer: 0, mische: 0, points: 0 } }));
    setMyId(id);
    showToast(`Willkommen, ${profile.name}! 🤘`);
  };

  const claimExisting = async (id) => {
    await lset('myUserId', id);
    setMyId(id);
    showToast('Eingeloggt 🍻');
  };

  const updateMyProfile = async (patch) => {
    const updated = users.map(u => u.id === myId ? { ...u, ...patch } : u);
    setUsers(updated);
    await sset('users', updated);
    showToast('Gespeichert ✓');
  };

  const incCounter = async (kind) => {
    if (!myId) return;
    const cur = statsMap[myId] || { beer: 0, mische: 0, points: 0 };
    const inc = kind === 'beer' ? event.pointsPerBeer : event.pointsPerMische;
    const next = { ...cur, [kind]: (cur[kind] || 0) + 1, points: (cur.points || 0) + inc };
    setStatsMap(s => ({ ...s, [myId]: next }));
    await sset(`stats_${myId}`, next);
  };

  const decCounter = async (kind) => {
    if (!myId) return;
    const cur = statsMap[myId] || { beer: 0, mische: 0, points: 0 };
    if ((cur[kind] || 0) <= 0) return;
    const inc = kind === 'beer' ? event.pointsPerBeer : event.pointsPerMische;
    const next = { ...cur, [kind]: cur[kind] - 1, points: Math.max(0, (cur.points || 0) - inc) };
    setStatsMap(s => ({ ...s, [myId]: next }));
    await sset(`stats_${myId}`, next);
  };

  const switchUser = async () => {
    await ldel('myUserId');
    setMyId(null);
    setAuthView('pick');
    setView('dashboard');
  };

  const updateEvent = async (patch) => {
    const next = { ...event, ...patch };
    setEvent(next);
    await sset('event', next);
    showToast('Event aktualisiert ✓');
  };

  const resetCounters = async () => {
    if (!confirm('Wirklich alle Bier/Mische-Counter & Punkte zurücksetzen?')) return;
    const zero = { beer: 0, mische: 0, points: 0 };
    const m = {};
    for (const u of users) {
      m[u.id] = zero;
      await sset(`stats_${u.id}`, zero);
    }
    setStatsMap(m);
    showToast('Counter zurückgesetzt 🔄');
  };

  const resetEvent = async () => {
    if (!confirm('Komplettes Event zurücksetzen? Alle Spieler, Wünsche und Counter werden gelöscht!')) return;
    for (const u of users) await sdel(`stats_${u.id}`);
    await sdel('users');
    await sdel('event');
    await ldel('myUserId');
    setUsers([]);
    setStatsMap({});
    setEvent(DEFAULT_EVENT);
    setMyId(null);
    setView('dashboard');
    setAuthView('pick');
    showToast('Neues Event bereit ⚡');
  };

  if (!booted) return <BootScreen />;

  const me = users.find(u => u.id === myId);
  const needsAuth = !me;

  return (
    <div className="ww-app">
      <GrainOverlay />
      {needsAuth ? (
        <AuthScreen
          event={event}
          users={users}
          view={authView}
          setView={setAuthView}
          onClaim={claimExisting}
          onJoin={joinAsNew}
        />
      ) : (
        <>
          <TopBar me={me} onSettings={() => setView('settings')} />
          <main className="ww-main">
            {view === 'dashboard' && (
              <Dashboard
                event={event}
                me={me}
                users={users}
                statsMap={statsMap}
                onInc={incCounter}
                onDec={decCounter}
              />
            )}
            {view === 'crew' && <CrewView users={users} statsMap={statsMap} myId={myId} />}
            {view === 'profile' && (
              <ProfileView me={me} onSave={updateMyProfile} onSwitch={switchUser} />
            )}
            {view === 'settings' && (
              <SettingsView
                event={event}
                onSave={updateEvent}
                onResetCounters={resetCounters}
                onResetEvent={resetEvent}
                onBack={() => setView('dashboard')}
              />
            )}
          </main>
          {view !== 'settings' && <BottomNav view={view} setView={setView} />}
        </>
      )}
      {toast && <Toast toast={toast} />}
    </div>
  );
}

// ============================================================
// Boot screen
// ============================================================

function BootScreen() {
  return (
    <div className="ww-boot">
      <div className="ww-boot-inner">
        <div className="ww-boot-emoji">🍺</div>
        <div className="ww-boot-text">LADE...</div>
      </div>
    </div>
  );
}

// ============================================================
// Auth (Pick existing or create new)
// ============================================================

function AuthScreen({ event, users, view, setView, onClaim, onJoin }) {
  if (view === 'new') {
    return <NewPlayerForm onBack={() => setView('pick')} onSubmit={onJoin} />;
  }
  return (
    <div className="ww-auth">
      <div className="ww-auth-header">
        <div className="ww-tag">EVENT</div>
        <h1 className="ww-display ww-title-huge">{event.name}</h1>
        <div className="ww-date-row">
          <Calendar size={14} />
          <span>{formatDate(event.date)}</span>
        </div>
      </div>

      <div className="ww-auth-prompt">Wer bist du?</div>

      {users.length > 0 && (
        <div className="ww-user-grid">
          {users.map(u => (
            <button key={u.id} className="ww-user-card" onClick={() => onClaim(u.id)}>
              <div className="ww-user-emoji">{u.emoji}</div>
              <div className="ww-user-name">{u.name}</div>
              <ChevronRight size={16} className="ww-user-chev" />
            </button>
          ))}
        </div>
      )}

      <div className="ww-divider"><span>oder</span></div>

      <button className="ww-big-cta" onClick={() => setView('new')}>
        <Plus size={20} />
        <span>NEUER SPIELER</span>
      </button>
    </div>
  );
}

function NewPlayerForm({ onBack, onSubmit }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_AVATARS[0]);
  const [foodWishes, setFoodWishes] = useState('');
  const [drinkWishes, setDrinkWishes] = useState('');
  const [allergies, setAllergies] = useState('');
  const valid = name.trim().length >= 2;

  const submit = () => {
    if (!valid) return;
    onSubmit({
      name: name.trim(),
      emoji,
      foodWishes: foodWishes.trim(),
      drinkWishes: drinkWishes.trim(),
      allergies: allergies.trim(),
    });
  };

  return (
    <div className="ww-form-wrap">
      <button className="ww-back" onClick={onBack}><ArrowLeft size={18} /> zurück</button>
      <h2 className="ww-display ww-title-big">Anmeldung</h2>
      <p className="ww-muted">Gib deine Wünsche an — der Host sieht alles auf einen Blick.</p>

      <label className="ww-label">DEIN NAME</label>
      <input className="ww-input" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Max" maxLength={20} />

      <label className="ww-label">AVATAR</label>
      <div className="ww-emoji-grid">
        {EMOJI_AVATARS.map(e => (
          <button key={e} className={`ww-emoji-btn ${emoji === e ? 'sel' : ''}`} onClick={() => setEmoji(e)}>{e}</button>
        ))}
      </div>

      <label className="ww-label"><Utensils size={12} /> ESSENSWÜNSCHE</label>
      <textarea className="ww-textarea" value={foodWishes} onChange={e => setFoodWishes(e.target.value)} placeholder="z.B. Spareribs, viel Fleisch, Pizza Hawaii (sorry)..." rows={2} />

      <label className="ww-label"><Beer size={12} /> GETRÄNKEWÜNSCHE</label>
      <textarea className="ww-textarea" value={drinkWishes} onChange={e => setDrinkWishes(e.target.value)} placeholder="z.B. Tannenzäpfle, Bourbon, Mate, Club Mate..." rows={2} />

      <label className="ww-label"><AlertTriangle size={12} /> ALLERGIEN / SONSTIGES</label>
      <textarea className="ww-textarea" value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="z.B. Laktose, keine Pilze..." rows={2} />

      <button className={`ww-big-cta ${valid ? '' : 'disabled'}`} onClick={submit} disabled={!valid}>
        <Check size={20} />
        <span>SQUAD BEITRETEN</span>
      </button>
    </div>
  );
}

// ============================================================
// Top bar
// ============================================================

function TopBar({ me, onSettings }) {
  return (
    <header className="ww-topbar">
      <div className="ww-topbar-left">
        <div className="ww-me-emoji">{me.emoji}</div>
        <div className="ww-me-block">
          <div className="ww-me-hi">Servus,</div>
          <div className="ww-me-name">{me.name}</div>
        </div>
      </div>
      <button className="ww-icon-btn" onClick={onSettings} aria-label="Settings">
        <Settings size={18} />
      </button>
    </header>
  );
}

// ============================================================
// Dashboard
// ============================================================

function Dashboard({ event, me, users, statsMap, onInc, onDec }) {
  const myStats = statsMap[me.id] || { beer: 0, mische: 0, points: 0 };
  const leaderboard = [...users]
    .map(u => ({ ...u, ...(statsMap[u.id] || { beer: 0, mische: 0, points: 0 }) }))
    .sort((a, b) => b.points - a.points);
  const myRank = leaderboard.findIndex(u => u.id === me.id) + 1;
  const maxPoints = Math.max(1, ...leaderboard.map(u => u.points));

  return (
    <div className="ww-dash">
      <div className="ww-event-banner">
        <div className="ww-tag">{formatDate(event.date)}</div>
        <h1 className="ww-display ww-title-big">{event.name}</h1>
      </div>

      <div className="ww-counters">
        <CounterCard
          icon={<Beer size={28} />}
          label={event.beerLabel}
          color="amber"
          count={myStats.beer}
          onInc={() => onInc('beer')}
          onDec={() => onDec('beer')}
        />
        <CounterCard
          icon={<Wine size={28} />}
          label={event.drinkLabel}
          color="red"
          count={myStats.mische}
          onInc={() => onInc('mische')}
          onDec={() => onDec('mische')}
        />
      </div>

      <div className="ww-stats-row">
        <StatPill label="Drinks" value={myStats.beer + myStats.mische} />
        <StatPill label="Punkte" value={myStats.points} accent />
        <StatPill label="Rang" value={myRank ? `#${myRank}` : '–'} />
      </div>

      <section className="ww-section">
        <div className="ww-section-head">
          <Trophy size={16} />
          <h3>LIVE LEADERBOARD</h3>
        </div>
        <div className="ww-board">
          {leaderboard.map((u, i) => (
            <div key={u.id} className={`ww-board-row ${u.id === me.id ? 'me' : ''}`}>
              <div className="ww-board-rank">{rankBadge(i)}</div>
              <div className="ww-board-emoji">{u.emoji}</div>
              <div className="ww-board-name">{u.name}{u.id === me.id && <span className="ww-you">DU</span>}</div>
              <div className="ww-board-bar-wrap">
                <div className="ww-board-bar" style={{ width: `${(u.points / maxPoints) * 100}%` }} />
              </div>
              <div className="ww-board-pts">{u.points}<span>pkt</span></div>
            </div>
          ))}
          {leaderboard.length === 0 && <div className="ww-empty">Noch keiner getrunken 💀</div>}
        </div>
      </section>
    </div>
  );
}

function CounterCard({ icon, label, color, count, onInc, onDec }) {
  const [pulse, setPulse] = useState(0);
  const handleInc = () => {
    onInc();
    setPulse(p => p + 1);
  };
  return (
    <div className={`ww-counter ww-${color}`}>
      <button className="ww-counter-tap" onClick={handleInc}>
        <div className="ww-counter-icon">{icon}</div>
        <div className="ww-counter-label">{label.toUpperCase()}</div>
        <div className="ww-counter-num" key={pulse}>{count}</div>
        <div className="ww-counter-hint">TIPPEN = +1</div>
      </button>
      <button className="ww-counter-minus" onClick={onDec} aria-label="minus eins">
        <Minus size={14} />
      </button>
    </div>
  );
}

function StatPill({ label, value, accent }) {
  return (
    <div className={`ww-stat ${accent ? 'accent' : ''}`}>
      <div className="ww-stat-val">{value}</div>
      <div className="ww-stat-lbl">{label}</div>
    </div>
  );
}

function rankBadge(i) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `${i + 1}.`;
}

// ============================================================
// Crew view
// ============================================================

function CrewView({ users, statsMap, myId }) {
  return (
    <div className="ww-crew">
      <div className="ww-section-head"><Users size={16} /><h3>DIE CREW ({users.length})</h3></div>
      <div className="ww-crew-list">
        {users.map(u => {
          const s = statsMap[u.id] || { beer: 0, mische: 0, points: 0 };
          return (
            <div key={u.id} className={`ww-crew-card ${u.id === myId ? 'me' : ''}`}>
              <div className="ww-crew-head">
                <div className="ww-crew-emoji">{u.emoji}</div>
                <div className="ww-crew-name">{u.name}{u.id === myId && <span className="ww-you">DU</span>}</div>
                <div className="ww-crew-pts">{s.points} pkt</div>
              </div>
              <div className="ww-crew-mini">
                <span><Beer size={11} /> {s.beer}</span>
                <span><Wine size={11} /> {s.mische}</span>
              </div>
              {u.foodWishes && <div className="ww-crew-line"><b>Essen:</b> {u.foodWishes}</div>}
              {u.drinkWishes && <div className="ww-crew-line"><b>Trinken:</b> {u.drinkWishes}</div>}
              {u.allergies && <div className="ww-crew-line warn"><b>⚠ Allergie:</b> {u.allergies}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Profile view (edit own)
// ============================================================

function ProfileView({ me, onSave, onSwitch }) {
  const [name, setName] = useState(me.name);
  const [emoji, setEmoji] = useState(me.emoji);
  const [foodWishes, setFoodWishes] = useState(me.foodWishes || '');
  const [drinkWishes, setDrinkWishes] = useState(me.drinkWishes || '');
  const [allergies, setAllergies] = useState(me.allergies || '');

  const dirty = name !== me.name || emoji !== me.emoji || foodWishes !== (me.foodWishes || '') || drinkWishes !== (me.drinkWishes || '') || allergies !== (me.allergies || '');

  return (
    <div className="ww-form-wrap">
      <h2 className="ww-display ww-title-big">Mein Profil</h2>

      <label className="ww-label">NAME</label>
      <input className="ww-input" value={name} onChange={e => setName(e.target.value)} maxLength={20} />

      <label className="ww-label">AVATAR</label>
      <div className="ww-emoji-grid">
        {EMOJI_AVATARS.map(e => (
          <button key={e} className={`ww-emoji-btn ${emoji === e ? 'sel' : ''}`} onClick={() => setEmoji(e)}>{e}</button>
        ))}
      </div>

      <label className="ww-label"><Utensils size={12} /> ESSENSWÜNSCHE</label>
      <textarea className="ww-textarea" value={foodWishes} onChange={e => setFoodWishes(e.target.value)} rows={2} />

      <label className="ww-label"><Beer size={12} /> GETRÄNKEWÜNSCHE</label>
      <textarea className="ww-textarea" value={drinkWishes} onChange={e => setDrinkWishes(e.target.value)} rows={2} />

      <label className="ww-label"><AlertTriangle size={12} /> ALLERGIEN</label>
      <textarea className="ww-textarea" value={allergies} onChange={e => setAllergies(e.target.value)} rows={2} />

      <button
        className={`ww-big-cta ${dirty ? '' : 'disabled'}`}
        onClick={() => dirty && onSave({ name: name.trim(), emoji, foodWishes: foodWishes.trim(), drinkWishes: drinkWishes.trim(), allergies: allergies.trim() })}
        disabled={!dirty}
      >
        <Check size={20} /><span>SPEICHERN</span>
      </button>

      <button className="ww-text-btn" onClick={onSwitch}>
        <LogOut size={14} /> Spieler wechseln (auf diesem Gerät)
      </button>
    </div>
  );
}

// ============================================================
// Settings (admin / event config)
// ============================================================

function SettingsView({ event, onSave, onResetCounters, onResetEvent, onBack }) {
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date);
  const [beerLabel, setBeerLabel] = useState(event.beerLabel);
  const [drinkLabel, setDrinkLabel] = useState(event.drinkLabel);
  const [pb, setPb] = useState(event.pointsPerBeer);
  const [pm, setPm] = useState(event.pointsPerMische);

  return (
    <div className="ww-form-wrap">
      <button className="ww-back" onClick={onBack}><ArrowLeft size={18} /> zurück</button>
      <h2 className="ww-display ww-title-big">Settings</h2>
      <p className="ww-muted">Event anpassen — alle sehen die Änderung sofort.</p>

      <label className="ww-label">EVENT-NAME</label>
      <input className="ww-input" value={name} onChange={e => setName(e.target.value)} />

      <label className="ww-label">DATUM</label>
      <input className="ww-input" type="date" value={date} onChange={e => setDate(e.target.value)} />

      <div className="ww-grid2">
        <div>
          <label className="ww-label">BIER-LABEL</label>
          <input className="ww-input" value={beerLabel} onChange={e => setBeerLabel(e.target.value)} maxLength={12} />
        </div>
        <div>
          <label className="ww-label">MISCHE-LABEL</label>
          <input className="ww-input" value={drinkLabel} onChange={e => setDrinkLabel(e.target.value)} maxLength={12} />
        </div>
      </div>

      <div className="ww-grid2">
        <div>
          <label className="ww-label">PKT / BIER</label>
          <input className="ww-input" type="number" min={0} max={10} value={pb} onChange={e => setPb(Number(e.target.value))} />
        </div>
        <div>
          <label className="ww-label">PKT / MISCHE</label>
          <input className="ww-input" type="number" min={0} max={10} value={pm} onChange={e => setPm(Number(e.target.value))} />
        </div>
      </div>

      <button className="ww-big-cta" onClick={() => onSave({ name: name.trim(), date, beerLabel: beerLabel.trim(), drinkLabel: drinkLabel.trim(), pointsPerBeer: pb, pointsPerMische: pm })}>
        <Check size={20} /><span>SPEICHERN</span>
      </button>

      <div className="ww-danger">
        <div className="ww-danger-head"><AlertTriangle size={14} /> DANGER ZONE</div>
        <button className="ww-danger-btn" onClick={onResetCounters}>
          <RotateCcw size={14} /> Counter & Punkte zurücksetzen
        </button>
        <button className="ww-danger-btn red" onClick={onResetEvent}>
          <X size={14} /> Komplettes Event löschen (neues Wochenende)
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Bottom nav
// ============================================================

function BottomNav({ view, setView }) {
  const items = [
    { k: 'dashboard', icon: <Home size={20} />, label: 'Home' },
    { k: 'crew', icon: <Users size={20} />, label: 'Crew' },
    { k: 'profile', icon: <UserIcon size={20} />, label: 'Profil' },
  ];
  return (
    <nav className="ww-bottomnav">
      {items.map(it => (
        <button key={it.k} className={`ww-nav-btn ${view === it.k ? 'active' : ''}`} onClick={() => setView(it.k)}>
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ============================================================
// Toast
// ============================================================

function Toast({ toast }) {
  return <div className="ww-toast" key={toast.id}>{toast.msg}</div>;
}

// ============================================================
// Helpers
// ============================================================

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  } catch { return iso; }
}

function GrainOverlay() {
  return <div className="ww-grain" aria-hidden="true" />;
}
