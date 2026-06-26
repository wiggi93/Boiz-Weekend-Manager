// Available event modules. `kind` separates competitive games (score
// into the leaderboard) from tools (helpers that don't). Tools are
// ALWAYS available in every event — they are never selected/unselected
// in event.modules and don't appear in the "Module verwalten" toggle.
// `available: false` modules show as "Coming Soon" placeholders.
export const MODULES = [
  // --- Games / Module (selectable per event) ---
  { id: 'drinks',          name: 'Bier-Counter',     icon: '🍺',  available: true,  kind: 'game' },
  { id: 'flunky',          name: 'Flunkyball',       icon: '🎳',  available: true,  kind: 'game' },
  { id: 'jeopardy',        name: 'Jeopardy',         icon: '🎤',  available: true,  kind: 'game' },
  { id: 'schnelle_fragen', name: '5 Schnelle',       icon: '⚡',  available: true,  kind: 'game' },
  { id: 'schedule',        name: 'Programm',         icon: '🗓️', available: true,  kind: 'game' },
  { id: 'challenges',      name: 'Challenges',       icon: '🎯',  available: true,  kind: 'game' },
  { id: 'wine',            name: 'Weinwanderung',    icon: '🍷',  available: true,  kind: 'game' },
  { id: 'mostlikely',      name: 'Wer würde eher',   icon: '🤔',  available: true,  kind: 'game' },
  { id: 'werewolf',        name: 'Werwolf',          icon: '🐺',  available: true,  kind: 'game' },
  // --- Tools (Helpers, kein Scoring, immer verfügbar, NICHT in der Modulauswahl) ---
  { id: 'polls',           name: 'Umfragen',         icon: '📊',  available: true,  kind: 'tool' },
  { id: 'team_split',      name: 'Team Aufteilung',  icon: '🎲',  available: true,  kind: 'tool' },
  { id: 'kitty',           name: 'Kassensturz',      icon: '💰',  available: true,  kind: 'tool' },
  { id: 'chessclock',      name: 'Schachuhr',        icon: '⏱️', available: true,  kind: 'tool' },
];

export const moduleById = (id) => MODULES.find(m => m.id === id);
export const isToolModule = (id) => moduleById(id)?.kind === 'tool';
export const TOOL_MODULES = MODULES.filter(m => m.kind === 'tool' && m.available);
export const GAME_MODULES = MODULES.filter(m => m.kind === 'game');
