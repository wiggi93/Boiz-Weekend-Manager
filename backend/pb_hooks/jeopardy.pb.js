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
  const prompt = `Erstelle ein deutsches Jeopardy-Spielbrett für einen anspruchsvollen Spieleabend unter Freunden, die gerne knobeln.

Kategorien:
${catBlock}

Pro Kategorie GENAU 5 Fragen mit aufsteigendem Schwierigkeitsgrad:
- Level 1: solides Allgemeinwissen, sollte ein interessierter Erwachsener wissen (keine Trivia-Selbstläufer)
- Level 2: mittelschwer, leicht spezialisiert
- Level 3: anspruchsvoll, Detailwissen oder weniger bekannte Fakten
- Level 4: schwer, deutlich spezialisiert / weniger geläufig
- Level 5: sehr schwer / Experten / überraschende Details (sollte richtig nachdenken oder raten lassen)

Vermeide offensichtliche Tagesschau-Fragen ("Hauptstadt von Deutschland"). Die Fragen sollen für ein erwachsenes deutsches Publikum interessant sein, kreativ formuliert, kurz (max. 25 Wörter) und eindeutig beantwortbar. Frage-Stil im klassischen Jeopardy-Look ("Diese Hauptstadt …"), wo es passt — sonst normale Frage. Antworten kurz und faktisch.

Antworte AUSSCHLIESSLICH mit reinem JSON. Kein Vortext, keine Erklärung, kein Codeblock, kein "Hier ist das Brett". Die Antwort MUSS mit { beginnen und mit } enden, exakt nach diesem Schema:

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
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  };
  if (oauthToken) {
    requestBody.system = "You are Claude Code, Anthropic's official CLI for Claude.";
  }

  let res;
  try {
    res = $http.send({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestBody),
      timeout: 90,
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
    text = parsed.content && parsed.content[0] && parsed.content[0].text;
    if (!text) throw new Error("no content");
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
