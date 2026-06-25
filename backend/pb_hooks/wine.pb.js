/// <reference path="../pb_data/types.d.ts" />

// Wine module: fun-fact delivery. Facts are pushed to event members hourly
// (cron) and on demand by the host, and listed in the app's "Wein-Wissen"
// section.
//
// NOTE: the PocketBase JSVM runs every hook/route handler in an ISOLATED
// scope — file-level functions here are NOT visible inside the handlers. So
// the fact-push logic is inlined per handler, with all helpers require()d
// inside that same handler.

// GET /api/wine/facts → the fact catalogue (for the in-app list).
routerAdd("GET", "/api/wine/facts", (e) => {
  const facts = require(`${__hooks}/wine_facts.js`).WINE_FACTS;
  return e.json(200, { facts: facts });
});

// POST /api/wine/fact-push { eventId } — host/admin triggers a fact now.
routerAdd("POST", "/api/wine/fact-push", (e) => {
  const data = new DynamicModel({ eventId: "" });
  e.bindBody(data);
  if (!data.eventId) return e.badRequestError("eventId required", null);

  const gate = require(`${__hooks}/jeopardy_lib.js`).jeoAuthOk(e, data.eventId);
  if (gate.err) return gate.err;

  try {
    const facts = require(`${__hooks}/wine_facts.js`).WINE_FACTS;
    const push = require(`${__hooks}/push_lib.js`);
    if (facts.length) {
      const idx = Math.floor(Math.random() * facts.length);
      const f = facts[idx];
      const members = push.eventMemberIds(e.app, data.eventId, e.auth ? e.auth.id : null);
      if (members.length) {
        const body = (f.text || "").length > 130 ? (f.text.slice(0, 127) + "…") : (f.text || "");
        push.sendPushToUsers(e.app, members, {
          title: "🍷 Wein-Fun-Fact: " + f.title,
          body: body,
          url: `/?event=${data.eventId}&goto=wine&fact=${idx}`,
          tag: `wine-fact-${data.eventId}`,
        });
      }
    }
  } catch (err) { console.log("[wine] manual fact-push:", err); }
  return e.json(200, { ok: true });
});

// Hourly: push a random fact to every ACTIVE event that has the wine module
// enabled. Quiet hours 1–9am so nobody's woken at night.
cronAdd("wine-funfact", "0 * * * *", () => {
  try {
    const hour = new Date().getHours();
    if (hour >= 1 && hour < 9) return; // no nightly pings
    const facts = require(`${__hooks}/wine_facts.js`).WINE_FACTS;
    const push = require(`${__hooks}/push_lib.js`);
    if (!facts.length) return;

    let events = [];
    try { events = $app.findRecordsByFilter("events", "active = true", "", 200, 0); }
    catch (_) { return; }

    for (const ev of events) {
      const mods = push.parseArr(ev, "modules");
      if (mods.indexOf("wine") === -1) continue;
      try {
        const idx = Math.floor(Math.random() * facts.length);
        const f = facts[idx];
        const members = push.eventMemberIds($app, ev.id, null);
        if (!members.length) continue;
        const body = (f.text || "").length > 130 ? (f.text.slice(0, 127) + "…") : (f.text || "");
        push.sendPushToUsers($app, members, {
          title: "🍷 Wein-Fun-Fact: " + f.title,
          body: body,
          url: `/?event=${ev.id}&goto=wine&fact=${idx}`,
          tag: `wine-fact-${ev.id}`,
        });
      } catch (_) {}
    }
  } catch (err) { console.log("[wine] cron:", err); }
});
