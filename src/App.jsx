import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Beer, Wine, Trophy, Users, Settings, Plus, Minus, Check, X,
  RotateCcw, Home, User as UserIcon, Utensils,
  ArrowLeft, LogOut, AlertTriangle, ShieldCheck,
  Mail, Lock, UserPlus, Shield, KeyRound, Copy, Play, Pause,
  Hourglass, Eye, EyeOff, Dice5, Hand, Trash2, Flag, Crown,
  ChevronRight,
} from 'lucide-react';
import {
  pb, isSiteAdmin, isHost, isEventAdmin, isEventCreator, isEventHost,
  login, register, logout,
  listAllEvents, getEvent, createEvent, updateEvent, deleteEvent,
  listMyMemberships, listEventMembers, joinByCode, leaveEvent, kickMember,
  loadEventStats, setMyCount, resetEventStats,
  updateMyProfile, setUserRole, deleteUser, loadAllUsers,
  getFlunky, updateFlunky,
  getJeopardy, updateJeopardy, ensureJeopardy, generateJeopardyBoard,
  listCustomModules, createCustomModule, updateCustomModule, deleteCustomModule,
  subscribeEvent, subscribeMyMemberships,
} from './api.js';
import { MODULES, moduleById } from './modules.js';
import './App.css';

const EMOJI_AVATARS = ['🦁','🐻','🐺','🦊','🐯','🦅','🦍','🐂','🐉','🦈','⚔️','🔥','💪','🍺','🎸','🏍️','⚡','💀','🍻','🐗','🐲','🥃','🎯','🤘'];

// Pickable icons for custom competition modules. Bias toward sport / game / bar themes.
const MODULE_ICONS = ['🎯','🎳','🎱','🏓','🏐','🏀','⚽','🎾','🏈','🥏','🥅','🏑','🏏','🏌️','🎮','🎲','🃏','🧠','🚣','🧗','🏇','🏎️','🛹','🚴','🏹','🪁','🥊','🥋','🍻','🍺','🥃','🔥'];

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

const customGameWins = (userId, mode, sets, teams) => {
  let n = 0;
  if (mode === 'teams') {
    for (const s of sets || []) {
      if (!s.winner) continue;
      const t = (teams || []).find(x => x.id === s.winner);
      if (t && Array.isArray(t.members) && t.members.includes(userId)) n++;
    }
  } else {
    for (const s of sets || []) {
      if (s.winner === userId) n++;
    }
  }
  return n;
};

const computeCustomPoints = (userId, customModules) => {
  if (!customModules?.length) return 0;
  let total = 0;
  for (const cm of customModules) {
    const ppw = cm.pointsPerWin || 0;
    total += customGameWins(userId, cm.mode, cm.sets, cm.teams) * ppw;
    for (const g of cm.games || []) {
      total += customGameWins(userId, g.mode || cm.mode, g.sets, g.teams) * ppw;
    }
  }
  return total;
};

// Levels are stored as 1..5 (matches the generator prompt). Points displayed
// and scored are level × 100, so the board reads 100, 200, 300, 400, 500.
const levelPoints = (level) => {
  const n = Number(level) || 0;
  return n >= 10 ? n : n * 100;
};

const jeopardyRoundScores = (round) => {
  const map = {};
  for (const q of round?.questions || []) {
    const pts = levelPoints(q.level);
    if (q.winnerUserId) {
      map[q.winnerUserId] = (map[q.winnerUserId] || 0) + pts;
    }
    // Every user who tried and didn't end up winning loses half the
    // question's points. Penalty applies whether the question was
    // eventually won by someone else or abandoned with "Niemand".
    const penalty = Math.floor(pts / 2);
    for (const u of q.triedUsers || []) {
      if (!u || u === q.winnerUserId) continue;
      map[u] = (map[u] || 0) - penalty;
    }
  }
  return map;
};

const computeJeopardyPoints = (userId, jeopardy) => {
  if (!jeopardy) return 0;
  const positionPts = Array.isArray(jeopardy.pointsPerPosition) ? jeopardy.pointsPerPosition : [];
  let total = 0;
  for (const r of jeopardy.rounds || []) {
    if (!r.finishedAt) continue;
    const scores = jeopardyRoundScores(r);
    const ranking = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const idx = ranking.findIndex(([uid]) => uid === userId);
    if (idx >= 0 && idx < positionPts.length) total += positionPts[idx] || 0;
  }
  return total;
};

