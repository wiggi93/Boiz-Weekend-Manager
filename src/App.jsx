import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Beer, Wine, Trophy, Users, Settings, Plus, Minus, Check, X,
  RotateCcw, Home, User as UserIcon, Utensils,
  ArrowLeft, LogOut, AlertTriangle, ShieldCheck,
  Mail, Lock, UserPlus, Shield, KeyRound, Copy, Play, Pause,
  Hourglass, Eye, EyeOff, Dice5, Hand, Trash2, Flag,
} from 'lucide-react';
import {
  pb, isSiteAdmin, isHost, isEventAdmin,
  login, register, logout,
  listAllEvents, getEvent, createEvent, updateEvent, deleteEvent,
  listMyMemberships, listEventMembers, joinByCode, leaveEvent, kickMember,
  loadEventStats, setMyCount, resetEventStats,
  updateMyProfile, setUserRole, deleteUser, loadAllUsers,
  getFlunky, updateFlunky,
  subscribeEvent, subscribeMyMemberships,
} from './api.js';
import { MODULES, moduleById } from './modules.js';
import './App.css';

const EMOJI_AVATARS = ['🦁','🐻','🐺','🦊','🐯','🦅','🦍','🐂','🐉','🦈','⚔️','🔥','💪','🍺','🎸','🏍️','⚡','💀','🍻','🐗','🐲','🥃','🎯','🤘'];

const computeDrinkPoints = (s, ev) =>
  (s?.beer || 0) * (ev?.pointsPerBeer ?? 1) + (s?.mische || 0) * (ev?.pointsPerMische ?? 1);

const finishedGames = (flunky) => (flunky?.games || []).filter(g => g.winner === 'A' || g.winner === 'B');
const currentGame = (flunky) => {
  const games = flunky?.games || [];
  const last = games[games.length - 1];
  return last && last.winner == null ? last : null;
};
const teamOfInGame = (userId, game) => {
  if (!game) return null;
  if ((game.teamA || []).includes(userId)) return 'A';
  if ((game.teamB || []).includes(userId)) return 'B';
  return null;
};
const computeFlunkyPoints = (userId, flunky) => {
  if (!flunky) return 0;
  const ppw = flunky.pointsPerWin || 0;
  return finishedGames(flunky).reduce((sum, g) =>
    teamOfInGame(userId, g) === g.winner ? sum + ppw : sum, 0);
};
const computeTotalPoints = (userId, s, ev, flunky) =>
  computeDrinkPoints(s, ev) + computeFlunkyPoints(userId, flunky);

// ============================================================
// Root
// ============================================================

