// Spicy compliments for Jeopardy's "Komplimente-Modus". Short, punchy, dirty
// one-liners — independent of the quiz, just a quick cheeky/flirty hit. Shown
// to whoever just nailed a high-value question; they swipe it away to play on.
// Private adult party app: bold and suggestive, but playful — never degrading.

export const SPICY_COMPLIMENTS = [
  'Verdammt, du siehst heute zum Anbeißen aus.',
  'Mit dir würde ich sofort den Tisch abräumen.',
  'Dein Körper ist echt jede Sünde wert.',
  'Ich krieg gerade schlechte Gedanken — die richtig guten.',
  'So heiß, man sollte dich eigentlich nicht angezogen rauslassen.',
  'Dieser Hintern sorgt hier fahrlässig für Stimmung.',
  'Du bist der Grund für kalte Duschen.',
  'Wenn Blicke ausziehen könnten…',
  'Heute Abend wärst du definitiv mein Beifang.',
  'Du machst es echt schwer, mich zu benehmen.',
  'Bei dir wird mir warm an Stellen, über die wir nicht reden.',
  'Sünde sieht an dir verdammt gut aus.',
  'Ich würde dich glatt zum Nachtisch nehmen.',
  'Dieses Grinsen ruiniert meine ganzen guten Vorsätze.',
  'Du bist 100 % der Grund, warum ich abgelenkt bin.',
  'So sexy, das grenzt an unfaire Kampfweise.',
  'Komm näher, dann flüster ich dir was Unanständiges.',
  'Deine Lippen schreien geradezu nach Ärger.',
  'Ich hätte da ein paar sehr handfeste Komplimente für dich.',
  'Du bist heiß genug, um Sicherungen durchbrennen zu lassen.',
  'Dieser Körper ist eine glatte Straftat.',
  'Wenn du so weitermachst, vergesse ich meine Manieren.',
  'Du bist das beste, was diesem Raum je passiert ist.',
  'Allein dein Blick ist schon Vorspiel.',
  'Du siehst aus wie eine richtig schlechte Entscheidung — meine liebste.',
  'Ich würde dir gern persönlich applaudieren. Sehr persönlich.',
  'Dein Anblick macht süchtig, und ich will keinen Entzug.',
  'So ein Anblick gehört eigentlich verboten — oder gerahmt.',
  'Du bringst die Raumtemperatur gefährlich nach oben.',
  'Mit dir würde ich gern die Regeln brechen.',
  'Du bist heißer als jede Antwort, die hier fällt.',
  'Ich denk gerade an alles, nur nicht ans Quiz.',
  'Diese Kurven haben hier eindeutig Vorfahrt.',
  'Du bist die Versuchung, vor der mich Mama gewarnt hat.',
  'Knack-Körper und Köpfchen — du Angeberin/Angeber.',
  'Ich würde dir den letzten Drink kaufen und den ersten Kuss klauen.',
  'So gut, dass ich kurz vergessen hab, wie man atmet.',
  'Du bist der Hauptgewinn, den ich hier mit nach Hause nehmen will.',
  'Heute Nacht stehst du ganz oben auf meiner Wunschliste.',
  'Du machst dieses Outfit unanständig gut.',
  'Ehrlich? Ich kann meine Augen (und Hände) kaum bei mir behalten.',
  'Du bist scharf, frech und genau mein Beuteschema.',
  'Mit so einem Lächeln kriegst du hier alles, was du willst.',
  'Du bist die definitiv heißeste Ablenkung im Raum.',
  'Ich würde glatt verlieren, nur um dir länger zuzusehen.',
  'Komm her, du heißes Stück Statistik.',
];

export function pickCompliment() {
  return SPICY_COMPLIMENTS[Math.floor(Math.random() * SPICY_COMPLIMENTS.length)];
}
