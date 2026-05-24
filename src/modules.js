// Available event modules. Frontend renders the icon/name in the
// event-create flow and in the dashboard. `available: false` modules
// show as "Coming Soon" placeholders. `kind` separates competitive
// games (score into the leaderboard) from tools (helpers that don't).
export const MODULES = [
  // --- Games / Competitions (score into leaderboard) ---
  { id: 'drinks',     name: 'Bier-Counter',     icon: '🍺', available: true,  kind: 'game' },
  { id: 'flunky',     name: 'Flunkyball',       icon: '🎳', available: true,  kind: 'game' },
  { id: 'jeopardy',   name: 'Jeopardy',         icon: '🎤', available: true,  kind: 'game' },
  { id: 'gokart',     name: 'Go-Kart',          icon: '🏎️', available: false, kind: 'game' },
  { id: 'padel',      name: 'Padel-Tennis',     icon: '🎾', available: false, kind: 'game' },
  // --- Tools (Helpers, kein Scoring) ---
  { id: 'team_split', name: 'Team Aufteilung',  icon: '🎲', available: true,  kind: 'tool' },
  { id: 'kitty',      name: 'Kassensturz',      icon: '💰', available: true,  kind: 'tool' },
];

export const moduleById = (id) => MODULES.find(m => m.id === id);
export const isToolModule = (id) => moduleById(id)?.kind === 'tool';
