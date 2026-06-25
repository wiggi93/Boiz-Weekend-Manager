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
  // --- Pool-Erweiterung ---
  { title: "Champagner darf nur aus der Champagne", text: "Echter Champagner kommt ausschließlich aus der gleichnamigen Region in Frankreich. Alles andere ist Sekt, Crémant, Cava oder Prosecco — egal wie edel die Flasche aussieht." },
  { title: "Der größte Weinproduzent", text: "Italien, Frankreich und Spanien liefern sich seit Jahren das Kopf-an-Kopf-Rennen um den Titel des größten Weinproduzenten der Welt. Zusammen machen sie fast die Hälfte des weltweiten Weins." },
  { title: "Eichenfass oder Stahltank", text: "Im Eichenfass bekommt Wein Vanille-, Röst- und Würznoten; im Stahltank bleibt er frisch und fruchtig. Welches besser ist? Reine Geschmackssache." },
  { title: "Wein hat (fast) kein Verfallsdatum", text: "Die allermeisten Weine sind zum Trinken gedacht, nicht zum Horten — 90 % sollte man innerhalb von ein bis zwei Jahren öffnen. Nur wenige sind echte Lagerweine." },
  { title: "Warum Weingläser dünn sind", text: "Ein dünner Glasrand lenkt weniger vom Wein ab — der Wein fließt 'direkter' auf die Zunge. Deshalb schwören Genießer auf hauchdünne Gläser." },
  { title: "Die Nase macht den Geschmack", text: "Rund 80 % dessen, was wir 'schmecken', riechen wir eigentlich. Mit zugehaltener Nase erkennt man kaum, ob man Rot- oder Weißwein trinkt." },
  { title: "Rebstöcke werden uralt", text: "Ein Weinstock kann über 100 Jahre alt werden. Alte Reben tragen weniger Trauben, dafür konzentriertere — 'Vieilles Vignes' auf dem Etikett ist oft ein Qualitätshinweis." },
  { title: "Dekantieren vs. Karaffieren", text: "Dekantieren trennt alten Wein vom Bodensatz; Karaffieren belüftet jungen Wein. Zwei verschiedene Dinge, die ständig verwechselt werden — jetzt nicht mehr von dir." },
  { title: "Wein-Beine lügen ein bisschen", text: "Die 'Kirchenfenster' zeigen vor allem Alkohol- und Zuckergehalt an — nicht unbedingt Qualität. Ein teurer Wein kann magere Beine haben und trotzdem genial schmecken." },
  { title: "Sauerstoff ist Freund und Feind", text: "Etwas Luft öffnet den Wein, zu viel killt ihn. Ein offener Wein hält im Kühlschrank meist 2–4 Tage, bevor er kippt." },
  { title: "Die Farbe verrät das Alter", text: "Rotwein wird mit den Jahren bräunlich-ziegelrot, Weißwein dagegen goldener bis bernsteinfarben. Am Glasrand sieht man's am besten." },
  { title: "Schwefel ist (meist) okay", text: "'Enthält Sulfite' steht auf fast jeder Flasche — Schwefel macht den Wein haltbar. Der berüchtigte Kopfschmerz kommt aber eher vom Alkohol und der Menge." },
  { title: "Eiswein aus gefrorenen Trauben", text: "Für Eiswein müssen die Trauben am Stock auf mindestens −7 °C gefrieren und werden gefroren gepresst. Das Wasser bleibt als Eis zurück, nur der süße Saft fließt." },
  { title: "Terroir — der Geschmack des Ortes", text: "Boden, Klima, Hangneigung und Lage prägen den Wein so stark, dass dieselbe Rebsorte je nach Herkunft komplett anders schmeckt. Die Franzosen nennen das 'Terroir'." },
  { title: "Pinot Noir, die Diva", text: "Spätburgunder (Pinot Noir) gilt als eine der anspruchsvollsten Rebsorten überhaupt — dünnhäutig, empfindlich, schwer anzubauen. Gelingt er, ist er großes Kino." },
  { title: "Wein zum Essen — die alte Regel wankt", text: "'Weißwein zu Fisch, Rotwein zu Fleisch' stimmt oft, aber nicht immer. Ein kräftiger Weißwein zu Steak oder ein leichter Roter zu Lachs kann grandios sein. Trau dich." },
  { title: "Die Magnum reift besser", text: "In großen Flaschen (Magnum = 1,5 l) reift Wein langsamer und gleichmäßiger, weil das Verhältnis von Wein zu Sauerstoff günstiger ist. Deshalb sind sie bei Sammlern beliebt." },
  { title: "Wie viele Trauben in der Welt?", text: "Es gibt über 10.000 verschiedene Rebsorten weltweit — aber nur etwa ein Dutzend dominiert den globalen Weinmarkt. Riesling, Cabernet, Chardonnay & Co." },
  { title: "Der 'Atem' nach dem Öffnen", text: "Manche Weine wirken direkt nach dem Öffnen verschlossen und 'mucken' erst nach 30–60 Minuten Luft richtig auf. Geduld wird hier oft belohnt." },
  { title: "Roséwein boomt", text: "Rosé war lange als 'Sommerwein für nebenbei' verschrien — heute ist er weltweit einer der am schnellsten wachsenden Trends, besonders trockene Provence-Rosés." },
  { title: "Trinktemperatur per Hand testen", text: "Keine Thermometer-Lust? Rotwein sollte sich kühler anfühlen als Zimmertemperatur, Weißwein angenehm kühl, aber nicht eiskalt — sonst schmeckt man nichts." },
  { title: "Der Bocksbeutel", text: "Die bauchige, abgeflachte Frankenwein-Flasche ('Bocksbeutel') ist eine der ältesten geschützten Flaschenformen der Welt — unverwechselbar im Regal." },
  { title: "Wein und Schokolade", text: "Kräftige, süße Rotweine (z. B. Portwein) harmonieren wunderbar mit dunkler Schokolade. Bei Milchschokolade wird's schon kniffliger — probier dich durch." },
  { title: "Warum manche Weine prickeln", text: "Ein leichtes Prickeln bei jungem Weißwein ('spritzig') kommt von etwas Restkohlensäure aus der Gärung. Kein Fehler — bei vielen Sorten sogar gewollt." },
  { title: "Die Wein-Highspeed-Reife", text: "Sonne, Wärme und Erschütterung lassen Wein schneller altern. Deshalb lagert man ihn dunkel, kühl, ruhig und liegend — nicht auf dem Küchenschrank über dem Herd." },
  { title: "Vino Verde — fast noch Most", text: "Portugals 'grüner Wein' (Vinho Verde) wird so jung getrunken, dass er leicht und spritzig ist und oft nur 9–11 % Alkohol hat. Perfekt für heiße Tage." },
  { title: "Korken-Knall mit Ansage", text: "Profis öffnen Sekt/Champagner fast lautlos — den Korken festhalten, die Flasche drehen, 'mit einem Seufzer statt einem Knall'. Schont den Druck und die Perlage." },
  { title: "Wein dekantiert sich im Glas", text: "Selbst ohne Karaffe 'atmet' Wein im Glas weiter. Deshalb schmeckt der letzte Schluck oft anders (und manchmal besser) als der erste." },
  { title: "Trockene Tränen, süße Wahrheit", text: "Wie süß ein Wein ist, sagt nicht die Frucht-Aromatik, sondern der Restzucker. Ein Wein kann intensiv nach reifer Frucht riechen und trotzdem knochentrocken sein." },
  { title: "Die teuersten Reben stehen am Hang", text: "Steillagen bekommen mehr Sonne und bessere Drainage. Mehr Handarbeit, kleinere Erträge, konzentrierte Trauben — und entsprechend höhere Preise." },
];

// Pick a random fact index the event hasn't seen yet; if all are seen, reset
// and pick from the full pool. Pure (no PB deps) so it can live in this lib.
function pickFactIndex(seen, total) {
  const seenSet = {};
  for (const s of (Array.isArray(seen) ? seen : [])) seenSet[Number(s)] = true;
  const fresh = [];
  for (let i = 0; i < total; i++) if (!seenSet[i]) fresh.push(i);
  const pool = fresh.length ? fresh : Array.from({ length: total }, (_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)] || 0;
}

module.exports = { WINE_FACTS, pickFactIndex };
