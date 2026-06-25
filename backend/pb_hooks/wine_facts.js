/// <reference path="../pb_data/types.d.ts" />

// Wine fun facts — pushed to event members (hourly + on demand) and shown in
// the wine module's "Wein-Wissen" section. require()d inside handlers.

const WINE_FACTS = [
  { title: "Älter als die Pyramiden", text: "Die ältesten Spuren von Weinherstellung sind über 8000 Jahre alt und stammen aus Georgien. Damit ist Wein älter als die ägyptischen Pyramiden — Prost auf die Steinzeit-Winzer!" },
  { title: "Eine Flasche = ein Kilo Trauben", text: "Für eine 0,75-l-Flasche Wein braucht man im Schnitt rund 1 kg Trauben, also etwa 600–800 Beeren. Beim nächsten Schluck einfach mal dran denken." },
  { title: "Warum man am Glas schwenkt", text: "Das Schwenken bringt Sauerstoff an den Wein und lässt Aromastoffe verdampfen — dadurch riecht und schmeckt er intensiver. Es ist also keine Angeberei, sondern Chemie." },
  { title: "Die 'Tränen' im Glas", text: "Die Schlieren, die am Glasrand herunterlaufen ('Kirchenfenster' oder 'Weintränen'), entstehen durch den Alkohol. Je mehr Tränen, desto höher tendenziell der Alkoholgehalt." },
  { title: "Rotwein ist nicht aus roten Trauben-Saft", text: "Der Saft fast aller Trauben ist hell. Die rote Farbe kommt von den Schalen, die beim Rotwein mitvergoren werden. Champagner z.B. wird oft aus roten Trauben gemacht — nur ohne Schalenkontakt." },
  { title: "Schraubverschluss ≠ billig", text: "Der Drehverschluss schützt oft besser vor 'Korkschmecker' als der Naturkork. Viele hochwertige Weine, vor allem frische Weißweine, setzen bewusst darauf." },
  { title: "Dekantieren weckt den Wein", text: "Junge, kräftige Rotweine profitieren von Luft — eine Stunde im Dekanter macht sie weicher und runder. Bei sehr alten Weinen lieber vorsichtig sein, die können schnell 'kippen'." },
  { title: "Riesling — der deutsche Star", text: "Deutschland ist das Riesling-Land Nr. 1 der Welt. Die Rebsorte kann von knochentrocken bis edelsüß alles, und die besten reifen jahrzehntelang." },
  { title: "Je steiler, desto besser?", text: "Viele Spitzenlagen liegen an extrem steilen Hängen (z.B. an der Mosel bis 65° Neigung). Dort kann keine Maschine ernten — alles Handarbeit, deshalb sind die Weine oft teurer." },
  { title: "Wein 'atmet' durch den Korken", text: "Naturkork lässt minimal Sauerstoff durch, was den Wein über Jahre langsam reifen lässt. Deshalb lagert man Flaschen liegend — damit der Korken feucht und dicht bleibt." },
  { title: "Tannine — das pelzige Gefühl", text: "Das trockene, pelzige Gefühl am Gaumen bei Rotwein kommt von Tanninen (Gerbstoffen) aus Schalen und Kernen. Sie konservieren den Wein und machen ihn lagerfähig." },
  { title: "Champagner-Druck wie im Reifen", text: "In einer Champagnerflasche herrschen rund 5–6 bar Druck — mehr als in einem Autoreifen. Deshalb fliegt der Korken mit bis zu 50 km/h raus. Vorsicht beim Öffnen!" },
  { title: "Die teuerste Flasche der Welt", text: "Ein 1945er Romanée-Conti wurde 2018 für rund 558.000 Dollar versteigert. Pro Schluck wären das etwa 37.000 Dollar — da trinkt man lieber langsam." },
  { title: "Temperatur macht den Unterschied", text: "Zu warmer Rotwein schmeckt nach Alkohol, zu kalter Weißwein nach nichts. Faustregel: Rotwein 16–18°C, Weißwein 8–12°C. Im Zweifel den Roten lieber etwas kühler." },
  { title: "Süßwein aus edler Fäulnis", text: "Edelsüße Weine (z.B. Sauternes, Trockenbeerenauslese) entstehen durch einen Pilz, die 'Edelfäule'. Er entzieht den Beeren Wasser und konzentriert den Zucker — klingt eklig, schmeckt himmlisch." },
  { title: "Roséwein ist kein Mix", text: "Guter Rosé entsteht nicht durch Mischen von Rot- und Weißwein, sondern durch kurzen Schalenkontakt roter Trauben. (Ausnahme: Rosé-Champagner, da ist Mischen erlaubt.)" },
  { title: "Wein und Mondphasen", text: "Manche Winzer arbeiten biodynamisch nach dem Mondkalender und füllen nur an bestimmten Tagen ab. Wissenschaftlich umstritten — aber die Weine sind oft trotzdem klasse." },
  { title: "Der Klang verrät den Reifegrad", text: "Profis hören beim Einschenken hin: Junger, spritziger Wein klingt anders als schwerer, gereifter. Okay, das ist Angeber-Level — aber jetzt weißt du's." },
  { title: "Korkschmecker ist echt", text: "Etwa 1 von 20 naturverkorkten Flaschen 'korkt' — sie riecht muffig nach feuchtem Karton. Das liegt an der Chemikalie TCA im Kork, nicht am Wein selbst. Zurückgeben ist legitim." },
  { title: "Wein macht (ein bisschen) glücklich", text: "Rotwein enthält Resveratrol, dem positive Effekte nachgesagt werden. In Maßen, versteht sich — der Spaß auf einer Weinwanderung zählt aber definitiv mehr." },
];

module.exports = { WINE_FACTS };
