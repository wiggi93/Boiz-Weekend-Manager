// Offline-Flaggen-Datenbank für die Jeopardy-Kategorie "Flaggen".
// Länderflaggen sind als Unicode-Emoji nativ auf jedem Gerät verfügbar —
// kein Netzwerk, kein Bundle-Ballast, kein Copyright-Thema.
// Jede Flagge hat ein Schwierigkeits-Level 1..5 (1 = jeder kennt sie,
// 5 = sehr schwer). Beim Generieren einer Runde wird pro Level eine
// zufällige Flagge gezogen.
//
// code = ISO 3166-1 alpha-2 (daraus wird das Emoji berechnet)
// name = deutsche Antwort (akzeptierter Ländername)

export const FLAGS = [
  // ---- Level 1: jeder kennt sie ----
  { code: 'DE', name: 'Deutschland', level: 1 },
  { code: 'FR', name: 'Frankreich', level: 1 },
  { code: 'IT', name: 'Italien', level: 1 },
  { code: 'ES', name: 'Spanien', level: 1 },
  { code: 'US', name: 'USA', level: 1 },
  { code: 'GB', name: 'Vereinigtes Königreich', level: 1 },
  { code: 'JP', name: 'Japan', level: 1 },
  { code: 'CH', name: 'Schweiz', level: 1 },
  { code: 'AT', name: 'Österreich', level: 1 },
  { code: 'NL', name: 'Niederlande', level: 1 },
  { code: 'SE', name: 'Schweden', level: 1 },
  { code: 'BR', name: 'Brasilien', level: 1 },
  { code: 'CA', name: 'Kanada', level: 1 },
  { code: 'CN', name: 'China', level: 1 },
  { code: 'TR', name: 'Türkei', level: 1 },

  // ---- Level 2: kurz überlegen ----
  { code: 'PL', name: 'Polen', level: 2 },
  { code: 'GR', name: 'Griechenland', level: 2 },
  { code: 'PT', name: 'Portugal', level: 2 },
  { code: 'NO', name: 'Norwegen', level: 2 },
  { code: 'DK', name: 'Dänemark', level: 2 },
  { code: 'FI', name: 'Finnland', level: 2 },
  { code: 'IE', name: 'Irland', level: 2 },
  { code: 'BE', name: 'Belgien', level: 2 },
  { code: 'RU', name: 'Russland', level: 2 },
  { code: 'MX', name: 'Mexiko', level: 2 },
  { code: 'AR', name: 'Argentinien', level: 2 },
  { code: 'AU', name: 'Australien', level: 2 },
  { code: 'IN', name: 'Indien', level: 2 },
  { code: 'KR', name: 'Südkorea', level: 2 },
  { code: 'ZA', name: 'Südafrika', level: 2 },

  // ---- Level 3: gebildet, kein Spezialist ----
  { code: 'CZ', name: 'Tschechien', level: 3 },
  { code: 'HU', name: 'Ungarn', level: 3 },
  { code: 'HR', name: 'Kroatien', level: 3 },
  { code: 'IS', name: 'Island', level: 3 },
  { code: 'NZ', name: 'Neuseeland', level: 3 },
  { code: 'TH', name: 'Thailand', level: 3 },
  { code: 'MA', name: 'Marokko', level: 3 },
  { code: 'EG', name: 'Ägypten', level: 3 },
  { code: 'UA', name: 'Ukraine', level: 3 },
  { code: 'RO', name: 'Rumänien', level: 3 },
  { code: 'VN', name: 'Vietnam', level: 3 },
  { code: 'ID', name: 'Indonesien', level: 3 },
  { code: 'CL', name: 'Chile', level: 3 },
  { code: 'CO', name: 'Kolumbien', level: 3 },
  { code: 'CU', name: 'Kuba', level: 3 },
  { code: 'JM', name: 'Jamaika', level: 3 },

  // ---- Level 4: schon knifflig ----
  { code: 'RS', name: 'Serbien', level: 4 },
  { code: 'SK', name: 'Slowakei', level: 4 },
  { code: 'SI', name: 'Slowenien', level: 4 },
  { code: 'BG', name: 'Bulgarien', level: 4 },
  { code: 'EE', name: 'Estland', level: 4 },
  { code: 'LV', name: 'Lettland', level: 4 },
  { code: 'LT', name: 'Litauen', level: 4 },
  { code: 'GE', name: 'Georgien', level: 4 },
  { code: 'KZ', name: 'Kasachstan', level: 4 },
  { code: 'PK', name: 'Pakistan', level: 4 },
  { code: 'PH', name: 'Philippinen', level: 4 },
  { code: 'MY', name: 'Malaysia', level: 4 },
  { code: 'PE', name: 'Peru', level: 4 },
  { code: 'VE', name: 'Venezuela', level: 4 },
  { code: 'NG', name: 'Nigeria', level: 4 },
  { code: 'KE', name: 'Kenia', level: 4 },
  { code: 'SA', name: 'Saudi-Arabien', level: 4 },
  { code: 'IL', name: 'Israel', level: 4 },

  // ---- Level 5: sehr schwer ----
  { code: 'BT', name: 'Bhutan', level: 5 },
  { code: 'KI', name: 'Kiribati', level: 5 },
  { code: 'KM', name: 'Komoren', level: 5 },
  { code: 'NR', name: 'Nauru', level: 5 },
  { code: 'VU', name: 'Vanuatu', level: 5 },
  { code: 'SZ', name: 'Eswatini', level: 5 },
  { code: 'LS', name: 'Lesotho', level: 5 },
  { code: 'TM', name: 'Turkmenistan', level: 5 },
  { code: 'KG', name: 'Kirgisistan', level: 5 },
  { code: 'TJ', name: 'Tadschikistan', level: 5 },
  { code: 'BN', name: 'Brunei', level: 5 },
  { code: 'SR', name: 'Suriname', level: 5 },
  { code: 'BZ', name: 'Belize', level: 5 },
  { code: 'MK', name: 'Nordmazedonien', level: 5 },
  { code: 'MD', name: 'Moldau', level: 5 },
  { code: 'ME', name: 'Montenegro', level: 5 },
  { code: 'DJ', name: 'Dschibuti', level: 5 },
  { code: 'MR', name: 'Mauretanien', level: 5 },
  { code: 'BW', name: 'Botswana', level: 5 },
  { code: 'PY', name: 'Paraguay', level: 5 },
];

// ISO-Code → Flaggen-Emoji (Regional Indicator Symbols)
export function flagEmoji(code) {
  if (!code || code.length !== 2) return '🏳️';
  const base = 0x1F1E6;
  return String.fromCodePoint(
    base + code.toUpperCase().charCodeAt(0) - 65,
    base + code.toUpperCase().charCodeAt(1) - 65,
  );
}

// Case-insensitive check, ob eine Kategorie die Flaggen-Kategorie ist.
export const isFlagsCategory = (name) =>
  typeof name === 'string' && name.trim().toLowerCase() === 'flaggen';

// Zieht pro Level (1..5) eine zufällige, nicht-doppelte Flagge.
// Liefert ein Array mit 5 Einträgen { level, code, name }.
export function pickFlagRound() {
  const used = new Set();
  const out = [];
  for (let level = 1; level <= 5; level++) {
    const pool = FLAGS.filter(f => f.level === level && !used.has(f.code));
    const pick = pool.length
      ? pool[Math.floor(Math.random() * pool.length)]
      : FLAGS[Math.floor(Math.random() * FLAGS.length)];
    used.add(pick.code);
    out.push({ level, code: pick.code, name: pick.name });
  }
  return out;
}
