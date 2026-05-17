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
  const prompt = `Du erstellst ein deutsches Jeopardy-Spielbrett für einen Spieleabend unter Freunden.

Kategorien:
${catBlock}

Erstelle pro Kategorie GENAU 5 Fragen mit aufsteigendem Schwierigkeitsgrad (Level 1 = sehr leicht / Allgemeinwissen, Level 5 = sehr schwer / Experten).
Die Fragen sollen passend zur Kategorie, kurz (max. 25 Wörter), kreativ, eindeutig beantwortbar und für ein deutsches Publikum interessant sein. Frage-Stil im klassischen Jeopardy-Look ("Diese Hauptstadt ..."), wo es passt — sonst normale Frage.

Antworten kurz und faktisch.

Gib AUSSCHLIESSLICH gültiges JSON zurück (kein Markdown, keine Erklärung, kein Codeblock), exakt im folgenden Schema:

{
  "questions": [
    { "category": "<Kategoriename wortgleich>", "level": 1, "q": "<Frage>", "a": "<Antwort>" }
  ]
}

Insgesamt ${cats.length * 5} Einträge.`;

  const headers = oauthToken
    ? {
        "Authorization": "Bearer " + oauthToken,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "content-type": "application/json",
      }
    : {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      };

  let res;
  try {
    res = $http.send({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
      timeout: 90,
    });
  } catch (err) {
    return e.internalServerError("anthropic http error: " + err, null);
  }

  if (res.statusCode !== 200) {
    return e.internalServerError("anthropic " + res.statusCode + ": " + res.body, null);
  }

  let text;
  try {
    const parsed = JSON.parse(res.body);
    text = parsed.content && parsed.content[0] && parsed.content[0].text;
    if (!text) throw new Error("no content");
  } catch (err) {
    return e.internalServerError("anthropic response unparseable: " + err, null);
  }

  // Strip optional markdown fences just in case
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let board;
  try { board = JSON.parse(cleaned); }
  catch (err) { return e.internalServerError("model returned non-JSON: " + cleaned.slice(0, 300), null); }

  if (!board || !Array.isArray(board.questions)) {
    return e.internalServerError("response missing questions[]", null);
  }

  return e.json(200, board);
});
