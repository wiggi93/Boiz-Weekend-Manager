import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_PB_URL || 'http://localhost:8090';

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

export const isSiteAdmin = (u) => !!u && u.role === 'admin';
export const isHost = (u) => !!u && (u.role === 'admin' || u.role === 'host');
export const isEventCreator = (u, ev) => !!u && !!ev && ev.createdBy === u.id;
export const isEventHost = (u, ev) =>
  !!u && !!ev && Array.isArray(ev.hostUsers) && ev.hostUsers.includes(u.id);
// Event-admin: anyone allowed to change live event state (start/pause,
// modules, score games, kick). The original creator, anyone they
// promoted to event-host, and the site admin.
export const isEventAdmin = (u, ev) =>
  isSiteAdmin(u) || isEventCreator(u, ev) || isEventHost(u, ev);

// ---- Auth ----
export async function login(email, password) {
  return pb.collection('users').authWithPassword(email, password);
}

export async function register({ email, password, displayName, emoji }) {
  await pb.collection('users').create({
    email, password, passwordConfirm: password,
    displayName, emoji,
  });
  // Fire off a verification email. Do NOT auto-login: verification is required
  // before the account can sign in, so we leave the user logged out and let the
  // UI tell them to confirm via the link first.
  try { await pb.collection('users').requestVerification(email); } catch (_) {}
  return { needsVerification: true, email };
}

export function logout() { pb.authStore.clear(); }

export async function requestPasswordReset(email) {
  return pb.collection('users').requestPasswordReset(email);
}

export async function requestVerification(email) {
  return pb.collection('users').requestVerification(email);
}

