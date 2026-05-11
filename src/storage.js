// ============================================================
// Storage abstraction
// ============================================================
// In der Claude-Artifact-Version war hier window.storage (mit
// shared:true sync zwischen allen Usern). In dieser Vite-Version
// nutzen wir localStorage als Drop-in-Ersatz mit identischem API.
//
// localStorage = nur auf diesem Gerät, kein Sync zwischen Handys.
// Für echtes Multi-Device-Sync am Jungs-Wochenende braucht ihr ein
// Backend. Empfohlene Optionen (alle haben Free-Tier):
//
//   1) Supabase (Postgres + REST) — am realistischsten
//   2) Firebase Realtime DB — live-sync out of the box
//   3) Eigener kleiner Node/Express Server + JSON-Datei
//
// Die Funktionen unten haben das gleiche Interface wie die
// Artifact-Version, sodass ihr beim Backend-Swap nur diese Datei
// austauschen müsst.
// ============================================================

const PREFIX_SHARED = 'bwm:shared:';
const PREFIX_LOCAL = 'bwm:local:';

const prefixFor = (shared) => (shared ? PREFIX_SHARED : PREFIX_LOCAL);

async function rawSet(key, value, shared) {
  try {
    localStorage.setItem(prefixFor(shared) + key, JSON.stringify(value));
    return { key, value, shared };
  } catch (e) {
    console.warn('storage.set failed', key, e);
    return null;
  }
}

async function rawGet(key, shared) {
  try {
    const raw = localStorage.getItem(prefixFor(shared) + key);
    if (raw === null) return null;
    return { key, value: JSON.parse(raw), shared };
  } catch (e) {
    return null;
  }
}

async function rawDelete(key, shared) {
  try {
    const fullKey = prefixFor(shared) + key;
    const existed = localStorage.getItem(fullKey) !== null;
    localStorage.removeItem(fullKey);
    return { key, deleted: existed, shared };
  } catch (e) {
    return null;
  }
}

async function rawList(prefix = '', shared = false) {
  try {
    const fullPrefix = prefixFor(shared) + prefix;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        keys.push(k.substring(prefixFor(shared).length));
      }
    }
    return { keys, prefix, shared };
  } catch (e) {
    return { keys: [], prefix, shared };
  }
}

// ---- Shared (across all "users") ----
export const sset = async (key, value) => {
  const r = await rawSet(key, value, true);
  return r;
};

export const sget = async (key, fallback = null) => {
  const r = await rawGet(key, true);
  return r ? r.value : fallback;
};

export const sdel = async (key) => rawDelete(key, true);

export const slist = async (prefix = '') => {
  const r = await rawList(prefix, true);
  return r.keys;
};

// ---- Local (per device) ----
export const lset = async (key, value) => rawSet(key, value, false);

export const lget = async (key, fallback = null) => {
  const r = await rawGet(key, false);
  return r ? r.value : fallback;
};

export const ldel = async (key) => rawDelete(key, false);
