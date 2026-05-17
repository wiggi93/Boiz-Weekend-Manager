// Available event modules. Frontend renders the icon/name in the
// event-create flow and in the dashboard. `available: false` modules
// show as "Coming Soon" placeholders.
export const MODULES = [
  { id: 'drinks',   name: 'Bier-Counter',   icon: '🍺', available: true  },
  { id: 'flunky',   name: 'Flunkyball',     icon: '🎳', available: true  },
  { id: 'jeopardy', name: 'Jeopardy',       icon: '🎤', available: true  },
  { id: 'gokart',   name: 'Go-Kart',        icon: '🏎️', available: false },
  { id: 'padel',    name: 'Padel-Tennis',   icon: '🎾', available: false },
];

export const moduleById = (id) => MODULES.find(m => m.id === id);
