/// <reference path="../pb_data/types.d.ts" />

// Shared Jeopardy helpers. require()d INSIDE hook handlers (JSVM runs each
// handler in an isolated scope, so file-level functions in a *.pb.js aren't
// visible there). JSVM globals ($os, $http) are available here.

// Read a JSON-array field reliably (PocketBase's record.get() on a json field
// can return a raw byte array / string instead of a JS array).
function parseArr(record, field) {
  try {
    const s = record.getString(field);
    if (s && s.charAt(0) === "[") { const v = JSON.parse(s); if (Array.isArray(v)) return v; }
  } catch (_) {}
  try {
    const v = record.get(field);
    if (Array.isArray(v)) {
      if (v.length === 0) return v;
      if (typeof v[0] !== "number") return v;
      let s = ""; for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);
      const p = JSON.parse(s); return Array.isArray(p) ? p : [];
    }
    if (typeof v === "string") { const p = JSON.parse(v); return Array.isArray(p) ? p : []; }
    const s = String(v); if (s && s.charAt(0) === "[") { const p = JSON.parse(s); return Array.isArray(p) ? p : []; }
  } catch (_) {}
  return [];
}

// Generate a Jeopardy board via the Anthropic API. Returns
// { ok: true, board: { questions:[...] } } or { ok: false, error: "..." }.
// (No HTTP/`e` here — the caller shapes the response.)
function generateBoard(opts) {
  const cats = Array.isArray(opts.cats) ? opts.cats.filter(c => typeof c === "string" && c.trim().length > 0).map(c => c.trim()) : [];
  const surprise = !!opts.surprise || cats.length === 0;
  if (!surprise && (cats.length < 1 || cats.length > 8)) {
    return { ok: false, error: "between 1 and 8 categories required" };
  }
  const catCount = surprise ? 5 : cats.length;
  const avoid = (Array.isArray(opts.avoid) ? opts.avoid : [])
    .filter(x => typeof x === "string" && x.trim().length > 0).slice(0, 400);

  const oauthToken = $os.getenv("CLAUDE_OAUTH_TOKEN");
  const apiKey = $os.getenv("ANTHROPIC_API_KEY");
  if (!oauthToken && !apiKey) {
    return { ok: false, error: "neither CLAUDE_OAUTH_TOKEN nor ANTHROPIC_API_KEY configured on the server" };
  }

  const catBlock = surprise
    ? `WÄHLE SELBST genau 5 Kategorien — gängige, bunt gemischte Quiz-Kategorien,
wie man sie von Quiz-/Kneipenabenden kennt. Mische die Bereiche (z.B.
Geographie, Geschichte, Musik, Film & Serien, Sport, Wissenschaft & Natur,
Essen & Trinken, Kunst & Literatur, Technik, Popkultur, Sprache). Nimm gut
spielbare, allgemein bekannte Kategorien — keine Nischen-Themen. Verwende
deutsche Kategorie-Namen und schreibe sie in jedes "category"-Feld.`
    : cats.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const avoidBlock = avoid.length
    ? `\n================================================================
== SPERRLISTE — DIESE INHALTE SIND VERBOTEN (HARTE REGEL)
================================================================
Die folgenden Fragen UND Antworten wurden in FRÜHEREN Runden dieses Events
bereits gestellt. Das ist eine harte Sperrliste:
  • Verwende KEINE dieser Antworten erneut — auch nicht mit anderem Fragetext.
  • Verwende KEINE Frage zum selben Fakt/Thema (z.B. ist "Berlin" einmal die
    Antwort gewesen, darf Berlin in KEINER Frage mehr die Antwort sein).
  • Auch wenn die Kategorie identisch zur Vorrunde ist: nimm KOMPLETT andere
    Themen/Personen/Orte/Werke. Gleiche Kategorie ≠ gleiche Fragen.
Geh die Liste durch und prüfe JEDE neue Frage gegen sie, bevor du sie nimmst.

GESPERRT:
${avoid.map(x => `- ${x}`).join("\n")}
`
    : "";
  const prompt = `Du erstellst ein deutsches Jeopardy-Brett für einen Spieleabend mit Freunden.

Kategorien (genau ${catCount} Stück):
${catBlock}
${avoidBlock}

================================================================
== KORREKTHEIT — ABSOLUTE PRIORITÄT (höher als jede andere Regel)
================================================================
Jeder einzelne Fakt MUSS verifizierbar wahr sein. Wenn du dir bei einem Detail (Jahr, Name, Songtext, Episode, Spielmechanik, chemische Formel, geographisches Detail) nicht zu 100% sicher bist:
  → ERSETZE die Frage mit einer, bei der du dir sicher bist.
  → Formuliere ungenauer, statt zu raten.

Konkrete Risiko-Bereiche (besonders streng prüfen):
  • Songtexte: zitiere NUR Zeilen, deren genauen Wortlaut du sicher kennst. Lieber eine bekanntere, ältere Hookline als ein unsicheres Detail. Schreibe Texte exakt mit korrekten Apostrophen, Pausen-Wörtern ("Yeah", "Oh", "Baby") und Wortabständen.
  • Reality-TV-Staffeln/Folgen: keine erfundene Staffelnummer. Wenn du eine konkrete Staffel nennst, prüf dass die Show in dem Jahr lief.
  • Twitch/YouTube: keine erfundenen Drama-Momente, keine ausgedachten Sub-Counts.
  • Geschichte/Daten: keine ausgedachten Jahreszahlen — wenn das Jahr unsicher ist, weglassen.
  • Geographie: keine erfundenen Höhen-/Distanz-/Bevölkerungsangaben.
  • Wissenschaft/Mathe: Formeln und Konstanten EXAKT.

Eindeutigkeits-Test: Die Antwort muss eindeutig sein. "Dieser Song von 2010" → es muss CONTEXT geben, der nur EINEN Song zulässt. "Dieser Schauspieler aus Hollywood" → unzureichend.

Selbsttest pro Frage: Wenn ein Spieler nach der Antwort "moment, ist das nicht eigentlich X?" sagen könnte und teilweise recht hätte → Frage umformulieren oder Antwort um Alternativen erweitern.

================================================================
== ANTWORT NICHT VERRATEN (HARTE REGEL — sonst ist die Frage wertlos)
================================================================
Die Frage darf die Antwort NICHT enthalten oder trivial verraten. Konkret verboten:
  • Das Antwortwort (oder ein Teil davon) steht im Fragetext.
  • Eine wörtliche Übersetzung / offensichtliches Synonym der Antwort steht im Text.
  • Ein Eigenname im Text, der die Antwort eindeutig festnagelt.
  • Die Antwort ist aus der Satzstruktur/Definition direkt ablesbar (reine Definitionsfrage).
GUT (Jeopardy-Stil, Antwort erschlossen, nicht genannt):
  "Dieses Bauwerk aus Stahl wurde 1889 zur Weltausstellung errichtet und ist 330m hoch." → Eiffelturm
  "Dieser Planet erscheint durch Eisenoxid auf seiner Oberfläche rötlich." → Mars
Selbsttest pro Frage: Streiche im Kopf die Antwort — ist sie aus der Frage trotzdem fast zwingend? Dann umformulieren.

================================================================
== SCHWIERIGKEITS-ANKER — Level 1..5
================================================================
Du MUSST die fünf Level innerhalb jeder Kategorie SPÜRBAR unterschiedlich machen.
Level 1 (=100): ~80% wissen es. Level 2 (=200): ~60%. Level 3 (=300): ~40%, spezifisch.
Level 4 (=400): ~20%, deutlich kniffliger. Level 5 (=500): ~10%, schwer aber FAIR (kein obskures Trivia).

================================================================
== KATEGORIE-FOKUS
================================================================
Halte dich strikt an die Kategorie. Wenn die Kategorie "Songtexte 2000er" heißt: ALLE 5 Fragen sind Songtexte aus 2000–2009.

================================================================
== AUFGABE
================================================================
1. Pro Kategorie GENAU 5 Fragen — exakt eine je Level 1, 2, 3, 4, 5.
2. Insgesamt also exakt ${catCount * 5} Fragen.
3. Fragen max 30 Wörter, eindeutig. Antwort kurz (max 10 Wörter).
4. Bei Songtexten in der Frage zitieren, Antwort = das fehlende Wort.

================================================================
== ARBEITSWEISE (im Thinking-Block)
================================================================
Pro Kategorie 5 Themen (einen je Level), Korrektheits-Check, Antwort-verraten-Check, Level-Check, Sperrlisten-Check — dann erst JSON.

================================================================
== AUSGABE
================================================================
NUR JSON. Kein Vortext, kein Codeblock. Beginnt mit { endet mit }. level-Feld ist 1..5 (NICHT 100..500). ${surprise ? "Vergib selbst gewählte, gängige Kategorie-Namen und nutze sie konsistent in allen 5 Fragen je Kategorie." : "Kategorie-Name MUSS wortgleich mit der Eingabe sein."} Schema:

{"questions":[{"category":"<Kategoriename>","level":1,"q":"<Frage>","a":"<Antwort>"}]}

Insgesamt ${catCount * 5} Einträge.`;

  const envModel = $os.getenv("JEOPARDY_MODEL");
  const modelCandidates = [envModel, "claude-opus-4-8", "claude-opus-4-5", "claude-opus-4-1"]
    .filter(m => typeof m === "string" && m.trim().length > 0);

  const buildOAuthReq = (model) => ({
    headers: {
      "Authorization": "Bearer " + oauthToken,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
      "content-type": "application/json",
      "User-Agent": "claude-cli/1.0.0",
    },
    body: {
      model: model,
      max_tokens: 12000,
      system: "You are Claude Code, Anthropic's official CLI for Claude. The user is asking you to generate a German Jeopardy board. Be meticulous about factual correctness and difficulty calibration. Verify every single fact before including it; replace any question whose facts you cannot fully verify.",
      messages: [{ role: "user", content: prompt }],
    },
  });
  const buildApiKeyReq = (model) => ({
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: { model: model, max_tokens: 6000, thinking: { type: "enabled", budget_tokens: 2000 }, messages: [{ role: "user", content: prompt }] },
  });
  const send = (req) => {
    try {
      return $http.send({ url: "https://api.anthropic.com/v1/messages", method: "POST", headers: req.headers, body: JSON.stringify(req.body), timeout: 240 });
    } catch (err) { return { statusCode: 0, body: "", _err: err }; }
  };
  const isModelError = (status, body) => {
    if (status !== 400) return false;
    const b = (body || "").toLowerCase();
    return b.indexOf("model") !== -1 && (b.indexOf("invalid") !== -1 || b.indexOf("not found") !== -1 || b.indexOf("not_found") !== -1 || b.indexOf("unknown") !== -1 || b.indexOf("does not exist") !== -1 || b.indexOf("deprecated") !== -1);
  };

  const tried = [];
  let res, bodyStr, usedAuth, usedModel;
  outer:
  for (const model of modelCandidates) {
    const attempts = [];
    if (oauthToken) attempts.push({ name: "oauth", req: buildOAuthReq(model) });
    if (apiKey) attempts.push({ name: "apikey", req: buildApiKeyReq(model) });
    let modelRejected = false;
    for (const a of attempts) {
      res = send(a.req);
      if (res._err) { tried.push(a.name + "/" + model + ":net"); continue; }
      try { bodyStr = typeof res.body === "string" ? res.body : toString(res.body); } catch (_) { bodyStr = ""; }
      usedAuth = a.name; usedModel = model;
      tried.push(a.name + "/" + model + ":" + res.statusCode);
      if (res.statusCode === 200) break outer;
      if (isModelError(res.statusCode, bodyStr)) { modelRejected = true; break; }
    }
    if (modelRejected) continue;
  }

  const triedStr = " [tried: " + tried.join(", ") + "]";
  if (!res || res._err) return { ok: false, error: "anthropic http error: " + ((res && res._err) || "no auth") + triedStr };
  if (isModelError(res.statusCode, bodyStr)) {
    return { ok: false, error: "kein gültiges Opus-Modell akzeptiert (zuletzt '" + usedModel + "'). Setze JEOPARDY_MODEL. " + bodyStr.slice(0, 200) + triedStr };
  }
  if (res.statusCode !== 200) return { ok: false, error: "anthropic " + res.statusCode + " (" + usedAuth + "/" + usedModel + "): " + bodyStr.slice(0, 250) + triedStr };

  let text;
  try {
    const parsed = JSON.parse(bodyStr);
    if (Array.isArray(parsed.content)) {
      const tb = parsed.content.find(b => b && b.type === "text") || parsed.content[0];
      text = tb && tb.text;
    }
    if (!text) throw new Error("no text block");
  } catch (err) { return { ok: false, error: "anthropic response unparseable: " + err }; }

  const tryParse = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let board = tryParse(stripped);
  if (!board) {
    const first = stripped.indexOf("{"); const last = stripped.lastIndexOf("}");
    if (first >= 0 && last > first) board = tryParse(stripped.slice(first, last + 1));
  }
  if (!board || !Array.isArray(board.questions)) return { ok: false, error: "model returned non-JSON / missing questions[]: " + stripped.slice(0, 300) };
  return { ok: true, board: board };
}

module.exports = { generateBoard, parseArr };
