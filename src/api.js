import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_PB_URL || 'http://localhost:8090';

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

export const isAdmin = (u) => !!u && u.role === 'admin';

export async function loadEvent() {
  const list = await pb.collection('event').getList(1, 1, { sort: 'created' });
  return list.items[0] || null;
}

export async function loadUsers() {
  return pb.collection('users').getFullList({ sort: 'created' });
}

export async function loadStats() {
  const list = await pb.collection('stats').getFullList();
  const map = {};
  for (const s of list) {
    map[s.user] = { id: s.id, beer: s.beer || 0, mische: s.mische || 0 };
  }
  return map;
}

export async function ensureMyStats(userId) {
  try {
    return await pb.collection('stats').getFirstListItem(`user="${userId}"`);
  } catch {
    return pb.collection('stats').create({ user: userId, beer: 0, mische: 0 });
  }
}

export async function bumpStat(statsId, kind, delta) {
  const cur = await pb.collection('stats').getOne(statsId);
  const next = Math.max(0, (cur[kind] || 0) + delta);
  return pb.collection('stats').update(statsId, { [kind]: next });
}

export async function updateMyProfile(userId, patch) {
  return pb.collection('users').update(userId, patch);
}

export async function updateEvent(eventId, patch) {
  return pb.collection('event').update(eventId, patch);
}

export async function resetAllStats() {
  const all = await pb.collection('stats').getFullList();
  await Promise.all(all.map(s =>
    pb.collection('stats').update(s.id, { beer: 0, mische: 0 })
  ));
}

export async function deleteUser(userId) {
  return pb.collection('users').delete(userId);
}

export async function setUserRole(userId, role) {
  return pb.collection('users').update(userId, { role });
}

export async function login(email, password) {
  return pb.collection('users').authWithPassword(email, password);
}

export async function register({ email, password, displayName, emoji, foodWishes, drinkWishes, allergies }) {
  await pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    displayName,
    emoji,
    foodWishes: foodWishes || '',
    drinkWishes: drinkWishes || '',
    allergies: allergies || '',
  });
  return login(email, password);
}

export function logout() {
  pb.authStore.clear();
}

export async function subscribeAll(onChange) {
  const unsubs = await Promise.all([
    pb.collection('users').subscribe('*', onChange).catch(() => () => {}),
    pb.collection('stats').subscribe('*', onChange).catch(() => () => {}),
    pb.collection('event').subscribe('*', onChange).catch(() => () => {}),
  ]);
  return () => {
    unsubs.forEach(fn => { try { fn(); } catch (_) {} });
  };
}
