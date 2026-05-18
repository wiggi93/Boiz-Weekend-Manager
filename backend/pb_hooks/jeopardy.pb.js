/// <reference path="../pb_data/types.d.ts" />

// POST /api/jeopardy/generate { eventId, categories: string[] }
// Calls the Anthropic API to build a 5x5 (5 categories × 5 levels) board.
// Only event creator, event-hosts, and site admins may invoke.
routerAdd("POST", "/api/jeopardy/generate", (e) => {
  const auth = e.auth;
  if (!auth) return e.unauthorizedError("auth required", null);

  const data = new DynamicModel({ eventId: "", categories: [] });
  e.bindBody(data);

  if (!data.eventId) return e.badRequestError("eventId required", null);
  const cats = Array.isArray(data.categories) ? data.categories.filter(c => typeof c === "string" && c.trim().length > 0).map(c => c.trim()) : [];
  if (cats.length < 1 || cats.length > 8) {
    return e.badRequestError("between 1 and 8 categories required", null);
  }

  // Authorisation: site admin OR event creator OR event-host
  let ev;
  try { ev = e.app.findRecordById("events", data.eventId); }
  catch (_) { return e.notFoundError("event not found", null); }
  const isAdmin = auth.get("role") === "admin";
  const isCreator = ev.get("createdBy") === auth.id;
  const hostUsers = ev.get("hostUsers") || [];
  const isEventHost = Array.isArray(hostUsers) && hostUsers.includes(auth.id);
  if (!isAdmin && !isCreator && !isEventHost) {
    return e.forbiddenError("event host privileges required", null);
  }

  // Auth preference: OAuth token (counts against Claude.ai Pro/Max
  // subscription) wins over API key (pay-per-use credits). Either one
  // works; setting both lets the maintainer flip back to API by clearing
  // the OAuth env var without touching the API-key one.
  const oauthToken = $os.getenv("CLAUDE_OAUTH_TOKEN");
  const apiKey = $os.getenv("ANTHROPIC_API_KEY");
  if (!oauthToken && !apiKey) {
    return e.internalServerError("neither CLAUDE_OAUTH_TOKEN nor ANTHROPIC_API_KEY configured on the server", null);
  }

  const catBlock = cats.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const prompt = `Du erstellst ein deutsches Jeopardy-Brett für einen Spieleabend.

Kategorien:
${catBlock}

== KORREKTHEIT (oberste Priorität) ==
Jeder Fakt MUSS überprüfbar korrekt sein. Wenn du dir bei einem Fakt nicht 100% sicher bist (z.B. exaktes Jahr, exakter Songtext, Name einer Person), wähle ein anderes Thema oder formuliere weniger spezifisch. Lieber eine sichere als eine "interessantere" aber falsche Frage. Bei Songtexten wortwörtlich zitieren — wenn du den genauen Wortlaut nicht sicher kennst, nutz eine andere Zeile oder einen anderen Song. Bei TV-Shows: keine erfundenen Staffeln, Kandidaten oder Drama-Momente.

== SCHWIERIGKEITS-ANKER (sehr wichtig — staffel sie wirklich!) ==

Level 1 (100 Pkt) — "Pub-Quiz easy":
  Etwa 80% der Teilnehmer wissen es. Mainstream-Allgemeinwissen.
  Geographie-Beispiel: "Diese Stadt an der Spree ist Deutschlands Hauptstadt" → Berlin
  Reality-TV-Beispiel: "Diese Sendung sucht jährlich auf Mallorca die große Liebe" → Bachelor in Paradise (oder Love Island)
  Songtext-2000er-Beispiel: "Diese Robbie-Williams-Hit-Zeile geht 'I sit and wait, does an _ have a key?'" → Angel ('angel')

Level 2 (200 Pkt) — "kurz nachdenken":
  Etwa 60% wissen es.
  Geographie: "Dieser höchste Berg im Schwarzwald ist 1493m hoch" → Feldberg
  Schule: "Diese chemische Formel beschreibt Kochsalz" → NaCl

Level 3 (300 Pkt) — "gebildet, kein Spezialist":
  Etwa 40% wissen es. Schon spezifischer.
  Geographie: "In diesem deutschen Bundesland liegt die kleinste Landeshauptstadt Mainz" → Rheinland-Pfalz
  Twitch/YT-Beispiel: "Dieser Twitch-Streamer ist mit Mois und Trymacs Teil der 'Bratzn'" → Rumathra

Level 4 (400 Pkt) — "schon knifflig":
  Etwa 20%, deutlich spezifischer. Hier muss man nachdenken oder gut raten.
  Schule: "Diese mathematische Konstante ist als Eulersche Zahl bekannt und beträgt etwa 2,718" → e
  Songtext-2000er: "In diesem Tokio-Hotel-Song von 2005 fragt Bill: '_, in deiner Schule lernen sie nur Mist'" → Schrei

Level 5 (500 Pkt) — "richtig schwer, aber lösbar":
  Etwa 10%, Detailwissen. Aber NICHT obskur — sollte einem aufmerksamen Fan/Lerner einfallen.
  Geographie: "Dieser nördlichste Punkt Deutschlands liegt auf der Insel Sylt" → Listland (oder Kliffende)
  Reality-TV: "In dieser Staffel von 'Are You The One' war Aleks Petrović auf der Suche nach seinem Match" → Staffel 1 (2020)

== AUFGABE ==
1. Pro Kategorie GENAU 5 Fragen — eine je Level 1..5.
2. Jeder Level-Sprung MUSS deutlich spürbar sein. Wenn deine Level-5-Frage sich wie Level 3 anfühlt → spezifischer machen.
3. Fragen kurz (max 25 Wörter), klar formuliert, eindeutig beantwortbar.
4. Antworten kurz, faktisch, korrekt.
5. Stil: klassisches Jeopardy ("Diese Hauptstadt …" / "Dieser Schauspieler …"), wo's passt.

== ARBEITSWEISE ==
Im Thinking-Schritt: erst alle 25 Fragen im Entwurf, dann ehrlich kritisch durchgehen — ist das wirklich Level 5 oder gefühlt Level 2? Stimmt der Fakt 100%? Songtext exakt zitiert? Wenn unsicher: durch eine andere Frage ersetzen. Erst dann die endgültige JSON-Ausgabe.

== AUSGABE ==
NUR JSON. Kein Vortext, kein Codeblock. Beginnt mit { endet mit }. level-Feld ist 1..5 (NICHT 100..500). Schema:

{"questions":[{"category":"<Kategoriename wortgleich>","level":1,"q":"<Frage>","a":"<Antwort>"}]}

Insgesamt ${cats.length * 5} Einträge.`;

  const headers = oauthToken
    ? {
        // Pro/Max OAuth tokens only allow Messages API access when the
        // request identifies itself as Claude Code (Anthropic gates third-
        // party use). Without the User-Agent + Claude-Code system prompt
        // below the same token gets a 429 rate_limit_error on every call.
        "Authorization": "Bearer " + oauthToken,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "content-type": "application/json",
        "User-Agent": "claude-cli/1.0.0",
      }
    : {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      };

  const requestBody = {
    model: "claude-sonnet-4-5",
    max_tokens: 24000,
    // Extended thinking: lets the model deliberate (draft, fact-check, rewrite)
    // before emitting JSON. Budget covers the calibration work for ~25 trivia
    // questions; the visible answer still has room within max_tokens.
    thinking: {
      type: "enabled",
      budget_tokens: 8000,
    },
    messages: [{ role: "user", content: prompt }],
    // temperature must be 1 when thinking is enabled
    temperature: 1,
  };
  if (oauthToken) {
    // Claude Code identity required for OAuth tokens; we extend it with a
    // mini-instruction so the model is primed for careful trivia work.
    requestBody.system = "You are Claude Code, Anthropic's official CLI for Claude. The user is asking you to generate a German Jeopardy board. Be meticulous about factual correctness and difficulty calibration.";
  }

  let res;
  try {
    res = $http.send({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestBody),
      // Extended thinking + 25 questions can take a while.
      timeout: 240,
    });
  } catch (err) {
    return e.internalServerError("anthropic http error: " + err, null);
  }

  // res.body comes back as a Go []byte (Uint8Array-like in JSVM). JSON.parse
  // on it throws SyntaxError. Convert through the PB-provided toString helper
  // (handles UTF-8 properly, unlike String.fromCharCode).
  let bodyStr;
  try {
    bodyStr = typeof res.body === "string" ? res.body : toString(res.body);
  } catch (err) {
    return e.internalServerError("anthropic body decode failed: " + err, null);
  }

  if (res.statusCode !== 200) {
    return e.internalServerError("anthropic " + res.statusCode + ": " + bodyStr.slice(0, 400), null);
  }

  let text;
  try {
    const parsed = JSON.parse(bodyStr);
    // With extended thinking enabled, content is [thinking..., text...]. We
    // want the first block whose type is "text"; fall back to first block.
    if (Array.isArray(parsed.content)) {
      const textBlock = parsed.content.find(b => b && b.type === "text") || parsed.content[0];
      text = textBlock && textBlock.text;
    }
    if (!text) throw new Error("no text block in content");
  } catch (err) {
    return e.internalServerError("anthropic response unparseable: " + err + " | body[:300]=" + bodyStr.slice(0, 300), null);
  }

  // Extract the JSON object even if the model wrapped it in prose,
  // markdown fences, or both. Try strict-parse first, then a balanced-
  // brace extraction if that fails.
  const tryParse = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let board = tryParse(stripped);
  if (!board) {
    // Find the outermost {...} block
    const first = stripped.indexOf("{");
    const last = stripped.lastIndexOf("}");
    if (first >= 0 && last > first) {
      board = tryParse(stripped.slice(first, last + 1));
    }
  }
  if (!board) {
    return e.internalServerError("model returned non-JSON: " + stripped.slice(0, 400), null);
  }

  if (!board || !Array.isArray(board.questions)) {
    return e.internalServerError("response missing questions[]", null);
  }

  return e.json(200, board);
});
