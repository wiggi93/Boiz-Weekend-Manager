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

  // --- Mehr Foto-Challenges ---
  { text: 'Mach ein Foto mit einem Fremden, der eine Sonnenbrille trägt', reward: 3, photo: true },
  { text: 'Foto-Beweis: imitiere ein Werbeplakat so genau wie möglich', reward: 4, photo: true },
  { text: 'Mach ein Foto, auf dem du so tust, als hieltest du ein riesiges Gebäude in der Hand', reward: 3, photo: true },
  { text: 'Finde drei Dinge in derselben Farbe und mach ein Foto davon', reward: 2, photo: true },
  { text: 'Mach ein Selfie mit einem Tier (egal welches)', reward: 4, photo: true },
  { text: 'Foto mit dem skurrilsten Gegenstand, den du in der Nähe findest', reward: 3, photo: true },
  { text: 'Mach ein Gruppenfoto, auf dem alle dieselbe dumme Grimasse ziehen', reward: 3, photo: true },
  { text: 'Foto-Beweis: balanciere etwas auf dem Kopf und geh 10 Schritte', reward: 4, photo: true },
  { text: 'Mach ein dramatisches „Albumcover"-Foto von deinem Sitznachbarn', reward: 3, photo: true },
  { text: 'Foto mit einer Speisekarte, auf der du auf dein „Henkersmahl" zeigst', reward: 2, photo: true },

  // --- Mehr „Für X Minuten…" / Verhalten ---
  { text: 'Sprich die nächsten 20 Minuten mit einem erfundenen Akzent', reward: 5 },
  { text: 'Nenne dich für eine halbe Stunde nur bei einem ausgedachten Künstlernamen', reward: 4 },
  { text: 'Klatsche die nächsten 15 Minuten nach jedem deiner eigenen Sätze', reward: 3 },
  { text: 'Behaupte 20 Minuten lang, du seist ein berühmter Promi auf der Flucht', reward: 5 },
  { text: 'Beginne 15 Minuten lang jeden Satz mit „Ehrlich gesagt…"', reward: 3 },
  { text: 'Mach für 20 Minuten zu jeder Bewegung passende Soundeffekte', reward: 4 },
  { text: 'Sei die nächste halbe Stunde dein eigener Hype-Man und kündige dich an', reward: 4 },
  { text: 'Reagiere 15 Minuten lang auf alles mit übertriebenem Erstaunen', reward: 3 },

  // --- Mehr Aktion / Mutprobe ---
  { text: 'Halte eine flammende 1-Min-Rede für ein völlig banales Alltagsobjekt', reward: 4 },
  { text: 'Bring eine fremde Gruppe dazu, dir „Happy Birthday" zu singen', reward: 7, photo: true },
  { text: 'Erzähle einem Fremden überzeugend, du hättest heute Geburtstag', reward: 5 },
  { text: 'Mach eine spontane Stand-up-Nummer von 30 Sekunden', reward: 5 },
  { text: 'Überrede die Gruppe zu einer 15-Sekunden-La-Ola-Welle', reward: 3 },
  { text: 'Tausche für eine Runde komplett die Rolle/Stimme mit jemandem am Tisch', reward: 4 },
  { text: 'Frag den Barkeeper nach seinem absoluten Lieblingsgetränk und bestell es', reward: 4 },
  { text: 'Mach eine 20-Sekunden-Robotertanz-Einlage', reward: 3 },
  { text: 'Halte eine ernste TED-Talk-Intro über das Thema „Socken"', reward: 5 },
  { text: 'Geh zu einem Fremden und mach ihm ein ehrliches, nettes Kompliment', reward: 4 },
  { text: 'Erfinde einen Trinkspruch und bring die ganze Gruppe zum Anstoßen', reward: 3 },
  { text: 'Imitiere 30 Sekunden lang jemanden aus der Gruppe – die anderen raten wen', reward: 4 },
  { text: 'Bestell beim nächsten Mal etwas, das du noch nie probiert hast', reward: 3 },
  { text: 'Mach 15 Hampelmänner und zähl laut auf einer Fremdsprache mit', reward: 3 },
];

export const randomChallenge = (avoid = '') => {
  const pool = CHALLENGE_BANK.filter(c => c.text !== avoid);
  return pool[Math.floor(Math.random() * pool.length)] || CHALLENGE_BANK[0];
};
