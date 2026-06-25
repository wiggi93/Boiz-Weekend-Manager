import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Beer, Wine, Trophy, Users, Settings, Plus, Minus, Check, X,
  RotateCcw, Home, User as UserIcon, Utensils,
  ArrowLeft, LogOut, AlertTriangle, ShieldCheck,
  Mail, Lock, UserPlus, Shield, KeyRound, Copy, Play, Pause,
  Hourglass, Eye, EyeOff, Dice5, Hand, Trash2, Flag, Crown,
  ChevronRight, Bell, BellOff, Wrench, Target, Sparkles, Send,
} from 'lucide-react';
import {
  pb, isSiteAdmin, isHost, isEventAdmin, isEventCreator, isEventHost,
  login, register, logout, requestPasswordReset, requestVerification, broadcastEmail,
  listAllEvents, getEvent, createEvent, updateEvent, deleteEvent,
  listMyMemberships, listEventMembers, joinByCode, leaveEvent, kickMember, updateMembership,
  loadEventStats, setMyCount, resetEventStats,
  updateMyProfile, setUserRole, setUserApproved, deleteUser, loadAllUsers,
  getFlunky, updateFlunky,
  getJeopardy, updateJeopardy, ensureJeopardy, generateJeopardyBoard, startJeopardyRound,
  listCustomModules, createCustomModule, updateCustomModule, deleteCustomModule,
  getKitty, updateKitty, ensureKitty,
  getSchnelleFragen, updateSchnelleFragen, ensureSchnelleFragen,
  getSchedule, updateSchedule, ensureSchedule,
  listPolls, createPoll, updatePoll, deletePoll, listPollVotes, castVote,
  listChallenges, createChallenge, updateChallenge, deleteChallenge,
  listWines, createWine, deleteWine, listWineRatings, rateWine,
  getWineFacts, pushWineFact,
  ensurePushSubscription,
  subscribeEvent, subscribeMyMemberships,
} from './api.js';
import { MODULES, moduleById, TOOL_MODULES, GAME_MODULES } from './modules.js';
import { SCHNELLE_FRAGEN } from './schnelleFragenBank.js';
import { flagEmoji, isFlagsCategory, pickFlagRound } from './flagsBank.js';
import { pickCompliment } from './compliments.js';
import { randomChallenge } from './challengeBank.js';
import './App.css';

// ---- Confirm singleton (no prop drilling) ----
// All components call appConfirm() directly; the root App wires up the setState.
let _confirmSetState = null;
function _initConfirm(fn) { _confirmSetState = fn; }
function appConfirm(msg, opts = {}) {
  if (!_confirmSetState) return Promise.resolve(false);
  return new Promise(resolve => {
    _confirmSetState({ msg, title: opts.title || 'Sicher?', destructive: opts.destructive !== false, okLabel: opts.okLabel, resolve });
  });
}

const EMOJI_AVATARS = ['🦁','🐻','🐺','🦊','🐯','🦅','🦍','🐂','🐉','🦈','⚔️','🔥','💪','🍺','🎸','🏍️','⚡','💀','🍻','🐗','🐲','🥃','🎯','🤘'];

// Pickable icons for custom competition modules. Bias toward sport / game / bar themes.
const MODULE_ICONS = ['🎯','🎳','🎱','🏓','🏐','🏀','⚽','🎾','🏈','🥏','🥅','🏑','🏏','🏌️','🎮','🎲','🃏','🧠','🚣','🧗','🏇','🏎️','🛹','🚴','🏹','🪁','🥊','🥋','🍻','🍺','🥃','🔥'];

// Configurable drinks: an event defines a list of drinks (emoji/label/points).
// Falls back to the legacy beer/mische config for events created before this.
const eventDrinks = (ev) => {
  if (Array.isArray(ev?.drinks) && ev.drinks.length) return ev.drinks;
  return [
    { id: 'beer', emoji: '🍺', label: ev?.beerLabel || 'Bier', points: ev?.pointsPerBeer ?? 1 },
    { id: 'mische', emoji: '🍷', label: ev?.drinkLabel || 'Mische', points: ev?.pointsPerMische ?? 1 },
  ];
};
// Count for a given drink id on a stats row (with legacy beer/mische fallback).
const drinkCount = (s, id) => {
  if (s?.counts && typeof s.counts === 'object' && s.counts[id] != null) return s.counts[id] || 0;
  if (id === 'beer') return s?.beer || 0;
  if (id === 'mische') return s?.mische || 0;
  return 0;
};
// Normalised counts map for a stats row.
const drinkCounts = (s, ev) => {
  const out = {};
  for (const d of eventDrinks(ev)) out[d.id] = drinkCount(s, d.id);
  return out;
};
const totalDrinkCount = (s, ev) => eventDrinks(ev).reduce((n, d) => n + drinkCount(s, d.id), 0);

const computeDrinkPoints = (s, ev) =>
  eventDrinks(ev).reduce((total, d) => total + drinkCount(s, d.id) * (Number(d.points) || 0), 0);

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

// Peer challenges: a player earns `reward` when a challenge assigned to them
// is marked done, and loses `penalty` when it's marked failed. Open challenges
// don't count yet.
const computeChallengePoints = (userId, challenges) => {
  if (!Array.isArray(challenges)) return 0;
  let total = 0;
  for (const c of challenges) {
    const reward = Number(c.reward) || 0;
    if (c.status === 'done') {
      if (c.toUser === userId) total += reward;
      // Secret challenge: the proposer pays the reward out of their own points.
      if (c.secret && c.fromUser === userId) total -= reward;
    } else if (c.status === 'failed') {
      if (c.toUser === userId) total -= Number(c.penalty) || 0;
    }
  }
  return total;
};

