/// <reference path="../pb_data/types.d.ts" />

// POST /api/jeopardy/generate { eventId, categories: string[] }
// Calls the Anthropic API to build a 5x5 (5 categories × 5 levels) board.
// Only event creator, event-hosts, and site admins may invoke.
routerAdd("POST", "/api/jeopardy/generate", (e) => {
  const auth = e.auth;
  if (!auth) return e.unauthorizedError("auth required", null);

  const data = new DynamicModel({ eventId: "", categories: [], avoid: [] });
  e.bindBody(data);

  if (!data.eventId) return e.badRequestError("eventId required", null);
  const cats = Array.isArray(data.categories) ? data.categories.filter(c => typeof c === "string" && c.trim().length > 0).map(c => c.trim()) : [];
  if (cats.length < 1 || cats.length > 8) {
    return e.badRequestError("between 1 and 8 categories required", null);
  }
  // Questions/answers already used in earlier rounds of this event — the
  // model must avoid these and anything closely similar. Cap to keep the
  // prompt bounded.
  const avoid = (Array.isArray(data.avoid) ? data.avoid : [])
    .filter(x => typeof x === "string" && x.trim().length > 0)
    .slice(0, 400);

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
  const avoidBlock = avoid.length
    ? `\n================================================================
== BEREITS GESTELLT — NICHT WIEDERHOLEN
================================================================
Diese Fragen/Antworten wurden in diesem Event schon verwendet. Stelle KEINE
davon erneut und auch nichts inhaltlich sehr Ähnliches (gleiche Antwort,
gleiches Faktum mit anderem Wortlaut). Wähle frische Themen:
${avoid.map(x => `- ${x}`).join("\n")}
`
    : "";
  const prompt = `Du erstellst ein deutsches Jeopardy-Brett für einen Spieleabend mit Freunden.

Kategorien (genau ${cats.length} Stück):
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
== SCHWIERIGKEITS-ANKER — Level 1..5
================================================================
Du MUSST die fünf Level innerhalb jeder Kategorie SPÜRBAR unterschiedlich machen. Wenn alle fünf "irgendwie gleich schwer" wirken: vergeigt.

Level 1 (= 100 Punkte) — "Pub-Quiz Mainstream":
  ~80% einer durchschnittlichen Erwachsenen-Runde wissen es.
  Geographie: "Diese Stadt an der Spree ist Deutschlands Hauptstadt." → Berlin
  Reality-TV: "In dieser RTL-Sendung verteilt ein Single jede Folge Rosen." → Der Bachelor

Level 2 (= 200 Punkte) — "kurz nachdenken":
  ~60% wissen es.
  Geographie: "Dieser höchste Berg im Schwarzwald ist 1493m hoch." → Feldberg
  Schule: "Diese chemische Formel beschreibt Kochsalz." → NaCl

Level 3 (= 300 Punkte) — "gebildet, kein Spezialist":
  ~40% wissen es. Schon spezifisch.
  Geographie: "Diese Landeshauptstadt von Rheinland-Pfalz liegt am Rhein." → Mainz
  Twitch/YT: "Diese deutsche Streamerin ist seit 2018 bei Twitch und veranstaltet das 'GIRLPLANET'-Festival." → Shurjoka

Level 4 (= 400 Punkte) — "schon knifflig":
  ~20% wissen es. Deutlich spezifischer als Level 3.
  Schule: "Diese mathematische Konstante ist als Eulersche Zahl bekannt und beträgt ca. 2,718." → e
  Songtext-2000er: "In Robbie Williams' 'Angel' (1997) heißt es: 'And through it all, she offers me ___.'" → protection

Level 5 (= 500 Punkte) — "schwer aber FAIR":
  ~10% wissen es. Detailwissen, ABER niemals obskur — Fakten, an die sich ein engagierter Fan/Lernender erinnern könnte.
  Reality-TV: "In dieser Staffel von 'Are You The One? Reality Stars in Love' war Aleks Petrović Teilnehmer." → Staffel 1 (2020)

NICHT machen auf Level 5: Trivial-Tier Detail-Fakten, die selbst Experten nicht wissen (z.B. "Wie hieß der dritte Hauself in Buch 7?").

================================================================
== KATEGORIE-FOKUS
================================================================
Halte dich strikt an die Kategorie. "Geographie" ≠ Hauptstadt-Quiz mit einer einzigen Star-Wars-Frage drin. Wenn die Kategorie "Songtexte 2000er" heißt: ALLE 5 Fragen sind Songtexte aus 2000–2009, nicht "Songs der 2000er" oder "Texte der 90er".

================================================================
== AUFGABE
================================================================
1. Pro Kategorie GENAU 5 Fragen — exakt eine je Level 1, 2, 3, 4, 5.
2. Insgesamt also exakt ${cats.length * 5} Fragen.
3. Fragen max 30 Wörter, eindeutig formuliert.
4. Antwort kurz und präzise (max 10 Wörter).
5. Bei Songtexten in der Frage selbst zitieren, Antwort = das fehlende Wort/die Antwort.
6. Stil: klassische Jeopardy-Aussagen ("Diese Hauptstadt…", "Dieser Schauspieler…") wo's passt.

================================================================
== ARBEITSWEISE (im Thinking-Block)
================================================================
Schritt 1: Pro Kategorie 5 Themen-Kandidaten sammeln, einen pro Level.
Schritt 2: Korrektheits-Check pro Frage: "Bin ich mir bei diesem Fakt zu 100% sicher?" — bei NEIN: ersetzen.
Schritt 3: Level-Konsistenz-Check: Stimmt die geschätzte Lösungsquote? Würde eine Level-5-Frage von 50% der Leute gelöst → zu leicht.
Schritt 4: Eindeutigkeits-Check: Gibt es nur EINE valide Antwort?
Schritt 5: Erst dann JSON ausgeben.

================================================================
== AUSGABE
================================================================
NUR JSON. Kein Vortext, kein Codeblock, keine Erklärung. Beginnt mit { endet mit }. level-Feld ist 1..5 (NICHT 100..500). Kategorie-Name MUSS wortgleich mit der Eingabe sein. Schema:

{"questions":[{"category":"<Kategoriename wortgleich>","level":1,"q":"<Frage>","a":"<Antwort>"}]}

Insgesamt ${cats.length * 5} Einträge in dieser Reihenfolge: Kategorie 1 Level 1..5, Kategorie 2 Level 1..5, ..., Kategorie ${cats.length} Level 1..5.`;

  // Model selection — Opus only. Question quality with Sonnet was poor, so we
  // never fall back to a cheaper/older family. Anthropic retires old snapshots
  // (that's why the previous hard-coded "claude-opus-4-7" started 400ing), so
  // we try the current Opus generations newest→older and skip any the API
  // rejects as invalid/unknown. The maintainer can pin an exact id via the
  // JEOPARDY_MODEL env var (highest priority) — set it to the latest Opus
  // snapshot on the HTPC without a code change.
  const envModel = $os.getenv("JEOPARDY_MODEL");
  const modelCandidates = [
    envModel,
    "claude-opus-4-8",
    "claude-opus-4-5",
    "claude-opus-4-1",
  ].filter(m => typeof m === "string" && m.trim().length > 0);

  // Build per-auth request configuration for a given model. We try OAuth (Pro
  // subscription) first; if it 429s we automatically retry with the API key
  // when one is available, so a Pro rate-limit doesn't block the round.
  const buildOAuthReq = (model) => ({
    headers: {
      // Pro/Max OAuth tokens only allow Messages API access when the
      // request identifies itself as Claude Code (Anthropic gates third-
      // party use). Without the User-Agent + Claude-Code system prompt
      // the same token gets a 429 rate_limit_error on every call.
      "Authorization": "Bearer " + oauthToken,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
      "content-type": "application/json",
      "User-Agent": "claude-cli/1.0.0",
    },
    body: {
      // NOTE: Pro/Max OAuth tokens do NOT permit extended thinking. With
      // `thinking` set, Anthropic returns 429 rate_limit_error. So OAuth
      // requests run without it; the API-key path below uses thinking for
      // higher quality output.
      model: model,
      max_tokens: 12000,
      system: "You are Claude Code, Anthropic's official CLI for Claude. The user is asking you to generate a German Jeopardy board. Be meticulous about factual correctness and difficulty calibration. Verify every single fact before including it; replace any question whose facts you cannot fully verify.",
      messages: [{ role: "user", content: prompt }],
    },
  });

  const buildApiKeyReq = (model) => ({
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: {
      // Extended thinking — better factual recall and difficulty-level
      // calibration. Budget gives the model room for the self-validation
      // pass demanded by the prompt.
      model: model,
      max_tokens: 24000,
      thinking: { type: "enabled", budget_tokens: 10000 },
      messages: [{ role: "user", content: prompt }],
    },
  });

  const send = (req) => {
    try {
      return $http.send({
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
        timeout: 240,
      });
    } catch (err) {
      return { statusCode: 0, body: "", _err: err };
    }
  };

  // True when a 400 body looks like an invalid/unknown-model rejection — the
  // signal to drop this model id and try the next candidate.
  const isModelError = (status, body) => {
    if (status !== 400) return false;
    const b = (body || "").toLowerCase();
    return b.indexOf("model") !== -1 &&
      (b.indexOf("invalid") !== -1 || b.indexOf("not found") !== -1 ||
       b.indexOf("not_found") !== -1 || b.indexOf("unknown") !== -1 ||
       b.indexOf("does not exist") !== -1 || b.indexOf("deprecated") !== -1);
  };

  // Diagnostics: record every attempt so a persistent failure tells us which
  // (auth × model) combos were tried and exactly how each one failed. Shown
  // in the final error so we never have to guess again.
  const tried = [];
  let res, bodyStr, usedAuth, usedModel;
  outer:
  for (const model of modelCandidates) {
    const attempts = [];
    if (oauthToken) attempts.push({ name: "oauth", req: buildOAuthReq(model) });
    if (apiKey)     attempts.push({ name: "apikey", req: buildApiKeyReq(model) });

    let modelRejected = false;
    for (const a of attempts) {
      res = send(a.req);
      if (res._err) {
        tried.push(a.name + "/" + model + ":net");
        continue; // network-level failure — try next auth
      }
      try { bodyStr = typeof res.body === "string" ? res.body : toString(res.body); }
      catch (_) { bodyStr = ""; }
      usedAuth = a.name;
      usedModel = model;
      tried.push(a.name + "/" + model + ":" + res.statusCode);

      if (res.statusCode === 200) break outer; // success
      // Invalid model → no point trying the other auth with the SAME model;
      // jump straight to the next candidate model.
      if (isModelError(res.statusCode, bodyStr)) {
        console.log("[jeopardy] model '" + model + "' rejected (400) — trying next candidate");
        modelRejected = true;
        break;
      }
      // Any other non-200 (429/401/403/5xx): fall through to the next auth
      // for THIS model if one remains; otherwise this becomes the final error.
      console.log("[jeopardy] " + a.name + "/" + model + " -> " + res.statusCode + " — trying next auth/model");
    }
    if (modelRejected) continue; // next model
    // All auths for this model failed with non-model errors — try next model
    // too (e.g. a transient 5xx might not recur on the next snapshot).
  }

  if (!res || res._err) {
    return e.internalServerError("anthropic http error: " + (res?._err || "no auth configured"), null);
  }
  const triedStr = " [tried: " + tried.join(", ") + "]";
  if (isModelError(res.statusCode, bodyStr)) {
    // Every Opus candidate was rejected — the built-in ids are out of date.
    // The maintainer must pin the current snapshot via the env var.
    return e.internalServerError(
      "kein gültiges Opus-Modell akzeptiert (zuletzt '" + usedModel + "'). " +
      "Setze die Env-Variable JEOPARDY_MODEL auf die aktuelle Opus-Snapshot-ID. " +
      "Anthropic: " + bodyStr.slice(0, 250) + triedStr, null);
  }
  if (res.statusCode !== 200) {
    return e.internalServerError("anthropic " + res.statusCode + " (" + usedAuth + "/" + usedModel + "): " + bodyStr.slice(0, 300) + triedStr, null);
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
