import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Beer, Wine, Trophy, Users, Settings, Plus, Minus, Check, X,
  RotateCcw, Home, User as UserIcon, Utensils,
  ArrowLeft, LogOut, AlertTriangle, Calendar, ShieldCheck,
  Mail, Lock, UserPlus, Shield, KeyRound, Copy, Play, Pause,
  Hourglass, Wrench,
} from 'lucide-react';
import {
  pb, isSiteAdmin, isEventAdmin,
  login, register, logout,
  listAllEvents, getEvent, createEvent, updateEvent, deleteEvent,
  listMyMemberships, listEventMembers, joinByCode, leaveEvent,
  loadEventStats, setMyCount, resetEventStats,
  updateMyProfile, setUserRole, deleteUser,
  subscribeEvent, subscribeMyMemberships,
} from './api.js';
import { MODULES, moduleById } from './modules.js';
import './App.css';

const EMOJI_AVATARS = ['🦁','🐻','🐺','🦊','🐯','🦅','🦍','🐂','🐉','🦈','⚔️','🔥','💪','🍺','🎸','🏍️','⚡','💀','🍻','🐗','🐲','🥃','🎯','🤘'];

const computePoints = (s, ev) =>
  (s?.beer || 0) * (ev?.pointsPerBeer ?? 1) + (s?.mische || 0) * (ev?.pointsPerMische ?? 1);

// ============================================================
// Root
// ============================================================