const computeTotalPoints = (userId, s, ev, flunky, customModules, jeopardy, challenges) =>
  computeDrinkPoints(s, ev)
  + computeFlunkyPoints(userId, flunky)
  + computeCustomPoints(userId, customModules)
  + computeJeopardyPoints(userId, jeopardy)
  + computeChallengePoints(userId, challenges);

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
  // Timestamp of the last LOCAL jeopardy write. The poll backstop uses this to
  // avoid clobbering an optimistic move that hasn't round-tripped yet (which
  // made tiles flash open→closed).
  const jeopardyWriteRef = useRef(0);
  // Server-side round generation in progress (shows a blocking overlay). The
  // round is built + saved on the backend, so this can clear when the new
  // round lands via realtime even if the request itself dropped.
  const [jeoGenerating, setJeoGenerating] = useState(false);
  const jeoGenRoundsRef = useRef(0); // rounds count when generation started
  const [kitty, setKitty] = useState(null);
  const kittyRef = useRef(null);
  useEffect(() => { kittyRef.current = kitty; }, [kitty]);
  const [schnelleFragen, setSchnelleFragen] = useState(null);
  const schnelleFragenRef = useRef(null);
  useEffect(() => { schnelleFragenRef.current = schnelleFragen; }, [schnelleFragen]);
  const [customModules, setCustomModules] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const scheduleRef = useRef(null);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  const [polls, setPolls] = useState([]);
  const [pollVotes, setPollVotes] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [wines, setWines] = useState([]);
  const [wineRatings, setWineRatings] = useState([]);
  // Tracks the latest optimistic values for my own drink stats so realtime
  // echoes (PB broadcasts our own writes back) don't cause flicker. Updated
  // by DrinksBar on every bump; cleared on event switch.
  const myOptRef = useRef({ counts: {} });
  const [allEvents, setAllEvents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [view, setView] = useState('home');
  const [toolOpen, setToolOpen] = useState(null); // open tool id within the Tools tab (lifted so the top-bar back button is context-aware)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moduleTab, setModuleTab] = useState('overview');
  const [moduleSettingsOpen, setModuleSettingsOpen] = useState(null); // module id or null
  const [wineFactJump, setWineFactJump] = useState(null); // fact index from a fun-fact push
  const [detailUserId, setDetailUserId] = useState(null);
  const [authView, setAuthView] = useState('login');
  const [lobbyView, setLobbyView] = useState('list');
  const [toast, setToast] = useState(null);
  const [confirmDlg, setConfirmDlg] = useState(null);

  // Wire the confirm singleton to this component's state.
  useEffect(() => { _initConfirm(setConfirmDlg); return () => _initConfirm(null); }, []);

  const showToast = (msg) => {
    setToast({ msg, id: Date.now() });
    // Clear after animation completes (2.8s) + small buffer
    setTimeout(() => setToast(t => (t && Date.now() - t.id >= 2600) ? null : t), 3000);
  };

  const showEventNotification = useCallback(async (eventName, kind) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const icon = `${window.location.origin}${import.meta.env.BASE_URL}pwa-192x192.png`;
    const isStart = kind === 'start';
    const title = isStart ? 'Event gestartet! 🍻' : 'Event pausiert ⏸';
    const body = isStart
      ? `${eventName} ist jetzt aktiv — es geht los! 🎉`
      : `${eventName} wurde pausiert. Stand wird festgehalten.`;
    const opts = { body, icon, badge: icon, tag: `event-${kind}`, renotify: true };
    try {
      const sw = await navigator.serviceWorker?.ready;
      if (sw?.showNotification) { sw.showNotification(title, opts); return; }
    } catch { /* no sw */ }
    try { new Notification(title, opts); } catch { /* permission or unsupported */ }
  }, []);

  useEffect(() => pb.authStore.onChange(() => setMe(pb.authStore.record)), []);

  // Web-Push: once logged in with notification permission granted, make sure
  // this device has a push subscription registered (idempotent).
  useEffect(() => {
    if (!me?.id) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      ensurePushSubscription();
    }
  }, [me?.id]);

  // Deep links from push notifications: /?event=<id>&goto=challenges|jeopardy|kitty
  // Applied once on boot (cold launch via notification tap) and whenever the
  // already-running app gets a navigate message from the service worker.
  const applyDeepLink = useCallback((urlOrSearch) => {
    try {
      const params = typeof urlOrSearch === 'string'
        ? new URL(urlOrSearch, window.location.origin).searchParams
        : urlOrSearch;
      const goto = params.get('goto');
      const evId = params.get('event');
      // Event-less admin deep-link (e.g. new-signup push → user management).
      if (!evId) {
        if (goto === 'users') { setView('users'); return true; }
        return false;
      }
      setCurrentEventId(evId);
      if (goto === 'kitty') { setView('tools'); setToolOpen('kitty'); }
      else if (goto) {
        setView('home'); setModuleTab(goto);
        // Fun-fact push deep-links straight to a specific fact in the wine module.
        if (goto === 'wine' && params.get('fact') != null) setWineFactJump(Number(params.get('fact')));
      }
      else { setView('home'); setModuleTab('overview'); }
      return true;
    } catch { return false; }
  }, []);

  useEffect(() => {
    if (!me?.id) return;
    // Cold launch: consume the deep link from the URL, then clean it up so a
    // reload doesn't re-apply it.
    if (applyDeepLink(new URLSearchParams(window.location.search))) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    const onMsg = (e) => {
      if (e.data?.type === 'push-navigate' && e.data.url) applyDeepLink(e.data.url);
    };
    navigator.serviceWorker?.addEventListener?.('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener?.('message', onMsg);
  }, [me?.id, applyDeepLink]);

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
      setCurrentEvent(null); setEventMembers([]); setStatsMap({}); setFlunky(null); setJeopardy(null); setKitty(null); setSchnelleFragen(null); setCustomModules([]); setSchedule(null); setPolls([]); setPollVotes([]); setChallenges([]); setWines([]); setWineRatings([]);
      return;
    }
    // Fetch the event first. ONLY a genuinely missing event (404) kicks the
    // user back to the lobby — a transient failure of any sub-fetch must not.
    let ev;
    try {
      ev = await getEvent(currentEventId);
    } catch (e) {
      if (e?.status === 404) { setCurrentEventId(null); }
      else { console.warn('refreshCurrentEvent: getEvent failed (kept)', e); }
      return;
    }
    setCurrentEvent(ev);
    // Sub-fetches: each tolerates its own failure, never resets the event.
    const safe = (p, fallback) => p.catch(() => fallback);
    try {
      const [members, stats, fl, je, kt, sf, cms, sc, pl, pv, ch, wn, wr] = await Promise.all([
        safe(listEventMembers(currentEventId), []),
        safe(loadEventStats(currentEventId), {}),
        safe(getFlunky(currentEventId), null),
        safe(getJeopardy(currentEventId), null),
        safe(getKitty(currentEventId), null),
        safe(getSchnelleFragen(currentEventId), null),
        safe(listCustomModules(currentEventId), []),
        safe(getSchedule(currentEventId), null),
        safe(listPolls(currentEventId), []),
        safe(listPollVotes(currentEventId), []),
        safe(listChallenges(currentEventId), []),
        safe(listWines(currentEventId), []),
        safe(listWineRatings(currentEventId), []),
      ]);
      setEventMembers(members); setStatsMap(stats);
      setFlunky(fl); setJeopardy(je); setKitty(kt); setSchnelleFragen(sf); setCustomModules(cms);
      setSchedule(sc); setPolls(pl); setPollVotes(pv); setChallenges(ch);
      setWines(wn); setWineRatings(wr);
    } catch (e) {
      console.warn('refreshCurrentEvent sub-fetch', e);
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
    myOptRef.current = { counts: {} };
  }, [refreshCurrentEvent]);

  // Sync own-optimistic baseline from initial / refreshed stats
  useEffect(() => {
    const mine = statsMap[me?.id];
    if (mine) myOptRef.current = { counts: { ...drinkCounts(mine, eventRef.current) } };
  }, [statsMap, me?.id]);

  // Stable realtime handler — applies records incrementally, no refetch storm.
  const realtimeHandler = useCallback((collection, ev) => {
    const rec = ev.record;
    if (!rec) return;
    const myId = pb.authStore.record?.id;

    if (collection === 'events') {
      if (ev.action === 'delete') { setCurrentEventId(null); return; }
      const wasActive = eventRef.current?.active;
      setCurrentEvent(prev => {
        const next = prev ? { ...prev, ...rec } : rec;
        eventRef.current = next;
        return next;
      });
      const evName = rec.name || eventRef.current?.name || 'Event';
      if (!wasActive && rec.active) showEventNotification(evName, 'start');
      else if (wasActive && !rec.active) showEventNotification(evName, 'pause');
      return;
    }

    if (collection === 'stats') {
      if (ev.action === 'delete') {
        setStatsMap(m => { const c = { ...m }; delete c[rec.user]; return c; });
        return;
      }
      // Skip our own write echo if the broadcast matches what we optimistically already show.
      // Different values would mean an external change (e.g., admin reset) — accept those.
      const recCounts = (rec.counts && typeof rec.counts === 'object') ? rec.counts : { beer: rec.beer || 0, mische: rec.mische || 0 };
      if (rec.user === myId) {
        const opt = myOptRef.current?.counts || {};
        if (JSON.stringify(recCounts) === JSON.stringify(opt)) return;
        myOptRef.current = { counts: { ...recCounts } };
      }
      setStatsMap(m => ({ ...m, [rec.user]: { id: rec.id, beer: rec.beer || 0, mische: rec.mische || 0, counts: recCounts, log: Array.isArray(rec.log) ? rec.log : (m[rec.user]?.log || []) } }));
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
        // Ignore out-of-order/stale events: never apply a record older than
        // what we already show (server `updated` is monotonic per record).
        // This stops a late echo from reverting a fresher state.
        if (prev && prev.updated && rec.updated && rec.updated < prev.updated) return prev;
        const next = prev ? { ...prev, ...rec } : rec;
        jeopardyRef.current = next;
        return next;
      });
      return;
    }

    if (collection === 'kitty') {
      setKitty(prev => {
        const next = prev ? { ...prev, ...rec } : rec;
        kittyRef.current = next;
        return next;
      });
      return;
    }

    if (collection === 'schnelle_fragen') {
      setSchnelleFragen(prev => {
        const next = prev ? { ...prev, ...rec } : rec;
        schnelleFragenRef.current = next;
        return next;
      });
      return;
    }

    if (collection === 'schedule') {
      setSchedule(prev => {
        const next = prev ? { ...prev, ...rec } : rec;
        scheduleRef.current = next;
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

    if (collection === 'polls') {
      setPolls(prev => {
        if (ev.action === 'delete') return prev.filter(p => p.id !== rec.id);
        const idx = prev.findIndex(p => p.id === rec.id);
        if (idx === -1) return [rec, ...prev];
        const copy = [...prev]; copy[idx] = { ...copy[idx], ...rec }; return copy;
      });
      return;
    }

    if (collection === 'challenges') {
      setChallenges(prev => {
        if (ev.action === 'delete') return prev.filter(c => c.id !== rec.id);
        const idx = prev.findIndex(c => c.id === rec.id);
        if (idx === -1) return [rec, ...prev];
        const copy = [...prev]; copy[idx] = { ...copy[idx], ...rec }; return copy;
      });
      return;
    }

    if (collection === 'wines') {
      setWines(prev => {
        if (ev.action === 'delete') return prev.filter(w => w.id !== rec.id);
        const idx = prev.findIndex(w => w.id === rec.id);
        if (idx === -1) return [rec, ...prev];
        const copy = [...prev]; copy[idx] = { ...copy[idx], ...rec }; return copy;
      });
      return;
    }

    if (collection === 'wine_ratings') {
      // Ratings only carry the wine id; refetch all ratings for the event.
      const eid = eventRef.current?.id;
      if (eid) listWineRatings(eid).then(setWineRatings).catch(() => {});
      return;
    }

    if (collection === 'poll_votes') {
      // Votes only carry the poll id; refetch all votes for the event.
      const eid = eventRef.current?.id;
      if (eid) listPollVotes(eid).then(setPollVotes).catch(() => {});
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
  }, [showEventNotification]);

  useEffect(() => {
    if (!currentEventId) return;
    let unsub;
    subscribeEvent(currentEventId, realtimeHandler).then(fn => { unsub = fn; });
    return () => { if (unsub) unsub(); };
  }, [currentEventId, realtimeHandler]);

  // Resilience: PocketBase's realtime (SSE) can silently die on mobile —
  // backgrounding the app, a network blip, or a flaky connection — and then a
  // tile someone else opened never arrives until the app is killed + reopened.
  // Two safety nets:
  //  (a) When the app returns to the foreground (or the network comes back),
  //      proactively refresh the auth token (prevents random sign-outs from an
  //      expired token) and re-pull the current event so any missed realtime
  //      events are caught up.
  //  (b) While a Jeopardy round is live, poll the jeopardy record every few
  //      seconds as a backstop so the board self-heals within seconds even if
  //      realtime is dead for one player.
  useEffect(() => {
    if (!me?.id) return;
    let last = 0;
    const onForeground = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < 1500) return; // debounce focus/visibility/online storms
      last = now;
      if (pb.authStore.isValid) {
        pb.collection('users').authRefresh().catch(() => {});
      }
      if (eventRef.current?.id) refreshCurrentEvent();
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);
    window.addEventListener('online', onForeground);
    return () => {
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onForeground);
      window.removeEventListener('online', onForeground);
    };
  }, [me?.id, refreshCurrentEvent]);

  // (b) Jeopardy poll backstop — only runs while a round is unfinished.
  const jeopardyRoundLive = (() => {
    const rs = jeopardy?.rounds || [];
    const last = rs[rs.length - 1];
    return !!(last && !last.finishedAt);
  })();
  useEffect(() => {
    if (!currentEventId || !jeopardyRoundLive) return;
    // Backstop for when realtime (SSE) is slow/dropping. Apply the server copy
    // ONLY when it's strictly newer than what we already show (by the record's
    // monotonic `updated`). Optimistic local moves don't bump `updated`, so an
    // in-flight move is NEVER reverted by the poll (that was the "tile closes
    // again" / "Richtig does nothing" bug). Poll fast so others see moves
    // within ~2s even if realtime is dead.
    const id = setInterval(async () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      try {
        const fresh = await getJeopardy(currentEventId);
        if (!fresh) return;
        const cur = jeopardyRef.current;
        const curUpd = cur?.updated || '';
        if (!curUpd || (fresh.updated && fresh.updated > curUpd)) {
          jeopardyRef.current = fresh; setJeopardy(fresh);
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(id);
  }, [currentEventId, jeopardyRoundLive]);

  // While a round is being generated server-side, poll for it to appear (works
  // even before any round exists, and even if the start-round request dropped
  // because the phone was locked). Clears the blocking overlay on arrival, with
  // a timeout fallback so it never hangs forever.
  useEffect(() => {
    if (!jeoGenerating || !currentEventId) return;
    let done = false;
    const check = async () => {
      try {
        const fresh = await getJeopardy(currentEventId);
        if (fresh && (fresh.rounds || []).length > jeoGenRoundsRef.current) {
          jeopardyRef.current = fresh; setJeopardy(fresh);
          done = true; setJeoGenerating(false);
        }
      } catch (_) {}
    };
    const id = setInterval(check, 3000);
    const timeout = setTimeout(() => { if (!done) setJeoGenerating(false); }, 140000);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, [jeoGenerating, currentEventId]);

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

  // ---- Unread / "something new" indicators ----------------------------
  // Per-module latest-activity timestamp (from each record's `updated`), vs a
  // per-device "last seen" map in localStorage. A module shows a red dot when
  // it changed since you last looked; opening it clears the dot.
  const moduleActivity = useMemo(() => {
    const maxUpd = (arr) => (Array.isArray(arr) ? arr : []).reduce((m, x) => (x && x.updated && x.updated > m ? x.updated : m), '');
    const act = {
      flunky: flunky?.updated || '',
      jeopardy: jeopardy?.updated || '',
      schnelle_fragen: schnelleFragen?.updated || '',
      schedule: schedule?.updated || '',
      challenges: maxUpd(challenges),
      wine: [maxUpd(wines), maxUpd(wineRatings)].sort().pop() || '',
      kitty: kitty?.updated || '',
      polls: maxUpd(polls),
    };
    for (const cm of (customModules || [])) act[`cm-${cm.id}`] = cm.updated || '';
    return act;
  }, [flunky, jeopardy, schnelleFragen, schedule, challenges, wines, wineRatings, kitty, polls, customModules]);
  const moduleActivityRef = useRef(moduleActivity);
  useEffect(() => { moduleActivityRef.current = moduleActivity; }, [moduleActivity]);

  const [seenMap, setSeenMap] = useState({});
  const seenKey = currentEventId && me?.id ? `boiz_seen_${currentEventId}_${me.id}` : null;
  useEffect(() => {
    if (!seenKey) { setSeenMap({}); return; }
    try { setSeenMap(JSON.parse(localStorage.getItem(seenKey) || '{}')); } catch { setSeenMap({}); }
  }, [seenKey]);

  const markSeen = useCallback((id) => {
    if (!id || !seenKey) return;
    const a = moduleActivityRef.current[id] || new Date().toISOString();
    setSeenMap(prev => {
      if (prev[id] === a) return prev;
      const next = { ...prev, [id]: a };
      try { localStorage.setItem(seenKey, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, [seenKey]);

  const isUnread = useCallback((id) => {
    const a = moduleActivity[id];
    return !!a && (!seenMap[id] || seenMap[id] < a);
  }, [moduleActivity, seenMap]);

  // The tab/tool you're currently looking at counts as seen (and keeps being
  // marked seen as fresh activity streams in while you watch).
  useEffect(() => {
    if (view === 'home' && moduleTab && moduleTab !== 'overview') markSeen(moduleTab);
  }, [view, moduleTab, moduleActivity, markSeen]);
  useEffect(() => {
    if (view === 'tools' && toolOpen) markSeen(toolOpen);
  }, [view, toolOpen, moduleActivity, markSeen]);

  // Roll-ups for the bottom nav (when you're NOT on that section).
  const gameModuleIds = ['flunky', 'jeopardy', 'schnelle_fragen', 'schedule', 'challenges', 'wine',
    ...(customModules || []).map(cm => `cm-${cm.id}`)];
  const homeUnread = gameModuleIds.some(id => id !== moduleTab && isUnread(id));
  const toolsUnread = ['kitty', 'polls'].some(id => isUnread(id) && !(view === 'tools' && toolOpen === id));

  // ---- Handlers ----
  const onLogin = async (email, password) => {
    // Transient failures (network blip, 5xx, a still-closing realtime socket
    // from a previous session) can make the first re-login attempt fail even
    // with correct credentials. Retry a couple of times with a short backoff;
    // only a genuine 400 (wrong credentials / not verified) fails fast.
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await login(email, password); showToast('Eingeloggt 🍻'); return; }
      catch (e) {
        lastErr = e;
        const status = e?.status || 0;
        if (status === 400 || status === 403) throw e; // credential/verify error — don't retry
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    throw lastErr;
  };
  const onRegister = async (data) => { await register(data); showToast('Fast fertig — bestätige deine E-Mail 📧'); };
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
    if (!await appConfirm('Alle Counter und Modul-Spiele dieses Events zurücksetzen?', { title: 'Reset?', destructive: false, okLabel: 'RESET' })) return;
    try {
      await resetEventStats(currentEvent.id);
      // Optimistic stats wipe so the UI updates before realtime echo arrives.
      setStatsMap(prev => {
        const next = {};
        for (const k of Object.keys(prev)) next[k] = { ...prev[k], beer: 0, mische: 0, counts: {}, log: [] };
        return next;
      });
      myOptRef.current = { counts: {} };

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
    if (!await appConfirm(`"${currentEvent.name}" verlassen?`, { title: 'Event verlassen?' })) return;
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

  // ---- Polls ----
  const onPollCreate = async ({ question, options, allowText }) => {
    try {
      await createPoll({
        event: currentEventId, question, options,
        allowText: !!allowText, closed: false,
        createdBy: me.id,
      });
      showToast('Umfrage erstellt 📊');
    } catch (e) { showToast(`Fehler: ${e?.status || ''} ${e?.message || ''}`); }
  };
  const onPollUpdate = async (id, patch) => {
    setPolls(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    try { await updatePoll(id, patch); }
    catch (e) { showToast('Fehler 😬'); refreshCurrentEvent(); }
  };
  const onPollDelete = async (id) => {
    if (!(await appConfirm('Umfrage wirklich löschen?'))) return;
    try { await deletePoll(id); setPolls(prev => prev.filter(p => p.id !== id)); showToast('Umfrage gelöscht'); }
    catch (e) { showToast('Fehler 😬'); }
  };
  const onVote = async (pollId, vote) => {
    // optimistic local upsert
    setPollVotes(prev => {
      const idx = prev.findIndex(v => v.poll === pollId && v.user === me.id);
      if (idx === -1) return [...prev, { id: `tmp-${pollId}`, poll: pollId, user: me.id, ...vote }];
      const copy = [...prev]; copy[idx] = { ...copy[idx], ...vote }; return copy;
    });
    try { await castVote(pollId, vote); }
    catch (e) { showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  // ---- Challenges (peer dares) ----
  // toUsers is an array: 1 entry for a single/random target, N for a group
  // challenge (one row per targeted member — reuses the normal per-target
  // scoring + resolution).
  const onChallengeCreate = async ({ toUsers, text, reward, secret = false, isPhoto = false }) => {
    const targets = (toUsers || []).filter(Boolean);
    if (targets.length === 0) return;
    try {
      await Promise.all(targets.map(t => createChallenge({ eventId: currentEventId, toUser: t, text, reward, secret, isPhoto })));
      showToast(secret ? '🤫 Geheime Challenge gestellt' : (targets.length > 1 ? `Gruppen-Challenge an ${targets.length} 🎯` : 'Challenge gestellt 🎯'));
    } catch (e) { showToast(`Fehler: ${e?.status || ''} ${e?.message || ''}`); }
  };
  const onChallengeResolve = async (id, patch) => {
    setChallenges(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    try { await updateChallenge(id, patch); }
    catch (e) { showToast('Fehler 😬'); refreshCurrentEvent(); }
  };
  const onChallengeDelete = async (id) => {
    if (!(await appConfirm('Challenge wirklich löschen?'))) return;
    try { await deleteChallenge(id); setChallenges(prev => prev.filter(c => c.id !== id)); showToast('Challenge gelöscht'); }
    catch (e) { showToast('Fehler 😬'); }
  };

  // ---- Weinwanderung ----
  const onWineCreate = async ({ name, note }) => {
    const clean = (name || '').trim();
    if (clean.length < 2) return;
    if (wines.some(w => (w.name || '').trim().toLowerCase() === clean.toLowerCase())) {
      showToast('Diesen Wein gibt es schon 🍷'); return;
    }
    try { await createWine({ eventId: currentEventId, name: clean, note }); showToast('Wein eingetragen 🍷'); }
    catch (e) { showToast(`Fehler: ${e?.status || ''} ${e?.message || ''}`); }
  };
  const onWineDelete = async (id) => {
    if (!(await appConfirm('Wein wirklich löschen? Alle Bewertungen gehen verloren.', { title: 'Wein löschen?', destructive: true }))) return;
    try { await deleteWine(id); setWines(prev => prev.filter(w => w.id !== id)); showToast('Wein gelöscht'); }
    catch (e) { showToast('Fehler 😬'); }
  };
  const onWineRate = async (wineId, rating) => {
    // optimistic upsert of my rating
    setWineRatings(prev => {
      const idx = prev.findIndex(r => r.wine === wineId && r.user === me.id);
      if (idx === -1) return [...prev, { id: `tmp-${wineId}`, wine: wineId, user: me.id, rating }];
      const copy = [...prev]; copy[idx] = { ...copy[idx], rating }; return copy;
    });
    try { await rateWine(wineId, rating); }
    catch (e) { showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  // Event-specific wishes saved on my membership row for the current event.
  const onSaveMyWishes = async (patch) => {
    const mine = eventMembers.find(m => m.expand?.user?.id === me.id || m.user === me.id);
    if (!mine) { showToast('Mitgliedschaft nicht gefunden'); return; }
    // optimistic
    setEventMembers(prev => prev.map(m => m.id === mine.id ? { ...m, ...patch } : m));
    try { await updateMembership(mine.id, patch); showToast('Wünsche gespeichert ✓'); }
    catch (e) { showToast('Fehler 😬'); refreshCurrentEvent(); }
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
    jeopardyWriteRef.current = Date.now(); // mark dirty so the poll backs off
    jeopardyRef.current = nextJ; setJeopardy(nextJ);
    try { await updateJeopardy(cur.id, patch); jeopardyWriteRef.current = Date.now(); }
    catch (e) { console.warn('jeopardy update', e); showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  const onJeopardyGenerate = async (categories, opts = {}) => {
    const surprise = !!opts.surprise;
    // Flag questions are built offline (the server has no flag bank) and sent
    // along; the slow AI generation + round creation + save happens server-side.
    const usedFlagCodes = [];
    for (const r of (jeopardyRef.current?.rounds || [])) {
      for (const q of (r.questions || [])) {
        if (q.type === 'flag' && q.flagCode) usedFlagCodes.push(q.flagCode);
      }
    }
    let flagQuestions = [];
    let aiCategories = [];
    if (!surprise) {
      const flagCats = categories.filter(isFlagsCategory);
      aiCategories = categories.filter(c => !isFlagsCategory(c));
      for (const cat of flagCats) {
        for (const f of pickFlagRound(usedFlagCodes)) {
          usedFlagCodes.push(f.code);
          flagQuestions.push({ category: cat, level: f.level, flagCode: f.code, q: 'Welches Land zeigt diese Flagge?', a: f.name });
        }
      }
    }

    // Fire and let it run server-side. Close the drawer + show a blocking
    // overlay; the round lands via realtime/poll even if this request drops
    // (phone locked/backgrounded) — the backend saves it regardless.
    jeoGenRoundsRef.current = (jeopardyRef.current?.rounds || []).length;
    setModuleSettingsOpen(null);
    setJeoGenerating(true);
    // Optimistically reflect the event going live for the host.
    const curEv = eventRef.current;
    if (curEv && !curEv.active) { const nextEv = { ...curEv, active: true }; eventRef.current = nextEv; setCurrentEvent(nextEv); }

    try {
      await startJeopardyRound(currentEventId, { categories, aiCategories, flagQuestions, surprise });
      await refreshCurrentEvent();
      setJeoGenerating(false);
      showToast('Neue Runde mit frischen Fragen 🎤');
    } catch (e) {
      if (e?.pending) {
        // Request dropped, but the server keeps generating + saving. Leave the
        // overlay up; the effect below clears it when the round arrives (or a
        // timeout fallback fires).
        showToast('Generierung läuft weiter — du kannst das Handy weglegen 😌');
        return;
      }
      setJeoGenerating(false);
      showToast(`Frage-Gen Fehler: ${e?.message?.slice?.(0, 80) || e}`);
    }
  };

  // Regenerate a single bad/wrong question on demand. Reuses the existing
  // generator for that one category and swaps the q/a in place (resetting the
  // attempt state) so play can continue with a fresh question.
  const onJeopardyRegenerate = async (ri, qi) => {
    const cur = jeopardyRef.current;
    const rounds = cur?.rounds || [];
    const q = rounds[ri]?.questions?.[qi];
    if (!q) return;
    // Collect everything used so the replacement doesn't repeat.
    const usedQA = []; const usedFlagCodes = [];
    for (const r of rounds) {
      for (const qq of (r.questions || [])) {
        if (qq.type === 'flag') { if (qq.flagCode) usedFlagCodes.push(qq.flagCode); }
        else { if (qq.q) usedQA.push(qq.q); if (qq.a) usedQA.push(qq.a); }
      }
    }
    let patchFields;
    try {
      if (q.type === 'flag') {
        const pick = pickFlagRound(usedFlagCodes).find(f => f.level === q.level) || pickFlagRound(usedFlagCodes)[0];
        if (!pick) throw new Error('keine Flagge');
        patchFields = { type: 'flag', flagCode: pick.code, q: 'Welches Land zeigt diese Flagge?', a: pick.name };
      } else {
        const board = await generateJeopardyBoard(currentEventId, [q.category], usedQA);
        const qs = board.questions || [];
        const chosen = qs.find(x => (Number(x.level) || 1) === q.level) || qs[0];
        if (!chosen) throw new Error('keine Frage');
        patchFields = { q: String(chosen.q || ''), a: String(chosen.a || ''), type: undefined, flagCode: undefined };
      }
    } catch (e) {
      showToast(`Neu-Generieren fehlgeschlagen: ${e?.message?.slice?.(0, 60) || e}`);
      throw e;
    }
    // Swap the question, reset its attempt state, keep it open + same dran.
    // Count regenerations so the UI can cap them (2× per question).
    const latest = jeopardyRef.current?.rounds || rounds;
    const next = latest.map((r, i) => i !== ri ? r : {
      ...r,
      questions: r.questions.map((x, j) => j !== qi ? x : {
        ...x, ...patchFields,
        winnerUserId: null, revealed: false, resolved: false, triedUsers: [], typedAnswer: '',
        regenCount: (x.regenCount || 0) + 1,
      }),
    });
    await onJeopardyPatch({ rounds: next });
    showToast('Neue Frage generiert 🔄');
  };

  const onKittyPatch = async (patch) => {
    let cur = kittyRef.current;
    if (!cur) {
      cur = await ensureKitty(currentEventId);
      kittyRef.current = cur; setKitty(cur);
    }
    const nextK = { ...cur, ...patch };
    kittyRef.current = nextK; setKitty(nextK);
    try { await updateKitty(cur.id, patch); }
    catch (e) { console.warn('kitty update', e); showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  const onSchnellePatch = async (patch) => {
    let cur = schnelleFragenRef.current;
    if (!cur) {
      cur = await ensureSchnelleFragen(currentEventId);
      schnelleFragenRef.current = cur; setSchnelleFragen(cur);
    }
    const nextS = { ...cur, ...patch };
    schnelleFragenRef.current = nextS; setSchnelleFragen(nextS);
    try { await updateSchnelleFragen(cur.id, patch); }
    catch (e) { console.warn('schnelle update', e); showToast('Fehler 😬'); refreshCurrentEvent(); }
  };

  // ---- Schedule / Programm ----
  const onSchedulePatch = async (patch) => {
    let cur = scheduleRef.current;
    if (!cur) {
      cur = await ensureSchedule(currentEventId);
      scheduleRef.current = cur; setSchedule(cur);
    }
    const next = { ...cur, ...patch };
    scheduleRef.current = next; setSchedule(next);
    try { await updateSchedule(cur.id, patch); }
    catch (e) { console.warn('schedule update', e); showToast('Fehler 😬'); refreshCurrentEvent(); }
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
    if (!await appConfirm('Modul wirklich löschen?', { title: 'Modul löschen?' })) return;
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
        {confirmDlg && <ConfirmDialog {...confirmDlg} />}
      </div>
    );
  }

  if (!me.verified) {
    return (
      <div className="ww-app">
        <GrainOverlay />
        <VerifyEmailScreen me={me} onLogout={onLogout} />
        {toast && <Toast toast={toast} />}
        {confirmDlg && <ConfirmDialog {...confirmDlg} />}
      </div>
    );
  }

  if (!me.approved && me.role !== 'admin') {
    return (
      <div className="ww-app">
        <GrainOverlay />
        <PendingApprovalScreen me={me} onLogout={onLogout} />
        {toast && <Toast toast={toast} />}
        {confirmDlg && <ConfirmDialog {...confirmDlg} />}
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
            if (!await appConfirm('Event wirklich löschen?', { title: 'Event löschen?' })) return;
            try { await deleteEvent(id); await refreshAllEvents(); showToast('Event gelöscht'); }
            catch (e) { showToast(`Löschen fehlgeschlagen: ${e?.status || ''} ${e?.message || ''}`); }
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
          onSetUserApproved={async (id, approved) => {
            setAllUsers(prev => prev.map(u => u.id === id ? { ...u, approved } : u));
            try {
              await setUserApproved(id, approved);
              showToast(approved ? 'User freigeschaltet ✓' : 'Freigabe entzogen');
              await refreshAllUsers();
            } catch (e) {
              showToast(`Fehler: ${e?.status || ''} ${e?.message || ''}`);
              await refreshAllUsers();
            }
          }}
          onDeleteUser={async (id) => {
            if (!await appConfirm('User wirklich löschen? Gilt global, alle Events.', { title: 'User löschen?' })) return;
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
        {confirmDlg && <ConfirmDialog {...confirmDlg} />}
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
          <WaitingScreen
            event={currentEvent} onLeave={onLeaveEvent}
            me={me} polls={polls} pollVotes={pollVotes} onVote={onVote}
            schedule={schedule} scheduleOn={(currentEvent.modules || []).includes('schedule')}
          />
        </main>
        {settingsOpen && (
          <ModuleSettingsDrawer title="⚙️ Event-Settings" onClose={() => setSettingsOpen(false)}>
            <NotAllowed onBack={() => setSettingsOpen(false)} />
          </ModuleSettingsDrawer>
        )}
        {toast && <Toast toast={toast} />}
        {confirmDlg && <ConfirmDialog {...confirmDlg} />}
      </div>
    );
  }

  return (
    <div className="ww-app">
      <GrainOverlay />
      <TopBar
        me={me} admin={admin} eventName={currentEvent.name} active={currentEvent.active}
        settingsActive={settingsOpen}
        backToTools={view === 'tools' && !!toolOpen}
        onToggleSettings={() => setSettingsOpen(v => !v)}
        onSwitchEvent={() => {
          // Context-aware back: inside an open tool, go back to the tool list
          // first instead of leaving the whole event.
          if (view === 'tools' && toolOpen) setToolOpen(null);
          else setCurrentEventId(null);
        }}
      />
      <main className="ww-main">
        {view === 'home' && (
          <HomeView
            me={me} admin={admin} event={currentEvent}
            members={eventMembers} statsMap={statsMap} setStatsMap={setStatsMap}
            flunky={flunky} onFlunkyPatch={onFlunkyPatch}
            jeopardy={jeopardy} onJeopardyPatch={onJeopardyPatch} onJeopardyGenerate={onJeopardyGenerate} onJeopardyRegenerate={onJeopardyRegenerate}
            kitty={kitty} onKittyPatch={onKittyPatch}
            schnelleFragen={schnelleFragen} onSchnellePatch={onSchnellePatch}
            schedule={schedule} onSchedulePatch={onSchedulePatch}
            challenges={challenges}
            onChallengeCreate={onChallengeCreate}
            onChallengeResolve={onChallengeResolve}
            onChallengeDelete={onChallengeDelete}
            wines={wines} wineRatings={wineRatings}
            onWineCreate={onWineCreate} onWineDelete={onWineDelete} onWineRate={onWineRate}
            customModules={customModules}
            onCustomCreate={onCustomCreate}
            onCustomPatch={onCustomPatch}
            onCustomDelete={onCustomDelete}
            modules={modules}
            onToggleModule={onToggleModule}
            moduleTab={moduleTab} setModuleTab={setModuleTab}
            moduleSettingsOpen={moduleSettingsOpen} setModuleSettingsOpen={setModuleSettingsOpen}
            onSaveEvent={onSaveEvent}
            onShowUserDetail={setDetailUserId}
            myOptRef={myOptRef}
            isUnread={isUnread}
            wineFactJump={wineFactJump}
            onWineFactJumpDone={() => setWineFactJump(null)}
          />
        )}
        {view === 'crew' && (
          <CrewView members={eventMembers} statsMap={statsMap} event={currentEvent} flunky={flunky} jeopardy={jeopardy} customModules={customModules} challenges={challenges} myId={me.id} onShowUserDetail={setDetailUserId} onSaveMyWishes={onSaveMyWishes} />
        )}
        {view === 'tools' && (
          <ToolsView
            me={me} admin={admin} event={currentEvent} members={eventMembers}
            kitty={kitty} onKittyPatch={onKittyPatch}
            onSaveEvent={onSaveEvent}
            polls={polls} pollVotes={pollVotes}
            onPollCreate={onPollCreate} onPollUpdate={onPollUpdate}
            onPollDelete={onPollDelete} onVote={onVote}
            open={toolOpen} setOpen={setToolOpen}
            isUnread={isUnread}
          />
        )}
      </main>
      <BottomNav view={view} setView={(v) => { setToolOpen(null); setView(v); }} homeUnread={homeUnread} toolsUnread={toolsUnread} />
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
                  if (!await appConfirm('Event endgültig löschen?', { title: 'Event löschen?' })) return;
                  const id = currentEvent.id;
                  // Close the drawer + leave the event UI first so a stale
                  // currentEvent can't crash the settings view mid-delete.
                  setSettingsOpen(false);
                  try {
                    await deleteEvent(id);
                    setCurrentEventId(null);
                    await refreshMemberships();
                    showToast('Event gelöscht');
                  } catch (e) {
                    showToast(`Löschen fehlgeschlagen: ${e?.status || ''} ${e?.message || ''}`);
                  }
                }}
                onKickMember={async (memberId) => {
                  if (!await appConfirm('User wirklich aus diesem Event entfernen?', { title: 'Aus Event entfernen?' })) return;
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
          membership={eventMembers.find(m => m.expand?.user?.id === detailUserId)}
          stats={statsMap[detailUserId]}
          event={currentEvent}
          flunky={flunky}
          jeopardy={jeopardy}
          customModules={customModules}
          isMe={detailUserId === me.id}
          onClose={() => setDetailUserId(null)}
        />
      )}
      {jeoGenerating && <JeoGeneratingOverlay />}
      {toast && <Toast toast={toast} />}
      {confirmDlg && <ConfirmDialog {...confirmDlg} />}
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

function PendingApprovalScreen({ me, onLogout }) {
  return (
    <div className="ww-pending">
      <div className="ww-pending-card">
        <div className="ww-pending-emoji">⏳</div>
        <h2 className="ww-pending-title">Fast geschafft, {me.displayName || 'Boi'}!</h2>
        <p className="ww-pending-text">
          Dein Account wartet auf Freigabe durch einen Admin.
          Sobald du freigeschaltet bist, geht's los. 🍺
        </p>
        <button className="ww-text-btn" onClick={onLogout}><LogOut size={14} /> Abmelden</button>
      </div>
    </div>
  );
}

function VerifyEmailScreen({ me, onLogout }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    setBusy(true); setMsg('');
    try { await requestVerification(me.email); setMsg('✓ Bestätigungs-Mail erneut verschickt — schau in deine Inbox (auch Spam).'); }
    catch (_) { setMsg('Konnte Mail nicht erneut senden.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="ww-pending">
      <div className="ww-pending-card">
        <div className="ww-pending-emoji">📧</div>
        <h2 className="ww-pending-title">Bestätige deine E-Mail</h2>
        <p className="ww-pending-text">
          Wir haben dir einen Link an <b>{me.email}</b> geschickt. Klick ihn an,
          danach geht's weiter. (Schau auch im Spam-Ordner.)
        </p>
        {msg && <div className={msg.startsWith('✓') ? 'ww-notif-banner-ok' : 'ww-err'}>{msg}</div>}
        <button className="ww-big-cta" onClick={resend} disabled={busy} style={{ marginTop: 4 }}>
          {busy ? <span className="ww-spinner" /> : <Mail size={18} />}<span>MAIL ERNEUT SENDEN</span>
        </button>
        <button className="ww-text-btn" onClick={onLogout}><LogOut size={14} /> Abmelden</button>
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
        {view === 'login' ? <LoginForm onSubmit={onLogin} /> : <RegisterForm onSubmit={onRegister} onGoLogin={() => setView('login')} />}
      </div>
    </div>
  );
}

function LoginForm({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const valid = email.includes('@') && password.length >= 8;
  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr('');
    try { await onSubmit(email.trim(), password); }
    catch (e) {
      // PocketBase returns the verification-gate message in the response
      const msg = e?.response?.message || e?.message || '';
      if (/bestätige|verif/i.test(msg)) {
        setErr('E-Mail noch nicht bestätigt — schau in deine Inbox (auch Spam).');
      } else {
        setErr('Login fehlgeschlagen — falsche Daten?');
      }
    }
    finally { setBusy(false); }
  };
  const doReset = async () => {
    if (!email.includes('@')) { setResetMsg('Gib zuerst deine E-Mail ein.'); return; }
    setBusy(true); setResetMsg('');
    try {
      await requestPasswordReset(email.trim());
      setResetMsg('✓ E-Mail verschickt — folge dem Link zum Zurücksetzen.');
    } catch (e) {
      setResetMsg('Konnte keine E-Mail verschicken (E-Mail evtl. unbekannt).');
    } finally { setBusy(false); }
  };

  if (resetMode) {
    return (
      <div>
        <label className="ww-label"><Mail size={12} /> E-MAIL</label>
        <input className="ww-input" type="email" autoComplete="email" placeholder="deine@email.de" value={email} onChange={e => setEmail(e.target.value)} />
        {resetMsg && <div className={resetMsg.startsWith('✓') ? 'ww-notif-banner-ok' : 'ww-err'} style={{ marginTop: 8 }}>{resetMsg}</div>}
        <button className={`ww-big-cta ${email.includes('@') && !busy ? '' : 'disabled'}`} onClick={doReset} disabled={!email.includes('@') || busy}>
          {busy ? <span className="ww-spinner" /> : <Mail size={18} />}<span>RESET-LINK SENDEN</span>
        </button>
        <button className="ww-text-btn" onClick={() => { setResetMode(false); setResetMsg(''); }}>
          <ArrowLeft size={14} /> zurück zum Login
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="ww-label"><Mail size={12} /> E-MAIL</label>
      <input className="ww-input" type="email" autoComplete="email" placeholder="deine@email.de" value={email} onChange={e => setEmail(e.target.value)} />
      <label className="ww-label"><Lock size={12} /> PASSWORT</label>
      <input className="ww-input" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
      {err && <div className="ww-err">{err}</div>}
      <button className={`ww-big-cta ${valid && !busy ? '' : 'disabled'}`} onClick={submit} disabled={!valid || busy}>
        {busy ? <span className="ww-spinner" /> : <Check size={20} />}<span>{busy ? 'EINLOGGEN…' : 'EINLOGGEN'}</span>
      </button>
      <button className="ww-text-btn" onClick={() => { setResetMode(true); setErr(''); }} style={{ color: 'var(--muted)' }}>
        Passwort vergessen?
      </button>
    </div>
  );
}

function RegisterForm({ onSubmit, onGoLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_AVATARS[0]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const valid = email.includes('@') && password.length >= 8 && displayName.trim().length >= 2;
  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr('');
    try {
      await onSubmit({
        email: email.trim(), password,
        displayName: displayName.trim(), emoji,
      });
      setDone(true);
    } catch (e) {
      setErr(e?.response?.data
        ? Object.values(e.response.data).map(v => v.message).join(' / ')
        : 'Registrierung fehlgeschlagen');
    } finally { setBusy(false); }
  };
  const resend = async () => {
    setResendMsg('');
    try { await requestVerification(email.trim()); setResendMsg('✓ Bestätigungs-Mail erneut verschickt.'); }
    catch (_) { setResendMsg('Konnte Mail nicht erneut senden.'); }
  };

  if (done) {
    return (
      <div className="ww-verify-done">
        <div className="ww-verify-emoji">📧</div>
        <h3 className="ww-verify-title">Bestätige deine E-Mail</h3>
        <p className="ww-verify-text">
          Wir haben dir einen Link an <b>{email.trim()}</b> geschickt. Klick ihn an,
          danach kannst du dich einloggen. (Schau auch im Spam-Ordner.)
        </p>
        <p className="ww-verify-text" style={{ color: 'var(--muted-2)', fontSize: 12 }}>
          Danach muss dich noch ein Admin freischalten, bevor du loslegen kannst.
        </p>
        {resendMsg && <div className={resendMsg.startsWith('✓') ? 'ww-notif-banner-ok' : 'ww-err'} style={{ marginTop: 4 }}>{resendMsg}</div>}
        <button className="ww-big-cta" onClick={onGoLogin} style={{ marginTop: 12 }}>
          <Check size={18} /><span>ZUM LOGIN</span>
        </button>
        <button className="ww-text-btn" onClick={resend}>Mail erneut senden</button>
      </div>
    );
  }
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
      <p className="ww-muted" style={{ fontSize: 11, marginTop: 6 }}>
        Essens- & Getränke-Wünsche trägst du später pro Event im Crew-Tab ein.
      </p>
      {err && <div className="ww-err">{err}</div>}
      <button className={`ww-big-cta ${valid && !busy ? '' : 'disabled'}`} onClick={submit} disabled={!valid || busy}>
        {busy ? <span className="ww-spinner" /> : <UserPlus size={20} />}<span>{busy ? 'ERSTELLE…' : 'SQUAD BEITRETEN'}</span>
      </button>
    </div>
  );
}

// ============================================================
// Lobby
// ============================================================

function Lobby({
  me, memberships, allEvents, allUsers, view, setView, onPick, onJoin, onCreate,
  onLogout, onSaveProfile, onDeleteEvent, onToggleActiveAdmin, onSetUserRole, onDeleteUser, onSetUserApproved,
}) {
  const siteAdmin = isSiteAdmin(me);
  const canCreate = isHost(me);
  const onProfile = view === 'profile';
  return (
    <div className="ww-auth">
      <div className="ww-auth-fixed">
        <div className="ww-lobby-top">
          <div className="ww-auth-header" style={{ flex: 1 }}>
            <div className="ww-tag">SERVUS, {(me.displayName || me.email).toUpperCase()}</div>
            <h1 className="ww-display ww-title-huge">{onProfile ? 'Profil' : 'Events'}</h1>
            {!onProfile && <p className="ww-muted">Tritt einem Event bei{canCreate ? ' oder erstelle ein neues' : ''}.</p>}
          </div>
          <button
            className={`ww-avatar-btn ${onProfile ? 'active' : ''}`}
            onClick={() => setView(onProfile ? 'list' : 'profile')}
            aria-label="Profil"
            title="Profil & Einstellungen"
          >
            {me.emoji || '🍺'}
          </button>
        </div>
        {!onProfile && (
          <div className="ww-auth-tabs">
            <button className={`ww-auth-tab ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>MEINE</button>
            <button className={`ww-auth-tab ${view === 'join' ? 'active' : ''}`} onClick={() => setView('join')}>JOIN</button>
            {canCreate && <button className={`ww-auth-tab ${view === 'create' ? 'active' : ''}`} onClick={() => setView('create')}>NEU</button>}
            {siteAdmin && <button className={`ww-auth-tab ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>ALLE</button>}
            {siteAdmin && <button className={`ww-auth-tab ${view === 'users' ? 'active' : ''}`} onClick={() => setView('users')}>USER</button>}
          </div>
        )}
      </div>
      <div className="ww-auth-scroll">
        {!onProfile && (
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
                          <div className="ww-muted" style={{ fontSize: 11 }}>{formatEventDates(ev)} · CODE {ev.code}</div>
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
              <AdminAllUsers me={me} users={allUsers} onSetRole={onSetUserRole} onDelete={onDeleteUser} onSetApproved={onSetUserApproved} />
            )}
          </>
        )}
        {onProfile && <ProfileView me={me} onSave={onSaveProfile} onLogout={onLogout} />}
      </div>
    </div>
  );
}

function AdminAllUsers({ me, users, onSetRole, onDelete, onSetApproved }) {
  if (users.length === 0) return <p className="ww-muted">Lade…</p>;
  const others = users.filter(u => u.id !== me.id);
  const pending = others.filter(u => !u.approved && u.role !== 'admin');
  const renderRow = (u) => (
    <div key={u.id} className="ww-user-mgmt-row">
      <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
      <span className="ww-user-mgmt-name">
        {u.displayName || u.email}
        {u.role === 'admin' && <span className="ww-admin-badge"><ShieldCheck size={9} /> ADMIN</span>}
        {u.role === 'host' && <span className="ww-host-badge"><Shield size={9} /> HOST</span>}
        {!u.approved && u.role !== 'admin' && <span className="ww-pending-badge">WARTET</span>}
        {!u.verified && <span className="ww-pending-badge" style={{ background: 'var(--muted-2)', color: '#fff' }}>UNVERIFIZIERT</span>}
      </span>
      {!u.approved && u.role !== 'admin' ? (
        <button className="ww-mini-btn green" onClick={() => onSetApproved(u.id, true)} title="Freischalten">
          <Check size={13} /> OK
        </button>
      ) : (
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
      )}
      <button className="ww-mini-btn red" onClick={() => onDelete(u.id)} title="User löschen"><X size={12} /></button>
    </div>
  );
  return (
    <div>
      {pending.length > 0 && (
        <div className="ww-pending-block">
          <p className="ww-label" style={{ marginTop: 0 }}>⏳ WARTEN AUF FREIGABE ({pending.length})</p>
          <div className="ww-user-mgmt">{pending.map(renderRow)}</div>
        </div>
      )}
      <p className="ww-muted" style={{ fontSize: 12 }}>
        Alle registrierten User. Tap auf <b>M</b> / <b>H</b> / <b>A</b> setzt die Rolle:
        Member kann nur joinen, Host darf Events erstellen, Admin alles.
      </p>
      <div className="ww-user-mgmt">
        {others.filter(u => u.approved || u.role === 'admin').map(renderRow)}
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
        {busy ? <span className="ww-spinner" /> : <Check size={20} />}<span>{busy ? 'JOINEN…' : 'JOIN'}</span>
      </button>
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [openEnded, setOpenEnded] = useState(false);
  const [modules, setModules] = useState(['drinks']);
  const [customModulesDraft, setCustomModulesDraft] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [addModOpen, setAddModOpen] = useState(false);
  const valid = name.trim().length >= 2;
  const toggle = (id) => setModules(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const addCustomDraft = () => setAddModOpen(true);
  const removeCustomDraft = (i) => setCustomModulesDraft(arr => arr.filter((_, j) => j !== i));

  // Keep end ≥ start
  const onStartChange = (v) => {
    setDate(v);
    if (endDate && v && endDate < v) setEndDate(v);
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr('');
    const payload = openEnded
      ? { date: '', endDate: '' }
      : { date, endDate: endDate || date };
    try { await onSubmit({ name: name.trim(), ...payload, modules, customModules: customModulesDraft }); }
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
      <div className="ww-daterange-head">
        <label className="ww-label" style={{ margin: 0 }}>ZEITRAUM</label>
        <button
          type="button"
          className={`ww-chip-toggle ${openEnded ? 'on' : ''}`}
          onClick={() => setOpenEnded(v => !v)}
          aria-pressed={openEnded}
        >
          {openEnded ? <Check size={12} /> : null} Ohne festes Datum
        </button>
      </div>
      {openEnded ? (
        <p className="ww-muted" style={{ fontSize: 11, marginTop: 2 }}>
          Läuft unbegrenzt — z.B. für tägliche Spiele im selben Event.
        </p>
      ) : (
        <div className="ww-daterange">
          <div className="ww-daterange-field">
            <span className="ww-daterange-cap">VON</span>
            <input className="ww-input ww-input-date" type="date" value={date} onChange={e => onStartChange(e.target.value)} />
          </div>
          <span className="ww-daterange-sep">→</span>
          <div className="ww-daterange-field">
            <span className="ww-daterange-cap">BIS</span>
            <input className="ww-input ww-input-date" type="date" value={endDate} min={date || undefined} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
      )}
      <label className="ww-label">SPIELE</label>
      <div className="ww-modules">
        {GAME_MODULES.map(m => (
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
        {busy ? <span className="ww-spinner" /> : <Plus size={20} />}<span>{busy ? 'ERSTELLE…' : 'EVENT ERSTELLEN'}</span>
      </button>
      {addModOpen && (
        <AddCustomModuleDrawer
          onSubmit={({ name: n, mode, icon }) =>
            setCustomModulesDraft(arr => [...arr, { name: n, icon, mode, teamCount: 2, pointsPerWin: 3, totalSets: 3 }])
          }
          onClose={() => setAddModOpen(false)}
        />
      )}
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
              <div className="ww-muted" style={{ fontSize: 11 }}>{formatEventDates(ev)} · CODE {ev.code}</div>
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

function TopBar({ me, admin, eventName, active, settingsActive, backToTools, onToggleSettings, onSwitchEvent }) {
  return (
    <header className="ww-topbar">
      <div className="ww-topbar-left">
        <button
          className="ww-icon-btn"
          onClick={onSwitchEvent}
          aria-label={backToTools ? 'Zurück zu den Werkzeugen' : 'Andere Events'}
          title={backToTools ? 'Zurück zu den Werkzeugen' : 'Andere Events'}
        >
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

function WaitingScreen({ event, onLeave, me, polls = [], pollVotes = [], onVote, schedule, scheduleOn }) {
  const [notifPerm, setNotifPerm] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const requestPermission = async () => {
    const result = await Notification.requestPermission();
    setNotifPerm(result);
    if (result === 'granted') ensurePushSubscription();
  };
  const openPolls = (polls || []).filter(p => !p.closed);
  return (
    <div className="ww-waiting">
      <Hourglass size={64} className="ww-waiting-icon" />
      <h2 className="ww-display ww-title-big">Noch nicht gestartet</h2>
      <p className="ww-muted">
        Der Host hat <b>{event.name}</b> noch nicht aktiv gesetzt.<br />
        Sobald es losgeht, aktualisiert sich die App automatisch.
      </p>
      {notifPerm === 'default' && (
        <div className="ww-notif-banner">
          <button className="ww-big-cta" style={{ marginTop: 0, maxWidth: 300 }} onClick={requestPermission}>
            <Bell size={18} /><span>BENACHRICHTIGUNG ERLAUBEN</span>
          </button>
          <div className="ww-muted" style={{ fontSize: 11, textAlign: 'center' }}>
            Einmalige Erlaubnis — wir schicken nur wenn das Event startet.
          </div>
        </div>
      )}
      {notifPerm === 'granted' && (
        <div className="ww-notif-banner-ok">
          <Bell size={13} /><span>Benachrichtigung aktiv — du kriegst Bescheid wenn es losgeht.</span>
        </div>
      )}
      {scheduleOn && Array.isArray(schedule?.entries) && schedule.entries.length > 0 && (
        <div className="ww-waiting-polls">
          <div className="ww-section-head"><span>🗓️</span><h3>PROGRAMM</h3></div>
          <ScheduleView schedule={schedule} admin={false} onPatch={() => {}} eventStart={event.date} eventEnd={event.endDate} />
        </div>
      )}
      {openPolls.length > 0 && onVote && (
        <div className="ww-waiting-polls">
          <div className="ww-section-head"><span>📊</span><h3>UMFRAGEN</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {openPolls.map(p => (
              <PollCard
                key={p.id} poll={p} me={me} admin={false} members={[]}
                votes={pollVotes.filter(v => v.poll === p.id)}
                onVote={onVote} onUpdate={() => {}} onDelete={() => {}}
              />
            ))}
          </div>
        </div>
      )}
      <button className="ww-text-btn" onClick={onLeave}><X size={14} /> Event verlassen</button>
    </div>
  );
}

// ============================================================
// Home view: module tabs + content
// ============================================================

function HomeView({
  me, admin, event, members, statsMap, setStatsMap, flunky, onFlunkyPatch,
  jeopardy, onJeopardyPatch, onJeopardyGenerate, onJeopardyRegenerate,
  kitty, onKittyPatch,
  schnelleFragen, onSchnellePatch,
  schedule, onSchedulePatch,
  challenges, onChallengeCreate, onChallengeResolve, onChallengeDelete,
  wines, wineRatings, onWineCreate, onWineDelete, onWineRate,
  customModules, onCustomCreate, onCustomPatch, onCustomDelete,
  modules, onToggleModule, moduleTab, setModuleTab, moduleSettingsOpen, setModuleSettingsOpen,
  onSaveEvent, onShowUserDetail, myOptRef, isUnread = () => false,
  wineFactJump, onWineFactJumpDone,
}) {
  // 'drinks' is no longer a tab; it lives as the always-visible sticky bar.
  // Games are opt-in per event (modules array); tools are ALWAYS available.
  const gameTabs = GAME_MODULES
    .filter(m => modules.includes(m.id) && m.available && m.id !== 'drinks')
    // Programm/Tagesplan always comes first (right after the Stand tab).
    .sort((a, b) => (a.id === 'schedule' ? -1 : 0) - (b.id === 'schedule' ? -1 : 0));
  const customTabs = (customModules || []).map(cm => ({ id: `cm-${cm.id}`, name: cm.name || 'Modul', icon: cm.icon || '🎯', cm }));
  const drinksOn = modules.includes('drinks');
  const activeCustom = moduleTab?.startsWith?.('cm-')
    ? customModules.find(c => `cm-${c.id}` === moduleTab)
    : null;
  const [modulesOpen, setModulesOpen] = useState(false);
  const [addModOpen, setAddModOpen] = useState(false);

  // Scroll the main container back to top whenever the active tab changes
  // — otherwise content can render "behind" the sticky header strip.
  useEffect(() => {
    const main = document.querySelector('.ww-main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  }, [moduleTab]);

  return (
    <div className="ww-home">
      <div className="ww-event-banner">
        <div className="ww-tag">{formatEventDates(event)}</div>
        <h1 className="ww-display ww-title-big">{event.name}</h1>
      </div>

      <EventCodeCard event={event} />

      {drinksOn && (
        <DrinksBar
          me={me} event={event} statsMap={statsMap} setStatsMap={setStatsMap}
          admin={admin} active={event.active}
          onOpenSettings={() => setModuleSettingsOpen('drinks')}
          myOptRef={myOptRef}
        />
      )}

      <div className="ww-mod-tabs" style={drinksOn ? { top: 60 } : undefined}>
        <div className="ww-mod-tabs-scroll">
          <button className={`ww-mod-tab ${moduleTab === 'overview' ? 'active' : ''}`} onClick={() => setModuleTab('overview')}>
            <span className="ww-mod-tab-icon">📊</span>
            <span className="ww-mod-tab-name">Stand</span>
          </button>
          {[...gameTabs, ...customTabs].map(t => (
            <button key={t.id} className={`ww-mod-tab ${moduleTab === t.id ? 'active' : ''}`} onClick={() => setModuleTab(t.id)}>
              <span className="ww-mod-tab-icon">{t.icon}</span>
              <span className="ww-mod-tab-name">{t.name}</span>
              {moduleTab !== t.id && isUnread(t.id) && <span className="ww-unread-dot" aria-label="Neu" />}
            </button>
          ))}
        </div>
        {admin && (
          <button
            className="ww-mod-tab ww-tools-btn"
            onClick={() => setModulesOpen(true)}
            aria-label="Module verwalten"
            title="Module verwalten"
          >
            <span className="ww-mod-tab-icon">＋</span>
          </button>
        )}
      </div>

      {moduleTab === 'overview' && (
        <OverviewView me={me} event={event} members={members} statsMap={statsMap} flunky={flunky} jeopardy={jeopardy} customModules={customModules} challenges={challenges} onShowUserDetail={onShowUserDetail} />
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
          onJeopardyRegenerate={onJeopardyRegenerate}
          onOpenSettings={() => setModuleSettingsOpen('jeopardy')}
        />
      )}
      {moduleTab === 'schnelle_fragen' && (
        <SchnelleFragenView state={schnelleFragen} onPatch={onSchnellePatch} />
      )}
      {moduleTab === 'schedule' && (
        <ScheduleView schedule={schedule} admin={admin} onPatch={onSchedulePatch} eventStart={event.date} eventEnd={event.endDate} />
      )}
      {moduleTab === 'challenges' && (
        <ChallengesView
          me={me} admin={admin} members={members} challenges={challenges}
          onCreate={onChallengeCreate} onResolve={onChallengeResolve} onDelete={onChallengeDelete}
        />
      )}
      {moduleTab === 'wine' && (
        <WineView
          me={me} admin={admin} eventId={event.id} members={members} wines={wines} ratings={wineRatings}
          onCreate={onWineCreate} onDelete={onWineDelete} onRate={onWineRate}
          factJump={wineFactJump} onFactJumpDone={onWineFactJumpDone}
        />
      )}
      {/* Tools (team_split, kitty) live in their own bottom-nav "Tools"
          view (ToolsView), not in the games tab strip. */}
      {activeCustom && (
        <CustomModuleView
          me={me} mod={activeCustom} members={members} admin={admin} active={event.active}
          onPatch={(patch) => onCustomPatch(activeCustom.id, patch)}
          onOpenSettings={() => setModuleSettingsOpen(moduleTab)}
        />
      )}

      {modulesOpen && admin && (
        <ModuleSettingsDrawer title="＋ Module verwalten" onClose={() => setModulesOpen(false)}>
          <p className="ww-muted" style={{ fontSize: 12 }}>
            An/aus für alle. Tabs verschwinden bei den Spielern, wenn du ein Spiel deaktivierst.
          </p>
          <label className="ww-label" style={{ marginTop: 10 }}>SPIELE</label>
          <div className="ww-module-toggles">
            {GAME_MODULES.map(m => {
              const on = (modules || []).includes(m.id);
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

          <label className="ww-label" style={{ marginTop: 18 }}>CUSTOM MODULE</label>
          <div className="ww-module-toggles">
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
              onClick={() => setAddModOpen(true)}
            >
              <span className="ww-mod-icon"><Plus size={20} /></span>
              <span className="ww-mod-name">NEUES CUSTOM MODUL</span>
            </button>
          </div>
        </ModuleSettingsDrawer>
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

      {addModOpen && (
        <AddCustomModuleDrawer
          onSubmit={async ({ name, mode, icon }) => {
            await onCustomCreate({
              name, icon, mode,
              teamCount: 2, pointsPerWin: 3, totalSets: 3,
              teams: [], participants: [], sets: [],
            });
          }}
          onClose={() => setAddModOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Event code card (prominent share for hosts at top of Home)
// ============================================================

function EventCodeCard({ event }) {
  const [flash, setFlash] = useState(null);
  const code = event?.code || '';
  if (!code) return null;
  const shareUrl = `${location.origin}/?code=${encodeURIComponent(code)}`;
  const handle = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: event.name,
          text: `Join "${event.name}" mit Code ${code}`,
          url: shareUrl,
        });
        setFlash('Geteilt ✓');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        setFlash('Code kopiert ✓');
      }
    } catch (_) { /* user dismissed share sheet — silently ignore */ }
    if (flash !== null) return;
    setTimeout(() => setFlash(null), 1500);
  };
  return (
    <button className="ww-event-code-card" onClick={handle}>
      <div className="ww-event-code-card-left">
        <div className="ww-event-code-card-label">JOIN-CODE</div>
        <div className="ww-event-code-card-val">{code}</div>
      </div>
      <div className="ww-event-code-card-cta">
        {flash || (navigator.share ? '📤 Teilen' : '📋 Kopieren')}
      </div>
    </button>
  );
}

// ============================================================
// Team Split tool — random crew into N teams (kein Scoring)
// ============================================================

function TeamSplitView({ event, members, admin, onSaveEvent }) {
  const tools = event.tools || {};
  const saved = tools.team_split || { n: 2, teams: [] };
  const [n, setN] = useState(saved.n || 2);

  useEffect(() => { setN(saved.n || 2); }, [event.id]);

  const usersById = useMemo(() => {
    const m = {};
    for (const mem of members) if (mem.expand?.user) m[mem.expand.user.id] = mem.expand.user;
    return m;
  }, [members]);

  const shuffle = () => {
    if (!admin) return;
    const ids = members.map(m => m.expand?.user?.id).filter(Boolean);
    const shuffled = ids.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
    const N = Math.max(2, Math.min(10, Number(n) || 2));
    const teams = Array.from({ length: N }, () => []);
    shuffled.forEach((id, i) => teams[i % N].push(id));
    onSaveEvent({ tools: { ...tools, team_split: { n: N, teams } } });
  };

  const clear = () => {
    if (!admin) return;
    onSaveEvent({ tools: { ...tools, team_split: { n: Number(n) || 2, teams: [] } } });
  };

  return (
    <>
      <p className="ww-muted" style={{ fontSize: 12 }}>
        Tool: zufällige Aufteilung der Crew in Teams. Kein Scoring, fließt nicht ins Leaderboard.
      </p>

      {admin && (
        <>
          <label className="ww-label">ANZAHL TEAMS</label>
          <div className="ww-grid2" style={{ gridTemplateColumns: '1fr auto auto' }}>
            <input className="ww-input" type="number" min={2} max={10} value={n}
              onChange={e => setN(e.target.value)} style={{ margin: 0 }} />
            <button className="ww-mini-btn" onClick={shuffle}>🎲 Würfeln</button>
            <button className="ww-mini-btn red" onClick={clear}>↺ Reset</button>
          </div>
        </>
      )}

      {(!saved.teams || saved.teams.length === 0) ? (
        <div className="ww-empty" style={{ marginTop: 14 }}>
          {admin ? 'Tippe "🎲 Würfeln" um die Teams zu erstellen.' : 'Warte auf den Host — Teams werden gleich gewürfelt.'}
        </div>
      ) : (
        <div className="ww-entrant-grid" style={{ marginTop: 14 }}>
          {saved.teams.map((teamIds, i) => {
            const color = ENTRANT_PALETTE[i % ENTRANT_PALETTE.length];
            return (
              <div key={i} className="ww-entrant-card" style={{ borderColor: color }}>
                <div className="ww-entrant-head">
                  <span className="ww-entrant-name" style={{ color }}>TEAM {String.fromCharCode(65 + i)}</span>
                  <span className="ww-entrant-score">{teamIds.length}</span>
                </div>
                <div className="ww-flunky-roster">
                  {teamIds.map(uid => {
                    const u = usersById[uid];
                    if (!u) return null;
                    return (
                      <span key={uid} className="ww-flunky-player">
                        {u.emoji || '🍺'} {u.displayName || u.email}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ============================================================
// Sticky drinks bar (replaces the old drinks tab)
// ============================================================

function DrinksBar({ me, event, statsMap, setStatsMap, admin, active, onOpenSettings, myOptRef }) {
  const myStats = statsMap[me.id] || { id: null, counts: {} };
  const drinks = eventDrinks(event);
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

  const bump = (drinkId, delta) => {
    if (!active) return;
    const cur = statsMap[me.id]; if (!cur?.id) return;
    const counts = { ...drinkCounts(cur, event) };
    const curVal = counts[drinkId] || 0;
    const nextVal = Math.max(0, curVal + delta);
    if (nextVal === curVal) return; // nothing changed (e.g. minus at 0)
    counts[drinkId] = nextVal;
    // Maintain the timestamped drink log alongside the counter: +1 appends a
    // { t, k } entry (k = drink id), −1 removes the most recent of that kind.
    let log = Array.isArray(cur.log) ? cur.log.slice() : [];
    if (delta > 0) {
      log.push({ t: Date.now(), k: drinkId });
    } else {
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i]?.k === drinkId) { log.splice(i, 1); break; }
      }
    }
    const next = { ...cur, counts, log };
    setStatsMap(m => ({ ...m, [me.id]: next }));
    // Update the App-level ref so the realtime handler can recognise its
    // own echo and skip it (no flicker on rapid tapping).
    if (myOptRef) myOptRef.current = { counts: { ...counts } };
    scheduleWrite(cur.id, { counts, log });
  };

  return (
    <div className={`ww-drinks-bar ${!active ? 'paused' : ''} ${drinks.length > 2 ? 'multi' : ''}`}>
      {drinks.map(d => (
        <DrinkPill
          key={d.id} emoji={d.emoji || '🍺'} label={d.label} count={drinkCount(myStats, d.id)}
          disabled={!active}
          onInc={() => bump(d.id, +1)} onDec={() => bump(d.id, -1)}
        />
      ))}
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

function OverviewView({ me, event, members, statsMap, flunky, jeopardy, customModules, challenges, onShowUserDetail }) {
  const leaderboard = useMemo(() => members
    .map(m => {
      const u = m.expand?.user; if (!u) return null;
      const s = statsMap[u.id] || {};
      return { ...u, drinkTotal: totalDrinkCount(s, event), points: computeTotalPoints(u.id, s, event, flunky, customModules, jeopardy, challenges) };
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
        <StatPill label="Drinks" value={myEntry?.drinkTotal || 0} />
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

  const cancelCurrent = async () => {
    if (!cur) return;
    if (!await appConfirm('Spiel wirklich abbrechen?', { title: 'Spiel abbrechen?' })) return;
    onPatch({ games: games.filter(g => g.id !== cur.id) });
  };

  const deleteGame = async (gameId) => {
    if (!await appConfirm('Dieses Spiel wirklich löschen?', { title: 'Spiel löschen?' })) return;
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

// Read-only recap of a finished round: every question with its answer
// and who won it. Shown when a past round is expanded in the history.
function JeoBoardReadonly({ round, usersById }) {
  const cats = round?.categories || [];
  const byCat = {};
  for (const c of cats) byCat[c] = [];
  for (const q of (round?.questions || [])) {
    if (!byCat[q.category]) byCat[q.category] = [];
    byCat[q.category].push(q);
  }
  for (const c of cats) byCat[c].sort((a, b) => (a.level || 0) - (b.level || 0));
  return (
    <div className="ww-jeo-recap">
      {cats.map(c => (
        <div key={c} className="ww-jeo-recap-cat">
          <div className="ww-jeo-recap-cat-name">{c}</div>
          {(byCat[c] || []).map((q, i) => {
            const w = q.winnerUserId ? usersById[q.winnerUserId] : null;
            const isFlag = q.type === 'flag' && q.flagCode;
            return (
              <div key={i} className="ww-jeo-recap-row">
                <span className="ww-jeo-recap-pts">{levelPoints(q.level)}</span>
                <div className="ww-jeo-recap-qa">
                  <div className="ww-jeo-recap-q">
                    {isFlag ? <>{flagEmoji(q.flagCode)} Welches Land?</> : q.q}
                  </div>
                  <div className="ww-jeo-recap-a">→ {q.a}</div>
                </div>
                <span className="ww-jeo-recap-w">{w ? (w.emoji || '🍺') : '—'}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Renders a Jeopardy prompt: a big flag for flag-type questions, else text.
function JeoPrompt({ q }) {
  if (q?.type === 'flag' && q.flagCode) {
    return (
      <div className="ww-jeo-flag-wrap">
        <div className="ww-jeo-flag">{flagEmoji(q.flagCode)}</div>
        <div className="ww-jeo-flag-prompt">{q.q}</div>
      </div>
    );
  }
  return <div className="ww-jeo-question">{q.q}</div>;
}

// Remote mode: the dran player types their answer here; it's broadcast to the
// others to judge.
function JeoTypeAnswer({ onSubmit }) {
  const [text, setText] = useState('');
  const valid = text.trim().length >= 1;
  return (
    <div style={{ marginTop: 10 }}>
      <label className="ww-label">🤫 DEINE ANTWORT (tippen)</label>
      <input
        className="ww-input" value={text} maxLength={200} autoFocus
        placeholder="Antwort eingeben…"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && valid) onSubmit(text.trim()); }}
      />
      <button className={`ww-big-cta green ${valid ? '' : 'disabled'}`} disabled={!valid}
        onClick={() => onSubmit(text.trim())}>
        <Check size={20} /><span>ANTWORT ABSCHICKEN</span>
      </button>
      <p className="ww-muted" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>
        Die anderen sehen deine Antwort erst nach dem Abschicken.
      </p>
    </div>
  );
}

function JeopardyView({ me, jeopardy, members, admin, active, onPatch, onOpenSettings, onJeopardyRegenerate }) {
  const [expandedRound, setExpandedRound] = useState(null); // round id whose board is expanded in history
  const [compliment, setCompliment] = useState(null); // spicy-mode popup text
  const [regenBusy, setRegenBusy] = useState(false); // regenerating the open question
  const celebratedRef = useRef(null); // question keys I've already been complimented for

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
  const remote = !!jeopardy?.remoteMode;
  const spicy = !!jeopardy?.spicyMode;

  // Spicy mode: pop a dirty compliment on MY screen when I just won a
  // HIGH-VALUE question (≥400 pts). Detected via realtime; seed the
  // "already celebrated" set on first run so old wins don't replay.
  useEffect(() => {
    const mineHigh = [];
    for (const r of rounds) {
      (r.questions || []).forEach((q, qi) => {
        if (q.winnerUserId === me.id && levelPoints(q.level) >= 400) mineHigh.push(`${r.id || '?'}:${qi}`);
      });
    }
    if (celebratedRef.current === null) { celebratedRef.current = new Set(mineHigh); return; }
    if (!spicy) { celebratedRef.current = new Set(mineHigh); return; }
    const fresh = mineHigh.find(k => !celebratedRef.current.has(k));
    celebratedRef.current = new Set(mineHigh);
    if (fresh) setCompliment(pickCompliment());
  }, [rounds, spicy, me.id]);

  // The "active question" is always data-driven now (both modes are shared,
  // turn-based): any question flagged `opened` and not yet won shows on
  // EVERYONE's screen via realtime.
  const activeOpen = useMemo(() => {
    if (!currentRound) return null;
    for (let qi = 0; qi < currentRound.questions.length; qi++) {
      const q = currentRound.questions[qi];
      if (q.opened && !q.winnerUserId) return { ri: currentRoundIdx, qi };
    }
    return null;
  }, [currentRound, currentRoundIdx]);

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
    // A running (unfinished) round is itself the "live" state — interaction
    // is NOT gated on the event's global active/live toggle, so a host can
    // play a round (e.g. solo testing) without flipping the event live.
    if (!currentRound || currentRound.finishedAt) return;
    // Defense-in-depth: never re-open a tile that's already resolved
    // (won / closed / tried) or currently open.
    const t = rounds[ri]?.questions?.[qi];
    if (t && (t.opened || t.winnerUserId || t.resolved || t.revealed ||
        (Array.isArray(t.triedUsers) && t.triedUsers.length > 0))) return;
    // The picker (whoever tapped the tile) auto-becomes the first dran.
    resolveQuestion(ri, qi, { opened: true, currentlyAnswering: dranUserId || null, triedUsers: [] }, false);
  };
  const setDran = (ri, qi, userId) => resolveQuestion(ri, qi, { currentlyAnswering: userId }, false);
  // Remote mode: the dran player types their answer; it's stored on the
  // question and shown to everyone so the others can judge it.
  const submitTypedAnswer = (ri, qi, text) => resolveQuestion(ri, qi, { typedAnswer: String(text || '').slice(0, 200) }, false);
  // markRight does NOT clear triedUsers — those users tried wrong and keep
  // their −half penalty in the round scoring.
  const markRight = (ri, qi, who) => resolveQuestion(ri, qi, { winnerUserId: who, revealed: true, resolved: true, opened: false, currentlyAnswering: null }, true);
  // FALSCH in hostPlays mode closes the question immediately — by the time
  // someone clicks Richtig/Falsch the non-dran participants already saw the
  // correct answer on their screen, so a second-try "Wer versucht jetzt?"
  // becomes "say what you just read". The dran-person's −half penalty
  // sticks via triedUsers; queue advances.
  const markWrong = (ri, qi) => {
    const q = rounds[ri]?.questions?.[qi]; if (!q) return;
    const tried = Array.from(new Set([...(q.triedUsers || []), q.currentlyAnswering].filter(Boolean)));
    resolveQuestion(ri, qi, { opened: false, currentlyAnswering: null, triedUsers: tried, revealed: true, resolved: true }, true);
  };
  // closeQuestion ("Niemand") also preserves triedUsers so penalties for
  // everyone who tried still apply.
  const closeQuestion = (ri, qi) => resolveQuestion(ri, qi, { opened: false, currentlyAnswering: null, revealed: true, resolved: true }, true);

  // Correct a mis-judged tile (admin): reset it to fresh/unanswered so it can
  // be re-opened and re-judged. Removes its points until it's resolved again.
  const correctTile = async (ri, qi) => {
    if (!admin) return;
    if (!await appConfirm('Wertung korrigieren? Das Feld wird zurückgesetzt und kann neu beantwortet werden.', { title: 'Wertung korrigieren?', okLabel: 'ZURÜCKSETZEN' })) return;
    resolveQuestion(ri, qi, { winnerUserId: null, triedUsers: [], opened: false, currentlyAnswering: null, resolved: false, revealed: false }, false);
  };

  // Current picker derivation
  const pickerOrder = currentRound?.pickerOrder || [];
  const pickerIdx = currentRound?.pickerIdx || 0;
  const currentPickerId = pickerOrder.length > 0 ? pickerOrder[pickerIdx % pickerOrder.length] : null;
  const currentPicker = currentPickerId ? usersById[currentPickerId] : null;
  const iAmPicker = currentPickerId === me.id;

  const finishRound = async (ri) => {
    if (!admin) return;
    if (!await appConfirm('Runde beenden? Punkte werden ans Stand-Leaderboard übergeben.', { title: 'Runde beenden?', destructive: false, okLabel: 'BEENDEN' })) return;
    const next = rounds.map((r, i) => i === ri ? { ...r, finishedAt: new Date().toISOString() } : r);
    onPatch({ rounds: next });
  };

  // Delete a (finished) round from the history. Admin only.
  const deleteRound = async (roundId) => {
    if (!admin) return;
    if (!await appConfirm('Diese Runde endgültig löschen? Die vergebenen Event-Punkte verschwinden.', { title: 'Runde löschen?', destructive: true, okLabel: 'LÖSCHEN' })) return;
    onPatch({ rounds: rounds.filter(r => r.id !== roundId) });
    setExpandedRound(null);
  };

  // Abort the currently running (unfinished) round without awarding points.
  const cancelCurrentRound = async () => {
    if (!admin || !currentRound || currentRound.finishedAt) return;
    if (!await appConfirm('Laufendes Spiel abbrechen? Es werden keine Punkte vergeben und die Runde wird verworfen.', { title: 'Spiel abbrechen?', destructive: true, okLabel: 'ABBRECHEN' })) return;
    onPatch({ rounds: rounds.filter((_, i) => i !== currentRoundIdx) });
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
      {/* No gear: new rounds (incl. category + generate) run via the
          "Runde starten" button which opens the same settings drawer. */}
      <ModuleHeader title="🎤 Jeopardy" admin={false} onOpenSettings={onOpenSettings} />

      <div className="ww-stats-row">
        <StatPill label="Runde" value={`${rounds.length || 0}`} />
        <StatPill label="Aktuelle Pkt" value={myRoundScore} />
        <StatPill label="Event-Pkt" value={totalEventPts} accent />
      </div>

      {/* Start button whenever there's no active (unfinished) round. */}
      {(!currentRound || currentRound.finishedAt) && (
        admin ? (
          <button className="ww-big-cta green" style={{ marginTop: 6 }} onClick={onOpenSettings}>
            <Plus size={20} /><span>{rounds.length ? 'NEUE RUNDE STARTEN' : 'RUNDE STARTEN'}</span>
          </button>
        ) : (
          <div className="ww-empty">Warte auf den Host — eine neue Runde startet gleich.</div>
        )
      )}

      {/* Live board only while the current round is running. Finished rounds
          live in "Vergangene Runden" (expandable). */}
      {currentRound && !currentRound.finishedAt && categories.length > 0 && (
        <section className="ww-section">
          <div className="ww-section-head">
            <Trophy size={16} />
            <h3>RUNDE {currentRoundIdx + 1}</h3>
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
              // A tile is "done" once it has been resolved in any way — won,
              // marked wrong/closed (resolved/revealed flags), or tried by at
              // least one player. Done tiles must NOT be re-openable; clicking
              // one used to reset it and break the picker rotation.
              const done = !!q.winnerUserId || !!q.resolved || !!q.revealed ||
                (Array.isArray(q.triedUsers) && q.triedUsers.length > 0);
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
                    if (currentRound.finishedAt || q.opened) return;
                    // A resolved tile: admins may tap it to correct a wrong
                    // judgement (resets it); everyone else can't re-open it.
                    if (done) { if (admin) correctTile(currentRoundIdx, q._qi); return; }
                    // Turn-based (both modes): only the current picker (or the
                    // host as failsafe when there's no rotation yet) opens a
                    // tile; the picker auto-becomes the answerer ("dran").
                    const allowed = iAmPicker || (admin && !currentPickerId);
                    if (!allowed) return;
                    const dran = iAmPicker ? me.id : currentPickerId;
                    openTileShared(currentRoundIdx, q._qi, dran);
                  }}
                  disabled={
                    !!currentRound.finishedAt || q.opened ||
                    (done && !admin) ||
                    (!done && !(iAmPicker || (admin && !currentPickerId)))
                  }
                  title={done && admin ? 'Tippen zum Korrigieren' : `${c} · Level ${lvl}`}
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

          {admin && (
            <p className="ww-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 8 }}>
              ✎ Als Host: gewertetes Feld antippen, um eine Fehlwertung zu korrigieren.
            </p>
          )}

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

          {admin && !currentRound.finishedAt && (
            <>
              <button className="ww-big-cta green" onClick={() => finishRound(currentRoundIdx)} style={{ marginTop: 10 }}>
                <Flag size={20} /><span>RUNDE BEENDEN & PUNKTE VERTEILEN</span>
              </button>
              <button className="ww-danger-btn red" onClick={cancelCurrentRound} style={{ marginTop: 10 }}>
                <X size={16} /> Laufendes Spiel abbrechen
              </button>
            </>
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
              const isExp = expandedRound === r.id;
              return (
                <div key={r.id}>
                  <div className="ww-jeo-past-row">
                    <button
                      className="ww-board-row"
                      style={{ flex: 1, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                      onClick={() => setExpandedRound(isExp ? null : r.id)}
                    >
                      <div className="ww-board-rank">R{ri + 1}</div>
                      <div className="ww-board-name">
                        {rk.slice(0, 3).map(([uid, p]) => {
                          const u = usersById[uid]; if (!u) return null;
                          return <span key={uid} style={{ marginRight: 8 }}>{u.emoji || '🍺'} {p}</span>;
                        })}
                      </div>
                      <div className="ww-board-pts">+{myEventPts}<span>pkt</span></div>
                      <ChevronRight size={15} style={{ marginLeft: 6, transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                    </button>
                    {admin && (
                      <button className="ww-mini-btn red" onClick={() => deleteRound(r.id)} title="Runde löschen">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {isExp && <JeoBoardReadonly round={r} usersById={usersById} />}
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
        // Solo: when the dran person is the only participant there's nobody
        // else to judge, so they self-judge (answer shown + Richtig/Falsch).
        const soloMode = participants.length <= 1;

        const close = () => { if (admin) closeQuestion(activeOpen.ri, activeOpen.qi); };

        // Answer visibility + judging depend on the mode:
        //  hostPlays ON  → answer shown to everyone EXCEPT the dran player;
        //                  any other participant judges Richtig/Falsch.
        //  hostPlays OFF → quizmaster: ONLY the host sees the answer and
        //                  judges; players (incl. dran) just answer aloud.
        //  soloMode      → the dran player self-judges (no one else there).
        //  remote        → the dran player TYPES their answer; once submitted
        //                  everyone sees it + the solution and the others judge.
        const seesAnswer = remote ? !!q.typedAnswer : (hostPlays ? (!iAmDran || soloMode) : admin);
        // Interaction is gated by the round being live (activeOpen only exists
        // within an unfinished round), NOT by the event's global active flag —
        // otherwise a host playing solo without flipping the event live can
        // open a tile but never judge it.
        const canJudge = remote
          ? (!!q.typedAnswer && (admin || soloMode || (iAmParticipant && !iAmDran)))
          : (hostPlays ? (iAmParticipant && (!iAmDran || soloMode)) : admin);

        // Step 1: no one assigned yet (rare — e.g. host re-opened). Host picks.
        if (!q.currentlyAnswering) {
          const tried = q.triedUsers || [];
          const remaining = participants.filter(p => !tried.includes(p.id));
          return (
            <ModuleSettingsDrawer title={`${q.category} · ${levelPoints(q.level)} Pkt`} onClose={admin ? close : (() => {})}>
              <JeoPrompt q={q} />
              {admin ? (
                <>
                  <label className="ww-label" style={{ marginTop: 12 }}>WER ANTWORTET?</label>
                  {remaining.length === 0 ? (
                    <div className="ww-muted" style={{ fontSize: 13, padding: 8, textAlign: 'center' }}>Alle haben falsch geantwortet.</div>
                  ) : (
                    <div className="ww-flunky-assign">
                      {remaining.map(u => (
                        <button key={u.id} className="ww-flunky-assign-row"
                          onClick={() => setDran(activeOpen.ri, activeOpen.qi, u.id)}
                          style={{ border: 'none', textAlign: 'left', cursor: 'pointer' }}>
                          <span className="ww-user-mgmt-emoji">{u.emoji || '🍺'}</span>
                          <span className="ww-user-mgmt-name">{u.displayName || u.email}</span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="ww-mini-btn red" style={{ marginTop: 10 }}
                    onClick={() => closeQuestion(activeOpen.ri, activeOpen.qi)}>Frage zu · keine Punkte</button>
                </>
              ) : (
                <div className="ww-muted" style={{ fontSize: 12, margin: '8px 0' }}>Warte auf den Host…</div>
              )}
            </ModuleSettingsDrawer>
          );
        }

        // Step 2: someone is dran. Everyone sees the question.
        return (
          <ModuleSettingsDrawer title={`${q.category} · ${levelPoints(q.level)} Pkt`} onClose={admin ? close : (() => {})}>
            <div className="ww-jeo-dran">
              🎯 dran: <b>{dran ? `${dran.emoji || '🍺'} ${dran.displayName || dran.email}` : '?'}</b>
            </div>
            <JeoPrompt q={q} />
            {remote ? (
              q.typedAnswer ? (
                <>
                  <div className="ww-jeo-typed">✍️ {dran?.displayName || 'Antwort'}: <b>{q.typedAnswer}</b></div>
                  <div className="ww-jeo-answer">💡 Richtig: {q.a}</div>
                </>
              ) : iAmDran ? (
                <JeoTypeAnswer onSubmit={(txt) => submitTypedAnswer(activeOpen.ri, activeOpen.qi, txt)} />
              ) : (
                <div className="ww-muted" style={{ fontSize: 13, margin: '8px 0', textAlign: 'center', padding: 12 }}>
                  ✍️ {dran ? (dran.displayName || dran.email) : 'Der Spieler'} tippt gerade die Antwort…
                </div>
              )
            ) : seesAnswer ? (
              <div className="ww-jeo-answer">💡 {q.a}</div>
            ) : iAmDran ? (
              <div className="ww-muted" style={{ fontSize: 13, margin: '8px 0', textAlign: 'center', padding: 12 }}>
                🤫 Du bist dran — sag deine Antwort laut.<br />
                {hostPlays ? 'Die anderen sehen die Lösung und werten.' : 'Der Host sieht die Lösung und entscheidet.'}
              </div>
            ) : (
              <div className="ww-muted" style={{ fontSize: 13, margin: '8px 0', textAlign: 'center', padding: 12 }}>
                {dran ? `${dran.displayName || dran.email} ist dran.` : ''} Der Host entscheidet, ob richtig.
              </div>
            )}
            {canJudge && (
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
            {(admin || iAmParticipant) && onJeopardyRegenerate && (() => {
              const left = 2 - (q.regenCount || 0);
              if (left <= 0) return (
                <div className="ww-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 10 }}>
                  🔄 Schon 2× neu generiert — diese Frage muss jetzt reichen 😄
                </div>
              );
              return (
                <button className="ww-jeo-regen" disabled={regenBusy}
                  onClick={async () => {
                    setRegenBusy(true);
                    try { await onJeopardyRegenerate(activeOpen.ri, activeOpen.qi); } catch (_) {}
                    finally { setRegenBusy(false); }
                  }}>
                  <RotateCcw size={16} /> {regenBusy ? 'Neue Frage wird generiert…' : `Frage taugt nicht — andere Frage (noch ${left}×)`}
                </button>
              );
            })()}
            {admin && (
              <button className="ww-mini-btn red" style={{ marginTop: 10 }}
                onClick={() => closeQuestion(activeOpen.ri, activeOpen.qi)}>
                Niemand wusste es · Punkte annullieren
              </button>
            )}
          </ModuleSettingsDrawer>
        );
      })()}

      {compliment && <ComplimentOverlay text={compliment} onClose={() => setCompliment(null)} />}
      {regenBusy && <JeoGeneratingOverlay />}
    </>
  );
}

// Spicy-mode: full-screen compliment you SWIPE away to keep playing.
function ComplimentOverlay({ text, onClose }) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const startX = useRef(null);
  const THRESHOLD = 110;

  const down = (e) => { startX.current = (e.touches ? e.touches[0].clientX : e.clientX); };
  const move = (e) => {
    if (startX.current == null) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    setDx(x - startX.current);
  };
  const up = () => {
    if (startX.current == null) return;
    const d = dx;
    startX.current = null;
    if (Math.abs(d) > THRESHOLD) {
      // fling off in the swipe direction, then close
      setLeaving(true);
      setDx((d < 0 ? -1 : 1) * 600);
      setTimeout(onClose, 180);
    } else {
      setDx(0); // snap back
    }
  };

  const rot = Math.max(-12, Math.min(12, dx / 12));
  const opacity = leaving ? 0 : Math.max(0.25, 1 - Math.abs(dx) / 320);

  return createPortal(
    <div className="ww-compliment" role="alertdialog" aria-modal="true">
      <div
        className="ww-compliment-card"
        style={{
          transform: `translateX(${dx}px) rotate(${rot}deg)`,
          opacity,
          transition: startX.current == null ? 'transform .18s ease, opacity .18s ease' : 'none',
          touchAction: 'pan-y',
        }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onTouchStart={down} onTouchMove={move} onTouchEnd={up}
      >
        <div className="ww-compliment-spark">🌶️🔥</div>
        <div className="ww-compliment-text">{text}</div>
        <div className="ww-compliment-swipe">
          <span>👈 wegwischen 👉</span>
        </div>
      </div>
      <div className="ww-compliment-hint">Wisch das Kompliment weg, um weiterzuspielen 😏</div>
    </div>,
    document.body
  );
}

const DEFAULT_JEO_CATS = [
  'Geographie',
  'Zurück in die Schule',
  'Flaggen',
  'Twitch & Youtube Deutschland',
  'Songtexte 2000er',
];

// Curated pool of common, well-playable quiz categories. The 🎲 button
// pre-fills 5 random ones into the inputs (re-rollable) — the host can then
// tweak or re-roll before actually generating the round.
const JEO_CATEGORY_POOL = [
  'Geographie', 'Hauptstädte', 'Flaggen', 'Deutsche Geschichte', 'Weltgeschichte',
  'Berühmte Persönlichkeiten', 'Wissenschaft & Natur', 'Tierwelt', 'Der menschliche Körper',
  'Mathe & Logik', 'Physik', 'Chemie', 'Weltall & Astronomie', 'Erfindungen',
  'Filme & Kino', 'Serien & Streaming', 'Disney & Pixar', 'Harry Potter', 'Marvel & DC',
  'Musik allgemein', 'Songtexte 2000er', 'Deutscher Rap', '90er Hits', 'Eurovision',
  'Sport allgemein', 'Fußball', 'Olympische Spiele', 'Formel 1', 'Tennis',
  'Essen & Trinken', 'Biersorten', 'Cocktails', 'Internationale Küche', 'Süßigkeiten',
  'Videospiele', 'Twitch & Youtube Deutschland', 'Memes & Internet', 'Brettspiele',
  'Kunst & Malerei', 'Literatur & Bücher', 'Mythologie', 'Sprichwörter & Redewendungen',
  'Autos & Technik', 'Marken & Logos', 'Mode', 'Reality TV Deutschland', 'Zurück in die Schule',
  'Deutschland', 'Europa', 'Die 80er', 'Reisen & Sehenswürdigkeiten',
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

  // Pre-fill 5 random categories from the pool (re-rollable). Does NOT start
  // the round — the host can tweak them and then hit "Runde starten".
  const rollCategories = () => {
    const pool = [...JEO_CATEGORY_POOL];
    const picked = [];
    while (picked.length < 5 && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    setCats(picked);
    onPatch({ categories: picked });
  };

  // Re-roll a single slot — pick a fresh category from the pool that isn't
  // already used in the other slots (and differs from the current one).
  const rollOne = (i) => {
    const used = cats.map((c, j) => j === i ? null : (c || '').trim().toLowerCase()).filter(Boolean);
    const curLower = (cats[i] || '').trim().toLowerCase();
    let avail = JEO_CATEGORY_POOL.filter(c => !used.includes(c.toLowerCase()) && c.toLowerCase() !== curLower);
    if (avail.length === 0) avail = JEO_CATEGORY_POOL.filter(c => !used.includes(c.toLowerCase()));
    if (avail.length === 0) return;
    const pick = avail[Math.floor(Math.random() * avail.length)];
    const next = [...cats]; while (next.length < 5) next.push('');
    next[i] = pick;
    setCats(next);
    onPatch({ categories: next.map(c => (c || '').trim()).filter(Boolean) });
  };

  const toggleParticipant = (uid) => {
    const has = participants.includes(uid);
    onPatch({ participants: has ? participants.filter(x => x !== uid) : [...participants, uid] });
  };
  const allParticipants = () => onPatch({ participants: memberIds });
  const clearParticipants = () => onPatch({ participants: [] });

  return (
    <div>
      <button className="ww-big-cta" onClick={rollCategories} disabled={busy} type="button" style={{ marginTop: 0 }}>
        <Dice5 size={20} /><span>🎲 ALLE NEU WÜRFELN</span>
      </button>
      <p className="ww-muted" style={{ fontSize: 11, marginTop: 6, marginBottom: 16 }}>
        Füllt 5 zufällige Kategorien vor — oder würfle einzelne mit dem 🎲 neben
        dem Feld. Danach anpassen und unten die Runde starten.
      </p>

      <label className="ww-label">KATEGORIEN (5)</label>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="ww-jeo-cat-row" style={{ marginTop: i === 0 ? 0 : 6 }}>
          <input
            className="ww-input"
            placeholder={`Kategorie ${i + 1}`}
            value={cats[i] || ''}
            onChange={(e) => updateCat(i, e.target.value)}
            onBlur={saveCats}
            maxLength={40}
          />
          <button type="button" className="ww-jeo-cat-roll" onClick={() => rollOne(i)} title="Diese Kategorie neu würfeln" aria-label="Neu würfeln">
            <Dice5 size={16} />
          </button>
        </div>
      ))}
      <p className="ww-muted" style={{ fontSize: 11, marginTop: 6 }}>
        💡 Tipp: Kategorie <b>„Flaggen"</b> eintippen → zeigt offline Flaggen-Bilder
        zum Erraten (kein KI-Generieren, immer korrekt). Eine Flagge pro Schwierigkeit,
        zufällig aus dem Pool.
      </p>

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

      <label className="ww-label" style={{ marginTop: 14 }}>REMOTE-MODUS (getrennt spielen)</label>
      <button
        type="button"
        className={`ww-module-toggle ${jeopardy?.remoteMode ? 'on' : ''}`}
        onClick={() => onPatch({ remoteMode: !jeopardy?.remoteMode })}
        style={{ width: '100%' }}
      >
        <span className="ww-mod-icon">{jeopardy?.remoteMode ? '📱' : '🎙️'}</span>
        <span className="ww-mod-name">
          {jeopardy?.remoteMode
            ? 'AN — Dran tippt Antwort, die anderen werten'
            : 'AUS — Antwort wird laut gesagt'}
        </span>
        {jeopardy?.remoteMode ? <Check size={14} /> : <X size={14} />}
      </button>

      <label className="ww-label" style={{ marginTop: 14 }}>🌶️ KOMPLIMENTE-MODUS (spicy)</label>
      <button
        type="button"
        className={`ww-module-toggle ${jeopardy?.spicyMode ? 'on' : ''}`}
        onClick={() => onPatch({ spicyMode: !jeopardy?.spicyMode })}
        style={{ width: '100%' }}
      >
        <span className="ww-mod-icon">{jeopardy?.spicyMode ? '🌶️' : '😇'}</span>
        <span className="ww-mod-name">
          {jeopardy?.spicyMode
            ? 'AN — bei richtiger Antwort gibt es ein spicy Kompliment'
            : 'AUS — keine Komplimente'}
        </span>
        {jeopardy?.spicyMode ? <Check size={14} /> : <X size={14} />}
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
        <Play size={20} /><span>{busy ? 'STARTE…' : 'NEUE RUNDE STARTEN'}</span>
      </button>
      <p className="ww-muted" style={{ fontSize: 11, marginTop: 6 }}>
        Wird im Hintergrund generiert (ca. 15–40 Sek) — du kannst das Handy
        weglegen, die Runde erscheint von selbst, sobald sie fertig ist.
      </p>
      <p className="ww-muted" style={{ fontSize: 11, marginTop: 6 }}>
        💡 Einzelne Runden löschst du jetzt direkt unter „Vergangene Runden".
      </p>
    </div>
  );
}

// Full-screen blocking spinner while the board is being generated, so nobody
// taps something else mid-generation.
function JeoGeneratingOverlay() {
  return createPortal(
    <div className="ww-jeo-gen" role="alertdialog" aria-modal="true" aria-label="Fragen werden generiert">
      <div className="ww-jeo-gen-inner">
        <div className="ww-jeo-gen-spinner" />
        <div className="ww-jeo-gen-emoji">🎤</div>
        <div className="ww-jeo-gen-title">Fragen werden generiert…</div>
        <div className="ww-jeo-gen-sub">Claude tüftelt gerade dein Brett aus. Kurz Geduld — nicht wegtippen 😉</div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================
// Kitty Split (Kassensturz)
// ============================================================

function kittySettlement(expenses, parties) {
  const balances = {};
  for (const p of parties) balances[p.id] = 0;
  for (const exp of expenses) {
    const parts = (exp.participants || []).filter(pid => parties.some(p => p.id === pid));
    if (parts.length === 0) continue;
    const share = exp.amount / parts.length;
    for (const pid of parts) {
      if (pid === exp.paidBy) continue;
      balances[pid] = (balances[pid] || 0) - share;
      if (balances[exp.paidBy] !== undefined) {
        balances[exp.paidBy] += share;
      }
    }
  }
  const debtors  = Object.entries(balances).filter(([, b]) => b < -0.005).map(([id, b]) => ({ id, b })).sort((a, c) => a.b - c.b);
  const creditors = Object.entries(balances).filter(([, b]) => b > 0.005).map(([id, b]) => ({ id, b })).sort((a, c) => c.b - a.b);
  const txs = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(-debtors[i].b, creditors[j].b);
    txs.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
    debtors[i].b += amt;
    creditors[j].b -= amt;
    if (Math.abs(debtors[i].b) < 0.005) i++;
    if (Math.abs(creditors[j].b) < 0.005) j++;
  }
  return txs;
}

function KittyView({ me, kitty, members, admin, onPatch }) {
  const users = members.map(m => m.expand?.user).filter(Boolean);
  const expenses = kitty?.expenses || [];
  const externals = Array.isArray(kitty?.externals) ? kitty.externals : [];
  const done = Array.isArray(kitty?.done) ? kitty.done : [];

  // Unified "party" list: app members + external (non-app) people.
  const parties = [
    ...users.map(u => ({ id: u.id, name: u.displayName || u.email?.split('@')[0] || '?', emoji: u.emoji || '🍺', external: false })),
    ...externals.map(x => ({ id: x.id, name: x.name, emoji: '👤', external: true })),
  ];
  const partyById = (id) => parties.find(p => p.id === id);

  const [showAdd, setShowAdd] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(me.id);
  const [participants, setParticipants] = useState(() => parties.map(p => p.id));
  const [extName, setExtName] = useState('');

  const openAdd = () => {
    setDesc(''); setAmount(''); setPaidBy(me.id);
    setParticipants(parties.map(p => p.id));
    setExtName('');
    setShowAdd(true);
  };

  const toggleParticipant = (uid) => {
    setParticipants(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  // Any change to the expense set means confirmations are stale — clear `done`.
  const addExpense = () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!desc.trim() || isNaN(amt) || amt <= 0 || participants.length === 0) return;
    const expense = {
      id: String(Date.now()),
      desc: desc.trim(),
      amount: Math.round(amt * 100) / 100,
      paidBy,
      participants: [...participants],
      createdBy: me.id,
      createdAt: new Date().toISOString(),
    };
    onPatch({ expenses: [...expenses, expense], done: [] });
    setShowAdd(false);
  };

  const deleteExpense = async (id) => {
    if (!await appConfirm('Ausgabe löschen?', { title: 'Ausgabe löschen?' })) return;
    onPatch({ expenses: expenses.filter(e => e.id !== id), done: [] });
  };

  const addExternal = () => {
    const name = extName.trim();
    if (name.length < 1) return;
    const id = `ext-${Date.now()}`;
    onPatch({ externals: [...externals, { id, name }] });
    setParticipants(prev => [...prev, id]); // auto-include the new person
    setExtName('');
  };
  const removeExternal = (id) => {
    onPatch({ externals: externals.filter(x => x.id !== id) });
    setParticipants(prev => prev.filter(p => p !== id));
    if (paidBy === id) setPaidBy(me.id);
  };

  const toggleDone = () => {
    const next = done.includes(me.id) ? done.filter(d => d !== me.id) : [...done, me.id];
    onPatch({ done: next });
  };

  const totalAmount = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const settlement = kittySettlement(expenses, parties);
  const iAmDone = done.includes(me.id);
  const doneCount = users.filter(u => done.includes(u.id)).length;
  const allDone = users.length > 0 && doneCount === users.length;

  const fmt = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="ww-mod-panel">
      <div className="ww-kitty-header">
        <div className="ww-kitty-total">
          <span className="ww-kitty-total-label">GESAMT</span>
          <span className="ww-kitty-total-val">{fmt(totalAmount)} €</span>
        </div>
        <button className="ww-icon-btn" onClick={openAdd} aria-label="Ausgabe hinzufügen">
          <Plus size={18} />
        </button>
      </div>

      {expenses.length === 0 && (
        <div className="ww-kitty-empty">
          <div style={{ fontSize: 32 }}>💰</div>
          <div>Noch keine Ausgaben — tippe + um eine einzutragen.</div>
        </div>
      )}

      <div className="ww-kitty-list">
        {[...expenses].reverse().map(exp => {
          const payer = partyById(exp.paidBy);
          const canDelete = admin || exp.createdBy === me.id || exp.paidBy === me.id;
          const parts = (exp.participants || []).map(pid => partyById(pid)).filter(Boolean);
          const myShare = exp.participants?.includes(me.id)
            ? exp.amount / (exp.participants?.length || 1)
            : 0;
          return (
            <div key={exp.id} className="ww-kitty-expense">
              <div className="ww-kitty-exp-top">
                <span className="ww-kitty-exp-desc">{exp.desc}</span>
                <span className="ww-kitty-exp-amount">{fmt(exp.amount)} €</span>
              </div>
              <div className="ww-kitty-exp-meta">
                <span>{payer?.emoji || '🍺'} {payer?.name || '?'} hat bezahlt</span>
                <span className="ww-kitty-exp-parts">
                  {parts.map(u => u.emoji || '🍺').join('')} ÷{parts.length}
                  {myShare > 0.005 && <span className="ww-kitty-myshare"> · mein Anteil: {fmt(myShare)} €</span>}
                </span>
              </div>
              {canDelete && (
                <button className="ww-kitty-del" onClick={() => deleteExpense(exp.id)} aria-label="Löschen">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {expenses.length > 0 && (
        <div className="ww-kitty-settlement">
          <div className="ww-section-head"><h3>ABRECHNUNG</h3></div>
          {settlement.length === 0 ? (
            <div className="ww-muted" style={{ textAlign: 'center', padding: '12px 0' }}>Alles ausgeglichen ✓</div>
          ) : (
            settlement.map((tx, i) => {
              const from = partyById(tx.from);
              const to = partyById(tx.to);
              return (
                <div key={i} className="ww-kitty-tx">
                  <span className="ww-kitty-tx-from">{from?.emoji || '🍺'} {from?.name || '?'}</span>
                  <span className="ww-kitty-tx-arrow">→</span>
                  <span className="ww-kitty-tx-to">{to?.emoji || '🍺'} {to?.name || '?'}</span>
                  <span className="ww-kitty-tx-amt">{fmt(tx.amount)} €</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Final-status: everyone confirms when they've submitted all expenses */}
      <div className="ww-kitty-done">
        <div className="ww-section-head"><h3>FERTIG-STATUS</h3></div>
        {allDone ? (
          <div className="ww-kitty-alldone">✅ Alle fertig — ihr könnt jetzt ausgleichen! 💸</div>
        ) : (
          <div className="ww-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            {doneCount} von {users.length} haben alles eingereicht. Erst ausgleichen, wenn alle fertig sind.
          </div>
        )}
        <div className="ww-kitty-done-chips">
          {users.map(u => (
            <span key={u.id} className={`ww-kitty-done-chip ${done.includes(u.id) ? 'on' : ''}`}>
              {done.includes(u.id) ? '✓' : '…'} {u.emoji || '🍺'} {u.displayName || u.email?.split('@')[0]}
            </span>
          ))}
        </div>
        <button className={`ww-big-cta ${iAmDone ? '' : 'green'}`} style={{ marginTop: 10 }} onClick={toggleDone}>
          {iAmDone ? <><RotateCcw size={18} /><span>DOCH NOCH NICHT FERTIG</span></> : <><Check size={20} /><span>ICH BIN FERTIG — ALLES EINGEREICHT</span></>}
        </button>
      </div>

      {showAdd && (
        <ModuleSettingsDrawer title="💰 Ausgabe eintragen" onClose={() => setShowAdd(false)}>
          <label className="ww-label">BESCHREIBUNG</label>
          <input
            className="ww-input"
            placeholder="z.B. Pizza, Getränke, Eintritt…"
            value={desc}
            onChange={e => setDesc(e.target.value)}
          />
          <label className="ww-label">BETRAG (€)</label>
          <input
            className="ww-input"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <label className="ww-label">BEZAHLT VON</label>
          <div className="ww-kitty-pickers">
            {parties.map(p => (
              <button
                key={p.id}
                className={`ww-kitty-picker ${paidBy === p.id ? 'sel' : ''}`}
                onClick={() => setPaidBy(p.id)}
              >
                <span>{p.emoji}</span>
                <span className="ww-kitty-picker-name">{p.name}</span>
              </button>
            ))}
          </div>
          <label className="ww-label">BETEILIGT</label>
          <div className="ww-kitty-pickers">
            {parties.map(p => (
              <button
                key={p.id}
                className={`ww-kitty-picker ${participants.includes(p.id) ? 'sel' : ''}`}
                onClick={() => toggleParticipant(p.id)}
              >
                <span>{p.emoji}</span>
                <span className="ww-kitty-picker-name">{p.name}</span>
              </button>
            ))}
          </div>

          <label className="ww-label">EXTERNE PERSON (nicht in der App)</label>
          {externals.length > 0 && (
            <div className="ww-kitty-ext-list">
              {externals.map(x => (
                <span key={x.id} className="ww-kitty-ext-chip">
                  👤 {x.name}
                  <button onClick={() => removeExternal(x.id)} aria-label="Entfernen"><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="ww-kitty-ext-add">
            <input
              className="ww-input" placeholder="Name z.B. Tom (extern)"
              value={extName} maxLength={30}
              onChange={e => setExtName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addExternal()}
            />
            <button className="ww-mini-btn" onClick={addExternal} disabled={!extName.trim()}><Plus size={13} /> Add</button>
          </div>

          {participants.length > 0 && amount && !isNaN(parseFloat(amount.replace(',', '.'))) && (
            <div className="ww-muted" style={{ fontSize: 12, margin: '6px 0 10px', textAlign: 'center' }}>
              = {fmt(parseFloat(amount.replace(',', '.')) / participants.length)} € pro Person
            </div>
          )}
          <button
            className={`ww-big-cta ${desc.trim() && amount && participants.length > 0 ? '' : 'disabled'}`}
            onClick={addExpense}
            disabled={!desc.trim() || !amount || participants.length === 0}
          >
            <Plus size={20} /><span>EINTRAGEN</span>
          </button>
        </ModuleSettingsDrawer>
      )}
    </div>
  );
}

// ============================================================
// 5 Schnelle Fragen (Gemischtes Hack — Tool, non-competitive)
// Every event member can navigate. Backend keeps `qIds` (shuffled
// indices into the static SCHNELLE_FRAGEN bank) + `currentIdx` so all
// participants see the exact same question simultaneously.
// ============================================================

// Mulberry32 — small deterministic PRNG used to seed-shuffle the
// question bank so a fresh deck order is stable for everyone.
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const j = Math.floor(r * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick N distinct random question indices from the full bank.
function pickFive(n = 5) {
  const ids = SCHNELLE_FRAGEN.map((_, i) => i);
  const shuffled = seededShuffle(ids, (Date.now() ^ 0x9e3779b9) & 0xffffffff);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function SchnelleFragenView({ state, onPatch }) {
  // A round is exactly 5 questions. qIds holds those 5 bank indices.
  const qIds = Array.isArray(state?.qIds) && state.qIds.length ? state.qIds : null;
  const currentIdx = Math.max(0, Number(state?.currentIdx) || 0);

  const ensureDeck = () => {
    if (qIds) return qIds;
    const five = pickFive();
    onPatch({ qIds: five, currentIdx: 0 });
    return five;
  };

  const deck = qIds || pickFive();
  const safeIdx = Math.min(currentIdx, deck.length - 1);
  const currentQ = SCHNELLE_FRAGEN[deck[safeIdx]] || SCHNELLE_FRAGEN[0];
  const total = deck.length;
  const isLast = safeIdx >= total - 1;
  // Backwards-compat: bank entries used to be plain strings; now objects.
  const q = typeof currentQ === 'string' ? { q: currentQ } : (currentQ || {});

  const goPrev = () => {
    const d = ensureDeck();
    const next = Math.max(0, safeIdx - 1);
    onPatch({ qIds: d, currentIdx: next });
  };
  const goNext = () => {
    const d = ensureDeck();
    if (safeIdx >= d.length - 1) return; // stop at the 5th — use "neu" to restart
    onPatch({ qIds: d, currentIdx: safeIdx + 1 });
  };
  const reshuffle = async () => {
    if (!await appConfirm('5 neue Fragen ziehen?', { title: 'Neue Runde?', destructive: false, okLabel: 'NEUE 5' })) return;
    onPatch({ qIds: pickFive(), currentIdx: 0 });
  };

  return (
    <div className="ww-schnelle">
      <p className="ww-muted" style={{ fontSize: 12, marginTop: 0 }}>
        5 Fragen pro Runde. Diskutiert sie — alle sehen das Gleiche. Danach „Neue 5" für die nächste Runde.
      </p>

      <div className="ww-schnelle-card">
        <div className="ww-schnelle-counter">
          <span className="ww-schnelle-counter-num">{safeIdx + 1}</span>
          <span className="ww-schnelle-counter-total">/ {total}</span>
        </div>
        <div className="ww-schnelle-question">{q.q}</div>
        {(q.ep || q.year || q.author || q.link) && (
          <div className="ww-schnelle-meta">
            {q.author && <span className="ww-schnelle-chip">{q.author}</span>}
            {q.ep && <span className="ww-schnelle-chip">Folge {q.ep}</span>}
            {q.year && <span className="ww-schnelle-chip">{q.year}</span>}
            {q.link && (
              <a
                className="ww-schnelle-spotify"
                href={q.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="ww-schnelle-spotify-dot" /> Spotify{q.ts ? ` · ${q.ts}` : ''}
              </a>
            )}
          </div>
        )}
      </div>

      <div className="ww-schnelle-nav">
        <button className="ww-schnelle-nav-btn" onClick={goPrev} disabled={safeIdx === 0} aria-label="Vorherige Frage">
          <ArrowLeft size={20} />
        </button>
        {isLast ? (
          <button className="ww-schnelle-nav-btn primary" onClick={reshuffle} aria-label="Neue 5 Fragen">
            <RotateCcw size={18} />
            <span>NEUE 5</span>
          </button>
        ) : (
          <button className="ww-schnelle-nav-btn primary" onClick={goNext} aria-label="Nächste Frage">
            <span>NÄCHSTE</span>
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {!isLast && (
        <button className="ww-text-btn" onClick={reshuffle} style={{ marginTop: 16 }}>
          <RotateCcw size={14} /> Neue 5 ziehen
        </button>
      )}
    </div>
  );
}

// ============================================================
// Programm / Zeitplan
// ============================================================

// Cross-platform maps link: opens the maps app on mobile, web map on desktop.
function mapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function formatScheduleDay(day) {
  if (!day) return 'Ohne Datum';
  try {
    const d = new Date(day + 'T00:00:00');
    if (isNaN(d.getTime())) return day;
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });
  } catch { return day; }
}

// Format a Date as a local ISO day (YYYY-MM-DD). Avoids toISOString(), which
// converts to UTC and can shift the date by ±1 in non-UTC timezones.
function localISODay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Enumerate ISO days (YYYY-MM-DD) from start to end inclusive. Open-ended
// (no start) → []. End missing → just the single start day.
function enumerateDays(start, end) {
  if (!start) return [];
  const out = [];
  const s = new Date(start + 'T00:00:00');
  if (isNaN(s.getTime())) return [];
  const e = end ? new Date(end + 'T00:00:00') : s;
  if (isNaN(e.getTime()) || e < s) return [start];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(localISODay(d));
    if (out.length > 60) break; // safety
  }
  return out;
}

function ScheduleView({ schedule, admin, onPatch, eventStart, eventEnd }) {
  const [editing, setEditing] = useState(null); // entry being edited, or {} for new
  const eventDays = useMemo(() => enumerateDays(eventStart, eventEnd), [eventStart, eventEnd]);
  const openEnded = !eventStart && !eventEnd;

  const entries = useMemo(() => {
    const list = Array.isArray(schedule?.entries) ? [...schedule.entries] : [];
    list.sort((a, b) => (a.day || '').localeCompare(b.day || '') || (a.time || '').localeCompare(b.time || ''));
    return list;
  }, [schedule]);

  // group by day; for fixed-range events pre-seed every event day so the plan
  // mirrors the event's timeframe (empty days show a hint).
  const groups = useMemo(() => {
    const m = new Map();
    for (const d of eventDays) m.set(d, []);
    for (const e of entries) {
      const k = e.day || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    }
    return [...m.entries()].sort((a, b) => (a[0] || '').localeCompare(b[0] || ''));
  }, [entries, eventDays]);

  const saveEntry = (entry) => {
    const list = Array.isArray(schedule?.entries) ? [...schedule.entries] : [];
    if (entry.id) {
      const idx = list.findIndex(x => x.id === entry.id);
      if (idx >= 0) list[idx] = entry; else list.push(entry);
    } else {
      list.push({ ...entry, id: String(Date.now()) });
    }
    onPatch({ entries: list });
    setEditing(null);
  };
  const deleteEntry = async (id) => {
    if (!await appConfirm('Programmpunkt löschen?')) return;
    const list = (schedule?.entries || []).filter(x => x.id !== id);
    onPatch({ entries: list });
  };

  return (
    <div className="ww-sched">
      {admin && (
        <button className="ww-big-cta" style={{ marginTop: 0 }} onClick={() => setEditing({ day: eventDays[0] || '' })}>
          <Plus size={18} /><span>PROGRAMMPUNKT</span>
        </button>
      )}

      {entries.length === 0 && eventDays.length === 0 && (
        <div className="ww-empty" style={{ marginTop: 14 }}>
          {admin ? 'Noch nichts geplant — füge den ersten Programmpunkt hinzu.' : 'Der Host hat noch kein Programm eingetragen.'}
        </div>
      )}

      {groups.map(([day, items]) => (
        <div key={day || 'none'} className="ww-sched-day">
          <div className="ww-sched-day-head">{formatScheduleDay(day)}</div>
          {items.length === 0 && (
            <div className="ww-sched-empty">{admin ? 'Noch nichts geplant für diesen Tag.' : 'Nichts geplant.'}</div>
          )}
          <div className="ww-sched-list">
            {items.map(e => (
              <div key={e.id} className="ww-sched-item">
                <div className="ww-sched-time">{e.time || '—'}</div>
                <div className="ww-sched-body">
                  <div className="ww-sched-title">{e.title}</div>
                  {e.location && <div className="ww-sched-loc">📍 {e.location}</div>}
                  {e.address && (
                    <a className="ww-sched-addr" href={mapsUrl(e.address)} target="_blank" rel="noopener noreferrer">
                      🗺️ {e.address}
                    </a>
                  )}
                  {e.note && <div className="ww-sched-note">{e.note}</div>}
                </div>
                {admin && (
                  <div className="ww-sched-actions">
                    <button className="ww-mini-btn" onClick={() => setEditing(e)}>✎</button>
                    <button className="ww-mini-btn red" onClick={() => deleteEntry(e.id)}><X size={12} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {editing && admin && (
        <ScheduleEntryDrawer entry={editing} onSave={saveEntry} onClose={() => setEditing(null)} eventDays={eventDays} openEnded={openEnded} />
      )}
    </div>
  );
}

function ScheduleEntryDrawer({ entry, onSave, onClose, eventDays = [], openEnded = false }) {
  const [day, setDay] = useState(entry.day || eventDays[0] || '');
  const [time, setTime] = useState(entry.time || '');
  const [title, setTitle] = useState(entry.title || '');
  const [location, setLocation] = useState(entry.location || '');
  const [address, setAddress] = useState(entry.address || '');
  const [note, setNote] = useState(entry.note || '');
  const valid = title.trim().length >= 2;
  // Fixed-range events: pick from the event's days. Open-ended: free date input.
  const useDropdown = eventDays.length > 0;
  // Ensure the currently-edited day is selectable even if it's outside the range.
  const dayOptions = useDropdown && day && !eventDays.includes(day) ? [day, ...eventDays] : eventDays;
  return (
    <ModuleSettingsDrawer title={entry.id ? '🗓️ Programmpunkt bearbeiten' : '🗓️ Neuer Programmpunkt'} onClose={onClose}>
      <label className="ww-label">TITEL</label>
      <input className="ww-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="z.B. Abendessen im Restaurant" />
      <div className="ww-grid2">
        <div>
          <label className="ww-label">TAG</label>
          {useDropdown ? (
            <select className="ww-input" value={day} onChange={e => setDay(e.target.value)}>
              {dayOptions.map(d => <option key={d} value={d}>{formatScheduleDay(d)}</option>)}
            </select>
          ) : (
            <input className="ww-input" type="date" value={day} onChange={e => setDay(e.target.value)} />
          )}
        </div>
        <div>
          <label className="ww-label">UHRZEIT</label>
          <input className="ww-input" type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>
      <label className="ww-label">ORT (NAME)</label>
      <input className="ww-input" value={location} onChange={e => setLocation(e.target.value)} maxLength={80} placeholder="z.B. Trattoria Bella" />
      <label className="ww-label">ADRESSE (FÜR KARTEN-APP)</label>
      <input className="ww-input" value={address} onChange={e => setAddress(e.target.value)} maxLength={160} placeholder="z.B. Hauptstr. 1, 79100 Freiburg" />
      <label className="ww-label">NOTIZ (OPTIONAL)</label>
      <textarea className="ww-textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="z.B. Tisch auf Disco reserviert, Dresscode leger" />
      <button className={`ww-big-cta ${valid ? '' : 'disabled'}`} disabled={!valid}
        onClick={() => onSave({ ...entry, day, time, title: title.trim(), location: location.trim(), address: address.trim(), note: note.trim() })}>
        <Check size={18} /><span>SPEICHERN</span>
      </button>
    </ModuleSettingsDrawer>
  );
}

// ============================================================
// Challenges (peer dares for points)
// ============================================================

function ChallengesView({ me, admin, members, challenges, onCreate, onResolve, onDelete }) {
  const usersById = useMemo(() => {
    const m = {};
    for (const mem of members) if (mem.expand?.user) m[mem.expand.user.id] = mem.expand.user;
    return m;
  }, [members]);
  const others = members.map(m => m.expand?.user).filter(u => u && u.id !== me.id);

  const [mode, setMode] = useState('single'); // 'single' | 'random' | 'group'
  const [toUser, setToUser] = useState('');
  const [text, setText] = useState('');
  const [reward, setReward] = useState(3);
  const [secret, setSecret] = useState(false);
  const [isPhoto, setIsPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failingId, setFailingId] = useState(null); // challenge being marked failed
  const [penalty, setPenalty] = useState(3);

  const open = challenges.filter(c => !c.status || c.status === 'open');
  const resolved = challenges.filter(c => c.status === 'done' || c.status === 'failed');
  const textOk = text.trim().length >= 2 && Number(reward) > 0;
  // Secret challenges are 1:1 (a private dare) → force single mode.
  const effMode = secret ? 'single' : mode;
  const valid = textOk && others.length > 0 && (effMode !== 'single' || toUser);
  const canResolve = (c) => c.fromUser === me.id || admin;
  // Who may read a secret challenge's text: the two involved + host/admin.
  const canSeeSecret = (c) => !c.secret || c.fromUser === me.id || c.toUser === me.id || admin;

  const uname = (id) => { const u = usersById[id]; return u ? `${u.emoji || '🍺'} ${u.displayName || u.email}` : '?'; };

  const rollRandom = () => {
    const c = randomChallenge(text.trim());
    setText(c.text); setReward(c.reward || 3); setIsPhoto(!!c.photo);
  };

  const submit = async () => {
    if (!valid) return;
    let toUsers = [];
    if (effMode === 'group') toUsers = others.map(u => u.id);
    else if (effMode === 'random') toUsers = [others[Math.floor(Math.random() * others.length)].id];
    else toUsers = [toUser];
    setBusy(true);
    try {
      await onCreate({ toUsers, text: text.trim(), reward: Number(reward), secret, isPhoto });
      setText(''); setToUser(''); setReward(3); setMode('single'); setSecret(false); setIsPhoto(false);
    } finally { setBusy(false); }
  };
  const markDone = (c) => onResolve(c.id, { status: 'done' });
  const startFail = (c) => { setFailingId(c.id); setPenalty(Number(c.reward) || 3); };
  const confirmFail = (c) => { onResolve(c.id, { status: 'failed', penalty: Number(penalty) || 0 }); setFailingId(null); };

  return (
    <div className="ww-challenges">
      <section className="ww-section">
        <div className="ww-section-head"><Target size={16} /><h3>NEUE CHALLENGE</h3></div>
        <p className="ww-muted" style={{ fontSize: 12, marginTop: -2 }}>
          Fordere jemanden heraus. Schafft er's, kriegt er die Punkte. Schafft
          er's nicht, legst du beim Auflösen die Strafe fest.
        </p>
        <label className="ww-label">WEN?</label>
        <div className="ww-chal-modes">
          {[
            { k: 'single', label: 'Spieler' },
            { k: 'random', label: '🎲 Zufällig' },
            { k: 'group', label: '👥 Gruppe' },
          ].map(m => (
            <button key={m.k} type="button" disabled={secret && m.k !== 'single'}
              className={`ww-auth-tab ${effMode === m.k ? 'active' : ''}`}
              onClick={() => setMode(m.k)}>{m.label}</button>
          ))}
        </div>
        {effMode === 'single' && (
          <select className="ww-input" style={{ marginTop: 8 }} value={toUser} onChange={e => setToUser(e.target.value)}>
            <option value="">— Spieler wählen —</option>
            {others.map(u => <option key={u.id} value={u.id}>{u.displayName || u.email}</option>)}
          </select>
        )}
        {effMode === 'random' && (
          <p className="ww-muted" style={{ fontSize: 12, marginTop: 8 }}>
            🎲 Ein zufälliger Mitspieler wird beim Stellen ausgelost.
          </p>
        )}
        {effMode === 'group' && (
          <p className="ww-muted" style={{ fontSize: 12, marginTop: 8 }}>
            👥 Alle {others.length} Mitspieler bekommen die Challenge — jeder
            wird einzeln aufgelöst.
          </p>
        )}
        <div className="ww-chal-toggles">
          <button type="button" className={`ww-chal-toggle ${secret ? 'on' : ''}`}
            onClick={() => setSecret(s => !s)}>
            {secret ? <EyeOff size={14} /> : <Eye size={14} />} Geheim
          </button>
          <button type="button" className={`ww-chal-toggle ${isPhoto ? 'on' : ''}`}
            onClick={() => setIsPhoto(p => !p)}>
            📸 Foto-Challenge
          </button>
        </div>
        {secret && (
          <p className="ww-muted" style={{ fontSize: 11, marginTop: 6 }}>
            🤫 Nur du & {toUser ? (usersById[toUser]?.displayName || 'der Spieler') : 'der Spieler'} seht den Text.
            Du allein entscheidest, ob bestanden — und zahlst die Punkte aus deinem eigenen Konto.
          </p>
        )}
        <div className="ww-chal-label-row">
          <label className="ww-label">CHALLENGE</label>
          <button type="button" className="ww-chal-roll" onClick={rollRandom}><Dice5 size={13} /> Zufall</button>
        </div>
        <textarea className="ww-textarea" rows={2} maxLength={280} value={text}
          onChange={e => setText(e.target.value)} placeholder="z.B. Trink ein Bier in unter 10 Sekunden" />
        <label className="ww-label">{secret ? 'PUNKTE (zahlst du)' : 'PUNKTE BEI ERFOLG'}</label>
        <input className="ww-input" type="number" inputMode="numeric" min={1} max={100}
          value={reward} onChange={e => setReward(e.target.value)} />
        <button className={`ww-big-cta ${valid && !busy ? '' : 'disabled'}`} disabled={!valid || busy} onClick={submit}>
          {busy ? <span className="ww-spinner" /> : <Target size={20} />}<span>CHALLENGE STELLEN</span>
        </button>
      </section>

      {open.length > 0 && (
        <section className="ww-section">
          <div className="ww-section-head"><h3>OFFEN</h3></div>
          <div className="ww-board">
            {open.map(c => (
              <div key={c.id} className="ww-chal-card">
                <div className="ww-chal-top">
                  <span className="ww-chal-who">{uname(c.fromUser)} → <b>{uname(c.toUser)}</b></span>
                  <span className="ww-chal-reward">+{c.reward}</span>
                </div>
                {(c.secret || c.isPhoto) && (
                  <div className="ww-chal-badges">
                    {c.secret && <span className="ww-chal-badge secret">🤫 Geheim</span>}
                    {c.isPhoto && <span className="ww-chal-badge photo">📸 Foto-Beweis</span>}
                  </div>
                )}
                <div className="ww-chal-text">
                  {canSeeSecret(c) ? c.text : <span className="ww-muted">🤫 Geheime Challenge — nur für {uname(c.toUser)} sichtbar</span>}
                </div>
                {canResolve(c) && failingId !== c.id && (
                  <div className="ww-chal-actions">
                    <button className="ww-mini-btn green" onClick={() => markDone(c)}><Check size={12} /> Erfüllt</button>
                    <button className="ww-mini-btn red" onClick={() => startFail(c)}><X size={12} /> Nicht erfüllt</button>
                    <button className="ww-mini-btn" onClick={() => onDelete(c.id)}><Trash2 size={12} /></button>
                  </div>
                )}
                {canResolve(c) && failingId === c.id && (
                  <div className="ww-chal-fail">
                    <span className="ww-muted" style={{ fontSize: 12 }}>Strafe (Punkte abziehen):</span>
                    <input className="ww-input ww-chal-penalty" type="number" inputMode="numeric" min={0} max={100}
                      value={penalty} onChange={e => setPenalty(e.target.value)} />
                    <button className="ww-mini-btn red" onClick={() => confirmFail(c)}>−{Number(penalty) || 0} bestätigen</button>
                    <button className="ww-mini-btn" onClick={() => setFailingId(null)}>Abbruch</button>
                  </div>
                )}
                {!canResolve(c) && (
                  <div className="ww-muted" style={{ fontSize: 11 }}>{uname(c.fromUser).split(' ').slice(1).join(' ')} entscheidet, ob erfüllt.</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {resolved.length > 0 && (
        <section className="ww-section">
          <div className="ww-section-head"><h3>ERLEDIGT</h3></div>
          <div className="ww-board">
            {resolved.map(c => (
              <div key={c.id} className={`ww-chal-card ${c.status === 'done' ? 'done' : 'failed'}`}>
                <div className="ww-chal-top">
                  <span className="ww-chal-who"><b>{uname(c.toUser)}</b>{c.secret && ' 🤫'}</span>
                  <span className={c.status === 'done' ? 'ww-chal-reward' : 'ww-chal-penalty-badge'}>
                    {c.status === 'done' ? `+${c.reward}` : `−${c.penalty || 0}`}
                  </span>
                </div>
                <div className="ww-chal-text">
                  {canSeeSecret(c) ? c.text : <span className="ww-muted">🤫 Geheime Challenge</span>}
                </div>
                <div className="ww-chal-bottom">
                  <span className={`ww-chal-status ${c.status}`}>{c.status === 'done' ? '✓ erfüllt' : '✗ nicht erfüllt'}</span>
                  {canResolve(c) && <button className="ww-mini-btn" onClick={() => onDelete(c.id)}><Trash2 size={12} /></button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// Weinwanderung — log wines, everyone rates 1–5 glasses
// ============================================================

function GlassRating({ value, onPick, size = 22 }) {
  // Interactive 1–5 wine-glass rating. value=0 means not yet rated.
  return (
    <div className="ww-glasses" role="radiogroup" aria-label="Bewertung">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n} type="button"
          className={`ww-glass ${n <= value ? 'on' : ''}`}
          style={{ fontSize: size }}
          onClick={() => onPick(n === value ? 0 : n)}
          aria-label={`${n} Gläser`}
          aria-pressed={n <= value}
        >🍷</button>
      ))}
    </div>
  );
}

function WineView({ me, admin, eventId, members, wines, ratings, onCreate, onDelete, onRate, factJump, onFactJumpDone }) {
  const usersById = useMemo(() => {
    const m = {};
    for (const mem of members) if (mem.expand?.user) m[mem.expand.user.id] = mem.expand.user;
    return m;
  }, [members]);

  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [sort, setSort] = useState('new'); // 'new' | 'best'
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null); // wine id whose raters are shown

  // Fun facts (loaded from the backend catalogue).
  const [facts, setFacts] = useState([]);
  const [factsOpen, setFactsOpen] = useState(false);
  const [openFact, setOpenFact] = useState(null); // index of the expanded fact
  const [factPushBusy, setFactPushBusy] = useState(false);
  const [factPushed, setFactPushed] = useState(false);
  useEffect(() => { getWineFacts().then(setFacts).catch(() => {}); }, []);
  // A fun-fact push deep-links here with a fact index → open it.
  useEffect(() => {
    if (factJump == null) return;
    setFactsOpen(true);
    setOpenFact(factJump);
    setTimeout(() => { document.getElementById(`fact-${factJump}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
    onFactJumpDone?.();
  }, [factJump]);

  const sendFact = async () => {
    setFactPushBusy(true);
    try { await pushWineFact(eventId); setFactPushed(true); setTimeout(() => setFactPushed(false), 2500); }
    catch (_) {}
    finally { setFactPushBusy(false); }
  };

  // Aggregate ratings per wine + the individual ratings grouped per wine.
  const stats = useMemo(() => {
    const byWine = {};
    for (const r of ratings) {
      if (!byWine[r.wine]) byWine[r.wine] = { sum: 0, count: 0, mine: 0 };
      byWine[r.wine].sum += Number(r.rating) || 0;
      byWine[r.wine].count += 1;
      if (r.user === me.id) byWine[r.wine].mine = Number(r.rating) || 0;
    }
    return byWine;
  }, [ratings, me.id]);
  const ratingsByWine = useMemo(() => {
    const m = {};
    for (const r of ratings) { (m[r.wine] = m[r.wine] || []).push(r); }
    for (const k of Object.keys(m)) m[k].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return m;
  }, [ratings]);

  const openWine = (id) => { setExpanded(id); setSort('best'); setTimeout(() => { document.getElementById(`wine-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); };

  const enriched = wines.map(w => {
    const s = stats[w.id] || { sum: 0, count: 0, mine: 0 };
    return { ...w, avg: s.count ? s.sum / s.count : 0, count: s.count, mine: s.mine };
  });

  const ranked = [...enriched].filter(w => w.count > 0).sort((a, b) => b.avg - a.avg || b.count - a.count);
  const list = sort === 'best'
    ? [...enriched].sort((a, b) => b.avg - a.avg || b.count - a.count)
    : enriched; // already -created (newest first) from the API
  const rankOf = (id) => ranked.findIndex(w => w.id === id);

  const totalWines = wines.length;
  const overallAvg = ranked.length ? (ranked.reduce((s, w) => s + w.avg, 0) / ranked.length) : 0;
  const fmt1 = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const submit = async () => {
    if (name.trim().length < 2) return;
    setBusy(true);
    try { await onCreate({ name, note }); setName(''); setNote(''); }
    finally { setBusy(false); }
  };

  const medal = (id) => { const r = rankOf(id); return r === 0 ? '🥇' : r === 1 ? '🥈' : r === 2 ? '🥉' : null; };

  return (
    <div className="ww-wine">
      <div className="ww-stats-row">
        <StatPill label="Weine" value={totalWines} />
        <StatPill label="Ø Wertung" value={overallAvg ? `${fmt1(overallAvg)}🍷` : '—'} accent />
        <StatPill label="Bewertet" value={ranked.length} />
      </div>

      {/* Podium — tap a wine to jump to it + see who rated it. */}
      {ranked.length > 0 && (
        <section className="ww-section">
          <div className="ww-section-head"><Trophy size={16} /><h3>TOP 3 — LIVE</h3></div>
          <div className="ww-board">
            {ranked.slice(0, 3).map((w, i) => (
              <button key={w.id} className="ww-board-row clickable" style={{ width: '100%', border: 'none', background: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => openWine(w.id)}>
                <div className="ww-board-rank">{['🥇', '🥈', '🥉'][i]}</div>
                <div className="ww-board-name">{w.name}</div>
                <div className="ww-board-pts">{fmt1(w.avg)}<span>🍷 ({w.count})</span></div>
              </button>
            ))}
          </div>
          <div className="ww-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 6 }}>
            Tipp auf einen Wein → springt hin & zeigt, wer wie bewertet hat
          </div>
        </section>
      )}

      {/* Wein-Wissen: fun facts (pushed hourly + on demand, read here) */}
      <section className="ww-section">
        <button className="ww-funfact-head" onClick={() => setFactsOpen(o => !o)}>
          <span className="ww-funfact-title"><Sparkles size={16} /> WEIN-WISSEN</span>
          <span className="ww-funfact-sub">{facts.length} Fun Facts</span>
          <ChevronRight size={16} style={{ transform: factsOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
        </button>
        {admin && (
          <button className={`ww-funfact-send ${factPushed ? 'done' : ''}`} onClick={sendFact} disabled={factPushBusy || factPushed}>
            {factPushed ? <><Check size={15} /> Fun-Fact verschickt!</> : <>{factPushBusy ? <span className="ww-spinner" /> : <Send size={15} />} Fun-Fact jetzt an alle pushen</>}
          </button>
        )}
        {factsOpen && (
          <div className="ww-funfact-list">
            {facts.length === 0 && <div className="ww-empty">Lade Fun Facts… 🍷</div>}
            {facts.map((f, i) => (
              <div key={i} id={`fact-${i}`} className={`ww-funfact-item ${openFact === i ? 'open' : ''}`}>
                <button className="ww-funfact-item-head" onClick={() => setOpenFact(openFact === i ? null : i)}>
                  <span className="ww-funfact-item-title">🍷 {f.title}</span>
                  <ChevronRight size={14} style={{ transform: openFact === i ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
                </button>
                {openFact === i && <div className="ww-funfact-item-text">{f.text}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add wine */}
      <section className="ww-section">
        <div className="ww-section-head"><Plus size={16} /><h3>WEIN EINTRAGEN</h3></div>
        <input className="ww-input" placeholder="Name, z.B. Riesling Spätlese 2021"
          value={name} maxLength={120} onChange={e => setName(e.target.value)} />
        <input className="ww-input" style={{ marginTop: 6 }} placeholder="Notiz (Winzer / Ort / optional)"
          value={note} maxLength={200} onChange={e => setNote(e.target.value)} />
        <button className={`ww-big-cta ${name.trim().length >= 2 && !busy ? '' : 'disabled'}`}
          disabled={name.trim().length < 2 || busy} onClick={submit}>
          {busy ? <span className="ww-spinner" /> : <Plus size={20} />}<span>WEIN HINZUFÜGEN</span>
        </button>
      </section>

      {/* Wine list */}
      <section className="ww-section">
        <div className="ww-section-head" style={{ justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Wine size={16} /><h3 style={{ display: 'inline' }}>ALLE WEINE</h3></span>
          <div className="ww-auth-tabs" style={{ margin: 0, width: 'auto' }}>
            <button className={`ww-auth-tab ${sort === 'new' ? 'active' : ''}`} onClick={() => setSort('new')}>NEUESTE</button>
            <button className={`ww-auth-tab ${sort === 'best' ? 'active' : ''}`} onClick={() => setSort('best')}>BESTE</button>
          </div>
        </div>

        {list.length === 0 && (
          <div className="ww-empty">Noch keine Weine — trag den ersten ein! 🍷</div>
        )}

        <div className="ww-wine-list">
          {list.map(w => {
            const adder = usersById[w.addedBy];
            const canDelete = admin || w.addedBy === me.id;
            const raters = ratingsByWine[w.id] || [];
            const isOpen = expanded === w.id;
            return (
              <div key={w.id} id={`wine-${w.id}`} className={`ww-wine-card ${isOpen ? 'open' : ''}`}>
                <div className="ww-wine-top">
                  <div className="ww-wine-head">
                    <div className="ww-wine-name">{medal(w.id) && <span className="ww-wine-medal">{medal(w.id)}</span>}{w.name}</div>
                    <div className="ww-wine-meta">
                      {adder ? `${adder.emoji || '🍺'} ${adder.displayName || adder.email?.split('@')[0]}` : '?'}
                      {w.note ? ` · ${w.note}` : ''}
                    </div>
                  </div>
                  <div className="ww-wine-avg">
                    {w.count ? <><b>{fmt1(w.avg)}</b><span>🍷 · {w.count}</span></> : <span className="ww-wine-noavg">noch offen</span>}
                  </div>
                </div>
                <div className="ww-wine-rate">
                  <span className="ww-wine-rate-label">{w.mine ? 'Deine Wertung' : 'Bewerten:'}</span>
                  <GlassRating value={w.mine} onPick={(n) => onRate(w.id, n)} />
                </div>
                {w.count > 0 && (
                  <button className="ww-wine-raters-toggle" onClick={() => setExpanded(isOpen ? null : w.id)}>
                    👥 {w.count} {w.count === 1 ? 'Bewertung' : 'Bewertungen'}
                    <ChevronRight size={14} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                  </button>
                )}
                {isOpen && (
                  <div className="ww-wine-raters">
                    {raters.map(r => {
                      const u = usersById[r.user];
                      return (
                        <div key={r.id} className="ww-wine-rater">
                          <span className="ww-wine-rater-name">{u?.emoji || '🍺'} {u?.displayName || u?.email?.split('@')[0] || '?'}{r.user === me.id ? ' (du)' : ''}</span>
                          <span className="ww-wine-rater-glasses">{'🍷'.repeat(Math.max(0, Math.min(5, r.rating || 0)))}<span className="ww-wine-rater-num"> {r.rating}</span></span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {canDelete && (
                  <button className="ww-wine-del" onClick={() => onDelete(w.id)} aria-label="Wein löschen"><Trash2 size={13} /></button>
                )}
              </div>
            );
          })}
        </div>
      </section>
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

  const startNewGame = async () => {
    const hasState = (mod.sets || []).length > 0 || (mod.teams || []).length > 0 || (mod.participants || []).length > 0;
    if (hasState && !await appConfirm('Aktuelles Spiel archivieren und neues starten? Teams und Sets werden zurückgesetzt.', { title: 'Neues Spiel?', destructive: false, okLabel: 'STARTEN' })) return;
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
  // The drawer is `position: fixed; bottom: 0; height: 85vh` (layout viewport).
  // When the iOS keyboard opens it shrinks the *visual* viewport but NOT the
  // layout viewport, so the drawer's bottom (and the focused input) end up
  // behind the keyboard. iOS reacts by translating the whole fixed page up —
  // the "content schiebt sich nach oben" the user sees. Fix: track the visual
  // viewport, compute the keyboard height, and lift + shrink the drawer to sit
  // exactly above the keyboard. Then nothing is hidden, so iOS has no reason
  // to scroll the page. Also defensively pin any residual page offset to 0.
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      if (vv) {
        const h = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        setKb(h);
      }
      // Counter the iOS page-translate so the app stays anchored.
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
      const se = document.scrollingElement;
      if (se && se.scrollTop !== 0) se.scrollTop = 0;
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('scroll', apply, { passive: true });
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('scroll', apply);
    };
  }, []);

  // Portal to <body> so the drawer escapes any ancestor positioning
  // context (.ww-app's flex/overflow:hidden was clipping fixed children
  // on iOS Safari). With the portal it's a direct child of <body>,
  // position: fixed works as expected, and we can fill the viewport
  // safely.
  return createPortal(
    <>
      <div className="ww-drawer-backdrop" onClick={onClose} />
      <div
        className="ww-drawer"
        role="dialog"
        aria-modal="true"
        style={kb > 0 ? { bottom: kb, maxHeight: `calc(100vh - ${kb}px - max(60px, env(safe-area-inset-top, 0px) + 16px))` } : undefined}
      >
        <div className="ww-drawer-head">
          <h3>{title}</h3>
          <button className="ww-icon-btn" onClick={onClose} aria-label="Schließen"><X size={16} /></button>
        </div>
        <div className="ww-drawer-body">{children}</div>
      </div>
    </>,
    document.body
  );
}

const DRINK_EMOJI_CHOICES = ['🍺','🍻','🍷','🥂','🍾','🥃','🍸','🍹','🍶','🧉','🍵','☕','🥤','🧃','🧊','🔥','🍫','🌶️','🍾','🥛'];

function DrinksLiveSettings({ event, onSave }) {
  const [drinks, setDrinks] = useState(() => eventDrinks(event).map(d => ({
    id: d.id || `dr-${Math.random().toString(36).slice(2, 8)}`,
    emoji: d.emoji || '🍺', label: d.label || '', points: d.points ?? 1,
  })));
  const [emojiPickerFor, setEmojiPickerFor] = useState(null);

  const update = (i, field, val) => setDrinks(arr => arr.map((d, j) => j === i ? { ...d, [field]: val } : d));
  const addDrink = () => setDrinks(arr => [...arr, { id: `dr-${Date.now()}`, emoji: '🥤', label: '', points: 1 }]);
  const removeDrink = (i) => setDrinks(arr => arr.filter((_, j) => j !== i));

  const save = () => {
    const cleaned = drinks
      .map(d => ({ id: d.id, emoji: d.emoji || '🍺', label: (d.label || '').trim() || 'Drink', points: Math.max(0, Number(d.points) || 0) }))
      .slice(0, 8);
    if (cleaned.length === 0) return;
    // Keep legacy fields roughly in sync for any old code paths.
    onSave({
      drinks: cleaned,
      beerLabel: cleaned[0]?.label || 'Bier',
      drinkLabel: cleaned[1]?.label || 'Mische',
      pointsPerBeer: cleaned[0]?.points ?? 1,
      pointsPerMische: cleaned[1]?.points ?? 1,
    });
  };

  return (
    <div>
      <p className="ww-muted" style={{ fontSize: 12, marginTop: -2 }}>
        Lege fest, womit man punktet — Emoji, Name und Punkte pro Getränk.
        z.B. „🍷 Großer Wein" = 2 Pkt, „🥃 Kleiner Wein" = 1 Pkt.
      </p>
      <div className="ww-drinkcfg-list">
        {drinks.map((d, i) => (
          <div key={d.id} className="ww-drinkcfg-row">
            <button type="button" className="ww-drinkcfg-emoji" onClick={() => setEmojiPickerFor(emojiPickerFor === i ? null : i)}>
              {d.emoji}
            </button>
            <input className="ww-input ww-drinkcfg-name" placeholder="Name" maxLength={18}
              value={d.label} onChange={e => update(i, 'label', e.target.value)} />
            <input className="ww-input ww-drinkcfg-pts" type="number" inputMode="numeric" min={0} max={20}
              value={d.points} onChange={e => update(i, 'points', e.target.value)} aria-label="Punkte" />
            <span className="ww-drinkcfg-pkt">Pkt</span>
            <button type="button" className="ww-mini-btn red" onClick={() => removeDrink(i)} disabled={drinks.length <= 1} aria-label="Entfernen"><X size={12} /></button>
            {emojiPickerFor === i && (
              <div className="ww-drinkcfg-emojis">
                {DRINK_EMOJI_CHOICES.map(em => (
                  <button key={em} type="button" className={`ww-emoji-btn ${d.emoji === em ? 'sel' : ''}`}
                    onClick={() => { update(i, 'emoji', em); setEmojiPickerFor(null); }}>{em}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {drinks.length < 8 && (
        <button className="ww-mini-btn" onClick={addDrink} style={{ marginTop: 8 }}><Plus size={12} /> Getränk hinzufügen</button>
      )}
      <button className="ww-big-cta" onClick={save} style={{ marginTop: 14 }}><Check size={20} /><span>SPEICHERN</span></button>
      <p className="ww-muted" style={{ fontSize: 11, marginTop: 8 }}>
        💡 Bestehende Zähler bleiben erhalten. Löschst du ein Getränk, zählen
        seine bisherigen Punkte nicht mehr mit (Zähler bleiben aber gespeichert).
      </p>
    </div>
  );
}

function FlunkyLiveSettings({ flunky, onPatch }) {
  const [ppw, setPpw] = useState(flunky.pointsPerWin || 3);
  useEffect(() => setPpw(flunky.pointsPerWin || 3), [flunky.pointsPerWin]);
  const save = () => onPatch({ pointsPerWin: Number(ppw) });
  const clearHistory = async () => {
    if (!await appConfirm('Alle Spiele dieses Events löschen?', { title: 'Historie löschen?' })) return;
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

function CrewView({ members, statsMap, event, flunky, jeopardy, customModules, challenges, myId, onShowUserDetail, onSaveMyWishes }) {
  const myMembership = members.find(m => (m.expand?.user?.id || m.user) === myId);
  return (
    <div className="ww-crew">
      {myMembership && (
        <MyEventWishes membership={myMembership} onSave={onSaveMyWishes} eventName={event.name} />
      )}
      <div className="ww-section-head"><Users size={16} /><h3>DIE CREW ({members.length})</h3></div>
      <div className="ww-crew-list">
        {members.map(m => {
          const u = m.expand?.user; if (!u) return null;
          const s = statsMap[u.id] || { beer: 0, mische: 0 };
          const points = computeTotalPoints(u.id, s, event, flunky, customModules, jeopardy, challenges);
          // Event-specific wishes live on the membership row.
          const food = m.foodWishes || '';
          const drink = m.drinkWishes || '';
          return (
            <div key={u.id} className={`ww-crew-card ${u.id === myId ? 'me' : ''}`}>
              <button className="ww-crew-head clickable" onClick={() => onShowUserDetail?.(u.id)}>
                <div className="ww-crew-emoji">{u.emoji || '🍺'}</div>
                <div className="ww-crew-name">{u.displayName || u.email}{u.id === myId && <span className="ww-you">DU</span>}</div>
                <div className="ww-crew-pts">{points} pkt</div>
              </button>
              <div className="ww-crew-mini">
                {eventDrinks(event).map(d => (
                  <span key={d.id}>{d.emoji || '🍺'} {drinkCount(s, d.id)}</span>
                ))}
              </div>
              {food && <div className="ww-crew-line"><b>Essen:</b> {food}</div>}
              {drink && <div className="ww-crew-line"><b>Trinken:</b> {drink}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Editable card for the current user's event-specific food/drink wishes.
function MyEventWishes({ membership, onSave, eventName }) {
  const [food, setFood] = useState(membership.foodWishes || '');
  const [drink, setDrink] = useState(membership.drinkWishes || '');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setFood(membership.foodWishes || '');
    setDrink(membership.drinkWishes || '');
  }, [membership.id, membership.foodWishes, membership.drinkWishes]);
  const dirty = food !== (membership.foodWishes || '') || drink !== (membership.drinkWishes || '');
  const hasWishes = (membership.foodWishes || '').trim() || (membership.drinkWishes || '').trim();

  return (
    <div className="ww-mywishes">
      <button className="ww-mywishes-head" onClick={() => setOpen(o => !o)}>
        <Utensils size={15} />
        <span className="ww-mywishes-title">Meine Wünsche für dieses Event</span>
        <ChevronRight size={16} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {!open && !hasWishes && (
        <p className="ww-muted" style={{ fontSize: 12, margin: '4px 2px 0' }}>
          Noch keine Wünsche — tippe zum Hinzufügen, was du auf {eventName} essen/trinken willst.
        </p>
      )}
      {!open && hasWishes && (
        <div className="ww-mywishes-summary">
          {membership.foodWishes && <div className="ww-crew-line"><b>Essen:</b> {membership.foodWishes}</div>}
          {membership.drinkWishes && <div className="ww-crew-line"><b>Trinken:</b> {membership.drinkWishes}</div>}
        </div>
      )}
      {open && (
        <div className="ww-mywishes-form">
          <label className="ww-label"><Utensils size={12} /> ESSENSWÜNSCHE (DIESES EVENT)</label>
          <textarea className="ww-textarea" rows={2} value={food} onChange={e => setFood(e.target.value)}
            placeholder="z.B. Spareribs, Grillkäse, viel Fleisch..." />
          <label className="ww-label"><Beer size={12} /> GETRÄNKEWÜNSCHE (DIESES EVENT)</label>
          <textarea className="ww-textarea" rows={2} value={drink} onChange={e => setDrink(e.target.value)}
            placeholder="z.B. Tannenzäpfle, Bourbon, Mate..." />
          <button className={`ww-big-cta ${dirty ? '' : 'disabled'}`} disabled={!dirty}
            onClick={() => onSave({ foodWishes: food.trim(), drinkWishes: drink.trim() })}>
            <Check size={18} /><span>WÜNSCHE SPEICHERN</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// User detail drawer (point breakdown)
// ============================================================

function UserDetailDrawer({ user, membership, stats, event, flunky, jeopardy, customModules, isMe, onClose }) {
  if (!user) return null;
  const evFood = membership?.foodWishes || '';
  const evDrink = membership?.drinkWishes || '';
  const s = stats || {};
  const drinks = eventDrinks(event);
  const drinkById = {}; for (const d of drinks) drinkById[d.id] = d;
  const drinkBreakdown = drinks.map(d => ({ d, count: drinkCount(s, d.id), pts: drinkCount(s, d.id) * (Number(d.points) || 0) }));
  const drinkPts = drinkBreakdown.reduce((n, x) => n + x.pts, 0);

  // Timestamped drink history (newest first). Drinks logged before this
  // feature shipped have no timestamp — show them as a count-only remainder.
  const drinkLog = (Array.isArray(s.log) ? s.log : [])
    .filter(e => e && e.k && e.t)
    .slice()
    .sort((a, b) => (b.t || 0) - (a.t || 0));
  const totalDrinks = totalDrinkCount(s, event);
  const untrackedDrinks = Math.max(0, totalDrinks - drinkLog.length);

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
          <div className="ww-detail-section-head">🍺 GETRÄNKE</div>
          {drinkBreakdown.map(({ d, count, pts }) => (
            <DetailRow key={d.id} label={`${d.emoji || '🍺'} ${d.label} × ${Number(d.points) || 0} pkt`} count={count} pts={pts} />
          ))}
          <DetailRow label="Summe" pts={drinkPts} bold />
        </div>

        {(drinkLog.length > 0 || untrackedDrinks > 0) && (
          <div className="ww-detail-section">
            <div className="ww-detail-section-head">🕓 GETRÄNKE-VERLAUF</div>
            {drinkLog.length > 0 ? (
              <div className="ww-drinklog">
                {drinkLog.map((e, i) => (
                  <div key={i} className="ww-drinklog-row">
                    <span className="ww-drinklog-emoji">{drinkById[e.k]?.emoji || '🍺'}</span>
                    <span className="ww-drinklog-label">{drinkById[e.k]?.label || e.k}</span>
                    <span className="ww-drinklog-time">{formatDrinkTime(e.t)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ww-muted" style={{ fontSize: 12, padding: '8px 0' }}>Noch keine Getränke mit Zeitstempel.</div>
            )}
            {untrackedDrinks > 0 && (
              <div className="ww-muted" style={{ fontSize: 11, marginTop: 6 }}>
                + {untrackedDrinks} ohne Zeitstempel (vor dieser Funktion gezählt).
              </div>
            )}
          </div>
        )}

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

        {(evFood || evDrink) && (
          <div className="ww-detail-section">
            <div className="ww-detail-section-head">🍽 WÜNSCHE FÜR DIESES EVENT</div>
            {evFood && <div className="ww-detail-wish"><b>Essen:</b> {evFood}</div>}
            {evDrink && <div className="ww-detail-wish"><b>Trinken:</b> {evDrink}</div>}
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
  const [notifPerm, setNotifPerm] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const dirty = displayName !== (me.displayName || '') || emoji !== (me.emoji || '');
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
      <div className="ww-profile-hint">
        Essens- & Getränke-Wünsche setzt du pro Event im <b>Crew</b>-Tab des
        jeweiligen Events.
      </div>
      <button className={`ww-big-cta ${dirty ? '' : 'disabled'}`} disabled={!dirty}
        onClick={() => onSave({ displayName: displayName.trim(), emoji })}>
        <Check size={20} /><span>SPEICHERN</span>
      </button>

      {notifPerm !== 'unsupported' && (
        <>
          <label className="ww-label" style={{ marginTop: 24 }}><Bell size={12} /> PUSH-BENACHRICHTIGUNGEN</label>
          {notifPerm === 'granted' ? (
            <div className="ww-notif-banner-ok" style={{ marginTop: 6 }}>
              <Bell size={13} /><span>Erlaubt — du wirst benachrichtigt wenn ein Event startet.</span>
            </div>
          ) : notifPerm === 'denied' ? (
            <p className="ww-muted" style={{ fontSize: 12 }}>
              <BellOff size={12} style={{ verticalAlign: 'middle' }} /> Blockiert — in den Browser-/System-Einstellungen erlauben.
            </p>
          ) : (
            <button
              className="ww-big-cta"
              style={{ marginTop: 8 }}
              onClick={async () => {
                const r = await Notification.requestPermission();
                setNotifPerm(r);
                if (r === 'granted') ensurePushSubscription();
              }}
            >
              <Bell size={18} /><span>BENACHRICHTIGUNGEN ERLAUBEN</span>
            </button>
          )}
        </>
      )}

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

      <p className="ww-muted" style={{ fontSize: 12, marginTop: 14 }}>
        📦 <b>Module verwalten</b> findest du jetzt direkt im Home-Tab — der ＋-Button rechts neben den Modulleiste.
      </p>

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

      <BroadcastSection eventId={event.id} memberCount={members.length} />

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

// Host → all members email broadcast.
function BroadcastSection({ eventId, memberCount }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const valid = subject.trim().length >= 2 && body.trim().length >= 2;

  const send = async () => {
    if (!valid) return;
    if (!await appConfirm(`Nachricht an alle ${memberCount} Teilnehmer per E-Mail senden?`, { title: 'Broadcast senden?', destructive: false, okLabel: 'SENDEN' })) return;
    setBusy(true); setMsg('');
    try {
      const r = await broadcastEmail(eventId, subject.trim(), body.trim());
      setMsg(`✓ ${r.sent} verschickt${r.failed ? `, ${r.failed} fehlgeschlagen` : ''}.`);
      setSubject(''); setBody('');
    } catch (e) {
      setMsg(`Fehler: ${String(e?.message || e).slice(0, 120)}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="ww-section">
      <button className="ww-section-head" onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', color: 'inherit' }}>
        <Mail size={16} /><h3 style={{ flex: 1, textAlign: 'left' }}>NACHRICHT AN ALLE (E-MAIL)</h3>
        <ChevronRight size={16} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <label className="ww-label">BETREFF</label>
          <input className="ww-input" value={subject} onChange={e => setSubject(e.target.value)} maxLength={120} placeholder="z.B. Wichtige Info zum Wochenende" />
          <label className="ww-label">NACHRICHT</label>
          <textarea className="ww-textarea" rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Deine Nachricht an alle Teilnehmer…" />
          {msg && <div className={msg.startsWith('✓') ? 'ww-notif-banner-ok' : 'ww-err'} style={{ marginTop: 8 }}>{msg}</div>}
          <button className={`ww-big-cta ${valid && !busy ? '' : 'disabled'}`} onClick={send} disabled={!valid || busy}>
            {busy ? <span className="ww-spinner" /> : <Mail size={18} />}<span>{busy ? 'SENDE…' : `AN ${memberCount} SENDEN`}</span>
          </button>
        </div>
      )}
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

// ============================================================
// Tools view — its own bottom-nav page, separate from game modules.
// Lists every available tool; tapping opens it inline with a back link.
// ============================================================
// ============================================================
// Polls / Umfragen tool
// ============================================================
function PollsView({ me, admin, members, polls, pollVotes, onCreate, onUpdate, onDelete, onVote }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="ww-polls">
      <p className="ww-muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Umfragen fürs Event — funktionieren auch bevor das Event gestartet ist.
      </p>

      {admin && !creating && (
        <button className="ww-big-cta" style={{ marginTop: 0 }} onClick={() => setCreating(true)}>
          <Plus size={18} /><span>NEUE UMFRAGE</span>
        </button>
      )}
      {admin && creating && (
        <PollComposer
          onCancel={() => setCreating(false)}
          onSubmit={(data) => { onCreate(data); setCreating(false); }}
        />
      )}

      {polls.length === 0 && !creating && (
        <div className="ww-empty" style={{ marginTop: 14 }}>Noch keine Umfragen.</div>
      )}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {polls.map(p => (
          <PollCard
            key={p.id} poll={p} me={me} admin={admin} members={members}
            votes={pollVotes.filter(v => v.poll === p.id)}
            onVote={onVote} onUpdate={onUpdate} onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function PollComposer({ onCancel, onSubmit }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowText, setAllowText] = useState(false);
  const validOpts = options.map(o => o.trim()).filter(Boolean);
  const valid = question.trim().length >= 3 && (validOpts.length >= 2 || allowText);

  const submit = () => {
    if (!valid) return;
    const opts = validOpts.map((label, i) => ({ id: `o${i}_${Math.random().toString(36).slice(2, 6)}`, label }));
    onSubmit({ question: question.trim(), options: opts, allowText });
  };

  return (
    <div className="ww-poll-composer">
      <label className="ww-label">FRAGE</label>
      <input className="ww-input" value={question} onChange={e => setQuestion(e.target.value)}
        placeholder="z.B. Was wollen wir essen?" maxLength={200} />
      <label className="ww-label">ANTWORT-OPTIONEN</label>
      {options.map((o, i) => (
        <div key={i} className="ww-poll-opt-row">
          <input className="ww-input" style={{ margin: 0 }} value={o} maxLength={60}
            placeholder={`Option ${i + 1} (z.B. ${i === 0 ? 'Pizza' : 'Grillen'})`}
            onChange={e => setOptions(arr => arr.map((x, j) => j === i ? e.target.value : x))} />
          {options.length > 2 && (
            <button className="ww-mini-btn red" onClick={() => setOptions(arr => arr.filter((_, j) => j !== i))}>
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      <button className="ww-mini-btn" onClick={() => setOptions(arr => [...arr, ''])} style={{ marginTop: 6 }}>
        <Plus size={12} /> Option
      </button>
      <button
        className={`ww-module-toggle ${allowText ? 'on' : ''}`}
        onClick={() => setAllowText(v => !v)}
        style={{ width: '100%', marginTop: 12 }}
      >
        <span className="ww-mod-icon">✏️</span>
        <span className="ww-mod-name">Freitext-Antwort erlauben</span>
        {allowText ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button className={`ww-big-cta ${valid ? '' : 'disabled'}`} disabled={!valid} onClick={submit}>
        <Check size={18} /><span>UMFRAGE STARTEN</span>
      </button>
      <button className="ww-text-btn" onClick={onCancel}><X size={14} /> abbrechen</button>
    </div>
  );
}

function PollCard({ poll, me, admin, members, votes, onVote, onUpdate, onDelete }) {
  const usersById = useMemo(() => {
    const m = {};
    for (const mem of members) if (mem.expand?.user) m[mem.expand.user.id] = mem.expand.user;
    return m;
  }, [members]);
  const myVote = votes.find(v => v.user === me.id);
  const [text, setText] = useState(myVote?.text || '');
  useEffect(() => { setText(myVote?.text || ''); }, [myVote?.text]);

  const options = poll.options || [];
  const total = votes.filter(v => v.optionId).length;
  const countFor = (oid) => votes.filter(v => v.optionId === oid).length;
  const textAnswers = votes.filter(v => (v.text || '').trim()).map(v => ({
    user: usersById[v.user], text: v.text,
  }));

  const pick = (oid) => {
    if (poll.closed) return;
    onVote(poll.id, { optionId: oid, text: myVote?.text || '' });
  };
  const saveText = () => {
    if (poll.closed) return;
    onVote(poll.id, { optionId: myVote?.optionId || '', text: text.trim() });
  };

  return (
    <div className={`ww-poll-card ${poll.closed ? 'closed' : ''}`}>
      <div className="ww-poll-q-row">
        <div className="ww-poll-q">{poll.question}</div>
        {admin && (
          <div className="ww-poll-admin">
            <button className="ww-mini-btn" onClick={() => onUpdate(poll.id, { closed: !poll.closed })}>
              {poll.closed ? 'Öffnen' : 'Schließen'}
            </button>
            <button className="ww-mini-btn red" onClick={() => onDelete(poll.id)}><Trash2 size={12} /></button>
          </div>
        )}
      </div>
      {poll.closed && <div className="ww-poll-closed-tag">GESCHLOSSEN</div>}

      <div className="ww-poll-opts">
        {options.map(o => {
          const c = countFor(o.id);
          const pct = total > 0 ? Math.round((c / total) * 100) : 0;
          const mine = myVote?.optionId === o.id;
          return (
            <button key={o.id} className={`ww-poll-opt ${mine ? 'mine' : ''}`} onClick={() => pick(o.id)} disabled={poll.closed}>
              <div className="ww-poll-opt-bar" style={{ width: `${pct}%` }} />
              <span className="ww-poll-opt-label">{mine ? '✓ ' : ''}{o.label}</span>
              <span className="ww-poll-opt-count">{c} · {pct}%</span>
            </button>
          );
        })}
      </div>

      {poll.allowText && (
        <div className="ww-poll-text">
          <label className="ww-label">DEINE ANTWORT (FREITEXT)</label>
          <div className="ww-poll-opt-row">
            <textarea className="ww-textarea" style={{ margin: 0 }} rows={2} value={text}
              onChange={e => setText(e.target.value)} disabled={poll.closed}
              placeholder="Schreib was du willst…" />
          </div>
          <button className={`ww-mini-btn ${text.trim() !== (myVote?.text || '') ? '' : 'disabled'}`}
            onClick={saveText} disabled={poll.closed || text.trim() === (myVote?.text || '')} style={{ marginTop: 6 }}>
            <Check size={12} /> Antwort speichern
          </button>
          {textAnswers.length > 0 && (
            <div className="ww-poll-answers">
              {textAnswers.map((a, i) => (
                <div key={i} className="ww-poll-answer">
                  <b>{a.user?.emoji || '🍺'} {a.user?.displayName || a.user?.email || '?'}:</b> {a.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolsView({ me, admin, event, members, kitty, onKittyPatch, onSaveEvent,
  polls, pollVotes, onPollCreate, onPollUpdate, onPollDelete, onVote, open, setOpen, isUnread = () => false }) {
  if (open) {
    const tool = moduleById(open);
    return (
      <div className="ww-tool-open">
        <button className="ww-back" onClick={() => setOpen(null)}>
          <ArrowLeft size={18} /> Werkzeuge
        </button>
        <h2 className="ww-display ww-title-big">{tool?.icon} {tool?.name}</h2>
        {open === 'polls' && (
          <PollsView me={me} admin={admin} members={members} polls={polls} pollVotes={pollVotes}
            onCreate={onPollCreate} onUpdate={onPollUpdate} onDelete={onPollDelete} onVote={onVote} />
        )}
        {open === 'team_split' && (
          <TeamSplitView event={event} members={members} admin={admin} onSaveEvent={onSaveEvent} />
        )}
        {open === 'kitty' && (
          <KittyView me={me} kitty={kitty} members={members} admin={admin} onPatch={onKittyPatch} />
        )}
        {open === 'chessclock' && (
          <ChessClockView />
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="ww-display ww-title-big">Werkzeuge</h2>
      <p className="ww-muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 14 }}>
        Helfer fürs Event — fließen nicht ins Leaderboard.
      </p>
      <div className="ww-tools-list">
        {TOOL_MODULES.map(t => (
          <button key={t.id} className="ww-tools-item" onClick={() => setOpen(t.id)}>
            <span className="ww-tools-item-icon">{t.icon}</span>
            <span className="ww-tools-item-name">{t.name}</span>
            {isUnread(t.id) && <span className="ww-unread-dot" style={{ position: 'static', marginRight: 4 }} aria-label="Neu" />}
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}

function fmtClock(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = ms / 1000;
  if (totalSec < 10) return totalSec.toFixed(1);
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Classic two-player chess clock. Pure local timer — nothing is persisted.
// Two stacked tap-zones (top one rotated 180° for the player sitting
// opposite). You tap your own side when you're done → the opponent's clock
// starts counting down.
function ChessClockView() {
  const [phase, setPhase] = useState('setup'); // 'setup' | 'play'
  const [minutes, setMinutes] = useState(5);
  const [increment, setIncrement] = useState(0); // Fischer increment (sec/move)
  const [topMs, setTopMs] = useState(0);
  const [bottomMs, setBottomMs] = useState(0);
  const [active, setActive] = useState(null); // 'top' | 'bottom' | null (not started)
  const [paused, setPaused] = useState(false);
  const lastRef = useRef(0);

  const flagged = topMs <= 0 ? 'top' : bottomMs <= 0 ? 'bottom' : null;
  const running = phase === 'play' && !!active && !paused && !flagged;

  useEffect(() => {
    if (!running) return;
    lastRef.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = now - lastRef.current;
      lastRef.current = now;
      if (active === 'top') setTopMs(v => Math.max(0, v - dt));
      else if (active === 'bottom') setBottomMs(v => Math.max(0, v - dt));
    }, 100);
    return () => clearInterval(id);
  }, [running, active]);

  const start = () => {
    const ms = Math.max(1, Number(minutes) || 1) * 60000;
    setTopMs(ms); setBottomMs(ms);
    setActive(null); setPaused(false);
    setPhase('play');
  };

  const tap = (side) => {
    if (phase !== 'play' || flagged || paused) return;
    if (active && active !== side) return; // not your turn
    const inc = (Number(increment) || 0) * 1000;
    if (inc > 0) {
      if (side === 'top') setTopMs(v => v + inc);
      else setBottomMs(v => v + inc);
    }
    setActive(side === 'top' ? 'bottom' : 'top');
  };

  const reset = () => { setPhase('setup'); setActive(null); setPaused(false); };
  const restart = () => {
    const ms = Math.max(1, Number(minutes) || 1) * 60000;
    setTopMs(ms); setBottomMs(ms); setActive(null); setPaused(false);
  };

  if (phase === 'setup') {
    const presets = [1, 3, 5, 10, 15, 30];
    return (
      <div className="ww-chess-setup">
        <p className="ww-muted" style={{ fontSize: 13, marginTop: -4 }}>
          Zwei Spieler, gegenüber. Wer fertig ist, tippt auf seine Seite — die Uhr des Gegners läuft.
        </p>
        <label className="ww-label">MINUTEN PRO SPIELER</label>
        <input className="ww-input" type="number" inputMode="numeric" min={1} max={180}
          value={minutes} onChange={e => setMinutes(e.target.value)} />
        <div className="ww-chess-presets">
          {presets.map(p => (
            <button key={p} type="button"
              className={`ww-mini-btn ${Number(minutes) === p ? 'active' : ''}`}
              onClick={() => setMinutes(p)}>{p} min</button>
          ))}
        </div>
        <label className="ww-label" style={{ marginTop: 14 }}>INKREMENT (SEK PRO ZUG, OPTIONAL)</label>
        <input className="ww-input" type="number" inputMode="numeric" min={0} max={60}
          value={increment} onChange={e => setIncrement(e.target.value)} />
        <button className="ww-big-cta green" onClick={start} style={{ marginTop: 18 }}>
          <Play size={20} /><span>SCHACHUHR STARTEN</span>
        </button>
      </div>
    );
  }

  // Play phase = a fixed full-screen layer (portal to body) so it fits the
  // viewport exactly and never scrolls — like a real chess-clock app.
  return createPortal(
    <div className="ww-chess-fs">
      <button
        className={`ww-chess-zone top ${active === 'top' ? 'active' : ''} ${flagged === 'top' ? 'flag' : ''}`}
        onClick={() => tap('top')}
        disabled={!!flagged}
      >
        <span className="ww-chess-time">{fmtClock(topMs)}</span>
        {flagged === 'top' && <span className="ww-chess-lost">ZEIT ABGELAUFEN</span>}
        {!flagged && active === 'top' && <span className="ww-chess-hint">du bist dran — tippen wenn fertig</span>}
      </button>

      <div className="ww-chess-controls">
        <button className="ww-mini-btn" onClick={() => setPaused(p => !p)} disabled={!active || !!flagged}>
          {paused ? <Play size={13} /> : <Hourglass size={13} />} {paused ? 'Weiter' : 'Pause'}
        </button>
        <button className="ww-mini-btn" onClick={restart}>↺ Neu</button>
        <button className="ww-mini-btn red" onClick={reset}><X size={12} /> Beenden</button>
      </div>

      <button
        className={`ww-chess-zone bottom ${active === 'bottom' ? 'active' : ''} ${flagged === 'bottom' ? 'flag' : ''}`}
        onClick={() => tap('bottom')}
        disabled={!!flagged}
      >
        <span className="ww-chess-time">{fmtClock(bottomMs)}</span>
        {flagged === 'bottom' && <span className="ww-chess-lost">ZEIT ABGELAUFEN</span>}
        {!flagged && active === 'bottom' && <span className="ww-chess-hint">du bist dran — tippen wenn fertig</span>}
        {!flagged && active === null && <span className="ww-chess-hint">tippe nach deinem Zug</span>}
      </button>
    </div>,
    document.body
  );
}

function BottomNav({ view, setView, homeUnread, toolsUnread }) {
  const items = [
    { k: 'home', icon: <Home size={20} />, label: 'Home', unread: homeUnread },
    { k: 'crew', icon: <Users size={20} />, label: 'Crew', unread: false },
    { k: 'tools', icon: <Wrench size={20} />, label: 'Tools', unread: toolsUnread },
  ];
  return (
    <nav className="ww-bottomnav">
      {items.map(it => (
        <button key={it.k} className={`ww-nav-btn ${view === it.k ? 'active' : ''}`} onClick={() => setView(it.k)}>
          <span className="ww-nav-icon-wrap">{it.icon}{view !== it.k && it.unread && <span className="ww-unread-dot nav" aria-label="Neu" />}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

function ConfirmDialog({ msg, title, destructive, okLabel, resolve }) {
  const yes = () => { _confirmSetState(null); resolve(true); };
  const no = () => { _confirmSetState(null); resolve(false); };
  // Dismiss on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') no(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div className="ww-confirm-overlay" onClick={no}>
      <div
        className="ww-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ww-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="ww-confirm-title" className="ww-confirm-title">{title}</div>
        <div className="ww-confirm-msg">{msg}</div>
        <div className="ww-confirm-btns">
          <button className="ww-confirm-cancel" onClick={no}>ABBRECHEN</button>
          <button className={`ww-confirm-ok ${destructive ? '' : 'amber'}`} onClick={yes}>
            {okLabel || (destructive ? 'LÖSCHEN' : 'OK')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AddCustomModuleDrawer({ onSubmit, onClose }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('teams');
  const [icon, setIcon] = useState('🎯');
  const valid = name.trim().length >= 1;
  const submit = () => {
    if (!valid) return;
    onSubmit({ name: name.trim(), mode, icon });
    onClose();
  };
  return (
    <ModuleSettingsDrawer title="＋ Custom Modul" onClose={onClose}>
      <label className="ww-label">NAME</label>
      <input
        className="ww-input"
        placeholder="z.B. Cornhole, Bierpong, Dart…"
        value={name}
        onChange={e => setName(e.target.value)}
        maxLength={30}
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      <label className="ww-label" style={{ marginTop: 18 }}>MODUS</label>
      <div className="ww-auth-tabs" style={{ marginBottom: 0 }}>
        <button className={`ww-auth-tab ${mode === 'teams' ? 'active' : ''}`} onClick={() => setMode('teams')}>TEAMS</button>
        <button className={`ww-auth-tab ${mode === 'solo' ? 'active' : ''}`} onClick={() => setMode('solo')}>SOLO</button>
      </div>
      <label className="ww-label" style={{ marginTop: 18 }}>ICON</label>
      <div className="ww-emoji-grid">
        {MODULE_ICONS.slice(0, 16).map(e => (
          <button key={e} type="button"
            className={`ww-emoji-btn ${icon === e ? 'sel' : ''}`}
            onClick={() => setIcon(e)}>{e}
          </button>
        ))}
      </div>
      <button
        className={`ww-big-cta ${valid ? '' : 'disabled'}`}
        onClick={submit}
        disabled={!valid}
        style={{ marginTop: 20 }}
      >
        <Plus size={20} /><span>MODUL ERSTELLEN</span>
      </button>
    </ModuleSettingsDrawer>
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

// Drink-log timestamp: weekday + time, plus the date only if it's not today.
function formatDrinkTime(t) {
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `heute ${time}`;
  const day = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${day} ${time}`;
}

// Compact date used inside a range (no weekday/year noise).
function formatDateShort(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }).toUpperCase();
  } catch { return iso; }
}

// Human label for an event's timeframe. Open-ended (no dates) → "OHNE ENDE".
function formatEventDates(ev) {
  if (!ev) return '';
  const { date, endDate } = ev;
  if (!date && !endDate) return 'OHNE ENDE';
  if (date && endDate && endDate !== date) {
    return `${formatDateShort(date)} – ${formatDateShort(endDate)}`;
  }
  return formatDate(date || endDate);
}

function GrainOverlay() { return <div className="ww-grain" aria-hidden="true" />; }
