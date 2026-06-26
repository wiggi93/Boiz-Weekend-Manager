/// <reference path="../pb_data/types.d.ts" />

// Jeopardy board generation. The heavy lifting + the auth gate live in
// jeopardy_lib.js and are require()d INSIDE each handler — PocketBase runs
// route handlers in an isolated JSVM scope, so file-level functions here are
// NOT visible inside them (that caused "jeoAuthOk is not defined").

// POST /api/jeopardy/generate { eventId, categories, avoid, surprise }
// Returns the raw board { questions:[...] }. Used for single-question
// regeneration (the full round flow uses /start-round below).
routerAdd("POST", "/api/jeopardy/generate", (e) => {
  const lib = require(`${__hooks}/jeopardy_lib.js`);
  const data = new DynamicModel({ eventId: "", categories: [], avoid: [], surprise: false });
  e.bindBody(data);
  if (!data.eventId) return e.badRequestError("eventId required", null);
  const gate = lib.jeoAuthOk(e, data.eventId);
  if (gate.err) return gate.err;

  const r = lib.generateBoard({ cats: data.categories, surprise: data.surprise, avoid: data.avoid });
  if (!r.ok) return e.internalServerError(r.error, null);
  return e.json(200, r.board);
});

// POST /api/jeopardy/start-round
//   { eventId, categories:[ordered names], aiCategories:[subset to AI-gen],
//     flagQuestions:[prebuilt flag Qs], surprise:bool }
// Generates the board, BUILDS the round, SAVES it on the jeopardy record, and
// pushes the participants — all server-side. So the client can fire this and
// background/lock the phone; the round shows up via realtime when it returns.
routerAdd("POST", "/api/jeopardy/start-round", (e) => {
  const lib = require(`${__hooks}/jeopardy_lib.js`);
  // flagQuestions is an array of objects → passed as a JSON string to avoid
  // DynamicModel nested-binding quirks; parsed below.
  const data = new DynamicModel({ eventId: "", categories: [], aiCategories: [], flagQuestions: "", surprise: false });
  e.bindBody(data);
  if (!data.eventId) return e.badRequestError("eventId required", null);
  const gate = lib.jeoAuthOk(e, data.eventId);
  if (gate.err) return gate.err;
  const actor = gate.auth.id;

  // The per-event jeopardy row.
  let jrec;
  try { jrec = e.app.findFirstRecordByFilter("jeopardy", `event = "${data.eventId}"`); }
  catch (_) { return e.notFoundError("jeopardy state not found", null); }

  // Collect avoid list (q + a from prior, non-flag questions).
  const prevRounds = lib.parseArr(jrec, "rounds");
  const avoid = [];
  for (const r of prevRounds) {
    for (const q of (r.questions || [])) {
      if (q && q.type !== "flag") { if (q.q) avoid.push(q.q); if (q.a) avoid.push(q.a); }
    }
  }

  const surprise = !!data.surprise;
  const aiCats = Array.isArray(data.aiCategories)
    ? data.aiCategories.filter(c => typeof c === "string" && c.trim().length > 0).map(c => c.trim())
    : [];

  // AI questions (skip the call entirely if it's a flags-only round).
  let aiQuestions = [];
  if (surprise || aiCats.length > 0) {
    const r = lib.generateBoard({ cats: aiCats, surprise: surprise, avoid: avoid });
    if (!r.ok) return e.internalServerError(r.error, null);
    aiQuestions = (r.board.questions || []).map(q => ({
      category: String(q.category || ""), level: Number(q.level) || 1,
      q: String(q.q || ""), a: String(q.a || ""), winnerUserId: null, revealed: false,
    }));
  }

  // Pre-built flag questions from the client (offline flag bank).
  const flagQuestions = [];
  let fqRaw = [];
  try { fqRaw = JSON.parse(data.flagQuestions || "[]"); } catch (_) { fqRaw = []; }
  if (!Array.isArray(fqRaw)) fqRaw = [];
  for (const f of fqRaw) {
    if (!f || !f.flagCode || !f.category) continue;
    flagQuestions.push({
      category: String(f.category), level: Number(f.level) || 1,
      type: "flag", flagCode: String(f.flagCode),
      q: String(f.q || "Welches Land zeigt diese Flagge?"), a: String(f.a || ""),
      winnerUserId: null, revealed: false,
    });
  }

  const questions = aiQuestions.concat(flagQuestions);
  if (questions.length === 0) return e.badRequestError("no questions generated", null);

  // Final ordered category list. In surprise mode the model picked them, so
  // derive from the generated questions (first-seen order).
  let finalCategories;
  if (surprise) {
    finalCategories = [];
    for (const q of aiQuestions) {
      if (q.category && finalCategories.indexOf(q.category) === -1) finalCategories.push(q.category);
    }
  } else {
    finalCategories = (Array.isArray(data.categories) ? data.categories : [])
      .filter(c => typeof c === "string" && c.trim().length > 0).map(c => c.trim());
  }

  // Picker order: shuffle the participants.
  const participants = lib.parseArr(jrec, "participants").filter(x => typeof x === "string" && x);
  const pickerOrder = participants.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);

  const round = {
    id: String(Date.now()),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    categories: finalCategories,
    pickerOrder: pickerOrder,
    pickerIdx: 0,
    questions: questions,
  };

  // Persist the round on the jeopardy row.
  const nextRounds = prevRounds.concat([round]);
  jrec.set("rounds", nextRounds);
  jrec.set("categories", finalCategories);
  try { e.app.save(jrec); }
  catch (err) { return e.internalServerError("could not save round: " + err, null); }

  // Make the event live so non-host players leave the waiting screen.
  try {
    if (!gate.ev.get("active")) { gate.ev.set("active", true); e.app.save(gate.ev); }
  } catch (_) {}

  // Notify the participants (server-side save doesn't fire the request hook,
  // so push directly here). Plus a "your round is ready" ping to the host who
  // kicked it off — they may have locked the phone during the long generation.
  try {
    const push = require(`${__hooks}/push_lib.js`);
    const targets = participants.filter(id => id && id !== actor);
    push.sendPushToUsers(e.app, targets, {
      title: "🎤 Jeopardy-Runde gestartet!",
      body: "Eine neue Runde läuft — du bist dabei. Handy raus!",
      url: `/?event=${data.eventId}&goto=jeopardy`,
      tag: `jeo-${jrec.id}-${nextRounds.length}`,
    });
    push.sendPushToUsers(e.app, [actor], {
      title: "✅ Deine Jeopardy-Runde ist fertig!",
      body: "Die Fragen sind generiert — los geht's! 🎤",
      url: `/?event=${data.eventId}&goto=jeopardy`,
      tag: `jeo-ready-${jrec.id}-${nextRounds.length}`,
    });
    push.logNotif(e.app, {
      event: data.eventId, type: "jeopardy",
      title: "🎤 Jeopardy-Runde gestartet",
      body: "Eine neue Runde läuft — Handy raus!",
      url: `/?event=${data.eventId}&goto=jeopardy`,
    });
  } catch (err) { console.log("[push] start-round:", err); }

  return e.json(200, { ok: true, roundId: round.id });
});