const computeTotalPoints = (userId, s, ev, flunky, customModules, jeopardy) =>
  computeDrinkPoints(s, ev)
  + computeFlunkyPoints(userId, flunky)
  + computeCustomPoints(userId, customModules)
  + computeJeopardyPoints(userId, jeopardy);

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
  const [jeopardy, setJeopardy] = useState(null);
  const jeopardyRef = useRef(null);
  useEffect(() => { jeopardyRef.current = jeopardy; }, [jeopardy]);
  const [customModules, setCustomModules] = useState([]);
  // Tracks the latest optimistic values for my own drink stats so realtime
  // echoes (PB broadcasts our own writes back) don't cause flicker. Updated
  // by DrinksBar on every bump; cleared on event switch.
  const myOptRef = useRef({ beer: 0, mische: 0 });
  const [allEvents, setAllEvents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [view, setView] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // Refresh own auth record from server on boot so role changes made while
  // we were offline (e.g., admin promoted us to host) are picked up.
  useEffect(() => {
    if (pb.authStore.isValid) {
      pb.collection('users').authRefresh().catch(() => {
        // token invalid / user deleted → clear so user re-logs
        pb.authStore.clear();
      });
    }
  }, []);

  // Live subscription on own user record. When admin changes our role,
  // pull a fresh auth record so the UI flips to host/admin mode immediately.
  useEffect(() => {
    if (!me?.id) return;
    let unsub;
    pb.collection('users').subscribe(me.id, () => {
      pb.collection('users').authRefresh().catch(() => {});
    }).then(fn => { unsub = fn; }).catch(() => {});
    return () => { if (unsub) unsub(); };
  }, [me?.id]);

  const refreshMemberships = useCallback(async () => {
    if (!pb.authStore.isValid) { setMyMemberships([]); return; }
    try { setMyMemberships(await listMyMemberships()); }
    catch (e) { console.warn('refreshMemberships', e); }
  }, []);

  const refreshCurrentEvent = useCallback(async () => {
    if (!currentEventId) {
      setCurrentEvent(null); setEventMembers([]); setStatsMap({}); setFlunky(null); setJeopardy(null); setCustomModules([]);
      return;
    }
    try {
      const [ev, members, stats, fl, je, cms] = await Promise.all([
        getEvent(currentEventId),
        listEventMembers(currentEventId),
        loadEventStats(currentEventId),
        getFlunky(currentEventId),
        getJeopardy(currentEventId),
        listCustomModules(currentEventId),
      ]);
      setCurrentEvent(ev); setEventMembers(members); setStatsMap(stats);
      setFlunky(fl); setJeopardy(je); setCustomModules(cms);
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

    if (collection === 'jeopardy') {
      setJeopardy(prev => {
        const next = prev ? { ...prev, ...rec } : rec;
        jeopardyRef.current = next;
        return next;
      });
      return;
    }

    if (collection === 'custom_modules') {
      setCustomModules(prev => {
        if (ev.action === 'delete') return prev.filter(c => c.id !== rec.id);
        const idx = prev.findIndex(c => c.id === rec.id);
        if (idx === -1) return [...prev, rec];
        const copy = [...prev]; copy[idx] = { ...copy[idx], ...rec }; return copy;
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

  // Reset module tab if currently active static module gets disabled.
  // Custom modules (cm-*) aren't in event.modules, they live in their own
  // collection — leave them alone.
  useEffect(() => {
    if (!currentEvent) return;
    const mods = currentEvent.modules || [];
    if (moduleTab === 'overview' || moduleTab.startsWith('cm-')) return;
    if (!mods.includes(moduleTab)) setModuleTab('overview');
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
    const { customModules: drafts = [], ...rest } = data;
    const ev = await createEvent(rest);
    // Best-effort: create the queued custom modules right after the event exists.
    for (const d of drafts) {
      try {
        await createCustomModule({
          name: d.name?.trim() || 'Modul',
          icon: d.icon || '🎯',
          mode: d.mode || 'teams',
          teamCount: d.teamCount || 2,
          pointsPerWin: d.pointsPerWin ?? 3,
          totalSets: d.totalSets || 3,
          teams: [], participants: [], sets: [],
          event: ev.id,
        });
      } catch (e) { console.warn('custom module draft failed', e); }
    }
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
    if (!confirm('Alle Counter und Modul-Spiele dieses Events zurücksetzen?')) return;
    try {
      await resetEventStats(currentEvent.id);
      // Optimistic stats wipe so the UI updates before realtime echo arrives.
      setStatsMap(prev => {
        const next = {};
        for (const k of Object.keys(prev)) next[k] = { ...prev[k], beer: 0, mische: 0 };
        return next;
      });
      myOptRef.current = { beer: 0, mische: 0 };

      const flunkyCur = flunkyRef.current;
      if (flunkyCur?.id && (flunkyCur.games?.length || 0) > 0) {
        const nextF = { ...flunkyCur, games: [] };
        flunkyRef.current = nextF; setFlunky(nextF);
        await updateFlunky(flunkyCur.id, { games: [] });
      }

      const mods = customModules || [];
      if (mods.length) {
        setCustomModules(prev => prev.map(c => ({ ...c, sets: [] })));
        await Promise.all(mods.map(cm => updateCustomModule(cm.id, { sets: [] })));
      }

      showToast('Counter & Spiele zurückgesetzt 🔄');
    } catch (e) {
      console.warn('reset', e);
      showToast('Reset fehlgeschlagen 😬');
      refreshCurrentEvent();
    }
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

  const onJeopardyPatch = async (patch) => {
    let cur = jeopardyRef.current;
    if (!cur) {
      // Lazy seed for events created before the migration backfill ran
      cur = await ensureJeopardy(currentEventId);
      jeopardyRef.current = cur; setJeopardy(cur);
    }
    const nextJ = { ...cur, ...patch };
    jeopardyRef.current = nextJ; setJeopardy(nextJ);
    try { await updateJeopardy(cur.id, patch); }
    catch (e) { console.warn('jeopardy update', e); showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  const onJeopardyGenerate = async (categories) => {
    try {
      const board = await generateJeopardyBoard(currentEventId, categories);
      // Random pick order for this round so players take turns tapping tiles
      const parts = [...(jeopardyRef.current?.participants || [])];
      const shuffled = parts.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
      const round = {
        id: String(Date.now()),
        startedAt: new Date().toISOString(),
        finishedAt: null,
        categories,
        pickerOrder: shuffled,
        pickerIdx: 0,
        questions: (board.questions || []).map(q => ({
          category: q.category, level: Number(q.level) || 1,
          q: String(q.q || ''), a: String(q.a || ''),
          winnerUserId: null, revealed: false,
        })),
      };
      const rounds = [...(jeopardyRef.current?.rounds || []), round];
      await onJeopardyPatch({ rounds, categories });
      // Close the settings drawer so the host lands directly on the board.
      setModuleSettingsOpen(null);
      showToast('Neue Runde mit frischen Fragen 🎤');
    } catch (e) {
      showToast(`Frage-Gen Fehler: ${e?.message?.slice?.(0, 80) || e}`);
    }
  };

  // ---- Custom modules ----
  const onCustomCreate = async (data) => {
    try {
      await createCustomModule({ ...data, event: currentEventId });
      showToast('Modul erstellt 🎯');
    } catch (e) {
      showToast(`Fehler: ${e?.status || ''} ${e?.message || ''}`);
    }
  };

  const onCustomPatch = async (id, patch) => {
    // optimistic
    setCustomModules(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    try { await updateCustomModule(id, patch); }
    catch (e) { showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  const onCustomDelete = async (id) => {
    if (!confirm('Modul wirklich löschen?')) return;
    try {
      await deleteCustomModule(id);
      setCustomModules(prev => prev.filter(c => c.id !== id));
      showToast('Modul gelöscht');
    } catch (e) { showToast('Fehler 😬'); }
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
          onSaveProfile={onSaveProfile}
          onRefreshAll={refreshAllEvents}
          onDeleteEvent={async (id) => {
            if (!confirm('Event wirklich löschen?')) return;
            await deleteEvent(id); await refreshAllEvents(); showToast('Event gelöscht');
          }}
          onToggleActiveAdmin={async (id, next) => {
            await updateEvent(id, { active: next }); await refreshAllEvents();
          }}
          onSetUserRole={async (id, role) => {
            // Optimistic: update the row immediately so the picker reflects the click
            setAllUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
            try {
              await setUserRole(id, role);
              showToast(`Rolle: ${role.toUpperCase()}`);
              await refreshAllUsers();
            } catch (e) {
              const detail = e?.response?.data
                ? Object.entries(e.response.data).map(([k, v]) => `${k}: ${v.message}`).join(' / ')
                : (e?.response?.message || e?.message || 'unbekannt');
              showToast(`Fehler: ${e?.status || ''} ${detail}`);
              await refreshAllUsers();
            }
          }}
          onDeleteUser={async (id) => {
            if (!confirm('User wirklich löschen? Gilt global, alle Events.')) return;
            try {
              await deleteUser(id);
              showToast('User gelöscht');
              await refreshAllUsers();
            } catch (e) {
              showToast(`Fehler: ${e?.status || ''} ${e?.message || ''}`);
              await refreshAllUsers();
            }
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
          settingsActive={settingsOpen}
          onToggleSettings={() => setSettingsOpen(v => !v)}
          onSwitchEvent={() => setCurrentEventId(null)} />
        <main className="ww-main">
          <WaitingScreen event={currentEvent} onLeave={onLeaveEvent} />
        </main>
        {settingsOpen && (
          <ModuleSettingsDrawer title="⚙️ Event-Settings" onClose={() => setSettingsOpen(false)}>
            <NotAllowed onBack={() => setSettingsOpen(false)} />
          </ModuleSettingsDrawer>
        )}
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  return (
    <div className="ww-app">
      <GrainOverlay />
      <TopBar
        me={me} admin={admin} eventName={currentEvent.name} active={currentEvent.active}
        settingsActive={settingsOpen}
        onToggleSettings={() => setSettingsOpen(v => !v)}
        onSwitchEvent={() => setCurrentEventId(null)}
      />
      <main className="ww-main">
        {view === 'home' && (
          <HomeView
            me={me} admin={admin} event={currentEvent}
            members={eventMembers} statsMap={statsMap} setStatsMap={setStatsMap}
            flunky={flunky} onFlunkyPatch={onFlunkyPatch}
            jeopardy={jeopardy} onJeopardyPatch={onJeopardyPatch} onJeopardyGenerate={onJeopardyGenerate}
            customModules={customModules}
            onCustomCreate={onCustomCreate}
            onCustomPatch={onCustomPatch}
            onCustomDelete={onCustomDelete}
            modules={modules}
            moduleTab={moduleTab} setModuleTab={setModuleTab}
            moduleSettingsOpen={moduleSettingsOpen} setModuleSettingsOpen={setModuleSettingsOpen}
            onSaveEvent={onSaveEvent}
            onShowUserDetail={setDetailUserId}
            myOptRef={myOptRef}
          />
        )}
        {view === 'crew' && (
          <CrewView members={eventMembers} statsMap={statsMap} event={currentEvent} flunky={flunky} jeopardy={jeopardy} customModules={customModules} myId={me.id} onShowUserDetail={setDetailUserId} />
        )}
        {view === 'profile' && (
          <ProfileView me={me} onSave={onSaveProfile} onLogout={onLogout} />
        )}
      </main>
      <BottomNav view={view} setView={setView} />
      {settingsOpen && (
        <ModuleSettingsDrawer title="⚙️ Event-Settings" onClose={() => setSettingsOpen(false)}>
          {admin
            ? <EventSettingsView
                event={currentEvent} me={me} members={eventMembers}
                customModules={customModules}
                onCustomCreate={onCustomCreate}
                onCustomDelete={onCustomDelete}
                onSave={onSaveEvent} onToggleActive={onToggleActive}
                onToggleModule={onToggleModule}
                onResetCounters={onResetCounters}
                onDeleteEvent={async () => {
                  if (!confirm('Event endgültig löschen?')) return;
                  await deleteEvent(currentEvent.id);
                  setCurrentEventId(null);
                  await refreshMemberships();
                  showToast('Event gelöscht');
                  setSettingsOpen(false);
                }}
                onKickMember={async (memberId) => {
                  if (!confirm('User wirklich aus diesem Event entfernen?')) return;
                  try { await kickMember(memberId); showToast('Aus Event entfernt'); }
                  catch (e) { showToast('Konnte nicht entfernen 😬'); }
                }}
                onToggleEventHost={async (userId, makeHost) => {
                  const cur = Array.isArray(currentEvent.hostUsers) ? currentEvent.hostUsers : [];
                  const next = makeHost
                    ? [...new Set([...cur, userId])]
                    : cur.filter(id => id !== userId);
                  const nextEv = { ...currentEvent, hostUsers: next };
                  eventRef.current = nextEv; setCurrentEvent(nextEv);
                  try {
                    await updateEvent(currentEvent.id, { hostUsers: next });
                    showToast(makeHost ? 'Zum Event-Host gemacht 👑' : 'Event-Host-Rolle entzogen');
                  } catch (e) {
                    showToast(`Fehler: ${e?.status || ''} ${e?.message || ''}`);
                    refreshCurrentEvent();
                  }
                }}
              />
            : <NotAllowed onBack={() => setSettingsOpen(false)} />
          }
        </ModuleSettingsDrawer>
      )}
      {detailUserId && (
        <UserDetailDrawer
          user={(eventMembers.find(m => m.expand?.user?.id === detailUserId) || {}).expand?.user}
          stats={statsMap[detailUserId]}
          event={currentEvent}
          flunky={flunky}
          jeopardy={jeopardy}
          customModules={customModules}
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
      <div className="ww-auth-fixed">
        <div className="ww-auth-header">
          <div className="ww-tag">BOIZ</div>
          <h1 className="ww-display ww-title-huge">Weekend Manager</h1>
          <p className="ww-muted">Logg dich ein oder mach einen Account.</p>
        </div>
        <div className="ww-auth-tabs">
          <button className={`ww-auth-tab ${view === 'login' ? 'active' : ''}`} onClick={() => setView('login')}>LOGIN</button>
          <button className={`ww-auth-tab ${view === 'register' ? 'active' : ''}`} onClick={() => setView('register')}>NEU HIER</button>
        </div>
      </div>
      <div className="ww-auth-scroll">
        {view === 'login' ? <LoginForm onSubmit={onLogin} /> : <RegisterForm onSubmit={onRegister} />}
      </div>
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
  onLogout, onSaveProfile, onDeleteEvent, onToggleActiveAdmin, onSetUserRole, onDeleteUser,
}) {
  const [section, setSection] = useState('events');
  const siteAdmin = isSiteAdmin(me);
  const canCreate = isHost(me);
  return (
    <div className="ww-auth ww-auth--with-nav">
      {section === 'events' && (
        <div className="ww-auth-fixed">
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
        </div>
      )}
      <div className="ww-auth-scroll">
        {section === 'events' && (
          <>
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
          </>
        )}
        {section === 'profile' && <ProfileView me={me} onSave={onSaveProfile} onLogout={onLogout} />}
      </div>
      <LobbyNav section={section} setSection={setSection} onLogout={onLogout} />
    </div>
  );
}

function LobbyNav({ section, setSection, onLogout }) {
  return (
    <nav className="ww-bottomnav">
      <button className={`ww-nav-btn ${section === 'events' ? 'active' : ''}`} onClick={() => setSection('events')}>
        <Home size={20} /><span>Events</span>
      </button>
      <button className={`ww-nav-btn ${section === 'profile' ? 'active' : ''}`} onClick={() => setSection('profile')}>
        <UserIcon size={20} /><span>Profil</span>
      </button>
      <button className="ww-nav-btn ww-nav-btn-danger" onClick={onLogout}>
        <LogOut size={20} /><span>Logout</span>
      </button>
    </nav>
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
  const [customModulesDraft, setCustomModulesDraft] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const valid = name.trim().length >= 2;
  const toggle = (id) => setModules(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const addCustomDraft = () => {
    const n = prompt('Name des Moduls?', 'Cornhole');
    if (!n || !n.trim()) return;
    const modeInput = (prompt('Modus? "teams" oder "solo"', 'teams') || 'teams').toLowerCase();
    const mode = modeInput === 'solo' ? 'solo' : 'teams';
    setCustomModulesDraft(arr => [...arr, {
      name: n.trim(), icon: '🎯', mode,
      teamCount: 2, pointsPerWin: 3, totalSets: 3,
    }]);
  };
  const removeCustomDraft = (i) => setCustomModulesDraft(arr => arr.filter((_, j) => j !== i));

  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr('');
    try { await onSubmit({ name: name.trim(), date, modules, customModules: customModulesDraft }); }
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
        {customModulesDraft.map((cm, i) => (
          <button key={`d-${i}`} className="ww-mod-card sel" onClick={() => removeCustomDraft(i)} title="Entfernen">
            <div className="ww-mod-icon">{cm.icon}</div>
            <div className="ww-mod-name">{cm.name}</div>
            <div className="ww-mod-soon">{cm.mode.toUpperCase()} · ×</div>
          </button>
        ))}
        <button className="ww-mod-card ww-mod-card-add" onClick={addCustomDraft} title="Custom Modul hinzufügen">
          <Plus size={22} />
          <div className="ww-mod-name">CUSTOM</div>
        </button>
      </div>
      <p className="ww-muted" style={{ fontSize: 11, marginTop: 6 }}>
        Custom-Module sind Competitions wie Cornhole, Tischtennis usw. Teams oder Solo-Modus, Punkte und Sätze einstellbar — die genaue Konfiguration machst du nach dem Erstellen im Event.
      </p>
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
  jeopardy, onJeopardyPatch, onJeopardyGenerate,
  customModules, onCustomCreate, onCustomPatch, onCustomDelete,
  modules, moduleTab, setModuleTab, moduleSettingsOpen, setModuleSettingsOpen,
  onSaveEvent, onShowUserDetail, myOptRef,
}) {
  // 'drinks' is no longer a tab; it lives as the always-visible sticky bar.
  const enabledTabModules = MODULES.filter(m => modules.includes(m.id) && m.available && m.id !== 'drinks');
  const customTabs = (customModules || []).map(cm => ({ id: `cm-${cm.id}`, name: cm.name || 'Modul', icon: cm.icon || '🎯', cm }));
  const tabs = [{ id: 'overview', name: 'Stand', icon: '📊' }, ...enabledTabModules, ...customTabs];
  const drinksOn = modules.includes('drinks');
  const activeCustom = moduleTab?.startsWith?.('cm-')
    ? customModules.find(c => `cm-${c.id}` === moduleTab)
    : null;

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
        <OverviewView me={me} event={event} members={members} statsMap={statsMap} flunky={flunky} jeopardy={jeopardy} customModules={customModules} onShowUserDetail={onShowUserDetail} />
      )}
      {moduleTab === 'flunky' && flunky && (
        <FlunkyView
          me={me} flunky={flunky} members={members} admin={admin} active={event.active}
          onPatch={onFlunkyPatch}
          onOpenSettings={() => setModuleSettingsOpen('flunky')}
        />
      )}
      {moduleTab === 'jeopardy' && (
        <JeopardyView
          me={me} jeopardy={jeopardy} members={members} admin={admin} active={event.active}
          onPatch={onJeopardyPatch}
          onOpenSettings={() => setModuleSettingsOpen('jeopardy')}
        />
      )}
      {activeCustom && (
        <CustomModuleView
          me={me} mod={activeCustom} members={members} admin={admin} active={event.active}
          onPatch={(patch) => onCustomPatch(activeCustom.id, patch)}
          onOpenSettings={() => setModuleSettingsOpen(moduleTab)}
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
      {moduleSettingsOpen === 'jeopardy' && admin && (
        <ModuleSettingsDrawer title="🎤 Jeopardy — Live Settings" onClose={() => setModuleSettingsOpen(null)}>
          <JeopardyLiveSettings
            jeopardy={jeopardy} members={members}
            onPatch={onJeopardyPatch} onGenerate={onJeopardyGenerate}
          />
        </ModuleSettingsDrawer>
      )}
      {moduleSettingsOpen?.startsWith?.('cm-') && admin && (() => {
        const cm = customModules.find(c => `cm-${c.id}` === moduleSettingsOpen);
        if (!cm) return null;
        return (
          <ModuleSettingsDrawer
            title={`${cm.icon || '🎯'} ${cm.name} — Live Settings`}
            onClose={() => setModuleSettingsOpen(null)}
          >
            <CustomModuleSettings
              mod={cm} members={members}
              onPatch={(patch) => onCustomPatch(cm.id, patch)}
              onDelete={() => {
                onCustomDelete(cm.id);
                setModuleSettingsOpen(null);
                setModuleTab('overview');
              }}
            />
          </ModuleSettingsDrawer>
        );
      })()}
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

function OverviewView({ me, event, members, statsMap, flunky, jeopardy, customModules, onShowUserDetail }) {
  const leaderboard = useMemo(() => members
    .map(m => {
      const u = m.expand?.user; if (!u) return null;
      const s = statsMap[u.id] || { beer: 0, mische: 0 };
      return { ...u, beer: s.beer, mische: s.mische, points: computeTotalPoints(u.id, s, event, flunky, customModules, jeopardy) };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points),
    [members, statsMap, event, flunky, customModules, jeopardy]);

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

  const deleteGame = (gameId) => {
    if (!confirm('Dieses Spiel wirklich löschen?')) return;
    onPatch({ games: games.filter(g => g.id !== gameId) });
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
                  <div className="ww-game-head-right">
                    <span className="ww-game-result">🏆 Team {g.winner}</span>
                    {admin && (
                      <button
                        className="ww-icon-del"
                        onClick={() => deleteGame(g.id)}
                        title="Spiel löschen"
                        aria-label="Spiel löschen"
                      ><X size={11} /></button>
                    )}
                  </div>
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
// Jeopardy module
// ============================================================

function JeopardyView({ me, jeopardy, members, admin, active, onPatch, onOpenSettings }) {
  const [openQuestion, setOpenQuestion] = useState(null); // { ri, qi } — used when hostPlays=false (local-only)

  const usersById = useMemo(() => {
    const m = {};
    for (const mem of members) if (mem.expand?.user) m[mem.expand.user.id] = mem.expand.user;
    return m;
  }, [members]);

  const rounds = jeopardy?.rounds || [];
  const currentRoundIdx = rounds.length === 0 ? -1 : rounds.length - 1;
  const currentRound = currentRoundIdx >= 0 ? rounds[currentRoundIdx] : null;
  const participants = (jeopardy?.participants || []).map(uid => usersById[uid]).filter(Boolean);
  const positionPts = jeopardy?.pointsPerPosition || [];
  const hostPlays = !!jeopardy?.hostPlays;

  // When hostPlays is ON, the "active question" is data-driven: any question
  // flagged `opened` and not yet won is shown on EVERYONE's screen via realtime.
  const sharedActive = useMemo(() => {
    if (!hostPlays || !currentRound) return null;
    for (let qi = 0; qi < currentRound.questions.length; qi++) {
      const q = currentRound.questions[qi];
      if (q.opened && !q.winnerUserId) return { ri: currentRoundIdx, qi };
    }
    return null;
  }, [hostPlays, currentRound, currentRoundIdx]);

  // Effective drawer source
  const activeOpen = hostPlays ? sharedActive : openQuestion;

  const categories = currentRound?.categories || jeopardy?.categories || [];

  const scoresByUser = useMemo(() => currentRound ? jeopardyRoundScores(currentRound) : {}, [currentRound]);
  const ranking = useMemo(() => Object.entries(scoresByUser).sort((a, b) => b[1] - a[1]), [scoresByUser]);

  const myRoundScore = scoresByUser[me.id] || 0;
  const totalEventPts = computeJeopardyPoints(me.id, jeopardy);

  if (!jeopardy) {
    return (
      <>
        <ModuleHeader title="🎤 Jeopardy" admin={admin} onOpenSettings={onOpenSettings} />
        <div className="ww-empty">Host muss erst eine Runde starten (Zahnrad oben rechts).</div>
      </>
    );
  }

  const setQuestionWinner = (ri, qi, winnerUserId) => {
    if (!admin || !active) return;
    const next = rounds.map((r, i) => {
      if (i !== ri) return r;
      const qs = r.questions.map((q, j) => j === qi ? { ...q, winnerUserId, revealed: true, opened: false } : q);
      return { ...r, questions: qs };
    });
    onPatch({ rounds: next });
  };

  // Resolved helpers preserve triedUsers so penalties stick after right/close.

  // --- hostPlays helpers ---
  // Patches one question. `advanceTurn=true` also rotates pickerIdx by 1 so
  // the next player gets to pick a tile.
  const resolveQuestion = (ri, qi, qPatch, advanceTurn) => {
    const next = rounds.map((r, i) => {
      if (i !== ri) return r;
      const qs = r.questions.map((q, j) => j === qi ? { ...q, ...qPatch } : q);
      let pickerIdx = r.pickerIdx || 0;
      const len = (r.pickerOrder || []).length;
      if (advanceTurn && len > 0) pickerIdx = (pickerIdx + 1) % len;
      return { ...r, questions: qs, pickerIdx };
    });
    onPatch({ rounds: next });
  };

  const openTileShared = (ri, qi, dranUserId) => {
    if (!active) return;
    // The picker (whoever tapped the tile) auto-becomes the first dran.
    resolveQuestion(ri, qi, { opened: true, currentlyAnswering: dranUserId || null, triedUsers: [] }, false);
  };
  const setDran = (ri, qi, userId) => resolveQuestion(ri, qi, { currentlyAnswering: userId }, false);
  // markRight does NOT clear triedUsers — those users tried wrong and keep
  // their −half penalty in the round scoring.
  const markRight = (ri, qi, who) => resolveQuestion(ri, qi, { winnerUserId: who, revealed: true, opened: false, currentlyAnswering: null }, true);
  // FALSCH: log the dran-person as tried, clear current; step 1 reappears
  // with that user excluded from the next-dran picker list.
  const markWrong = (ri, qi) => {
    const q = rounds[ri]?.questions?.[qi]; if (!q) return;
    const tried = Array.from(new Set([...(q.triedUsers || []), q.currentlyAnswering].filter(Boolean)));
    resolveQuestion(ri, qi, { currentlyAnswering: null, triedUsers: tried }, false);
  };
  // closeQuestion ("Niemand") also preserves triedUsers so penalties for
  // everyone who tried still apply.
  const closeQuestion = (ri, qi) => resolveQuestion(ri, qi, { opened: false, currentlyAnswering: null }, true);

  // Current picker derivation
  const pickerOrder = currentRound?.pickerOrder || [];
  const pickerIdx = currentRound?.pickerIdx || 0;
  const currentPickerId = pickerOrder.length > 0 ? pickerOrder[pickerIdx % pickerOrder.length] : null;
  const currentPicker = currentPickerId ? usersById[currentPickerId] : null;
  const iAmPicker = currentPickerId === me.id;

  const finishRound = (ri) => {
    if (!admin) return;
    if (!confirm('Runde beenden? Punkte werden ans Stand-Leaderboard übergeben.')) return;
    const next = rounds.map((r, i) => i === ri ? { ...r, finishedAt: new Date().toISOString() } : r);
    onPatch({ rounds: next });
    setOpenQuestion(null);
  };

  // Build a 2D grid: category × level (1..5)
  const grid = {};
  for (const c of categories) grid[c] = {};
  for (let qi = 0; qi < (currentRound?.questions?.length || 0); qi++) {
    const q = currentRound.questions[qi];
    if (!grid[q.category]) grid[q.category] = {};
    grid[q.category][q.level] = { ...q, _qi: qi };
  }
  const levels = [1, 2, 3, 4, 5];

  return (
    <>
      <ModuleHeader title="🎤 Jeopardy" admin={admin} onOpenSettings={onOpenSettings} />

      <div className="ww-stats-row">
        <StatPill label="Runde" value={`${rounds.length || 0}`} />
        <StatPill label="Aktuelle Pkt" value={myRoundScore} />
        <StatPill label="Event-Pkt" value={totalEventPts} accent />
      </div>

      {!currentRound && (
        <div className="ww-empty">Keine Runde gestartet — Host öffnet Settings und tappt "Neue Runde".</div>
      )}

      {currentRound && categories.length > 0 && (
        <section className="ww-section">
          <div className="ww-section-head">
            <Trophy size={16} />
            <h3>RUNDE {currentRoundIdx + 1}{currentRound.finishedAt ? ' · BEENDET' : ''}</h3>
          </div>

          {hostPlays && !currentRound.finishedAt && currentPicker && (
            <div className={`ww-jeo-picker ${iAmPicker ? 'mine' : ''}`}>
              🎯 An der Reihe: <b>{currentPicker.emoji || '🍺'} {currentPicker.displayName || currentPicker.email}</b>
              {iAmPicker && <span style={{ marginLeft: 8 }}>— du bist dran, wähle ein Tile</span>}
            </div>
          )}

          <div className="ww-jeo-board" style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(60px, 1fr))` }}>
            {categories.map(c => (
              <div key={`h-${c}`} className="ww-jeo-cat-header" title={c}>{c}</div>
            ))}
            {levels.map(lvl => categories.map(c => {
              const q = grid[c]?.[lvl];
              if (!q) return <div key={`${c}-${lvl}`} className="ww-jeo-cell empty">—</div>;
              const winner = q.winnerUserId ? usersById[q.winnerUserId] : null;
              const triedWithoutWinner = !winner && Array.isArray(q.triedUsers) && q.triedUsers.length > 0 && !q.opened;
              const pts = levelPoints(lvl);
              const cls = q.winnerUserId
                ? 'won'
                : triedWithoutWinner
                  ? 'failed'
                  : (q.revealed ? 'revealed' : '');
              return (
                <button
                  key={`${c}-${lvl}`}
                  className={`ww-jeo-cell ${cls} ${q.opened ? 'opened' : ''}`}
                  onClick={() => {
                    if (currentRound.finishedAt && !winner) return;
                    if (hostPlays) {
                      // Turn-based: only the current picker (or host as failsafe
                      // if there's no picker queue yet) can open a tile. The
                      // picker auto-becomes the first answerer.
                      if (q.opened || winner || !active) return;
                      const allowed = iAmPicker || (admin && !currentPickerId);
                      if (!allowed) return;
                      const dran = iAmPicker ? me.id : currentPickerId;
                      openTileShared(currentRoundIdx, q._qi, dran);
                    } else {
                      setOpenQuestion({ ri: currentRoundIdx, qi: q._qi });
                    }
                  }}
                  disabled={
                    (!!currentRound.finishedAt && !winner) ||
                    (hostPlays && !winner && !q.opened && !(iAmPicker || (admin && !currentPickerId)))
                  }
                  title={`${c} · Level ${lvl}`}
                >
                  {winner ? (
                    <span className="ww-jeo-winner">{winner.emoji || '🍺'} · {pts}</span>
                  ) : triedWithoutWinner ? (
                    <span className="ww-jeo-failed">💀 −{Math.floor(pts / 2)}</span>
                  ) : (
                    <span className="ww-jeo-level">{pts}</span>
                  )}
                </button>
              );
            }))}
          </div>

          {participants.length > 0 && (
            <div className="ww-section" style={{ marginTop: 12 }}>
              <div className="ww-section-head"><h3>STAND RUNDE</h3></div>
              <div className="ww-board">
                {participants
                  .map(u => ({ u, pts: scoresByUser[u.id] || 0 }))
                  .sort((a, b) => b.pts - a.pts)
                  .map(({ u, pts }, i) => (
                    <div key={u.id} className={`ww-board-row ${u.id === me.id ? 'me' : ''}`}>
                      <div className="ww-board-rank">{rankBadge(i)}</div>
                      <div className="ww-board-emoji">{u.emoji || '🍺'}</div>
                      <div className="ww-board-name">{u.displayName || u.email}</div>
                      <div className="ww-board-pts">{pts}<span>pkt</span></div>
                    </div>
                  ))}
              </div>
              <div className="ww-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 8 }}>
                Event-Punkte bei Rundenende: {positionPts.map((p, i) => `${i + 1}. → ${p}`).join(' · ')}
              </div>
            </div>
          )}

          {admin && active && !currentRound.finishedAt && (
            <button className="ww-big-cta green" onClick={() => finishRound(currentRoundIdx)} style={{ marginTop: 10 }}>
              <Flag size={20} /><span>RUNDE BEENDEN & PUNKTE VERTEILEN</span>
            </button>
          )}
        </section>
      )}

      {rounds.filter(r => r.finishedAt).length > 0 && (
        <section className="ww-section">
          <div className="ww-section-head"><h3>VERGANGENE RUNDEN</h3></div>
          <div className="ww-board">
            {rounds.map((r, ri) => {
              if (!r.finishedAt) return null;
              const sc = jeopardyRoundScores(r);
              const rk = Object.entries(sc).sort((a, b) => b[1] - a[1]);
              const myPlace = rk.findIndex(([uid]) => uid === me.id);
              const myEventPts = myPlace >= 0 && myPlace < positionPts.length ? (positionPts[myPlace] || 0) : 0;
              return (
                <div key={r.id} className="ww-board-row">
                  <div className="ww-board-rank">R{ri + 1}</div>
                  <div className="ww-board-name">
                    {rk.slice(0, 3).map(([uid, p]) => {
                      const u = usersById[uid]; if (!u) return null;
                      return <span key={uid} style={{ marginRight: 8 }}>{u.emoji || '🍺'} {p}</span>;
                    })}
                  </div>
                  <div className="ww-board-pts">+{myEventPts}<span>pkt</span></div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeOpen && (() => {
        const r = rounds[activeOpen.ri];
        const q = r?.questions?.[activeOpen.qi];
        if (!q) return null;
        const winner = q.winnerUserId ? usersById[q.winnerUserId] : null;
        const dran = q.currentlyAnswering ? usersById[q.currentlyAnswering] : null;
        const iAmDran = !!q.currentlyAnswering && q.currentlyAnswering === me.id;
        const iAmParticipant = participants.some(p => p.id === me.id);

        // Close behaviour differs: hostPlays uses shared data, non-hostPlays uses local state.
        const close = () => {
          if (hostPlays && admin) closeQuestion(activeOpen.ri, activeOpen.qi);
          if (!hostPlays) setOpenQuestion(null);
          // non-admin players can't dismiss a shared modal; it closes when host abandons or marks
        };

        // -------- HOST-PLAYS branch (shared, turn-based) --------
        if (hostPlays) {
          const tried = q.triedUsers || [];
          const remaining = participants.filter(p => !tried.includes(p.id));
          // Step 1: only appears AFTER a wrong answer — picker auto-becomes the
          // first dran on tile-tap. Filters out users who already tried.
          if (!q.currentlyAnswering) {
            return (
              <ModuleSettingsDrawer
                title={`${q.category} · ${levelPoints(q.level)} Pkt`}
                onClose={admin ? close : (() => {})}
              >
                <div className="ww-jeo-question">{q.q}</div>
                {admin ? (
                  <>
                    <label className="ww-label" style={{ marginTop: 12 }}>
                      {tried.length > 0 ? 'WER VERSUCHT JETZT?' : 'WER ANTWORTET?'}
                    </label>
                    {remaining.length === 0 ? (
                      <div className="ww-muted" style={{ fontSize: 13, padding: 8, textAlign: 'center' }}>
                        Alle haben falsch geantwortet.
                      </div>
                    ) : (
                      <div className="ww-flunky-assign">
                        {remaining.map(u => (
                          <button
                            key={u.id}
                            className="ww-flunky-assign-row"
                            onClick={() => setDran(activeOpen.ri, activeOpen.qi, u.id)}
                            style={{ border: 'none', textAlign: 'left', cursor: 'pointer' }}
                          >
                            <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
                            <span className="ww-user-mgmt-name">{u.displayName || u.email}</span>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                      </div>
                    )}
                    <button className="ww-mini-btn red" style={{ marginTop: 10 }}
                      onClick={() => closeQuestion(activeOpen.ri, activeOpen.qi)}>
                      Niemand wusste es · Frage zu
                    </button>
                  </>
                ) : (
                  <div className="ww-muted" style={{ fontSize: 12, margin: '8px 0' }}>
                    Warte auf den Host — wer versucht es jetzt?
                  </div>
                )}
              </ModuleSettingsDrawer>
            );
          }

          // Step 2: somebody is dran → show Q to all, A to all except dran
          return (
            <ModuleSettingsDrawer
              title={`${q.category} · ${levelPoints(q.level)} Pkt`}
              onClose={admin ? close : (() => {})}
            >
              <div className="ww-jeo-dran">
                🎯 dran: <b>{dran ? `${dran.emoji || '🍺'} ${dran.displayName || dran.email}` : '?'}</b>
              </div>
              <div className="ww-jeo-question">{q.q}</div>
              {iAmDran ? (
                <div className="ww-muted" style={{ fontSize: 13, margin: '8px 0', textAlign: 'center', padding: 12 }}>
                  🤫 Du bist dran — sag deine Antwort laut.<br />Die anderen sehen die Lösung und werten.
                </div>
              ) : (
                <div className="ww-jeo-answer">💡 {q.a}</div>
              )}
              {iAmParticipant && !iAmDran && active && (
                <div className="ww-grid2" style={{ marginTop: 14 }}>
                  <button className="ww-big-cta green" style={{ marginTop: 0 }}
                    onClick={() => markRight(activeOpen.ri, activeOpen.qi, q.currentlyAnswering)}>
                    <Check size={20} /><span>RICHTIG</span>
                  </button>
                  <button className="ww-big-cta" style={{ marginTop: 0, background: 'var(--red)', boxShadow: 'none' }}
                    onClick={() => markWrong(activeOpen.ri, activeOpen.qi)}>
                    <X size={20} /><span>FALSCH</span>
                  </button>
                </div>
              )}
              {admin && (
                <button className="ww-mini-btn red" style={{ marginTop: 10 }}
                  onClick={() => closeQuestion(activeOpen.ri, activeOpen.qi)}>
                  Niemand wusste es · Punkte annullieren
                </button>
              )}
            </ModuleSettingsDrawer>
          );
        }

        // -------- Legacy non-hostPlays branch (local modal, admin picks winner) --------
        const showAnswer = winner || q.revealed;
        return (
          <ModuleSettingsDrawer
            title={`${q.category} · ${levelPoints(q.level)} Pkt`}
            onClose={close}
          >
            <div className="ww-jeo-question">{q.q}</div>
            {showAnswer ? (
              <div className="ww-jeo-answer">💡 {q.a}</div>
            ) : (
              admin && (
                <button className="ww-mini-btn" onClick={() => {
                  const next = rounds.map((rr, i) => i === activeOpen.ri ? {
                    ...rr,
                    questions: rr.questions.map((qq, j) => j === activeOpen.qi ? { ...qq, revealed: true } : qq),
                  } : rr);
                  onPatch({ rounds: next });
                }}>Antwort zeigen</button>
              )
            )}
            {admin && active && !r.finishedAt && (
              <>
                <label className="ww-label" style={{ marginTop: 14 }}>SIEGER</label>
                <div className="ww-flunky-assign">
                  {participants.map(u => (
                    <button
                      key={u.id}
                      className={`ww-flunky-assign-row ${q.winnerUserId === u.id ? 'sel' : ''}`}
                      onClick={() => { setQuestionWinner(activeOpen.ri, activeOpen.qi, u.id); setOpenQuestion(null); }}
                      style={{ background: q.winnerUserId === u.id ? 'rgba(245,165,36,0.15)' : '', border: 'none', textAlign: 'left' }}
                    >
                      <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
                      <span className="ww-user-mgmt-name">{u.displayName || u.email}</span>
                      {q.winnerUserId === u.id && <Check size={14} />}
                    </button>
                  ))}
                </div>
                <button className="ww-mini-btn red" style={{ marginTop: 10 }}
                  onClick={() => { setQuestionWinner(activeOpen.ri, activeOpen.qi, null); setOpenQuestion(null); }}>
                  Niemand · Punkte annullieren
                </button>
              </>
            )}
            {winner && !admin && (
              <div className="ww-muted" style={{ marginTop: 12 }}>Gewonnen von {winner.emoji} {winner.displayName || winner.email}</div>
            )}
          </ModuleSettingsDrawer>
        );
      })()}
    </>
  );
}

const DEFAULT_JEO_CATS = [
  'Geographie',
  'Zurück in die Schule',
  'Reality TV Deutschland',
  'Twitch & Youtube Deutschland',
  'Songtexte 2000er',
];

function JeopardyLiveSettings({ jeopardy, members, onPatch, onGenerate }) {
  const [cats, setCats] = useState(jeopardy?.categories?.length ? jeopardy.categories : DEFAULT_JEO_CATS);
  const [pts, setPts] = useState((jeopardy?.pointsPerPosition || [5, 3, 2, 1]).join(','));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (jeopardy?.categories?.length) setCats(jeopardy.categories);
  }, [jeopardy?.id]);

  const participants = jeopardy?.participants || [];
  const memberIds = members.map(m => m.expand?.user?.id).filter(Boolean);

  const updateCat = (i, v) => {
    const next = [...cats]; while (next.length < 5) next.push('');
    next[i] = v;
    setCats(next);
  };

  const saveCats = () => {
    const filtered = cats.map(c => (c || '').trim()).filter(Boolean);
    onPatch({ categories: filtered });
  };

  const savePts = () => {
    const arr = pts.split(/[,\s]+/).map(x => Number(x)).filter(n => Number.isFinite(n) && n >= 0);
    onPatch({ pointsPerPosition: arr });
  };

  const startRound = async () => {
    const filtered = cats.map(c => (c || '').trim()).filter(Boolean);
    if (filtered.length < 1) { alert('Mindestens eine Kategorie'); return; }
    setBusy(true);
    try { await onGenerate(filtered); } finally { setBusy(false); }
  };

  const toggleParticipant = (uid) => {
    const has = participants.includes(uid);
    onPatch({ participants: has ? participants.filter(x => x !== uid) : [...participants, uid] });
  };
  const allParticipants = () => onPatch({ participants: memberIds });
  const clearParticipants = () => onPatch({ participants: [] });

  const clearRounds = () => {
    if (!confirm('Alle Runden + Fragen löschen?')) return;
    onPatch({ rounds: [] });
  };

  return (
    <div>
      <label className="ww-label">KATEGORIEN (5)</label>
      {Array.from({ length: 5 }).map((_, i) => (
        <input
          key={i} className="ww-input"
          style={{ marginTop: i === 0 ? 0 : 6 }}
          placeholder={`Kategorie ${i + 1}`}
          value={cats[i] || ''}
          onChange={(e) => updateCat(i, e.target.value)}
          onBlur={saveCats}
          maxLength={40}
        />
      ))}

      <label className="ww-label">PUNKTE PRO PLATZ (komma-getrennt, 1. bis n.)</label>
      <input className="ww-input" value={pts} onChange={e => setPts(e.target.value)} onBlur={savePts} placeholder="5,3,2,1" />

      <label className="ww-label" style={{ marginTop: 14 }}>HOST SPIELT MIT</label>
      <button
        type="button"
        className={`ww-module-toggle ${jeopardy?.hostPlays ? 'on' : ''}`}
        onClick={() => onPatch({ hostPlays: !jeopardy?.hostPlays })}
        style={{ width: '100%' }}
      >
        <span className="ww-mod-icon">{jeopardy?.hostPlays ? '🤫' : '👀'}</span>
        <span className="ww-mod-name">
          {jeopardy?.hostPlays
            ? 'AN — Antwort erst nach Sieger-Pick sichtbar'
            : 'AUS — Host sieht Antwort sofort'}
        </span>
        {jeopardy?.hostPlays ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>

      <div className="ww-flunky-controls" style={{ marginTop: 10 }}>
        <button className="ww-mini-btn" onClick={allParticipants}>Alle dabei</button>
        <button className="ww-mini-btn red" onClick={clearParticipants}>↺ Leer</button>
      </div>
      <label className="ww-label" style={{ marginTop: 10 }}>TEILNEHMER</label>
      <div className="ww-flunky-assign">
        {members.map(m => {
          const u = m.expand?.user; if (!u) return null;
          const on = participants.includes(u.id);
          return (
            <div key={u.id} className="ww-flunky-assign-row">
              <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
              <span className="ww-user-mgmt-name">{u.displayName || u.email}</span>
              <button className={`ww-mini-btn ${on ? 'active' : ''}`} onClick={() => toggleParticipant(u.id)}>
                {on ? <><Check size={11} /> dabei</> : 'mitspielen'}
              </button>
            </div>
          );
        })}
      </div>

      <button className="ww-big-cta green" onClick={startRound} disabled={busy} style={{ marginTop: 14 }}>
        <Play size={20} /><span>{busy ? 'GENERIERE FRAGEN…' : 'NEUE RUNDE STARTEN'}</span>
      </button>
      <p className="ww-muted" style={{ fontSize: 11, marginTop: 6 }}>
        Anthropic generiert 5 Fragen pro Kategorie. Dauert ca. 5–15 Sek.
      </p>

      <button className="ww-danger-btn red" onClick={clearRounds} style={{ marginTop: 14 }}>
        <Trash2 size={14} /> Alle Runden löschen
      </button>
    </div>
  );
}

// ============================================================
// Custom-module view + settings (generic competition)
// ============================================================

const ENTRANT_PALETTE = ['#f5a524', '#22c55e', '#6366f1', '#ef4444', '#06b6d4', '#a855f7', '#eab308', '#ec4899'];

function CustomModuleView({ me, mod, members, admin, active, onPatch, onOpenSettings }) {
  const usersById = useMemo(() => {
    const m = {};
    for (const mem of members) if (mem.expand?.user) m[mem.expand.user.id] = mem.expand.user;
    return m;
  }, [members]);

  const totalSets = Math.max(1, mod.totalSets || 1);
  const setsArr = Array.from({ length: totalSets }, (_, i) => {
    const n = i + 1;
    const found = (mod.sets || []).find(s => s.n === n);
    return found || { n, winner: null };
  });

  const setWinner = (n, winner) => {
    if (!admin || !active) return;
    const existing = (mod.sets || []).find(s => s.n === n);
    let nextSets;
    if (existing && existing.winner === winner) {
      // toggle off
      nextSets = (mod.sets || []).filter(s => s.n !== n);
    } else {
      nextSets = [...(mod.sets || []).filter(s => s.n !== n), { n, winner }];
    }
    onPatch({ sets: nextSets });
  };

  const clearSet = (n) => {
    if (!admin) return;
    onPatch({ sets: (mod.sets || []).filter(s => s.n !== n) });
  };

  // Score per entrant (team or participant)
  const entrants = mod.mode === 'teams'
    ? (mod.teams || [])
    : (mod.participants || []).map(uid => {
        const u = usersById[uid];
        return { id: uid, name: u?.displayName || u?.email || '?', user: u };
      });

  const winsByEntrant = {};
  for (const s of (mod.sets || [])) if (s.winner) winsByEntrant[s.winner] = (winsByEntrant[s.winner] || 0) + 1;

  const myEntrantId = mod.mode === 'teams'
    ? (mod.teams || []).find(t => Array.isArray(t.members) && t.members.includes(me.id))?.id
    : (mod.participants || []).includes(me.id) ? me.id : null;

  const myWins = winsByEntrant[myEntrantId] || 0;

  // Only the entrant with the most sets (no tie) gets pointsPerWin
  const maxSetsWon = Math.max(0, ...Object.values(winsByEntrant));
  const matchWinnerId = maxSetsWon > 0 && Object.values(winsByEntrant).filter(v => v === maxSetsWon).length === 1
    ? Object.keys(winsByEntrant).find(id => winsByEntrant[id] === maxSetsWon)
    : null;
  const myPts = myEntrantId && myEntrantId === matchWinnerId ? (mod.pointsPerWin || 0) : 0;

  const ready = entrants.length >= 2;

  const archivedGames = mod.games || [];
  const archivedCount = archivedGames.length;
  const currentGameDone = setsArr.filter(s => s.winner).length === totalSets;

  const startNewGame = () => {
    const hasState = (mod.sets || []).length > 0 || (mod.teams || []).length > 0 || (mod.participants || []).length > 0;
    if (hasState && !confirm('Aktuelles Spiel archivieren und neues starten? Teams und Sets werden zurückgesetzt.')) return;
    const games = hasState ? [...archivedGames, {
      id: String(Date.now()),
      mode: mod.mode,
      teams: mod.teams || [],
      participants: mod.participants || [],
      sets: mod.sets || [],
      endedAt: new Date().toISOString(),
    }] : archivedGames;
    onPatch({ games, sets: [], teams: [], participants: [] });
  };

  return (
    <>
      <ModuleHeader title={`${mod.icon || '🎯'} ${mod.name}`} admin={admin} onOpenSettings={onOpenSettings} />

      <div className="ww-stats-row">
        <StatPill label="Sets" value={`${setsArr.filter(s => s.winner).length}/${totalSets}`} />
        <StatPill label={mod.mode === 'teams' ? 'Mein Team' : 'Meine Siege'} value={myWins} />
        <StatPill label="Pkt" value={myPts} accent />
      </div>

      {admin && active && (currentGameDone || archivedCount > 0) && (
        <button className="ww-mini-btn" onClick={startNewGame} style={{ marginBottom: 10 }}>
          <Play size={11} /> Neues Spiel starten (Teams neu)
        </button>
      )}

      {!ready && (
        <div className="ww-empty">
          {mod.mode === 'teams'
            ? 'Host muss mind. 2 Teams einteilen (Zahnrad oben rechts).'
            : 'Host muss mind. 2 Teilnehmer auswählen (Zahnrad oben rechts).'}
        </div>
      )}

      {ready && (
        <>
          <section className="ww-section">
            <div className="ww-section-head">
              <Trophy size={16} />
              <h3>{mod.mode === 'teams' ? 'TEAMS' : 'TEILNEHMER'}</h3>
            </div>
            <div className="ww-entrant-grid">
              {entrants.map((e, idx) => {
                const wins = winsByEntrant[e.id] || 0;
                const isMine = e.id === myEntrantId;
                const color = ENTRANT_PALETTE[idx % ENTRANT_PALETTE.length];
                return (
                  <div key={e.id} className={`ww-entrant-card ${isMine ? 'mine' : ''}`} style={{ borderColor: color }}>
                    <div className="ww-entrant-head">
                      <span className="ww-entrant-name" style={{ color }}>{e.name}</span>
                      <span className="ww-entrant-score">{wins}</span>
                    </div>
                    {mod.mode === 'teams' && (
                      <div className="ww-flunky-roster">
                        {(e.members || []).map(uid => {
                          const u = usersById[uid];
                          if (!u) return null;
                          return (
                            <span key={uid} className="ww-flunky-player">
                              {u.emoji || '🍺'} {u.displayName || u.email}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {mod.mode === 'solo' && e.user && (
                      <div className="ww-flunky-roster">
                        <span className="ww-flunky-player">{e.user.emoji || '🍺'} {e.user.displayName || e.user.email}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="ww-section">
            <div className="ww-section-head"><Flag size={16} /><h3>SETS</h3></div>
            <div className="ww-flunky-sets">
              {setsArr.map(s => {
                const winnerEntrant = entrants.find(e => e.id === s.winner);
                return (
                  <div key={s.n} className="ww-flunky-set">
                    <div className="ww-flunky-set-label">SET {s.n}</div>
                    {admin && active ? (
                      <>
                        <div className="ww-set-picker">
                          {entrants.map((e, idx) => (
                            <button
                              key={e.id}
                              className={`ww-flunky-set-btn ${s.winner === e.id ? 'won' : ''}`}
                              style={s.winner === e.id ? { background: ENTRANT_PALETTE[idx % ENTRANT_PALETTE.length], borderColor: ENTRANT_PALETTE[idx % ENTRANT_PALETTE.length] } : {}}
                              onClick={() => setWinner(s.n, e.id)}
                            >{e.name.slice(0, 8)}</button>
                          ))}
                        </div>
                        {s.winner && (
                          <button
                            className="ww-icon-del"
                            onClick={() => clearSet(s.n)}
                            title="Set leeren"
                            aria-label="Set leeren"
                          ><X size={10} /></button>
                        )}
                      </>
                    ) : (
                      <div className="ww-flunky-set-result">
                        {winnerEntrant ? (
                          <>
                            🏆 {winnerEntrant.name.slice(0, 10)}
                            {admin && (
                              <button
                                className="ww-icon-del"
                                onClick={() => clearSet(s.n)}
                                title="Set leeren"
                                aria-label="Set leeren"
                                style={{ marginLeft: 6 }}
                              ><X size={10} /></button>
                            )}
                          </>
                        ) : '—'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="ww-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 8 }}>
              {mod.pointsPerWin || 0} Punkte für {mod.mode === 'teams' ? 'das Team mit den meisten Sätzen' : 'den Spieler mit den meisten Sätzen'}
            </div>
          </section>
        </>
      )}

      {archivedCount > 0 && (
        <section className="ww-section">
          <div className="ww-section-head"><Trophy size={16} /><h3>VERGANGENE SPIELE ({archivedCount})</h3></div>
          <div className="ww-game-list">
            {[...archivedGames].reverse().map((g, idx) => {
              const gWinsByEntrant = {};
              for (const s of g.sets || []) if (s.winner) gWinsByEntrant[s.winner] = (gWinsByEntrant[s.winner] || 0) + 1;
              const gEntrants = (g.mode || mod.mode) === 'teams'
                ? (g.teams || [])
                : (g.participants || []).map(uid => {
                    const u = usersById[uid];
                    return { id: uid, name: u?.displayName || u?.email || '?' };
                  });
              const ranking = gEntrants.map(e => ({ ...e, w: gWinsByEntrant[e.id] || 0 })).sort((a, b) => b.w - a.w);
              return (
                <div key={g.id} className="ww-game-card">
                  <div className="ww-game-head">
                    <span className="ww-game-tag">SPIEL {archivedCount - idx}</span>
                    <span className="ww-game-result">{ranking[0]?.w > 0 ? `🏆 ${ranking[0].name.slice(0, 14)} (${ranking[0].w})` : '—'}</span>
                  </div>
                  <div className="ww-flunky-roster" style={{ fontSize: 11 }}>
                    {ranking.map(e => <span key={e.id}>{e.name}: {e.w}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function CustomModuleSettings({ mod, members, onPatch, onDelete }) {
  const [name, setName] = useState(mod.name || '');
  const [icon, setIcon] = useState(mod.icon || '🎯');
  const [mode, setMode] = useState(mod.mode || 'teams');
  const [teamCount, setTeamCount] = useState(mod.teamCount || 2);
  const [pointsPerWin, setPointsPerWin] = useState(mod.pointsPerWin || 3);
  const [totalSets, setTotalSets] = useState(mod.totalSets || 3);

  useEffect(() => {
    setName(mod.name || ''); setIcon(mod.icon || '🎯');
    setMode(mod.mode || 'teams'); setTeamCount(mod.teamCount || 2);
    setPointsPerWin(mod.pointsPerWin || 3); setTotalSets(mod.totalSets || 3);
  }, [mod.id]);

  const memberIds = members.map(m => m.expand?.user?.id).filter(Boolean);

  const saveBasics = () => onPatch({
    name: name.trim() || 'Modul',
    icon: icon.trim() || '🎯',
    mode,
    teamCount: Number(teamCount) || 2,
    pointsPerWin: Number(pointsPerWin) || 0,
    totalSets: Number(totalSets) || 1,
  });

  // Team management (teams mode)
  const teams = Array.isArray(mod.teams) ? mod.teams : [];
  const teamCountTarget = Math.max(2, Number(teamCount) || 2);

  const ensureTeams = () => {
    // Make sure teams array has exactly teamCountTarget rows, preserving existing
    const cur = teams.slice(0, teamCountTarget);
    while (cur.length < teamCountTarget) {
      cur.push({ id: `t${Date.now()}-${cur.length}`, name: `Team ${String.fromCharCode(65 + cur.length)}`, members: [] });
    }
    onPatch({ teams: cur, teamCount: teamCountTarget });
  };

  const shuffleTeams = () => {
    const ids = [...memberIds].map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
    const groups = Array.from({ length: teamCountTarget }, () => []);
    ids.forEach((id, i) => { groups[i % teamCountTarget].push(id); });
    const next = teams.length === teamCountTarget && teams.length > 0
      ? teams.map((t, i) => ({ ...t, members: groups[i] }))
      : groups.map((m, i) => ({ id: `t${Date.now()}-${i}`, name: `Team ${String.fromCharCode(65 + i)}`, members: m }));
    onPatch({ teams: next, teamCount: teamCountTarget });
  };

  const assignToTeam = (userId, teamIdx) => {
    let cur = teams.slice();
    while (cur.length < teamCountTarget) cur.push({ id: `t${Date.now()}-${cur.length}`, name: `Team ${String.fromCharCode(65 + cur.length)}`, members: [] });
    cur = cur.map((t, i) => ({ ...t, members: (t.members || []).filter(id => id !== userId) }));
    if (teamIdx != null && teamIdx >= 0 && teamIdx < cur.length) {
      cur[teamIdx] = { ...cur[teamIdx], members: [...cur[teamIdx].members, userId] };
    }
    onPatch({ teams: cur });
  };

  const teamIdxOf = (userId) => teams.findIndex(t => Array.isArray(t.members) && t.members.includes(userId));

  // Solo management
  const participants = Array.isArray(mod.participants) ? mod.participants : [];
  const toggleParticipant = (userId) => {
    const has = participants.includes(userId);
    onPatch({ participants: has ? participants.filter(id => id !== userId) : [...participants, userId] });
  };
  const setAllParticipants = () => onPatch({ participants: memberIds });
  const clearParticipants = () => onPatch({ participants: [] });

  return (
    <div>
      <label className="ww-label">NAME</label>
      <input className="ww-input" value={name} onChange={e => setName(e.target.value)} onBlur={saveBasics} maxLength={60} />

      <label className="ww-label">ICON</label>
      <div className="ww-emoji-grid">
        {MODULE_ICONS.map(e => (
          <button
            key={e} type="button"
            className={`ww-emoji-btn ${icon === e ? 'sel' : ''}`}
            onClick={() => { setIcon(e); onPatch({ icon: e }); }}
          >{e}</button>
        ))}
      </div>

      <label className="ww-label">MODUS</label>
      <div className="ww-auth-tabs" style={{ marginBottom: 0 }}>
        <button className={`ww-auth-tab ${mode === 'teams' ? 'active' : ''}`} onClick={() => { setMode('teams'); onPatch({ mode: 'teams' }); }}>TEAMS</button>
        <button className={`ww-auth-tab ${mode === 'solo' ? 'active' : ''}`} onClick={() => { setMode('solo'); onPatch({ mode: 'solo' }); }}>SOLO</button>
      </div>

      <div className="ww-grid2">
        <div>
          <label className="ww-label">PKT / SIEG</label>
          <input className="ww-input" type="number" min={0} max={1000} value={pointsPerWin} onChange={e => setPointsPerWin(e.target.value)} onBlur={saveBasics} />
        </div>
        <div>
          <label className="ww-label">ANZAHL SÄTZE</label>
          <input className="ww-input" type="number" min={1} max={99} value={totalSets} onChange={e => setTotalSets(e.target.value)} onBlur={saveBasics} />
        </div>
      </div>

      {mode === 'teams' && (
        <>
          <label className="ww-label">ANZAHL TEAMS</label>
          <input className="ww-input" type="number" min={2} max={12} value={teamCount} onChange={e => setTeamCount(e.target.value)} onBlur={saveBasics} />

          <div className="ww-flunky-controls" style={{ marginTop: 10 }}>
            <button className="ww-mini-btn" onClick={ensureTeams}>Teams initialisieren</button>
            <button className="ww-mini-btn" onClick={shuffleTeams}>🎲 Würfeln</button>
            <button className="ww-mini-btn red" onClick={() => onPatch({ teams: teams.map(t => ({ ...t, members: [] })), sets: [] })}>↺ Reset</button>
          </div>

          <label className="ww-label" style={{ marginTop: 14 }}>TEAM-NAMEN</label>
          <div className="ww-flunky-assign">
            {teams.slice(0, teamCountTarget).map((t, i) => (
              <div key={t.id} className="ww-flunky-assign-row">
                <span className="ww-user-mgmt-emoji" style={{ color: ENTRANT_PALETTE[i % ENTRANT_PALETTE.length] }}>●</span>
                <input
                  className="ww-input"
                  style={{ margin: 0, flex: 1 }}
                  value={t.name}
                  onChange={e => {
                    const next = teams.map((x, j) => j === i ? { ...x, name: e.target.value } : x);
                    onPatch({ teams: next });
                  }}
                  maxLength={20}
                />
              </div>
            ))}
          </div>

          <label className="ww-label" style={{ marginTop: 14 }}>ZUORDNUNG</label>
          <div className="ww-flunky-assign">
            {members.map(m => {
              const u = m.expand?.user; if (!u) return null;
              const idx = teamIdxOf(u.id);
              return (
                <div key={u.id} className="ww-flunky-assign-row">
                  <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
                  <span className="ww-user-mgmt-name">{u.displayName || u.email}</span>
                  <div className="ww-flunky-assign-btns">
                    {Array.from({ length: teamCountTarget }).map((_, ti) => (
                      <button
                        key={ti}
                        className={`ww-mini-btn ${idx === ti ? 'active' : ''}`}
                        onClick={() => assignToTeam(u.id, idx === ti ? null : ti)}
                        title={teams[ti]?.name || `Team ${String.fromCharCode(65 + ti)}`}
                      >{String.fromCharCode(65 + ti)}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {mode === 'solo' && (
        <>
          <div className="ww-flunky-controls" style={{ marginTop: 10 }}>
            <button className="ww-mini-btn" onClick={setAllParticipants}>Alle dabei</button>
            <button className="ww-mini-btn red" onClick={clearParticipants}>↺ Leer</button>
          </div>
          <label className="ww-label" style={{ marginTop: 14 }}>TEILNEHMER</label>
          <div className="ww-flunky-assign">
            {members.map(m => {
              const u = m.expand?.user; if (!u) return null;
              const on = participants.includes(u.id);
              return (
                <div key={u.id} className="ww-flunky-assign-row">
                  <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
                  <span className="ww-user-mgmt-name">{u.displayName || u.email}</span>
                  <button className={`ww-mini-btn ${on ? 'active' : ''}`} onClick={() => toggleParticipant(u.id)}>
                    {on ? <><Check size={11} /> dabei</> : 'mitspielen'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <button className="ww-danger-btn red" onClick={onDelete} style={{ marginTop: 18 }}>
        <Trash2 size={14} /> Modul löschen
      </button>
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

function CrewView({ members, statsMap, event, flunky, jeopardy, customModules, myId, onShowUserDetail }) {
  return (
    <div className="ww-crew">
      <div className="ww-section-head"><Users size={16} /><h3>DIE CREW ({members.length})</h3></div>
      <div className="ww-crew-list">
        {members.map(m => {
          const u = m.expand?.user; if (!u) return null;
          const s = statsMap[u.id] || { beer: 0, mische: 0 };
          const points = computeTotalPoints(u.id, s, event, flunky, customModules, jeopardy);
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

function UserDetailDrawer({ user, stats, event, flunky, jeopardy, customModules, isMe, onClose }) {
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

  // Per-custom-module breakdown for this user
  const customBreakdown = (customModules || []).map(cm => {
    const ppwc = cm.pointsPerWin || 0;
    const sets = cm.sets || [];
    let wins = 0;
    if (cm.mode === 'teams') {
      const teams = cm.teams || [];
      for (const s of sets) {
        if (!s.winner) continue;
        const t = teams.find(x => x.id === s.winner);
        if (t && Array.isArray(t.members) && t.members.includes(user.id)) wins++;
      }
    } else {
      for (const s of sets) if (s.winner === user.id) wins++;
    }
    return { cm, wins, pts: wins * ppwc };
  }).filter(x => x.wins > 0);

  const customPts = customBreakdown.reduce((s, x) => s + x.pts, 0);

  // Jeopardy: per-round position + cumulative points
  const jeopardyBreakdown = [];
  if (jeopardy) {
    const positionPts = Array.isArray(jeopardy.pointsPerPosition) ? jeopardy.pointsPerPosition : [];
    (jeopardy.rounds || []).forEach((r, ri) => {
      if (!r.finishedAt) return;
      const scores = jeopardyRoundScores(r);
      const ranking = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const idx = ranking.findIndex(([uid]) => uid === user.id);
      if (idx < 0) return;
      const pts = (idx < positionPts.length ? positionPts[idx] : 0) || 0;
      jeopardyBreakdown.push({ roundNo: ri + 1, place: idx + 1, roundScore: scores[user.id] || 0, pts });
    });
  }
  const jeopardyPts = jeopardyBreakdown.reduce((s, x) => s + x.pts, 0);

  const total = drinkPts + flunkyPts + customPts + jeopardyPts;

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

        {customBreakdown.length > 0 && (
          <div className="ww-detail-section">
            <div className="ww-detail-section-head">🎯 CUSTOM MODULE</div>
            {customBreakdown.map(({ cm, wins, pts }) => (
              <DetailRow key={cm.id} label={`${cm.icon || '🎯'} ${cm.name} (${wins}× × ${cm.pointsPerWin || 0} pkt)`} pts={pts} />
            ))}
            <DetailRow label="Summe" pts={customPts} bold />
          </div>
        )}

        {jeopardyBreakdown.length > 0 && (
          <div className="ww-detail-section">
            <div className="ww-detail-section-head">🎤 JEOPARDY</div>
            {jeopardyBreakdown.map(({ roundNo, place, roundScore, pts }) => (
              <DetailRow key={roundNo} label={`Runde ${roundNo} · Platz ${place} (${roundScore} Frage-Pkt)`} pts={pts} />
            ))}
            <DetailRow label="Summe" pts={jeopardyPts} bold />
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

function EventSettingsView({ event, me, members, customModules, onCustomCreate, onCustomDelete, onSave, onToggleActive, onToggleModule, onResetCounters, onDeleteEvent, onKickMember, onToggleEventHost }) {
  const canManageHosts = isEventCreator(me, event) || isSiteAdmin(me);
  const [name, setName] = useState(event.name || '');
  const [date, setDate] = useState(event.date || '');
  const copyCode = () => navigator.clipboard?.writeText?.(event.code);

  return (
    <div>
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
        {(customModules || []).map(cm => (
          <div key={cm.id} className="ww-module-toggle on">
            <span className="ww-mod-icon">{cm.icon || '🎯'}</span>
            <span className="ww-mod-name">{cm.name}</span>
            <span className="ww-muted" style={{ fontSize: 10, letterSpacing: '0.1em', marginRight: 4 }}>
              {(cm.mode || 'teams').toUpperCase()}
            </span>
            <button className="ww-mini-btn red" onClick={() => onCustomDelete(cm.id)} title="Modul löschen">
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          className="ww-module-toggle"
          onClick={async () => {
            const name = prompt('Name des Moduls?', 'Cornhole');
            if (!name || !name.trim()) return;
            const modeInput = (prompt('Modus? "teams" oder "solo"', 'teams') || 'teams').toLowerCase();
            const mode = modeInput === 'solo' ? 'solo' : 'teams';
            await onCustomCreate({
              name: name.trim(), icon: '🎯', mode,
              teamCount: 2, pointsPerWin: 3, totalSets: 3,
              teams: [], participants: [], sets: [],
            });
          }}
        >
          <span className="ww-mod-icon"><Plus size={20} /></span>
          <span className="ww-mod-name">CUSTOM MODUL HINZUFÜGEN</span>
        </button>
      </div>

      <div className="ww-section">
        <div className="ww-section-head"><Users size={16} /><h3>MITGLIEDER ({members.length})</h3></div>
        <p className="ww-muted" style={{ fontSize: 12, marginTop: -4 }}>
          {canManageHosts
            ? 'Event-Host-Rolle gilt nur in diesem Event (start/pause, Module, scoren). Entfernen wirft den User nur aus diesem Event.'
            : 'Wer ist in diesem Event drin.'}
        </p>
        <div className="ww-user-mgmt">
          {members.map(m => {
            const u = m.expand?.user; if (!u) return null;
            const isMe = u.id === me.id;
            const isCreator = event.createdBy === u.id;
            const isThisEventHost = Array.isArray(event.hostUsers) && event.hostUsers.includes(u.id);
            return (
              <div key={m.id} className="ww-user-mgmt-row">
                <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
                <span className="ww-user-mgmt-name">
                  {u.displayName || u.email}{isMe && <span className="ww-you">DU</span>}
                  {isCreator && <span className="ww-host-badge"><Crown size={9} /> CREATOR</span>}
                  {!isCreator && isThisEventHost && <span className="ww-event-host-badge"><Crown size={9} /> EVENT-HOST</span>}
                  {u.role === 'admin' && <span className="ww-admin-badge"><ShieldCheck size={9} /> ADMIN</span>}
                </span>
                {canManageHosts && !isMe && !isCreator && (
                  <button
                    className={`ww-mini-btn ${isThisEventHost ? 'active' : ''}`}
                    onClick={() => onToggleEventHost(u.id, !isThisEventHost)}
                    title={isThisEventHost ? 'Event-Host-Rolle entziehen' : 'Zum Event-Host machen'}
                  >
                    {isThisEventHost ? '→ Member' : '→ Host'}
                  </button>
                )}
                {!isMe && !isCreator && (
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