export default function App() {
  const [booted, setBooted] = useState(false);
  const [me, setMe] = useState(pb.authStore.record);
  const [myMemberships, setMyMemberships] = useState([]);
  const [currentEventId, setCurrentEventId] = useState(null);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [eventMembers, setEventMembers] = useState([]);
  const [statsMap, setStatsMap] = useState({});
  const [allEvents, setAllEvents] = useState([]);
  const [view, setView] = useState('dashboard');
  const [authView, setAuthView] = useState('login');
  const [lobbyView, setLobbyView] = useState('list'); // list | join | create | admin
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast({ msg, id: Date.now() });
    setTimeout(() => setToast(t => (t && Date.now() - t.id >= 1800) ? null : t), 2000);
  };

  useEffect(() => pb.authStore.onChange(() => setMe(pb.authStore.record)), []);

  const refreshMemberships = useCallback(async () => {
    if (!pb.authStore.isValid) { setMyMemberships([]); return; }
    try {
      const list = await listMyMemberships();
      setMyMemberships(list);
    } catch (e) { console.warn('refreshMemberships', e); }
  }, []);

  const refreshCurrentEvent = useCallback(async () => {
    if (!currentEventId) {
      setCurrentEvent(null);
      setEventMembers([]);
      setStatsMap({});
      return;
    }
    try {
      const [ev, members, stats] = await Promise.all([
        getEvent(currentEventId),
        listEventMembers(currentEventId),
        loadEventStats(currentEventId),
      ]);
      setCurrentEvent(ev);
      setEventMembers(members);
      setStatsMap(stats);
    } catch (e) {
      console.warn('refreshCurrentEvent', e);
      setCurrentEventId(null);
    }
  }, [currentEventId]);

  const refreshAllEvents = useCallback(async () => {
    if (!isSiteAdmin(me)) return;
    try { setAllEvents(await listAllEvents()); }
    catch (e) { console.warn('refreshAllEvents', e); }
  }, [me]);

  // initial boot
  useEffect(() => {
    (async () => {
      await refreshMemberships();
      setBooted(true);
    })();
  }, [refreshMemberships, me?.id]);

  // subscribe to membership changes for live "you got added" updates
  useEffect(() => {
    if (!me) return;
    let unsub;
    subscribeMyMemberships(() => refreshMemberships()).then(fn => { unsub = fn; });
    return () => { if (unsub) unsub(); };
  }, [me, refreshMemberships]);

  // load current event whenever id changes
  useEffect(() => { refreshCurrentEvent(); }, [refreshCurrentEvent]);

  // subscribe to current event live updates
  useEffect(() => {
    if (!currentEventId) return;
    let unsub;
    subscribeEvent(currentEventId, () => refreshCurrentEvent()).then(fn => { unsub = fn; });
    return () => { if (unsub) unsub(); };
  }, [currentEventId, refreshCurrentEvent]);

  // when admin opens lobby admin tab, load all events
  useEffect(() => { if (lobbyView === 'admin') refreshAllEvents(); }, [lobbyView, refreshAllEvents]);

  // ---------- Auth handlers ----------
  const onLogin = async (email, password) => {
    await login(email, password);
    showToast('Eingeloggt 🍻');
  };

  const onRegister = async (data) => {
    await register(data);
    showToast(`Willkommen, ${data.displayName}! 🤘`);
  };

  const onLogout = () => {
    logout();
    setCurrentEventId(null);
    setMyMemberships([]);
    setView('dashboard');
    setLobbyView('list');
    setAuthView('login');
    showToast('Tschüss 👋');
  };

  // ---------- Event handlers ----------
  const onJoin = async (code) => {
    const ev = await joinByCode(code);
    await refreshMemberships();
    setCurrentEventId(ev.id);
    setLobbyView('list');
    showToast(`In "${ev.name}" eingecheckt 🚪`);
  };

  const onCreateEvent = async (data) => {
    const ev = await createEvent(data);
    await refreshMemberships();
    setCurrentEventId(ev.id);
    setLobbyView('list');
    showToast(`Event "${ev.name}" erstellt — Code ${ev.code}`);
  };

  const onSaveEvent = async (patch) => {
    if (!currentEvent) return;
    await updateEvent(currentEvent.id, patch);
    showToast('Event aktualisiert ✓');
  };

  const onToggleActive = async () => {
    if (!currentEvent) return;
    await updateEvent(currentEvent.id, { active: !currentEvent.active });
    showToast(currentEvent.active ? 'Event pausiert ⏸' : 'Event aktiv ▶');
  };

  const onResetCounters = async () => {
    if (!currentEvent) return;
    if (!confirm('Alle Counter dieses Events zurücksetzen?')) return;
    await resetEventStats(currentEvent.id);
    showToast('Counter zurückgesetzt 🔄');
  };

  const onLeaveEvent = async () => {
    if (!currentEvent || !me) return;
    if (!confirm(`"${currentEvent.name}" verlassen?`)) return;
    try {
      await leaveEvent(currentEvent.id);
      setCurrentEventId(null);
      await refreshMemberships();
      showToast('Event verlassen');
    } catch (e) { showToast('Konnte nicht verlassen'); }
  };

  const onSaveProfile = async (patch) => {
    await updateMyProfile(me.id, patch);
    showToast('Profil gespeichert ✓');
  };

  // ---------- Render ----------
  if (!booted) return <BootScreen />;

  if (!me) {
    return (
      <div className="ww-app">
        <GrainOverlay />
        <AuthScreen view={authView} setView={setAuthView} onLogin={onLogin} onRegister={onRegister} />
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  if (!currentEventId) {
    return (
      <div className="ww-app">
        <GrainOverlay />
        <Lobby
          me={me}
          memberships={myMemberships}
          allEvents={allEvents}
          view={lobbyView}
          setView={setLobbyView}
          onPick={(id) => setCurrentEventId(id)}
          onJoin={onJoin}
          onCreate={onCreateEvent}
          onLogout={onLogout}
          onRefreshAll={refreshAllEvents}
          onDeleteEvent={async (id) => {
            if (!confirm('Event wirklich löschen?')) return;
            await deleteEvent(id); await refreshAllEvents(); showToast('Event gelöscht');
          }}
          onToggleActiveAdmin={async (id, next) => {
            await updateEvent(id, { active: next });
            await refreshAllEvents();
          }}
        />
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  if (!currentEvent) return <BootScreen />;

  const admin = isEventAdmin(me, currentEvent);
  const modules = currentEvent.modules || ['drinks'];
  const drinksOn = modules.includes('drinks');

  if (!currentEvent.active && !admin) {
    return (
      <div className="ww-app">
        <GrainOverlay />
        <TopBar
          me={me}
          admin={admin}
          eventName={currentEvent.name}
          onSettings={() => setView('settings')}
          onSwitchEvent={() => setCurrentEventId(null)}
        />
        <main className="ww-main">
          <WaitingScreen event={currentEvent} onLeave={onLeaveEvent} />
        </main>
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  return (
    <div className="ww-app">
      <GrainOverlay />
      <TopBar
        me={me}
        admin={admin}
        eventName={currentEvent.name}
        active={currentEvent.active}
        onSettings={() => setView('settings')}
        onSwitchEvent={() => setCurrentEventId(null)}
      />
      <main className="ww-main">
        {view === 'dashboard' && (
          <Dashboard
            me={me} event={currentEvent} members={eventMembers}
            statsMap={statsMap} setStatsMap={setStatsMap}
            drinksOn={drinksOn} active={currentEvent.active}
            modules={modules}
          />
        )}
        {view === 'crew' && (
          <CrewView members={eventMembers} statsMap={statsMap} event={currentEvent} myId={me.id} />
        )}
        {view === 'profile' && (
          <ProfileView me={me} onSave={onSaveProfile} onLogout={onLogout} />
        )}
        {view === 'settings' && (
          admin
            ? <EventSettingsView
                event={currentEvent}
                me={me}
                members={eventMembers}
                onSave={onSaveEvent}
                onToggleActive={onToggleActive}
                onResetCounters={onResetCounters}
                onDeleteEvent={async () => {
                  if (!confirm('Event endgültig löschen?')) return;
                  await deleteEvent(currentEvent.id);
                  setCurrentEventId(null);
                  await refreshMemberships();
                  showToast('Event gelöscht');
                }}
                onSetUserRole={setUserRole}
                onDeleteUser={async (id) => {
                  if (!confirm('User wirklich löschen?')) return;
                  await deleteUser(id); showToast('User gelöscht');
                }}
                onBack={() => setView('dashboard')}
              />
            : <NotAllowed onBack={() => setView('dashboard')} />
        )}
      </main>
      {view !== 'settings' && <BottomNav view={view} setView={setView} />}
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function BootScreen() {
  return (
    <div className="ww-boot">
      <div className="ww-boot-inner">
        <div className="ww-boot-emoji">🍺</div>
        <div className="ww-boot-text">LOADING</div>
      </div>
    </div>
  );
}

// ============================================================
// Auth
// ============================================================

function AuthScreen({ view, setView, onLogin, onRegister }) {
  return (
    <div className="ww-auth">
      <div className="ww-auth-header">
        <div className="ww-tag">BOIZ</div>
        <h1 className="ww-display ww-title-huge">Weekend Manager</h1>
        <p className="ww-muted">Logg dich ein oder mach einen Account.</p>
      </div>
      <div className="ww-auth-tabs">
        <button className={`ww-auth-tab ${view === 'login' ? 'active' : ''}`} onClick={() => setView('login')}>LOGIN</button>
        <button className={`ww-auth-tab ${view === 'register' ? 'active' : ''}`} onClick={() => setView('register')}>NEU HIER</button>
      </div>
      {view === 'login' ? <LoginForm onSubmit={onLogin} /> : <RegisterForm onSubmit={onRegister} />}
    </div>
  );
}

function LoginForm({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = email.includes('@') && password.length >= 8;
  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr('');
    try { await onSubmit(email.trim(), password); }
    catch (e) { setErr('Login fehlgeschlagen — falsche Daten?'); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <label className="ww-label"><Mail size={12} /> E-MAIL</label>
      <input className="ww-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      <label className="ww-label"><Lock size={12} /> PASSWORT</label>
      <input className="ww-input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
      {err && <div className="ww-err">{err}</div>}
      <button className={`ww-big-cta ${valid && !busy ? '' : 'disabled'}`} onClick={submit} disabled={!valid || busy}>
        <Check size={20} /><span>{busy ? '...' : 'EINLOGGEN'}</span>
      </button>
    </div>
  );
}

function RegisterForm({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_AVATARS[0]);
  const [foodWishes, setFoodWishes] = useState('');
  const [drinkWishes, setDrinkWishes] = useState('');
  const [allergies, setAllergies] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = email.includes('@') && password.length >= 8 && displayName.trim().length >= 2;
  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr('');
    try {
      await onSubmit({
        email: email.trim(), password,
        displayName: displayName.trim(), emoji,
        foodWishes: foodWishes.trim(),
        drinkWishes: drinkWishes.trim(),
        allergies: allergies.trim(),
      });
    } catch (e) {
      setErr(e?.response?.data
        ? Object.values(e.response.data).map(v => v.message).join(' / ')
        : 'Registrierung fehlgeschlagen');
    } finally { setBusy(false); }
  };
  return (
    <div>
      <label className="ww-label"><Mail size={12} /> E-MAIL</label>
      <input className="ww-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      <label className="ww-label"><Lock size={12} /> PASSWORT (min. 8)</label>
      <input className="ww-input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
      <label className="ww-label">DEIN NAME</label>
      <input className="ww-input" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={20} />
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
      {err && <div className="ww-err">{err}</div>}
      <button className={`ww-big-cta ${valid && !busy ? '' : 'disabled'}`} onClick={submit} disabled={!valid || busy}>
        <UserPlus size={20} /><span>{busy ? '...' : 'SQUAD BEITRETEN'}</span>
      </button>
    </div>
  );
}

// ============================================================
// Lobby (event picker / join / create / admin)
// ============================================================

function Lobby({
  me, memberships, allEvents, view, setView, onPick, onJoin, onCreate,
  onLogout, onDeleteEvent, onToggleActiveAdmin,
}) {
  const siteAdmin = isSiteAdmin(me);
  return (
    <div className="ww-auth">
      <div className="ww-auth-header">
        <div className="ww-tag">SERVUS, {(me.displayName || me.email).toUpperCase()}</div>
        <h1 className="ww-display ww-title-huge">Events</h1>
        <p className="ww-muted">Tritt einem Event bei{siteAdmin ? ' oder erstelle ein neues' : ''}.</p>
      </div>

      <div className="ww-auth-tabs">
        <button className={`ww-auth-tab ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>MEINE</button>
        <button className={`ww-auth-tab ${view === 'join' ? 'active' : ''}`} onClick={() => setView('join')}>JOIN</button>
        {siteAdmin && <button className={`ww-auth-tab ${view === 'create' ? 'active' : ''}`} onClick={() => setView('create')}>NEU</button>}
        {siteAdmin && <button className={`ww-auth-tab ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>ALLE</button>}
      </div>

      {view === 'list' && (
        <div>
          {memberships.length === 0 && <p className="ww-muted">Noch keine Events. Joine eins per Code 🎟️</p>}
          <div className="ww-user-grid">
            {memberships.map(m => {
              const ev = m.expand?.event;
              if (!ev) return null;
              return (
                <button key={m.id} className="ww-user-card" onClick={() => onPick(ev.id)}>
                  <div className="ww-user-emoji">{ev.active ? '🟢' : '⏸'}</div>
                  <div>
                    <div className="ww-user-name">{ev.name}</div>
                    <div className="ww-muted" style={{ fontSize: 11 }}>{formatDate(ev.date)} · CODE {ev.code}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <button className="ww-text-btn" onClick={onLogout}><LogOut size={14} /> Ausloggen</button>
        </div>
      )}

      {view === 'join' && <JoinForm onSubmit={onJoin} />}
      {view === 'create' && siteAdmin && <CreateEventForm onSubmit={onCreate} />}
      {view === 'admin' && siteAdmin && (
        <AdminAllEvents events={allEvents} onPick={onPick} onDelete={onDeleteEvent} onToggleActive={onToggleActiveAdmin} />
      )}
    </div>
  );
}

function JoinForm({ onSubmit }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr('');
    try { await onSubmit(code); }
    catch (e) { setErr('Code ungültig.'); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <label className="ww-label"><KeyRound size={12} /> EVENT-CODE</label>
      <input
        className="ww-input ww-code-input"
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        placeholder="ABC123"
        maxLength={6}
      />
      {err && <div className="ww-err">{err}</div>}
      <button className={`ww-big-cta ${code.length === 6 && !busy ? '' : 'disabled'}`} onClick={submit} disabled={code.length !== 6 || busy}>
        <Check size={20} /><span>{busy ? '...' : 'JOIN'}</span>
      </button>
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [modules, setModules] = useState(['drinks']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const valid = name.trim().length >= 2;
  const toggle = (id) => setModules(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr('');
    try { await onSubmit({ name: name.trim(), date, modules }); }
    catch (e) {
      const detail = e?.response?.data
        ? Object.entries(e.response.data).map(([k, v]) => `${k}: ${v.message}`).join(' / ')
        : (e?.response?.message || e?.message || 'Unbekannter Fehler');
      setErr(`${e?.status || ''} ${detail}`);
      console.error('createEvent failed', e);
    } finally { setBusy(false); }
  };
  return (
    <div>
      <label className="ww-label">EVENT-NAME</label>
      <input className="ww-input" value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Boiz Sommer-Wochenende" />
      <label className="ww-label">DATUM</label>
      <input className="ww-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
      <label className="ww-label">MODULE</label>
      <div className="ww-modules">
        {MODULES.map(m => (
          <button
            key={m.id}
            className={`ww-mod-card ${modules.includes(m.id) ? 'sel' : ''} ${m.available ? '' : 'disabled'}`}
            onClick={() => m.available && toggle(m.id)}
            disabled={!m.available}
          >
            <div className="ww-mod-icon">{m.icon}</div>
            <div className="ww-mod-name">{m.name}</div>
            {!m.available && <div className="ww-mod-soon">SOON</div>}
          </button>
        ))}
      </div>
      {err && <div className="ww-err">{err}</div>}
      <button className={`ww-big-cta ${valid && !busy ? '' : 'disabled'}`} onClick={submit} disabled={!valid || busy}>
        <Plus size={20} /><span>{busy ? '...' : 'EVENT ERSTELLEN'}</span>
      </button>
    </div>
  );
}

function AdminAllEvents({ events, onPick, onDelete, onToggleActive }) {
  if (!events.length) return <p className="ww-muted">Keine Events erstellt.</p>;
  return (
    <div className="ww-user-grid">
      {events.map(ev => (
        <div key={ev.id} className="ww-admin-event-card">
          <button className="ww-admin-event-main" onClick={() => onPick(ev.id)}>
            <div className="ww-user-emoji">{ev.active ? '🟢' : '⏸'}</div>
            <div>
              <div className="ww-user-name">{ev.name}</div>
              <div className="ww-muted" style={{ fontSize: 11 }}>{formatDate(ev.date)} · CODE {ev.code}</div>
            </div>
          </button>
          <div className="ww-admin-event-actions">
            <button className="ww-mini-btn" onClick={() => onToggleActive(ev.id, !ev.active)}>
              {ev.active ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Start</>}
            </button>
            <button className="ww-mini-btn red" onClick={() => onDelete(ev.id)}><X size={11} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Top bar
// ============================================================

function TopBar({ me, admin, eventName, active, onSettings, onSwitchEvent }) {
  return (
    <header className="ww-topbar">
      <div className="ww-topbar-left">
        <button className="ww-icon-btn" onClick={onSwitchEvent} aria-label="Andere Events" title="Andere Events">
          <ArrowLeft size={16} />
        </button>
        <div className="ww-me-block">
          <div className="ww-me-hi">{me.emoji || '🍺'} {(me.displayName || me.email).toUpperCase()}</div>
          <div className="ww-me-name">
            {eventName}
            {active === false && <span className="ww-pause-badge"><Pause size={9} /> PAUSE</span>}
            {admin && <span className="ww-admin-badge"><ShieldCheck size={10} /> HOST</span>}
          </div>
        </div>
      </div>
      {admin && (
        <button className="ww-icon-btn" onClick={onSettings} aria-label="Settings">
          <Settings size={18} />
        </button>
      )}
    </header>
  );
}

// ============================================================
// Waiting screen
// ============================================================

function WaitingScreen({ event, onLeave }) {
  return (
    <div className="ww-waiting">
      <Hourglass size={64} className="ww-waiting-icon" />
      <h2 className="ww-display ww-title-big">Noch nicht gestartet</h2>
      <p className="ww-muted">
        Der Host hat <b>{event.name}</b> noch nicht aktiv gesetzt.<br />
        Sobald es losgeht, ploppt's automatisch auf.
      </p>
      <button className="ww-text-btn" onClick={onLeave}>
        <X size={14} /> Event verlassen
      </button>
    </div>
  );
}

// ============================================================
// Dashboard
// ============================================================

function Dashboard({ me, event, members, statsMap, setStatsMap, drinksOn, active, modules }) {
  const usersById = useMemo(() => {
    const m = {};
    for (const mem of members) if (mem.expand?.user) m[mem.expand.user.id] = mem.expand.user;
    return m;
  }, [members]);

  const myStats = statsMap[me.id] || { id: null, beer: 0, mische: 0 };

  // ---- Counter debounce: optimistic state + debounced write of latest absolute value ----
  const pendingWrite = useRef(null);
  const flushTimer = useRef(null);

  const scheduleWrite = (statsId, vals) => {
    pendingWrite.current = { statsId, vals };
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(async () => {
      const w = pendingWrite.current;
      pendingWrite.current = null;
      if (!w?.statsId) return;
      try { await setMyCount(w.statsId, w.vals); }
      catch (e) { console.warn('write failed', e); }
    }, 350);
  };

  const bump = (kind, delta) => {
    if (!active) return;
    const cur = statsMap[me.id];
    if (!cur?.id) return;
    const nextVal = Math.max(0, (cur[kind] || 0) + delta);
    const next = { ...cur, [kind]: nextVal };
    setStatsMap(m => ({ ...m, [me.id]: next }));
    scheduleWrite(cur.id, { beer: next.beer, mische: next.mische });
  };

  const leaderboard = useMemo(() => {
    return members
      .map(m => {
        const u = m.expand?.user;
        if (!u) return null;
        const s = statsMap[u.id] || { beer: 0, mische: 0 };
        return { ...u, beer: s.beer, mische: s.mische, points: computePoints(s, event) };
      })
      .filter(Boolean)
      .sort((a, b) => b.points - a.points);
  }, [members, statsMap, event]);

  const myRank = leaderboard.findIndex(u => u.id === me.id) + 1;
  const maxPoints = Math.max(1, ...leaderboard.map(u => u.points));
  const myPoints = computePoints(myStats, event);

  return (
    <div className="ww-dash">
      <div className="ww-event-banner">
        <div className="ww-tag">{formatDate(event.date)}</div>
        <h1 className="ww-display ww-title-big">{event.name}</h1>
      </div>

      {drinksOn ? (
        <>
          <div className="ww-counters">
            <CounterCard icon={<Beer size={28} />} label={event.beerLabel} color="amber"
              count={myStats.beer} disabled={!active}
              onInc={() => bump('beer', +1)} onDec={() => bump('beer', -1)} />
            <CounterCard icon={<Wine size={28} />} label={event.drinkLabel} color="red"
              count={myStats.mische} disabled={!active}
              onInc={() => bump('mische', +1)} onDec={() => bump('mische', -1)} />
          </div>

          <div className="ww-stats-row">
            <StatPill label="Drinks" value={(myStats.beer || 0) + (myStats.mische || 0)} />
            <StatPill label="Punkte" value={myPoints} accent />
            <StatPill label="Rang" value={myRank ? `#${myRank}` : '–'} />
          </div>

          <section className="ww-section">
            <div className="ww-section-head"><Trophy size={16} /><h3>LIVE LEADERBOARD</h3></div>
            <div className="ww-board">
              {leaderboard.map((u, i) => (
                <div key={u.id} className={`ww-board-row ${u.id === me.id ? 'me' : ''}`}>
                  <div className="ww-board-rank">{rankBadge(i)}</div>
                  <div className="ww-board-emoji">{u.emoji || '🍺'}</div>
                  <div className="ww-board-name">{u.displayName || u.email}{u.id === me.id && <span className="ww-you">DU</span>}</div>
                  <div className="ww-board-bar-wrap">
                    <div className="ww-board-bar" style={{ width: `${(u.points / maxPoints) * 100}%` }} />
                  </div>
                  <div className="ww-board-pts">{u.points}<span>pkt</span></div>
                </div>
              ))}
              {leaderboard.length === 0 && <div className="ww-empty">Noch keiner getrunken 💀</div>}
            </div>
          </section>
        </>
      ) : (
        <section className="ww-section">
          <div className="ww-empty">Keine Module aktiviert.</div>
        </section>
      )}

      {modules.filter(m => m !== 'drinks').map(id => {
        const meta = moduleById(id);
        if (!meta) return null;
        return (
          <section key={id} className="ww-section">
            <div className="ww-section-head"><Wrench size={16} /><h3>{meta.icon} {meta.name.toUpperCase()}</h3></div>
            <div className="ww-empty">{meta.name} kommt bald 🛠️</div>
          </section>
        );
      })}
    </div>
  );
}

function CounterCard({ icon, label, color, count, onInc, onDec, disabled }) {
  const [pulse, setPulse] = useState(0);
  return (
    <div className={`ww-counter ww-${color} ${disabled ? 'disabled' : ''}`}>
      <button className="ww-counter-tap" onClick={() => { if (!disabled) { onInc(); setPulse(p => p + 1); } }} disabled={disabled}>
        <div className="ww-counter-icon">{icon}</div>
        <div className="ww-counter-label">{label?.toUpperCase()}</div>
        <div className="ww-counter-num" key={pulse}>{count || 0}</div>
        <div className="ww-counter-hint">{disabled ? 'PAUSE' : 'TIPPEN = +1'}</div>
      </button>
      <button className="ww-counter-minus" onClick={onDec} aria-label="minus eins" disabled={disabled}>
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
// Crew
// ============================================================

function CrewView({ members, statsMap, event, myId }) {
  return (
    <div className="ww-crew">
      <div className="ww-section-head"><Users size={16} /><h3>DIE CREW ({members.length})</h3></div>
      <div className="ww-crew-list">
        {members.map(m => {
          const u = m.expand?.user;
          if (!u) return null;
          const s = statsMap[u.id] || { beer: 0, mische: 0 };
          const points = computePoints(s, event);
          return (
            <div key={u.id} className={`ww-crew-card ${u.id === myId ? 'me' : ''}`}>
              <div className="ww-crew-head">
                <div className="ww-crew-emoji">{u.emoji || '🍺'}</div>
                <div className="ww-crew-name">{u.displayName || u.email}{u.id === myId && <span className="ww-you">DU</span>}</div>
                <div className="ww-crew-pts">{points} pkt</div>
              </div>
              <div className="ww-crew-mini">
                <span><Beer size={11} /> {s.beer || 0}</span>
                <span><Wine size={11} /> {s.mische || 0}</span>
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
// Profile
// ============================================================

function ProfileView({ me, onSave, onLogout }) {
  const [displayName, setDisplayName] = useState(me.displayName || '');
  const [emoji, setEmoji] = useState(me.emoji || EMOJI_AVATARS[0]);
  const [foodWishes, setFoodWishes] = useState(me.foodWishes || '');
  const [drinkWishes, setDrinkWishes] = useState(me.drinkWishes || '');
  const [allergies, setAllergies] = useState(me.allergies || '');
  const dirty = displayName !== (me.displayName || '') || emoji !== (me.emoji || '') ||
    foodWishes !== (me.foodWishes || '') || drinkWishes !== (me.drinkWishes || '') || allergies !== (me.allergies || '');
  return (
    <div className="ww-form-wrap">
      <h2 className="ww-display ww-title-big">Mein Profil</h2>
      <label className="ww-label">NAME</label>
      <input className="ww-input" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={20} />
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
      <button className={`ww-big-cta ${dirty ? '' : 'disabled'}`} disabled={!dirty}
        onClick={() => onSave({ displayName: displayName.trim(), emoji, foodWishes: foodWishes.trim(), drinkWishes: drinkWishes.trim(), allergies: allergies.trim() })}>
        <Check size={20} /><span>SPEICHERN</span>
      </button>
      <button className="ww-text-btn" onClick={onLogout}><LogOut size={14} /> Ausloggen</button>
    </div>
  );
}

// ============================================================
// Event Settings (host)
// ============================================================

function EventSettingsView({ event, me, members, onSave, onToggleActive, onResetCounters, onDeleteEvent, onSetUserRole, onDeleteUser, onBack }) {
  const [name, setName] = useState(event.name || '');
  const [date, setDate] = useState(event.date || '');
  const [beerLabel, setBeerLabel] = useState(event.beerLabel || 'Bier');
  const [drinkLabel, setDrinkLabel] = useState(event.drinkLabel || 'Mische');
  const [pb_, setPb] = useState(event.pointsPerBeer ?? 1);
  const [pm, setPm] = useState(event.pointsPerMische ?? 1);
  const [mods, setMods] = useState(event.modules || ['drinks']);
  const toggleMod = (id) => setMods(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const copyCode = () => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(event.code);
  };

  return (
    <div className="ww-form-wrap">
      <button className="ww-back" onClick={onBack}><ArrowLeft size={18} /> zurück</button>
      <h2 className="ww-display ww-title-big">Event-Settings</h2>

      <div className="ww-code-box">
        <div className="ww-muted" style={{ fontSize: 11, letterSpacing: '0.2em' }}>JOIN-CODE</div>
        <div className="ww-code-val">{event.code}</div>
        <button className="ww-mini-btn" onClick={copyCode}><Copy size={11} /> Copy</button>
      </div>

      <button className={`ww-big-cta ${event.active ? '' : 'green'}`} onClick={onToggleActive}>
        {event.active ? <><Pause size={20} /><span>PAUSIEREN</span></> : <><Play size={20} /><span>EVENT STARTEN</span></>}
      </button>

      <label className="ww-label">EVENT-NAME</label>
      <input className="ww-input" value={name} onChange={e => setName(e.target.value)} />
      <label className="ww-label">DATUM</label>
      <input className="ww-input" type="date" value={date} onChange={e => setDate(e.target.value)} />

      <label className="ww-label">MODULE</label>
      <div className="ww-modules">
        {MODULES.map(m => (
          <button
            key={m.id}
            className={`ww-mod-card ${mods.includes(m.id) ? 'sel' : ''} ${m.available ? '' : 'disabled'}`}
            onClick={() => m.available && toggleMod(m.id)}
            disabled={!m.available}
          >
            <div className="ww-mod-icon">{m.icon}</div>
            <div className="ww-mod-name">{m.name}</div>
            {!m.available && <div className="ww-mod-soon">SOON</div>}
          </button>
        ))}
      </div>

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
          <input className="ww-input" type="number" min={0} max={10} value={pb_} onChange={e => setPb(Number(e.target.value))} />
        </div>
        <div>
          <label className="ww-label">PKT / MISCHE</label>
          <input className="ww-input" type="number" min={0} max={10} value={pm} onChange={e => setPm(Number(e.target.value))} />
        </div>
      </div>
      <button className="ww-big-cta" onClick={() => onSave({
        name: name.trim(), date,
        beerLabel: beerLabel.trim(), drinkLabel: drinkLabel.trim(),
        pointsPerBeer: pb_, pointsPerMische: pm, modules: mods,
      })}>
        <Check size={20} /><span>SPEICHERN</span>
      </button>

      {isSiteAdmin(me) && (
        <div className="ww-section">
          <div className="ww-section-head"><Shield size={16} /><h3>USER MANAGEMENT (GLOBAL)</h3></div>
          <div className="ww-user-mgmt">
            {members.map(m => {
              const u = m.expand?.user;
              if (!u || u.id === me.id) return null;
              return (
                <div key={u.id} className="ww-user-mgmt-row">
                  <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
                  <span className="ww-user-mgmt-name">
                    {u.displayName || u.email}
                    {u.role === 'admin' && <span className="ww-admin-badge"><ShieldCheck size={9} /> ADMIN</span>}
                  </span>
                  <button className="ww-mini-btn" onClick={() => onSetUserRole(u.id, u.role === 'admin' ? 'member' : 'admin')}>
                    {u.role === 'admin' ? '→ Member' : '→ Admin'}
                  </button>
                  <button className="ww-mini-btn red" onClick={() => onDeleteUser(u.id)}><X size={12} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="ww-danger">
        <div className="ww-danger-head"><AlertTriangle size={14} /> DANGER ZONE</div>
        <button className="ww-danger-btn" onClick={onResetCounters}>
          <RotateCcw size={14} /> Counter dieses Events zurücksetzen
        </button>
        <button className="ww-danger-btn red" onClick={onDeleteEvent}>
          <X size={14} /> Event endgültig löschen
        </button>
      </div>
    </div>
  );
}

function NotAllowed({ onBack }) {
  return (
    <div className="ww-form-wrap">
      <h2 className="ww-display ww-title-big">Kein Zutritt</h2>
      <p className="ww-muted">Nur der Host darf hier rein.</p>
      <button className="ww-big-cta" onClick={onBack}><ArrowLeft size={20} /><span>ZURÜCK</span></button>
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

function Toast({ toast }) {
  return <div className="ww-toast" key={toast.id}>{toast.msg}</div>;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  } catch { return iso; }
}

function GrainOverlay() {
  return <div className="ww-grain" aria-hidden="true" />;
}
