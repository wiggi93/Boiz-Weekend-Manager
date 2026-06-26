/// <reference path="../pb_data/types.d.ts" />

// Werwolf: secure role assignment + the Seherin's nightly check. Phase/death
// management is done via host-gated record updates from the app; only the parts
// that must stay secret live here. Helpers require()d inside each handler.

// POST /api/werewolf/start { eventId, config:{wolves,seer,witch,hunter} }
// Host only. Randomly assigns roles, (re)creates the secret role rows + the
// public game state, and pushes everyone to look at their role.
routerAdd("POST", "/api/werewolf/start", (e) => {
  const data = new DynamicModel({ eventId: "", config: {} });
  e.bindBody(data);
  if (!data.eventId) return e.badRequestError("eventId required", null);
  const gate = require(`${__hooks}/jeopardy_lib.js`).jeoAuthOk(e, data.eventId);
  if (gate.err) return gate.err;

  try {
    const push = require(`${__hooks}/push_lib.js`);
    const moderator = e.auth ? e.auth.id : "";
    // The host runs the game (sees all roles) and does NOT play.
    const players = push.eventMemberIds(e.app, data.eventId, moderator);
    if (players.length < 3) return e.badRequestError("Mindestens 3 Mitspieler nötig (zusätzlich zum Spielleiter).", null);

    const cfg = data.config || {};
    const wolves = Math.max(1, Math.min(Number(cfg.wolves) || 1, Math.floor(players.length / 2)));

    // Build the role pool: wolves, then specials (only if they fit), villagers fill the rest.
    const pool = [];
    for (let i = 0; i < wolves; i++) pool.push("wolf");
    const specials = [];
    if (cfg.seer) specials.push("seer");
    if (cfg.witch) specials.push("witch");
    if (cfg.hunter) specials.push("hunter");
    for (const s of specials) { if (pool.length < players.length) pool.push(s); }
    while (pool.length < players.length) pool.push("villager");

    const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
    const ms = shuffle(players.slice());
    shuffle(pool);

    // Wipe old roles, write fresh ones.
    try {
      const old = e.app.findRecordsByFilter("werewolf_roles", `event = "${data.eventId}"`, "", 200, 0);
      for (const r of old) { try { e.app.delete(r); } catch (_) {} }
    } catch (_) {}
    const roleCol = e.app.findCollectionByNameOrId("werewolf_roles");
    for (let i = 0; i < ms.length; i++) {
      const rec = new Record(roleCol);
      rec.set("event", data.eventId); rec.set("user", ms[i]); rec.set("role", pool[i]);
      e.app.save(rec);
    }

    // Upsert the public game state.
    let ww;
    try { ww = e.app.findFirstRecordByFilter("werewolf", `event = "${data.eventId}"`); }
    catch (_) { ww = new Record(e.app.findCollectionByNameOrId("werewolf")); ww.set("event", data.eventId); }
    ww.set("moderator", moderator);
    ww.set("phase", "night"); ww.set("round", 1);
    ww.set("alive", players); ww.set("deaths", []); ww.set("winner", ""); ww.set("reveal", {});
    ww.set("config", { wolves: wolves, seer: !!cfg.seer, witch: !!cfg.witch, hunter: !!cfg.hunter });
    e.app.save(ww);

    push.sendPushToUsers(e.app, players, {
      title: "🐺 Werwolf: Rollen verteilt!",
      body: "Schau dir heimlich deine Rolle an — die Nacht beginnt…",
      url: `/?event=${data.eventId}&goto=werewolf`,
      tag: `ww-start-${data.eventId}`,
    });
    push.logNotif(e.app, {
      event: data.eventId, type: "werewolf",
      title: "🐺 Werwolf gestartet",
      body: "Rollen sind verteilt — schau dir deine Rolle an!",
      url: `/?event=${data.eventId}&goto=werewolf`,
    });
  } catch (err) { console.log("[werewolf] start:", err); return e.internalServerError("start failed: " + err, null); }
  return e.json(200, { ok: true });
});

// POST /api/werewolf/peek { eventId, target } — the Seherin checks one player at
// night and learns whether they're a werewolf. Server-side so it can't be faked.
routerAdd("POST", "/api/werewolf/peek", (e) => {
  const data = new DynamicModel({ eventId: "", target: "" });
  e.bindBody(data);
  if (!e.auth) return e.unauthorizedError("auth required", null);
  if (!data.eventId || !data.target) return e.badRequestError("eventId + target required", null);
  try {
    let mine;
    try { mine = e.app.findFirstRecordByFilter("werewolf_roles", `event = "${data.eventId}" && user = "${e.auth.id}"`); }
    catch (_) { return e.forbiddenError("keine Rolle", null); }
    if (mine.get("role") !== "seer") return e.forbiddenError("nur die Seherin darf prüfen", null);

    let ww;
    try { ww = e.app.findFirstRecordByFilter("werewolf", `event = "${data.eventId}"`); }
    catch (_) { return e.notFoundError("kein Spiel", null); }
    if (ww.get("phase") !== "night") return e.badRequestError("nur nachts", null);

    let tr;
    try { tr = e.app.findFirstRecordByFilter("werewolf_roles", `event = "${data.eventId}" && user = "${data.target}"`); }
    catch (_) { return e.notFoundError("Ziel nicht gefunden", null); }
    const role = tr.get("role");
    return e.json(200, { role: role, isWolf: role === "wolf" });
  } catch (err) { console.log("[werewolf] peek:", err); return e.internalServerError("peek failed", null); }
});
