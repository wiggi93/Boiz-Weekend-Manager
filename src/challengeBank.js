// Random challenge prompts for the "🎲 Zufall" button. `photo: true` marks a
// challenge whose proof is a photo (UI shows a 📸 hint). `reward` is a
// suggested point value the proposer can tweak.

export const CHALLENGE_BANK = [
  // --- Photo challenges ---
  { text: 'Mach ein Foto mit einem fremden Hund', reward: 4, photo: true },
  { text: 'Mach ein Selfie mit einer fremden Person, die genauso heißt wie du', reward: 6, photo: true },
  { text: 'Foto-Beweis: überzeuge Fremde zu einem Gruppenfoto mit dir', reward: 5, photo: true },
  { text: 'Mach ein Foto, auf dem du eine Statue/ein Denkmal nachstellst', reward: 3, photo: true },
  { text: 'Finde ein Auto in deiner Lieblingsfarbe und mach ein Foto davor', reward: 2, photo: true },
  { text: 'Mach ein Foto mit jemandem, der einen Hut trägt', reward: 3, photo: true },
  { text: 'Foto mit dem ältesten Gegenstand, den du in 5 Min findest', reward: 3, photo: true },
  { text: 'Mach ein möglichst episches Heldenfoto auf einer Bank', reward: 2, photo: true },

  // --- "Für X Minuten…" / Verhalten ---
  { text: 'Sieze alle für die nächsten 30 Minuten', reward: 4 },
  { text: 'Sprich die nächsten 15 Minuten nur im Flüsterton', reward: 3 },
  { text: 'Beende für 20 Minuten jeden Satz mit „…und das ist auch gut so"', reward: 4 },
  { text: 'Rede 15 Minuten lang über dich nur in der dritten Person', reward: 5 },
  { text: 'Nenne die nächste halbe Stunde jeden „Captain"', reward: 3 },
  { text: 'Mach 10 Minuten lang zu allem eine übertriebene Werbestimme', reward: 4 },
  { text: 'Verbeuge dich die nächsten 20 Minuten vor jeder Tür, durch die du gehst', reward: 3 },
  { text: 'Antworte 15 Minuten lang nur mit Gegenfragen', reward: 4 },

  // --- Aktion / Mutprobe ---
  { text: 'Halte eine 1-minütige Dankesrede, als hättest du gerade einen Oscar gewonnen', reward: 4 },
  { text: 'Bring eine fremde Person dazu, dir einen Witz zu erzählen', reward: 5 },
  { text: 'Singe lautstark den Refrain deines Lieblingssongs', reward: 3 },
  { text: 'Mach 20 Liegestütze am Stück', reward: 3 },
  { text: 'Erkläre einem Fremden 60 Sekunden lang begeistert ein erfundenes Hobby', reward: 6 },
  { text: 'Tausche ein Kleidungsstück mit der Person links von dir für 30 Min', reward: 4 },
  { text: 'Frag drei Fremde nach der Uhrzeit – in drei verschiedenen Akzenten', reward: 5 },
  { text: 'Bestelle deine nächste Runde komplett in Reimform', reward: 5 },
  { text: 'Mach mit einem Fremden einen kurzen Small Talk übers Wetter', reward: 3 },
  { text: 'Erfinde einen Handshake und bring zwei Leuten bei, ihn mit dir zu machen', reward: 4 },
  { text: 'Lauf 30 Sekunden wie ein Model über einen imaginären Laufsteg', reward: 2 },
  { text: 'Halte deinem Sitznachbarn eine 30-Sek-Lobrede, warum er der Beste ist', reward: 3 },
];

export const randomChallenge = (avoid = '') => {
  const pool = CHALLENGE_BANK.filter(c => c.text !== avoid);
  return pool[Math.floor(Math.random() * pool.length)] || CHALLENGE_BANK[0];
};
