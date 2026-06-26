// Prefab "Wer würde am ehesten…" prompts for a quick random round. Kept light
// and party-friendly. randomMostLikely(n, avoid) returns n unique prompts not
// already in `avoid`.

export const MOST_LIKELY_BANK = [
  'im Knast landen',
  'einen Promi heiraten',
  'als Erster heute einschlafen',
  'aus Versehen die ganze Gruppe anrufen',
  'bei einer Quizshow gewinnen',
  'sich auf einer Wanderung verlaufen',
  'einen Marathon spontan mitlaufen',
  'die teuerste Runde ausgeben',
  'sein Getränk verschütten',
  'mit Fremden Freundschaft schließen',
  'verschlafen und den Bus verpassen',
  'ein Tattoo aus einer Bierlaune bereuen',
  'bei „Wer wird Millionär" den Publikumsjoker brauchen',
  'als Erster betrunken sein',
  'das Handy in die Toilette fallen lassen',
  'ein Geheimnis ausplaudern',
  'in einer Doku über Kuriositäten landen',
  'auswandern und nie zurückkommen',
  'bei einem Date einschlafen',
  'die Karaoke-Bühne nicht mehr verlassen',
  'einen Streit über etwas Belangloses anfangen',
  'sich für die Gruppe komplett zum Affen machen',
  'als Letzter den Witz verstehen',
  'aus Versehen etwas anzünden beim Kochen',
  'eine Schlägerei aus Versehen schlichten',
  'bei Rot über die Ampel gehen und erwischt werden',
  'einen Influencer-Account starten',
  'die Gruppe zu spät zum Treffen kommen lassen',
  'ein Wildtier streicheln wollen',
  'beim Wandern über Steine ins Wasser fallen',
  'die ganze Nacht durchmachen',
  'spontan ein Instrument lernen',
  'einen peinlichen Spitznamen abkriegen',
  'die meisten Ex-Partner haben',
  'als Erster Eltern werden',
  'einen Lottogewinn in einer Woche verprassen',
  'sich in den Reiseführer verlieben',
  'beim Trinkspiel als Erster aussteigen',
  'eine Verschwörungstheorie ernsthaft verteidigen',
  'reich und berühmt werden',
  'sich mit dem Kellner anfreunden',
  'beim Wein-Tasting „schmeckt nach Wein" sagen',
];

export function randomMostLikely(n, avoid = []) {
  const avoidSet = new Set((avoid || []).map(t => (t || '').toLowerCase().trim()));
  const pool = MOST_LIKELY_BANK.filter(t => !avoidSet.has(('Wer würde am ehesten ' + t).toLowerCase()) && !avoidSet.has(t.toLowerCase()));
  const src = (pool.length >= n ? pool : MOST_LIKELY_BANK).slice();
  // shuffle
  for (let i = src.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [src[i], src[j]] = [src[j], src[i]]; }
  return src.slice(0, n).map(t => `Wer würde am ehesten ${t}?`);
}
