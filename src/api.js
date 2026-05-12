import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_PB_URL || 'http://localhost:8090';

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

export const isSiteAdmin = (u) => !!u && u.role === 'admin';
export const isHost = (u) => !!u && (u.role === 'admin' || u.role === 'host');
export const isEventAdmin = (u, ev) => isSiteAdmin(u) || (!!u && !!ev && ev.createdBy === u.id);

// ---- Auth ----
export async function login(email, password) {
  return pb.collection('users').authWithPassword(email, password);
}

export async function register({ email, password, displayName, emoji, foodWishes, drinkWishes, allergies }) {
  await pb.collection('users').create({
    email, password, passwordConfirm: password,
    displayName, emoji,
    foodWishes: foodWishes || '',
    drinkWishes: drinkWishes || '',
    allergies: allergies || '',
  });
  return login(email, password);
}

export function logout() { pb.authStore.clear(); }

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

export async function createEvent({ name, date, modules = ['drinks'] }) {
  return pb.collection('events').create({
    name, date,
    modules,
    active: false,
    beerLabel: 'Bier', drinkLabel: 'Mische',
    pointsPerBeer: 1, pointsPerMische: 1,
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

// ---- Stats ----
export async function loadEventStats(eventId) {
  const list = await pb.collection('stats').getFullList({ filter: `event="${eventId}"` });
  const map = {};
  for (const s of list) map[s.user] = { id: s.id, beer: s.beer || 0, mische: s.mische || 0 };
  return map;
}

export async function setMyCount(statsId, vals) {
  return pb.collection('stats').update(statsId, vals);
}

export async function resetEventStats(eventId) {
  const all = await pb.collection('stats').getFullList({ filter: `event="${eventId}"` });
  await Promise.all(all.map(s => pb.collection('stats').update(s.id, { beer: 0, mische: 0 })));
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