export default function App() {
  const [booted, setBooted] = useState(false);
  const [me, setMe] = useState(pb.authStore.record);
  const [myMemberships, setMyMemberships] = useState([]);
  const [currentEventId, setCurrentEventId] = useState(null);
  const [currentEvent, setCurrentEvent] = useState(null);
  const eventRef = useRef(null);
  useEffect(() => { eventRef.current = currentEvent; }, [currentEvent]);
  const [eventMembers, setEventMembers] = useState([]);
  const [statsMap, setStatsMap] = useState({});
  const [flunky, setFlunky] = useState(null);
  const flunkyRef = useRef(null);
  useEffect(() => { flunkyRef.current = flunky; }, [flunky]);
  // Tracks the latest optimistic values for my own drink stats so realtime
  // echoes (PB broadcasts our own writes back) don't cause flicker. Updated
  // by DrinksBar on every bump; cleared on event switch.
  const myOptRef = useRef({ beer: 0, mische: 0 });
  const [allEvents, setAllEvents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [view, setView] = useState('home');
  const [moduleTab, setModuleTab] = useState('overview');
  const [moduleSettingsOpen, setModuleSettingsOpen] = useState(null); // module id or null
  const [detailUserId, setDetailUserId] = useState(null);
  const [authView, setAuthView] = useState('login');
  const [lobbyView, setLobbyView] = useState('list');
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast({ msg, id: Date.now() });
    setTimeout(() => setToast(t => (t && Date.now() - t.id >= 1800) ? null : t), 2000);
  };

  useEffect(() => pb.authStore.onChange(() => setMe(pb.authStore.record)), []);

  const refreshMemberships = useCallback(async () => {
    if (!pb.authStore.isValid) { setMyMemberships([]); return; }
    try { setMyMemberships(await listMyMemberships()); }
    catch (e) { console.warn('refreshMemberships', e); }
  }, []);

  const refreshCurrentEvent = useCallback(async () => {
    if (!currentEventId) {
      setCurrentEvent(null); setEventMembers([]); setStatsMap({}); setFlunky(null);
      return;
    }
    try {
      const [ev, members, stats, fl] = await Promise.all([
        getEvent(currentEventId),
        listEventMembers(currentEventId),
        loadEventStats(currentEventId),
        getFlunky(currentEventId),
      ]);
      setCurrentEvent(ev); setEventMembers(members); setStatsMap(stats); setFlunky(fl);
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

  const refreshAllUsers = useCallback(async () => {
    if (!isSiteAdmin(me)) return;
    try { setAllUsers(await loadAllUsers()); }
    catch (e) { console.warn('refreshAllUsers', e); }
  }, [me]);

  useEffect(() => {
    (async () => { await refreshMemberships(); setBooted(true); })();
  }, [refreshMemberships, me?.id]);

  useEffect(() => {
    if (!me) return;
    let unsub;
    subscribeMyMemberships(() => refreshMemberships()).then(fn => { unsub = fn; });
    return () => { if (unsub) unsub(); };
  }, [me, refreshMemberships]);

  useEffect(() => {
    refreshCurrentEvent();
    // reset own-optimistic baseline on event switch
    myOptRef.current = { beer: 0, mische: 0 };
  }, [refreshCurrentEvent]);

  // Sync own-optimistic baseline from initial / refreshed stats
  useEffect(() => {
    const mine = statsMap[me?.id];
    if (mine) myOptRef.current = { beer: mine.beer || 0, mische: mine.mische || 0 };
  }, [statsMap, me?.id]);

  // Stable realtime handler — applies records incrementally, no refetch storm.
  const realtimeHandler = useCallback((collection, ev) => {
    const rec = ev.record;
    if (!rec) return;
    const myId = pb.authStore.record?.id;

    if (collection === 'events') {
      if (ev.action === 'delete') { setCurrentEventId(null); return; }
      setCurrentEvent(prev => {
        const next = prev ? { ...prev, ...rec } : rec;
        eventRef.current = next;
        return next;
      });
      return;
    }

    if (collection === 'stats') {
      if (ev.action === 'delete') {
        setStatsMap(m => { const c = { ...m }; delete c[rec.user]; return c; });
        return;
      }
      // Skip our own write echo if the broadcast matches what we optimistically already show.
      // Different values would mean an external change (e.g., admin reset) — accept those.
      if (rec.user === myId) {
        const opt = myOptRef.current;
        if ((rec.beer || 0) === opt.beer && (rec.mische || 0) === opt.mische) return;
        myOptRef.current = { beer: rec.beer || 0, mische: rec.mische || 0 };
      }
      setStatsMap(m => ({ ...m, [rec.user]: { id: rec.id, beer: rec.beer || 0, mische: rec.mische || 0 } }));
      return;
    }

    if (collection === 'flunky') {
      setFlunky(prev => {
        const next = prev ? { ...prev, ...rec } : rec;
        flunkyRef.current = next;
        return next;
      });
      return;
    }

    if (collection === 'event_members') {
      // Members need expand=user; refetch members list once (one HTTP call,
      // not the whole event payload).
      const eid = eventRef.current?.id;
      if (eid) listEventMembers(eid).then(setEventMembers).catch(() => {});
      return;
    }

    if (collection === 'users') {
      // Profile change: patch the embedded user in our members list.
      setEventMembers(prev => prev.map(m =>
        m.expand?.user?.id === rec.id ? { ...m, expand: { ...m.expand, user: { ...m.expand.user, ...rec } } } : m
      ));
      return;
    }
  }, []);

  useEffect(() => {
    if (!currentEventId) return;
    let unsub;
    subscribeEvent(currentEventId, realtimeHandler).then(fn => { unsub = fn; });
    return () => { if (unsub) unsub(); };
  }, [currentEventId, realtimeHandler]);

  useEffect(() => { if (lobbyView === 'admin') refreshAllEvents(); }, [lobbyView, refreshAllEvents]);

  // Load global user list when admin opens the USER tab in the lobby
  useEffect(() => { if (lobbyView === 'users') refreshAllUsers(); }, [lobbyView, refreshAllUsers]);

  // Reset module tab if currently active module gets disabled
  useEffect(() => {
    if (!currentEvent) return;
    const mods = currentEvent.modules || [];
    if (moduleTab !== 'overview' && !mods.includes(moduleTab)) setModuleTab('overview');
  }, [currentEvent, moduleTab]);

  // ---- Handlers ----
  const onLogin = async (email, password) => { await login(email, password); showToast('Eingeloggt 🍻'); };
  const onRegister = async (data) => { await register(data); showToast(`Willkommen, ${data.displayName}! 🤘`); };
  const onLogout = () => {
    logout(); setCurrentEventId(null); setMyMemberships([]);
    setView('home'); setLobbyView('list'); setAuthView('login');
    showToast('Tschüss 👋');
  };

  const onJoin = async (code) => {
    const ev = await joinByCode(code);
    await refreshMemberships();
    setCurrentEventId(ev.id); setLobbyView('list');
    showToast(`In "${ev.name}" eingecheckt 🚪`);
  };

  const onCreateEvent = async (data) => {
    const ev = await createEvent(data);
    await refreshMemberships();
    setCurrentEventId(ev.id); setLobbyView('list');
    showToast(`Event "${ev.name}" erstellt — Code ${ev.code}`);
  };

  const onSaveEvent = async (patch) => {
    const cur = eventRef.current;
    if (!cur) return;
    const nextEv = { ...cur, ...patch };
    eventRef.current = nextEv; setCurrentEvent(nextEv);
    try { await updateEvent(cur.id, patch); showToast('Event aktualisiert ✓'); }
    catch (e) { showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  const onToggleActive = async () => {
    const cur = eventRef.current;
    if (!cur) return;
    const next = !cur.active;
    const nextEv = { ...cur, active: next };
    eventRef.current = nextEv; setCurrentEvent(nextEv);
    showToast(next ? 'Event aktiv ▶' : 'Event pausiert ⏸');
    try { await updateEvent(cur.id, { active: next }); }
    catch (e) { showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  const onToggleModule = async (id) => {
    const cur = eventRef.current;
    if (!cur) return;
    const mods = cur.modules || [];
    const nextMods = mods.includes(id) ? mods.filter(x => x !== id) : [...mods, id];
    const nextEv = { ...cur, modules: nextMods };
    eventRef.current = nextEv; setCurrentEvent(nextEv);
    try { await updateEvent(cur.id, { modules: nextMods }); }
    catch (e) { showToast('Fehler 😬'); refreshCurrentEvent(); }
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

  const onFlunkyPatch = async (patch) => {
    const cur = flunkyRef.current;
    if (!cur) return;
    const nextF = { ...cur, ...patch };
    flunkyRef.current = nextF; setFlunky(nextF);
    try { await updateFlunky(cur.id, patch); }
    catch (e) { console.warn('flunky update', e); showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  // ---- Render ----
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
          me={me} memberships={myMemberships} allEvents={allEvents} allUsers={allUsers}
          view={lobbyView} setView={setLobbyView}
          onPick={(id) => { setCurrentEventId(id); setModuleTab('overview'); }}
          onJoin={onJoin} onCreate={onCreateEvent} onLogout={onLogout}
          onRefreshAll={refreshAllEvents}
          onDeleteEvent={async (id) => {
            if (!confirm('Event wirklich löschen?')) return;
            await deleteEvent(id); await refreshAllEvents(); showToast('Event gelöscht');
          }}
          onToggleActiveAdmin={async (id, next) => {
            await updateEvent(id, { active: next }); await refreshAllEvents();
          }}
          onSetUserRole={async (id, role) => {
            await setUserRole(id, role);
            await refreshAllUsers();
            showToast(`Rolle: ${role.toUpperCase()}`);
          }}
          onDeleteUser={async (id) => {
            if (!confirm('User wirklich löschen? Gilt global, alle Events.')) return;
            await deleteUser(id);
            await refreshAllUsers();
            showToast('User gelöscht');
          }}
        />
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  if (!currentEvent) return <BootScreen />;

  const admin = isEventAdmin(me, currentEvent);
  const modules = currentEvent.modules || [];

  if (!currentEvent.active && !admin) {
    return (
      <div className="ww-app">
        <GrainOverlay />
        <TopBar me={me} admin={admin} eventName={currentEvent.name}
          settingsActive={false}
          onToggleSettings={() => setView('settings')}
          onSwitchEvent={() => setCurrentEventId(null)} />
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
        me={me} admin={admin} eventName={currentEvent.name} active={currentEvent.active}
        settingsActive={view === 'settings'}
        onToggleSettings={() => setView(v => v === 'settings' ? 'home' : 'settings')}
        onSwitchEvent={() => setCurrentEventId(null)}
      />
      <main className="ww-main">
        {view === 'home' && (
          <HomeView
            me={me} admin={admin} event={currentEvent}
            members={eventMembers} statsMap={statsMap} setStatsMap={setStatsMap}
            flunky={flunky} onFlunkyPatch={onFlunkyPatch}
            modules={modules}
            moduleTab={moduleTab} setModuleTab={setModuleTab}
            moduleSettingsOpen={moduleSettingsOpen} setModuleSettingsOpen={setModuleSettingsOpen}
            onSaveEvent={onSaveEvent}
            onShowUserDetail={setDetailUserId}
          />
        )}
        {view === 'crew' && (
          <CrewView members={eventMembers} statsMap={statsMap} event={currentEvent} flunky={flunky} myId={me.id} onShowUserDetail={setDetailUserId} />
        )}
        {view === 'profile' && (
          <ProfileView me={me} onSave={onSaveProfile} onLogout={onLogout} />
        )}
        {view === 'settings' && (
          admin
            ? <EventSettingsView
                event={currentEvent} me={me} members={eventMembers}
                onSave={onSaveEvent} onToggleActive={onToggleActive}
                onToggleModule={onToggleModule}
                onResetCounters={onResetCounters}
                onDeleteEvent={async () => {
                  if (!confirm('Event endgültig löschen?')) return;
                  await deleteEvent(currentEvent.id);
                  setCurrentEventId(null);
                  await refreshMemberships();
                  showToast('Event gelöscht');
                }}
                onKickMember={async (memberId) => {
                  if (!confirm('User wirklich aus diesem Event entfernen?')) return;
                  try { await kickMember(memberId); showToast('Aus Event entfernt'); }
                  catch (e) { showToast('Konnte nicht entfernen 😬'); }
                }}
              />
            : <NotAllowed onBack={() => setView('home')} />
        )}
      </main>
      {view !== 'settings' && <BottomNav view={view} setView={setView} />}
      {detailUserId && (
        <UserDetailDrawer
          user={(eventMembers.find(m => m.expand?.user?.id === detailUserId) || {}).expand?.user}
          stats={statsMap[detailUserId]}
          event={currentEvent}
          flunky={flunky}
          isMe={detailUserId === me.id}
          onClose={() => setDetailUserId(null)}
        />
      )}
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
      <input className="ww-input" type="email" autoComplete="email" placeholder="deine@email.de" value={email} onChange={e => setEmail(e.target.value)} />
      <label className="ww-label"><Lock size={12} /> PASSWORT</label>
      <input className="ww-input" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
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
        foodWishes: foodWishes.trim(), drinkWishes: drinkWishes.trim(), allergies: allergies.trim(),
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
      <input className="ww-input" type="email" autoComplete="email" placeholder="deine@email.de" value={email} onChange={e => setEmail(e.target.value)} />
      <label className="ww-label"><Lock size={12} /> PASSWORT (min. 8)</label>
      <input className="ww-input" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
      <label className="ww-label">DEIN NAME</label>
      <input className="ww-input" placeholder="z.B. Max" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={20} />
      <label className="ww-label">AVATAR</label>
      <div className="ww-emoji-grid">
        {EMOJI_AVATARS.map(e => (
          <button key={e} className={`ww-emoji-btn ${emoji === e ? 'sel' : ''}`} onClick={() => setEmoji(e)}>{e}</button>
        ))}
      </div>
      <label className="ww-label"><Utensils size={12} /> ESSENSWÜNSCHE</label>
      <textarea className="ww-textarea" placeholder="z.B. Spareribs, Pizza, viel Fleisch..." value={foodWishes} onChange={e => setFoodWishes(e.target.value)} rows={2} />
      <label className="ww-label"><Beer size={12} /> GETRÄNKEWÜNSCHE</label>
      <textarea className="ww-textarea" placeholder="z.B. Tannenzäpfle, Bourbon, Mate..." value={drinkWishes} onChange={e => setDrinkWishes(e.target.value)} rows={2} />
      <label className="ww-label"><AlertTriangle size={12} /> ALLERGIEN</label>
      <textarea className="ww-textarea" placeholder="z.B. Laktose, keine Pilze..." value={allergies} onChange={e => setAllergies(e.target.value)} rows={2} />
      {err && <div className="ww-err">{err}</div>}
      <button className={`ww-big-cta ${valid && !busy ? '' : 'disabled'}`} onClick={submit} disabled={!valid || busy}>
        <UserPlus size={20} /><span>{busy ? '...' : 'SQUAD BEITRETEN'}</span>
      </button>
    </div>
  );
}

// ============================================================
// Lobby
// ============================================================

function Lobby({
  me, memberships, allEvents, allUsers, view, setView, onPick, onJoin, onCreate,
  onLogout, onDeleteEvent, onToggleActiveAdmin, onSetUserRole, onDeleteUser,
}) {
  const siteAdmin = isSiteAdmin(me);
  const canCreate = isHost(me); // admin or host
  return (
    <div className="ww-auth">
      <div className="ww-auth-header">
        <div className="ww-tag">SERVUS, {(me.displayName || me.email).toUpperCase()}</div>
        <h1 className="ww-display ww-title-huge">Events</h1>
        <p className="ww-muted">Tritt einem Event bei{canCreate ? ' oder erstelle ein neues' : ''}.</p>
      </div>
      <div className="ww-auth-tabs">
        <button className={`ww-auth-tab ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>MEINE</button>
        <button className={`ww-auth-tab ${view === 'join' ? 'active' : ''}`} onClick={() => setView('join')}>JOIN</button>
        {canCreate && <button className={`ww-auth-tab ${view === 'create' ? 'active' : ''}`} onClick={() => setView('create')}>NEU</button>}
        {siteAdmin && <button className={`ww-auth-tab ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>ALLE</button>}
        {siteAdmin && <button className={`ww-auth-tab ${view === 'users' ? 'active' : ''}`} onClick={() => setView('users')}>USER</button>}
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
      {view === 'create' && canCreate && <CreateEventForm onSubmit={onCreate} />}
      {view === 'admin' && siteAdmin && (
        <AdminAllEvents events={allEvents} onPick={onPick} onDelete={onDeleteEvent} onToggleActive={onToggleActiveAdmin} />
      )}
      {view === 'users' && siteAdmin && (
        <AdminAllUsers me={me} users={allUsers} onSetRole={onSetUserRole} onDelete={onDeleteUser} />
      )}
    </div>
  );
}

function AdminAllUsers({ me, users, onSetRole, onDelete }) {
  if (users.length === 0) return <p className="ww-muted">Lade…</p>;
  return (
    <div>
      <p className="ww-muted" style={{ fontSize: 12 }}>
        Alle registrierten User. Tap auf <b>M</b> / <b>H</b> / <b>A</b> setzt die Rolle:
        Member kann nur joinen, Host darf Events erstellen, Admin alles.
      </p>
      <div className="ww-user-mgmt">
        {users.filter(u => u.id !== me.id).map(u => (
          <div key={u.id} className="ww-user-mgmt-row">
            <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
            <span className="ww-user-mgmt-name">
              {u.displayName || u.email}
              {u.role === 'admin' && <span className="ww-admin-badge"><ShieldCheck size={9} /> ADMIN</span>}
              {u.role === 'host' && <span className="ww-host-badge"><Shield size={9} /> HOST</span>}
            </span>
            <div className="ww-role-pick" role="radiogroup" aria-label="Rolle">
              {['member', 'host', 'admin'].map(r => (
                <button
                  key={r}
                  className={`ww-role-btn ${(u.role || 'member') === r ? 'active' : ''}`}
                  onClick={() => (u.role || 'member') !== r && onSetRole(u.id, r)}
                  aria-pressed={(u.role || 'member') === r}
                  title={r.toUpperCase()}
                >{r[0].toUpperCase()}</button>
              ))}
            </div>
            <button className="ww-mini-btn red" onClick={() => onDelete(u.id)} title="User löschen"><X size={12} /></button>
          </div>
        ))}
      </div>
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
        placeholder="ABC123" maxLength={6}
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
    } finally { setBusy(false); }
  };
  return (
    <div>
      <label className="ww-label">EVENT-NAME</label>
      <input className="ww-input" value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="z.B. Boiz Sommer-Wochenende" />
      <label className="ww-label">DATUM</label>
      <input className="ww-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
      <label className="ww-label">MODULE</label>
      <div className="ww-modules">
        {MODULES.map(m => (
          <button key={m.id}
            className={`ww-mod-card ${modules.includes(m.id) ? 'sel' : ''} ${m.available ? '' : 'disabled'}`}
            onClick={() => m.available && toggle(m.id)} disabled={!m.available}>
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

function TopBar({ me, admin, eventName, active, settingsActive, onToggleSettings, onSwitchEvent }) {
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
        <button
          className={`ww-icon-btn ${settingsActive ? 'active' : ''}`}
          onClick={onToggleSettings}
          aria-label={settingsActive ? 'Settings schließen' : 'Settings öffnen'}
          aria-pressed={settingsActive}
          title={settingsActive ? 'Zurück zum Event' : 'Event-Settings'}
        >
          <Settings size={18} />
        </button>
      )}
    </header>
  );
}

function WaitingScreen({ event, onLeave }) {
  return (
    <div className="ww-waiting">
      <Hourglass size={64} className="ww-waiting-icon" />
      <h2 className="ww-display ww-title-big">Noch nicht gestartet</h2>
      <p className="ww-muted">
        Der Host hat <b>{event.name}</b> noch nicht aktiv gesetzt.<br />
        Sobald es losgeht, ploppt's automatisch auf.
      </p>
      <button className="ww-text-btn" onClick={onLeave}><X size={14} /> Event verlassen</button>
    </div>
  );
}

// ============================================================
// Home view: module tabs + content
// ============================================================

function HomeView({
  me, admin, event, members, statsMap, setStatsMap, flunky, onFlunkyPatch,
  modules, moduleTab, setModuleTab, moduleSettingsOpen, setModuleSettingsOpen,
  onSaveEvent, onShowUserDetail, myOptRef,
}) {
  // 'drinks' is no longer a tab; it lives as the always-visible sticky bar.
  const enabledTabModules = MODULES.filter(m => modules.includes(m.id) && m.available && m.id !== 'drinks');
  const tabs = [{ id: 'overview', name: 'Stand', icon: '📊' }, ...enabledTabModules];
  const drinksOn = modules.includes('drinks');

  return (
    <div className="ww-home">
      <div className="ww-event-banner">
        <div className="ww-tag">{formatDate(event.date)}</div>
        <h1 className="ww-display ww-title-big">{event.name}</h1>
      </div>

      {drinksOn && (
        <DrinksBar
          me={me} event={event} statsMap={statsMap} setStatsMap={setStatsMap}
          admin={admin} active={event.active}
          onOpenSettings={() => setModuleSettingsOpen('drinks')}
          myOptRef={myOptRef}
        />
      )}

      <div className="ww-mod-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`ww-mod-tab ${moduleTab === t.id ? 'active' : ''}`} onClick={() => setModuleTab(t.id)}>
            <span className="ww-mod-tab-icon">{t.icon}</span>
            <span className="ww-mod-tab-name">{t.name}</span>
          </button>
        ))}
      </div>

      {moduleTab === 'overview' && (
        <OverviewView me={me} event={event} members={members} statsMap={statsMap} flunky={flunky} onShowUserDetail={onShowUserDetail} />
      )}
      {moduleTab === 'flunky' && flunky && (
        <FlunkyView
          me={me} flunky={flunky} members={members} admin={admin} active={event.active}
          onPatch={onFlunkyPatch}
          onOpenSettings={() => setModuleSettingsOpen('flunky')}
        />
      )}

      {moduleSettingsOpen === 'drinks' && admin && (
        <ModuleSettingsDrawer title="🍺 Bier-Counter — Live Settings" onClose={() => setModuleSettingsOpen(null)}>
          <DrinksLiveSettings event={event} onSave={onSaveEvent} />
        </ModuleSettingsDrawer>
      )}
      {moduleSettingsOpen === 'flunky' && admin && flunky && (
        <ModuleSettingsDrawer title="🎳 Flunkyball — Live Settings" onClose={() => setModuleSettingsOpen(null)}>
          <FlunkyLiveSettings flunky={flunky} onPatch={onFlunkyPatch} />
        </ModuleSettingsDrawer>
      )}
    </div>
  );
}

// ============================================================
// Sticky drinks bar (replaces the old drinks tab)
// ============================================================

function DrinksBar({ me, event, statsMap, setStatsMap, admin, active, onOpenSettings, myOptRef }) {
  const myStats = statsMap[me.id] || { id: null, beer: 0, mische: 0 };
  const pendingWrite = useRef(null);
  const flushTimer = useRef(null);

  const scheduleWrite = (statsId, vals) => {
    pendingWrite.current = { statsId, vals };
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(async () => {
      const w = pendingWrite.current; pendingWrite.current = null;
      if (!w?.statsId) return;
      try { await setMyCount(w.statsId, w.vals); }
      catch (e) { console.warn('write failed', e); }
    }, 350);
  };

  const bump = (kind, delta) => {
    if (!active) return;
    const cur = statsMap[me.id]; if (!cur?.id) return;
    const nextVal = Math.max(0, (cur[kind] || 0) + delta);
    const next = { ...cur, [kind]: nextVal };
    setStatsMap(m => ({ ...m, [me.id]: next }));
    // Update the App-level ref so the realtime handler can recognise its
    // own echo and skip it (no flicker on rapid tapping).
    if (myOptRef) myOptRef.current = { beer: next.beer, mische: next.mische };
    scheduleWrite(cur.id, { beer: next.beer, mische: next.mische });
  };

  return (
    <div className={`ww-drinks-bar ${!active ? 'paused' : ''}`}>
      <DrinkPill
        emoji="🍺" label={event.beerLabel} count={myStats.beer || 0}
        disabled={!active}
        onInc={() => bump('beer', +1)} onDec={() => bump('beer', -1)}
      />
      <DrinkPill
        emoji="🍷" label={event.drinkLabel} count={myStats.mische || 0}
        disabled={!active}
        onInc={() => bump('mische', +1)} onDec={() => bump('mische', -1)}
      />
      {admin && (
        <button className="ww-icon-btn ww-icon-btn-sm" onClick={onOpenSettings} aria-label="Drinks Settings">
          <Settings size={14} />
        </button>
      )}
    </div>
  );
}

function DrinkPill({ emoji, label, count, disabled, onInc, onDec }) {
  const [pulse, setPulse] = useState(0);
  return (
    <div className={`ww-drink-pill ${disabled ? 'disabled' : ''}`} title={label}>
      <button className="ww-drink-btn minus" onClick={onDec} disabled={disabled} aria-label={`${label} minus`}>
        <Minus size={12} />
      </button>
      <button className="ww-drink-tap" onClick={() => { if (!disabled) { onInc(); setPulse(p => p + 1); } }} disabled={disabled}>
        <span className="ww-drink-emoji">{emoji}</span>
        <span className="ww-drink-count" key={pulse}>{count}</span>
      </button>
      <button className="ww-drink-btn plus" onClick={onInc} disabled={disabled} aria-label={`${label} plus`}>
        <Plus size={14} />
      </button>
    </div>
  );
}

// ============================================================
// Overview (leaderboard / standings)
// ============================================================

function OverviewView({ me, event, members, statsMap, flunky, onShowUserDetail }) {
  const leaderboard = useMemo(() => members
    .map(m => {
      const u = m.expand?.user; if (!u) return null;
      const s = statsMap[u.id] || { beer: 0, mische: 0 };
      return { ...u, beer: s.beer, mische: s.mische, points: computeTotalPoints(u.id, s, event, flunky) };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points),
    [members, statsMap, event, flunky]);

  const myRank = leaderboard.findIndex(u => u.id === me.id) + 1;
  const maxPoints = Math.max(1, ...leaderboard.map(u => u.points));
  const myEntry = leaderboard.find(u => u.id === me.id);

  return (
    <>
      <div className="ww-stats-row">
        <StatPill label="Drinks" value={(myEntry?.beer || 0) + (myEntry?.mische || 0)} />
        <StatPill label="Punkte" value={myEntry?.points || 0} accent />
        <StatPill label="Rang" value={myRank ? `#${myRank}` : '–'} />
      </div>
      <section className="ww-section">
        <div className="ww-section-head"><Trophy size={16} /><h3>LIVE LEADERBOARD</h3></div>
        <div className="ww-board">
          {leaderboard.map((u, i) => (
            <button key={u.id} className={`ww-board-row clickable ${u.id === me.id ? 'me' : ''}`} onClick={() => onShowUserDetail?.(u.id)}>
              <div className="ww-board-rank">{rankBadge(i)}</div>
              <div className="ww-board-emoji">{u.emoji || '🍺'}</div>
              <div className="ww-board-name">{u.displayName || u.email}{u.id === me.id && <span className="ww-you">DU</span>}</div>
              <div className="ww-board-bar-wrap">
                <div className="ww-board-bar" style={{ width: `${(u.points / maxPoints) * 100}%` }} />
              </div>
              <div className="ww-board-pts">{u.points}<span>pkt</span></div>
            </button>
          ))}
          {leaderboard.length === 0 && <div className="ww-empty">Noch keiner gepunktet 💀</div>}
        </div>
      </section>
    </>
  );
}

// ============================================================
// Module header (title + gear for host)
// ============================================================

function ModuleHeader({ title, admin, onOpenSettings }) {
  return (
    <div className="ww-mod-header">
      <h3 className="ww-mod-header-title">{title}</h3>
      {admin && (
        <button className="ww-icon-btn ww-icon-btn-sm" onClick={onOpenSettings} aria-label="Live Settings">
          <Settings size={14} />
        </button>
      )}
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
// Flunky module view (games)
// ============================================================

function FlunkyView({ me, flunky, members, admin, active, onPatch, onOpenSettings }) {
  const [composing, setComposing] = useState(false);

  const usersById = useMemo(() => {
    const m = {};
    for (const mem of members) if (mem.expand?.user) m[mem.expand.user.id] = mem.expand.user;
    return m;
  }, [members]);

  const games = flunky.games || [];
  const cur = currentGame(flunky);
  const finished = finishedGames(flunky);

  const myWins = finished.filter(g => teamOfInGame(me.id, g) === g.winner).length;
  const myLosses = finished.filter(g => teamOfInGame(me.id, g) && teamOfInGame(me.id, g) !== g.winner).length;

  const finishGame = (winner) => {
    if (!cur) return;
    const next = games.map(g => g.id === cur.id ? { ...g, winner, endedAt: new Date().toISOString() } : g);
    onPatch({ games: next });
  };

  const cancelCurrent = () => {
    if (!cur) return;
    if (!confirm('Spiel wirklich abbrechen?')) return;
    onPatch({ games: games.filter(g => g.id !== cur.id) });
  };

  const startGame = (teamA, teamB) => {
    const next = [...games, {
      id: String(Date.now()),
      teamA, teamB, winner: null,
      createdAt: new Date().toISOString(),
    }];
    onPatch({ games: next });
    setComposing(false);
  };

  return (
    <>
      <ModuleHeader title="🎳 Flunkyball" admin={admin} onOpenSettings={onOpenSettings} />

      <div className="ww-stats-row">
        <StatPill label="Siege" value={myWins} />
        <StatPill label="Niederl." value={myLosses} />
        <StatPill label="Pkt" value={myWins * (flunky.pointsPerWin || 0)} accent />
      </div>

      {cur && (
        <div className="ww-game-card live">
          <div className="ww-game-head"><span className="ww-game-tag live">🔴 LIVE</span></div>
          <GameView game={cur} usersById={usersById} myId={me.id} />
          {admin && active && (
            <div className="ww-game-actions">
              <button className="ww-mini-btn green" onClick={() => finishGame('A')}><Flag size={11} /> Team A gewinnt</button>
              <button className="ww-mini-btn green" onClick={() => finishGame('B')}><Flag size={11} /> Team B gewinnt</button>
              <button className="ww-mini-btn red" onClick={cancelCurrent}><X size={11} /> Abbrechen</button>
            </div>
          )}
        </div>
      )}

      {!cur && admin && active && !composing && (
        <button className="ww-big-cta green" onClick={() => setComposing(true)}>
          <Play size={20} /><span>NEUES SPIEL STARTEN</span>
        </button>
      )}

      {!cur && admin && active && composing && (
        <NewGameComposer members={members} usersById={usersById}
          onCancel={() => setComposing(false)} onStart={startGame} />
      )}

      {!cur && !admin && (
        <div className="ww-empty">Aktuell läuft kein Spiel — der Host startet eins, sobald's losgeht.</div>
      )}

      {finished.length > 0 && (
        <section className="ww-section">
          <div className="ww-section-head"><Trophy size={16} /><h3>HISTORIE</h3></div>
          <div className="ww-game-list">
            {[...finished].reverse().map((g, idx) => (
              <div key={g.id} className="ww-game-card">
                <div className="ww-game-head">
                  <span className="ww-game-tag">SPIEL {finished.length - idx}</span>
                  <span className="ww-game-result">🏆 Team {g.winner}</span>
                </div>
                <GameView game={g} usersById={usersById} myId={me.id} compact />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function GameView({ game, usersById, myId, compact }) {
  const teamA = (game.teamA || []).map(id => usersById[id]).filter(Boolean);
  const teamB = (game.teamB || []).map(id => usersById[id]).filter(Boolean);
  const myTeam = teamOfInGame(myId, game);
  const won = game.winner;
  return (
    <div className="ww-flunky-teams">
      <div className={`ww-flunky-team ${myTeam === 'A' ? 'mine' : ''} ${won === 'A' ? 'won' : (won === 'B' ? 'lost' : '')}`}>
        <div className="ww-flunky-team-head">
          <span className="ww-flunky-team-label">TEAM A</span>
          {won === 'A' && <span className="ww-flunky-score">🏆</span>}
        </div>
        <div className="ww-flunky-roster">
          {teamA.map(u => (
            <span key={u.id} className="ww-flunky-player">
              {u.emoji || '🍺'} {compact ? (u.displayName || u.email).slice(0, 10) : (u.displayName || u.email)}
            </span>
          ))}
        </div>
      </div>
      <div className="ww-flunky-vs">VS</div>
      <div className={`ww-flunky-team ${myTeam === 'B' ? 'mine' : ''} ${won === 'B' ? 'won' : (won === 'A' ? 'lost' : '')}`}>
        <div className="ww-flunky-team-head">
          <span className="ww-flunky-team-label">TEAM B</span>
          {won === 'B' && <span className="ww-flunky-score">🏆</span>}
        </div>
        <div className="ww-flunky-roster">
          {teamB.map(u => (
            <span key={u.id} className="ww-flunky-player">
              {u.emoji || '🍺'} {compact ? (u.displayName || u.email).slice(0, 10) : (u.displayName || u.email)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewGameComposer({ members, usersById, onCancel, onStart }) {
  const [mode, setMode] = useState('random'); // 'random' | 'manual'
  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);

  const shuffle = () => {
    const ids = members.map(m => m.expand?.user?.id).filter(Boolean);
    const shuffled = ids.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(p => p[1]);
    const mid = Math.ceil(shuffled.length / 2);
    setTeamA(shuffled.slice(0, mid));
    setTeamB(shuffled.slice(mid));
  };

  useEffect(() => { if (mode === 'random') shuffle(); /* eslint-disable-next-line */ }, []);

  const assign = (userId, team) => {
    setTeamA(arr => team === 'A' ? [...arr.filter(id => id !== userId), userId] : arr.filter(id => id !== userId));
    setTeamB(arr => team === 'B' ? [...arr.filter(id => id !== userId), userId] : arr.filter(id => id !== userId));
  };

  const teamOf_ = (id) => teamA.includes(id) ? 'A' : (teamB.includes(id) ? 'B' : null);

  return (
    <div className="ww-game-composer">
      <div className="ww-auth-tabs" style={{ marginBottom: 14 }}>
        <button className={`ww-auth-tab ${mode === 'random' ? 'active' : ''}`} onClick={() => setMode('random')}><Dice5 size={12} /> RANDOM</button>
        <button className={`ww-auth-tab ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}><Hand size={12} /> MANUELL</button>
      </div>

      {mode === 'random' && (
        <>
          <GameView game={{ teamA, teamB, winner: null }} usersById={usersById} myId={null} />
          <button className="ww-mini-btn" onClick={shuffle} style={{ marginTop: 10 }}>🎲 Nochmal würfeln</button>
        </>
      )}

      {mode === 'manual' && (
        <div className="ww-flunky-assign" style={{ marginTop: 10 }}>
          {members.map(m => {
            const u = m.expand?.user; if (!u) return null;
            const team = teamOf_(u.id);
            return (
              <div key={u.id} className="ww-flunky-assign-row">
                <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
                <span className="ww-user-mgmt-name">{u.displayName || u.email}</span>
                <div className="ww-flunky-assign-btns">
                  <button className={`ww-mini-btn ${team === 'A' ? 'active' : ''}`} onClick={() => assign(u.id, team === 'A' ? null : 'A')}>A</button>
                  <button className={`ww-mini-btn ${team === 'B' ? 'active' : ''}`} onClick={() => assign(u.id, team === 'B' ? null : 'B')}>B</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="ww-game-actions" style={{ marginTop: 14 }}>
        <button className="ww-big-cta green" onClick={() => onStart(teamA, teamB)} disabled={teamA.length === 0 || teamB.length === 0}>
          <Play size={18} /><span>SPIEL STARTEN</span>
        </button>
        <button className="ww-text-btn" onClick={onCancel}><X size={14} /> abbrechen</button>
      </div>
    </div>
  );
}

// ============================================================
// Live settings drawer
// ============================================================

function ModuleSettingsDrawer({ title, onClose, children }) {
  return (
    <>
      <div className="ww-drawer-backdrop" onClick={onClose} />
      <div className="ww-drawer">
        <div className="ww-drawer-head">
          <h3>{title}</h3>
          <button className="ww-icon-btn" onClick={onClose} aria-label="Schließen"><X size={16} /></button>
        </div>
        <div className="ww-drawer-body">{children}</div>
      </div>
    </>
  );
}

function DrinksLiveSettings({ event, onSave }) {
  const [beerLabel, setBeerLabel] = useState(event.beerLabel || 'Bier');
  const [drinkLabel, setDrinkLabel] = useState(event.drinkLabel || 'Mische');
  const [pb_, setPb] = useState(event.pointsPerBeer ?? 1);
  const [pm, setPm] = useState(event.pointsPerMische ?? 1);
  const save = () => onSave({
    beerLabel: beerLabel.trim(), drinkLabel: drinkLabel.trim(),
    pointsPerBeer: Number(pb_), pointsPerMische: Number(pm),
  });
  return (
    <div>
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
          <input className="ww-input" type="number" min={0} max={10} value={pb_} onChange={e => setPb(e.target.value)} />
        </div>
        <div>
          <label className="ww-label">PKT / MISCHE</label>
          <input className="ww-input" type="number" min={0} max={10} value={pm} onChange={e => setPm(e.target.value)} />
        </div>
      </div>
      <button className="ww-big-cta" onClick={save}><Check size={20} /><span>SPEICHERN</span></button>
    </div>
  );
}

function FlunkyLiveSettings({ flunky, onPatch }) {
  const [ppw, setPpw] = useState(flunky.pointsPerWin || 3);
  useEffect(() => setPpw(flunky.pointsPerWin || 3), [flunky.pointsPerWin]);
  const save = () => onPatch({ pointsPerWin: Number(ppw) });
  const clearHistory = () => {
    if (!confirm('Alle Spiele dieses Events löschen?')) return;
    onPatch({ games: [] });
  };
  return (
    <div>
      <label className="ww-label">PUNKTE PRO SIEG (pro Spieler im Sieger-Team)</label>
      <input className="ww-input" type="number" min={0} max={100} value={ppw} onChange={e => setPpw(e.target.value)} />
      <button className="ww-big-cta" onClick={save}><Check size={20} /><span>SPEICHERN</span></button>
      <button className="ww-danger-btn red" onClick={clearHistory} style={{ marginTop: 8 }}>
        <Trash2 size={14} /> Historie & laufendes Spiel löschen
      </button>
    </div>
  );
}

// ============================================================
// Crew
// ============================================================

function CrewView({ members, statsMap, event, flunky, myId, onShowUserDetail }) {
  return (
    <div className="ww-crew">
      <div className="ww-section-head"><Users size={16} /><h3>DIE CREW ({members.length})</h3></div>
      <div className="ww-crew-list">
        {members.map(m => {
          const u = m.expand?.user; if (!u) return null;
          const s = statsMap[u.id] || { beer: 0, mische: 0 };
          const points = computeTotalPoints(u.id, s, event, flunky);
          return (
            <div key={u.id} className={`ww-crew-card ${u.id === myId ? 'me' : ''}`}>
              <button className="ww-crew-head clickable" onClick={() => onShowUserDetail?.(u.id)}>
                <div className="ww-crew-emoji">{u.emoji || '🍺'}</div>
                <div className="ww-crew-name">{u.displayName || u.email}{u.id === myId && <span className="ww-you">DU</span>}</div>
                <div className="ww-crew-pts">{points} pkt</div>
              </button>
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
// User detail drawer (point breakdown)
// ============================================================

function UserDetailDrawer({ user, stats, event, flunky, isMe, onClose }) {
  if (!user) return null;
  const s = stats || { beer: 0, mische: 0 };
  const beerPts = (s.beer || 0) * (event.pointsPerBeer ?? 1);
  const mischePts = (s.mische || 0) * (event.pointsPerMische ?? 1);
  const drinkPts = beerPts + mischePts;

  const ppw = flunky?.pointsPerWin || 0;
  const allFinished = finishedGames(flunky);
  const playedGames = allFinished.filter(g => teamOfInGame(user.id, g) !== null);
  const wonGames = playedGames.filter(g => teamOfInGame(user.id, g) === g.winner);
  const lostGames = playedGames.filter(g => teamOfInGame(user.id, g) !== g.winner);
  const flunkyPts = wonGames.length * ppw;

  const total = drinkPts + flunkyPts;

  return (
    <ModuleSettingsDrawer
      title={`${user.emoji || '🍺'} ${user.displayName || user.email}${isMe ? ' (DU)' : ''}`}
      onClose={onClose}
    >
      <div className="ww-detail">
        <div className="ww-detail-total">
          <div className="ww-detail-total-label">PUNKTE GESAMT</div>
          <div className="ww-detail-total-val">{total}</div>
        </div>

        <div className="ww-detail-section">
          <div className="ww-detail-section-head">🍺 BIER & MISCHE</div>
          <DetailRow label={`${event.beerLabel || 'Bier'} × ${event.pointsPerBeer ?? 1} pkt`} count={s.beer || 0} pts={beerPts} />
          <DetailRow label={`${event.drinkLabel || 'Mische'} × ${event.pointsPerMische ?? 1} pkt`} count={s.mische || 0} pts={mischePts} />
          <DetailRow label="Summe" pts={drinkPts} bold />
        </div>

        {flunky && (
          <div className="ww-detail-section">
            <div className="ww-detail-section-head">🎳 FLUNKYBALL</div>
            {playedGames.length === 0 ? (
              <div className="ww-muted" style={{ fontSize: 12, padding: '8px 0' }}>Noch in keinem Spiel.</div>
            ) : (
              <>
                <DetailRow label={`Siege × ${ppw} pkt`} count={wonGames.length} pts={flunkyPts} />
                <DetailRow label="Niederlagen" count={lostGames.length} pts={0} />
                <DetailRow label="Summe" pts={flunkyPts} bold />
              </>
            )}
          </div>
        )}

        {(user.foodWishes || user.drinkWishes || user.allergies) && (
          <div className="ww-detail-section">
            <div className="ww-detail-section-head">📝 WÜNSCHE</div>
            {user.foodWishes && <div className="ww-detail-wish"><b>Essen:</b> {user.foodWishes}</div>}
            {user.drinkWishes && <div className="ww-detail-wish"><b>Trinken:</b> {user.drinkWishes}</div>}
            {user.allergies && <div className="ww-detail-wish warn"><b>⚠ Allergie:</b> {user.allergies}</div>}
          </div>
        )}
      </div>
    </ModuleSettingsDrawer>
  );
}

function DetailRow({ label, count, pts, bold }) {
  return (
    <div className={`ww-detail-row ${bold ? 'bold' : ''}`}>
      <span className="ww-detail-label">{label}</span>
      {count != null && <span className="ww-detail-count">×{count}</span>}
      <span className="ww-detail-pts">{pts} pkt</span>
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
// Event Settings (host) — slim, module configs live in module drawers
// ============================================================

function EventSettingsView({ event, me, members, onSave, onToggleActive, onToggleModule, onResetCounters, onDeleteEvent, onKickMember }) {
  const [name, setName] = useState(event.name || '');
  const [date, setDate] = useState(event.date || '');
  const copyCode = () => navigator.clipboard?.writeText?.(event.code);

  return (
    <div className="ww-form-wrap">
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
      <button className="ww-big-cta" onClick={() => onSave({ name: name.trim(), date })}>
        <Check size={20} /><span>SPEICHERN</span>
      </button>

      <label className="ww-label" style={{ marginTop: 14 }}>MODULE — LIVE TOGGLE</label>
      <p className="ww-muted" style={{ fontSize: 12, marginTop: -4 }}>Tabs verschwinden bei den Spielern, wenn du ein Modul deaktivierst.</p>
      <div className="ww-module-toggles">
        {MODULES.map(m => {
          const on = (event.modules || []).includes(m.id);
          return (
            <button key={m.id}
              className={`ww-module-toggle ${on ? 'on' : ''} ${m.available ? '' : 'disabled'}`}
              onClick={() => m.available && onToggleModule(m.id)}
              disabled={!m.available}>
              <span className="ww-mod-icon">{m.icon}</span>
              <span className="ww-mod-name">{m.name}</span>
              {m.available
                ? (on ? <Eye size={14} /> : <EyeOff size={14} />)
                : <span className="ww-mod-soon">SOON</span>}
            </button>
          );
        })}
      </div>

      <div className="ww-section">
        <div className="ww-section-head"><Users size={16} /><h3>MITGLIEDER ({members.length})</h3></div>
        <p className="ww-muted" style={{ fontSize: 12, marginTop: -4 }}>
          Wer ist in diesem Event drin. Entfernen wirft den User nur aus diesem Event.
        </p>
        <div className="ww-user-mgmt">
          {members.map(m => {
            const u = m.expand?.user; if (!u) return null;
            const isMe = u.id === me.id;
            return (
              <div key={m.id} className="ww-user-mgmt-row">
                <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
                <span className="ww-user-mgmt-name">
                  {u.displayName || u.email}{isMe && <span className="ww-you">DU</span>}
                  {u.role === 'admin' && <span className="ww-admin-badge"><ShieldCheck size={9} /> ADMIN</span>}
                  {u.role === 'host' && <span className="ww-host-badge"><Shield size={9} /> HOST</span>}
                </span>
                {!isMe && (
                  <button className="ww-mini-btn red" onClick={() => onKickMember(m.id)} title="Aus Event entfernen">
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
      {onBack && <button className="ww-big-cta" onClick={onBack}><ArrowLeft size={20} /><span>ZURÜCK</span></button>}
    </div>
  );
}

// ============================================================
// Bottom nav / toast / helpers
// ============================================================

function BottomNav({ view, setView }) {
  const items = [
    { k: 'home', icon: <Home size={20} />, label: 'Home' },
    { k: 'crew', icon: <Users size={20} />, label: 'Crew' },
    { k: 'profile', icon: <UserIcon size={20} />, label: 'Profil' },
  ];
  return (
    <nav className="ww-bottomnav">
      {items.map(it => (
        <button key={it.k} className={`ww-nav-btn ${view === it.k ? 'active' : ''}`} onClick={() => setView(it.k)}>
          {it.icon}<span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Toast({ toast }) { return <div className="ww-toast" key={toast.id}>{toast.msg}</div>; }

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  } catch { return iso; }
}

function GrainOverlay() { return <div className="ww-grain" aria-hidden="true" />; }