// Host broadcast: email every member of an event.
export async function broadcastEmail(eventId, subject, body) {
  const res = await fetch(`${PB_URL}/api/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
    body: JSON.stringify({ eventId, subject, body }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`broadcast failed (${res.status}): ${t.slice(0, 200)}`);
  }
  return res.json();
}

// ---- Events ----
export async function listAllEvents() {
  return pb.collection('events').getFullList();
}

export async function getEvent(id) {
  return pb.collection('events').getOne(id);
}

export async function getEventByCode(code) {
  return pb.collection('events').getFirstListItem(`code="${code.trim().toUpperCase()}"`);
}

export async function createEvent({ name, date = '', endDate = '', modules = ['drinks'] }) {
  return pb.collection('events').create({
    name, date, endDate,
    modules,
    active: false,
    beerLabel: 'Bier', drinkLabel: 'Mische',
    pointsPerBeer: 1, pointsPerMische: 1,
    drinks: [
      { id: 'beer', emoji: '🍺', label: 'Bier', points: 1 },
      { id: 'mische', emoji: '🍷', label: 'Mische', points: 1 },
    ],
    createdBy: pb.authStore.record.id,
  });
}

export async function updateEvent(id, patch) {
  return pb.collection('events').update(id, patch);
}

export async function deleteEvent(id) {
  return pb.collection('events').delete(id);
}

// ---- Memberships ----
export async function listMyMemberships() {
  if (!pb.authStore.record) return [];
  return pb.collection('event_members').getFullList({
    filter: `user="${pb.authStore.record.id}"`,
    expand: 'event',
  });
}

export async function listEventMembers(eventId) {
  return pb.collection('event_members').getFullList({
    filter: `event="${eventId}"`,
    expand: 'user',
  });
}

export async function joinByCode(code) {
  const event = await getEventByCode(code);
  const meId = pb.authStore.record?.id;
  if (!meId) throw new Error('Not authenticated');
  try {
    await pb.collection('event_members').create({ event: event.id, user: meId });
  } catch (e) {
    // 400 = unique index violation = already joined → ignore
    if (e?.status !== 400) throw e;
  }
  return event;
}

export async function leaveEvent(eventId, userId) {
  const meId = userId || pb.authStore.record?.id;
  const m = await pb.collection('event_members').getFirstListItem(`event="${eventId}" && user="${meId}"`);
  return pb.collection('event_members').delete(m.id);
}

export async function kickMember(memberRecordId) {
  return pb.collection('event_members').delete(memberRecordId);
}

// Per-event wishes live on the membership row (event-specific, unlike the
// profile-level general preferences on the user record).
export async function updateMembership(memberRecordId, patch) {
  return pb.collection('event_members').update(memberRecordId, patch);
}

// ---- Stats ----
export async function loadEventStats(eventId) {
  const list = await pb.collection('stats').getFullList({ filter: `event="${eventId}"` });
  const map = {};
  for (const s of list) map[s.user] = { id: s.id, beer: s.beer || 0, mische: s.mische || 0, counts: (s.counts && typeof s.counts === 'object') ? s.counts : {}, log: Array.isArray(s.log) ? s.log : [] };
  return map;
}

export async function setMyCount(statsId, vals) {
  return pb.collection('stats').update(statsId, vals);
}

export async function resetEventStats(eventId) {
  const all = await pb.collection('stats').getFullList({ filter: `event="${eventId}"` });
  await Promise.all(all.map(s => pb.collection('stats').update(s.id, { beer: 0, mische: 0, counts: {}, log: [] })));
}

// ---- Users ----
export async function updateMyProfile(userId, patch) {
  return pb.collection('users').update(userId, patch);
}

export async function loadAllUsers() {
  return pb.collection('users').getFullList();
}

export async function setUserRole(userId, role) {
  return pb.collection('users').update(userId, { role });
}

export async function setUserApproved(userId, approved) {
  return pb.collection('users').update(userId, { approved });
}

export async function deleteUser(userId) {
  return pb.collection('users').delete(userId);
}

// ---- Flunkyball ----
export async function getFlunky(eventId) {
  try {
    return await pb.collection('flunky').getFirstListItem(`event="${eventId}"`);
  } catch {
    return null;
  }
}

export async function updateFlunky(id, patch) {
  return pb.collection('flunky').update(id, patch);
}

// ---- Jeopardy ----
export async function getJeopardy(eventId) {
  try {
    return await pb.collection('jeopardy').getFirstListItem(`event="${eventId}"`);
  } catch {
    return null;
  }
}

export async function updateJeopardy(id, patch) {
  return pb.collection('jeopardy').update(id, patch);
}

export async function ensureJeopardy(eventId) {
  const existing = await getJeopardy(eventId);
  if (existing) return existing;
  return pb.collection('jeopardy').create({
    event: eventId,
    categories: [],
    pointsPerPosition: [5, 3, 2, 1],
    participants: [],
    rounds: [],
  });
}

export async function generateJeopardyBoard(eventId, categories, avoid = [], surprise = false) {
  // Generation can take a while (Opus). Give it a generous-but-bounded window
  // and surface a clear timeout message instead of the browser's opaque
  // "load failed" when an edge proxy drops a too-long request.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 110000);
  let res;
  try {
    res = await fetch(`${PB_URL}/api/jeopardy/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify({ eventId, categories, avoid, surprise }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('Zeitüberschreitung beim Generieren — versuch es nochmal (ggf. weniger/kürzere Kategorien).');
    }
    throw new Error('Verbindung beim Generieren abgebrochen — nochmal versuchen.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`generate failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Start a full round server-side: the backend generates the board, builds the
// round, SAVES it on the jeopardy record and pushes the participants. The
// client just fires this — it can then background/lock the phone; the round
// arrives via realtime when it lands. Flag questions are pre-built offline by
// the client and passed in (no flag bank on the server).
export async function startJeopardyRound(eventId, { categories, aiCategories, flagQuestions = [], surprise = false }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 115000);
  let res;
  try {
    res = await fetch(`${PB_URL}/api/jeopardy/start-round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
      body: JSON.stringify({ eventId, categories, aiCategories, flagQuestions: JSON.stringify(flagQuestions), surprise }),
      signal: ctrl.signal,
    });
  } catch (e) {
    // The request may drop (timeout / backgrounded), but the server still
    // finishes + saves the round. Signal "pending" rather than a hard error.
    if (e?.name === 'AbortError') { const err = new Error('pending'); err.pending = true; throw err; }
    const err = new Error('pending'); err.pending = true; throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`start-round failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ---- Wine fun facts ----
let _wineFactsCache = null;
export async function getWineFacts() {
  if (_wineFactsCache) return _wineFactsCache;
  const res = await fetch(`${PB_URL}/api/wine/facts`, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!res.ok) throw new Error('facts failed');
  const data = await res.json();
  _wineFactsCache = Array.isArray(data.facts) ? data.facts : [];
  return _wineFactsCache;
}
// Host triggers a random fun-fact push to all event members.
export async function pushWineFact(eventId) {
  const res = await fetch(`${PB_URL}/api/wine/fact-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
    body: JSON.stringify({ eventId }),
  });
  if (!res.ok) throw new Error(`fact-push failed (${res.status})`);
  return res.json();
}

// ---- Kitty Split ----
export async function getKitty(eventId) {
  try {
    return await pb.collection('kitty').getFirstListItem(`event="${eventId}"`);
  } catch {
    return null;
  }
}

export async function updateKitty(id, patch) {
  return pb.collection('kitty').update(id, patch);
}

export async function ensureKitty(eventId) {
  const existing = await getKitty(eventId);
  if (existing) return existing;
  return pb.collection('kitty').create({ event: eventId, expenses: [] });
}

// ---- Schnelle Fragen (5 Schnelle, Tool-Modul) ----
export async function getSchnelleFragen(eventId) {
  try {
    return await pb.collection('schnelle_fragen').getFirstListItem(`event="${eventId}"`);
  } catch {
    return null;
  }
}

export async function updateSchnelleFragen(id, patch) {
  return pb.collection('schnelle_fragen').update(id, patch);
}

export async function ensureSchnelleFragen(eventId) {
  const existing = await getSchnelleFragen(eventId);
  if (existing) return existing;
  return pb.collection('schnelle_fragen').create({ event: eventId, currentIdx: 0, qIds: [] });
}

// ---- Custom modules ----
export async function listCustomModules(eventId) {
  return pb.collection('custom_modules').getFullList({
    filter: `event="${eventId}"`,
    sort: 'created',
  });
}

export async function createCustomModule(data) {
  return pb.collection('custom_modules').create(data);
}

export async function updateCustomModule(id, patch) {
  return pb.collection('custom_modules').update(id, patch);
}

export async function deleteCustomModule(id) {
  return pb.collection('custom_modules').delete(id);
}

// ---- Schedule / Programm ----
export async function getSchedule(eventId) {
  try {
    return await pb.collection('schedule').getFirstListItem(`event="${eventId}"`);
  } catch {
    return null;
  }
}

export async function updateSchedule(id, patch) {
  return pb.collection('schedule').update(id, patch);
}

export async function ensureSchedule(eventId) {
  const existing = await getSchedule(eventId);
  if (existing) return existing;
  return pb.collection('schedule').create({ event: eventId, entries: [] });
}

// ---- Polls ----
export async function listPolls(eventId) {
  return pb.collection('polls').getFullList({ filter: `event="${eventId}"`, sort: '-created' });
}

export async function createPoll(data) {
  return pb.collection('polls').create(data);
}

export async function updatePoll(id, patch) {
  return pb.collection('polls').update(id, patch);
}

export async function deletePoll(id) {
  return pb.collection('polls').delete(id);
}

export async function listPollVotes(eventId) {
  // Dot-notation filter across the poll relation gets every vote for the event.
  return pb.collection('poll_votes').getFullList({ filter: `poll.event="${eventId}"` });
}

// ---- Web Push ----
// Real OS-level push notifications. iOS needs ≥16.4 AND the PWA installed to
// the Home Screen; permission must already be granted (we piggyback on the
// existing Notification permission flow). Idempotent — safe to call on every
// boot once permission is granted.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function ensurePushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (!pb.authStore.isValid || Notification.permission !== 'granted') return false;
  try {
    const res = await fetch(`${PB_URL}/api/push/pubkey`);
    const { key } = await res.json();
    if (!key) return false; // server not configured for push yet

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }

    const json = sub.toJSON();
    const meId = pb.authStore.record.id;
    // Upsert by endpoint: the endpoint may already exist (re-login on the
    // same device, possibly under another account) — claim/update it then.
    try {
      const existing = await pb.collection('push_subs')
        .getFirstListItem(`endpoint = "${json.endpoint.replace(/"/g, '\\"')}"`);
      if (existing.user !== meId || JSON.stringify(existing.keys) !== JSON.stringify(json.keys)) {
        await pb.collection('push_subs').update(existing.id, { user: meId, keys: json.keys });
      }
    } catch {
      await pb.collection('push_subs').create({
        user: meId,
        endpoint: json.endpoint,
        keys: json.keys,
        ua: navigator.userAgent.slice(0, 280),
      });
    }
    return true;
  } catch (e) {
    console.warn('push subscribe failed', e);
    return false;
  }
}

// ---- Weinwanderung (wine rating) ----
export async function listWines(eventId) {
  return pb.collection('wines').getFullList({ filter: `event="${eventId}"`, sort: '-created' });
}
export async function createWine({ eventId, name, note }) {
  return pb.collection('wines').create({
    event: eventId, name, note: note || '', addedBy: pb.authStore.record.id,
  });
}
export async function deleteWine(id) {
  return pb.collection('wines').delete(id);
}
export async function listWineRatings(eventId) {
  return pb.collection('wine_ratings').getFullList({ filter: `wine.event="${eventId}"` });
}
// Upsert the current user's rating for a wine (one row per wine+user).
export async function rateWine(wineId, rating) {
  const meId = pb.authStore.record.id;
  try {
    const existing = await pb.collection('wine_ratings').getFirstListItem(`wine="${wineId}" && user="${meId}"`);
    return pb.collection('wine_ratings').update(existing.id, { rating });
  } catch {
    return pb.collection('wine_ratings').create({ wine: wineId, user: meId, rating });
  }
}

// ---- Challenges (peer dares for points) ----
export async function listChallenges(eventId) {
  return pb.collection('challenges').getFullList({ filter: `event="${eventId}"`, sort: '-created' });
}

export async function createChallenge({ eventId, toUser, text, reward, secret = false, isPhoto = false }) {
  return pb.collection('challenges').create({
    event: eventId,
    fromUser: pb.authStore.record.id,
    toUser,
    text,
    reward: Number(reward) || 0,
    penalty: 0,
    status: 'open',
    secret: !!secret,
    isPhoto: !!isPhoto,
  });
}

export async function updateChallenge(id, patch) {
  return pb.collection('challenges').update(id, patch);
}

export async function deleteChallenge(id) {
  return pb.collection('challenges').delete(id);
}

// ---- Wer würde eher (Most-Likely-To) ----
export async function listMlQuestions(eventId) {
  return pb.collection('ml_questions').getFullList({ filter: `event="${eventId}"`, sort: '-created' });
}
export async function createMlQuestion({ eventId, text, points }) {
  return pb.collection('ml_questions').create({
    event: eventId,
    createdBy: pb.authStore.record.id,
    text,
    points: Number(points) || 2,
    closed: false,
    winnerId: '',
  });
}
export async function updateMlQuestion(id, patch) {
  return pb.collection('ml_questions').update(id, patch);
}
export async function deleteMlQuestion(id) {
  return pb.collection('ml_questions').delete(id);
}
export async function listMlVotes(eventId) {
  return pb.collection('ml_votes').getFullList({ filter: `event="${eventId}"` });
}
// Upsert the current user's vote for a question (one row per question+voter).
export async function castMlVote(questionId, eventId, targetId) {
  const meId = pb.authStore.record?.id;
  if (!meId) throw new Error('Not authenticated');
  try {
    const existing = await pb.collection('ml_votes').getFirstListItem(`question="${questionId}" && voter="${meId}"`);
    return pb.collection('ml_votes').update(existing.id, { target: targetId });
  } catch (_) {
    return pb.collection('ml_votes').create({ question: questionId, event: eventId, voter: meId, target: targetId });
  }
}

// Upsert the current user's vote for a poll (one row per poll+user).
export async function castVote(pollId, { optionId, text }) {
  const meId = pb.authStore.record?.id;
  if (!meId) throw new Error('Not authenticated');
  try {
    const existing = await pb.collection('poll_votes').getFirstListItem(`poll="${pollId}" && user="${meId}"`);
    return pb.collection('poll_votes').update(existing.id, { optionId: optionId || '', text: text || '' });
  } catch (_) {
    return pb.collection('poll_votes').create({ poll: pollId, user: meId, optionId: optionId || '', text: text || '' });
  }
}

// ---- Realtime ----
// onChange receives (collection, event) so the consumer can dispatch
// incremental updates instead of refetching everything.
export async function subscribeEvent(eventId, onChange) {
  const safe = (p) => p.catch(() => () => {});
  const wrap = (collection, predicate) => (ev) => {
    if (!predicate || predicate(ev)) onChange(collection, ev);
  };
  const unsubs = await Promise.all([
    safe(pb.collection('events').subscribe(eventId, wrap('events'))),
    safe(pb.collection('stats').subscribe('*', wrap('stats', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('event_members').subscribe('*', wrap('event_members', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('flunky').subscribe('*', wrap('flunky', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('jeopardy').subscribe('*', wrap('jeopardy', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('custom_modules').subscribe('*', wrap('custom_modules', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('kitty').subscribe('*', wrap('kitty', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('schnelle_fragen').subscribe('*', wrap('schnelle_fragen', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('schedule').subscribe('*', wrap('schedule', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('polls').subscribe('*', wrap('polls', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('challenges').subscribe('*', wrap('challenges', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('ml_questions').subscribe('*', wrap('ml_questions', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('ml_votes').subscribe('*', wrap('ml_votes', (ev) => ev.record?.event === eventId))),
    safe(pb.collection('wines').subscribe('*', wrap('wines', (ev) => ev.record?.event === eventId))),
    // wine_ratings only carry the wine id — forward all, the consumer refetches.
    safe(pb.collection('wine_ratings').subscribe('*', wrap('wine_ratings'))),
    // poll_votes records only carry the poll id, not the event — forward all
    // and let the consumer refetch (votes are low-frequency).
    safe(pb.collection('poll_votes').subscribe('*', wrap('poll_votes'))),
    safe(pb.collection('users').subscribe('*', wrap('users'))),
  ]);
  return () => unsubs.forEach(fn => { try { fn(); } catch (_) {} });
}

export async function subscribeMyMemberships(onChange) {
  const meId = pb.authStore.record?.id;
  if (!meId) return () => {};
  try {
    return await pb.collection('event_members').subscribe('*', (ev) => {
      if (ev.record?.user === meId) onChange(ev);
    });
  } catch (_) { return () => {}; }
}
