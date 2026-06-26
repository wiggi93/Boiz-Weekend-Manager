/// <reference path="../pb_data/types.d.ts" />

// Wine module: fun-fact delivery. Facts pop up per event hourly-ish (cron,
// host-configurable interval + on/off) and on demand by the host. Only facts
// that have actually been delivered to an event are readable in-app — the
// delivered indices are tracked on the event (wineFactsSeen).
//
// JSVM scope isolation: the push + record logic is inlined per handler, with
// all helpers require()d inside that handler.

// GET /api/wine/facts → the full catalogue (the app filters to delivered ones).
routerAdd("GET", "/api/wine/facts", (e) => {
  const facts = require(`${__hooks}/wine_facts.js`).WINE_FACTS;
  return e.json(200, { facts: facts });
});

// POST /api/wine/fact-push { eventId } — host/admin fires a fact now (ignores
// the schedule on/off + interval; still records it as delivered).
routerAdd("POST", "/api/wine/fact-push", (e) => {
  const data = new DynamicModel({ eventId: "" });
  e.bindBody(data);
  if (!data.eventId) return e.badRequestError("eventId required", null);

  const gate = require(`${__hooks}/jeopardy_lib.js`).jeoAuthOk(e, data.eventId);
  if (gate.err) return gate.err;

  try {
    const lib = require(`${__hooks}/wine_facts.js`);
    const push = require(`${__hooks}/push_lib.js`);
    const facts = lib.WINE_FACTS;
    const ev = gate.ev;
    const seen = push.parseArr(ev, "wineFactsSeen");
    const idx = lib.pickFactIndex(seen, facts.length);
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
    push.logNotif(e.app, {
      event: data.eventId, type: "wine",
      title: "🍷 Wein-Fun-Fact: " + f.title,
      body: f.text || "",
      url: `/?event=${data.eventId}&goto=wine&fact=${idx}`,
    });
    // Mark as delivered + stamp the time (so the next auto-fact waits its interval).
    ev.set("wineFactsSeen", seen.concat([String(idx)]));
    ev.set("wineFactLastAt", new Date().toISOString());
    e.app.save(ev);
  } catch (err) { console.log("[wine] manual fact-push:", err); }
  return e.json(200, { ok: true });
});

// Hourly tick: for every ACTIVE event with the wine module enabled, push a
// fresh fact if the schedule is on and its interval has elapsed. Quiet 1–9am.
cronAdd("wine-funfact", "0 * * * *", () => {
  try {
    const hour = new Date().getHours();
    if (hour >= 1 && hour < 9) return; // no nightly pings
    const lib = require(`${__hooks}/wine_facts.js`);
    const push = require(`${__hooks}/push_lib.js`);
    const facts = lib.WINE_FACTS;
    if (!facts.length) return;

    let events = [];
    try { events = $app.findRecordsByFilter("events", "active = true", "", 200, 0); }
    catch (_) { return; }

    const now = Date.now();
    for (const ev of events) {
      try {
        const mods = push.parseArr(ev, "modules");
        if (mods.indexOf("wine") === -1) continue;
        if (ev.get("wineFactEnabled") === false) continue; // schedule off

        const intervalH = Number(ev.get("wineFactIntervalH")) || 1;
        const lastAt = ev.get("wineFactLastAt");
        if (lastAt) {
          const elapsedH = (now - new Date(lastAt).getTime()) / 3600000;
          if (elapsedH < intervalH - 0.5) continue; // not due yet
        }

        const seen = push.parseArr(ev, "wineFactsSeen");
        const idx = lib.pickFactIndex(seen, facts.length);
        const f = facts[idx];
        const members = push.eventMemberIds($app, ev.id, null);
        if (members.length) {
          const body = (f.text || "").length > 130 ? (f.text.slice(0, 127) + "…") : (f.text || "");
          push.sendPushToUsers($app, members, {
            title: "🍷 Wein-Fun-Fact: " + f.title,
            body: body,
            url: `/?event=${ev.id}&goto=wine&fact=${idx}`,
            tag: `wine-fact-${ev.id}`,
          });
        }
        push.logNotif($app, {
          event: ev.id, type: "wine",
          title: "🍷 Wein-Fun-Fact: " + f.title,
          body: f.text || "",
          url: `/?event=${ev.id}&goto=wine&fact=${idx}`,
        });
        ev.set("wineFactsSeen", seen.concat([String(idx)]));
        ev.set("wineFactLastAt", new Date().toISOString());
        $app.save(ev);
      } catch (_) {}
    }
  } catch (err) { console.log("[wine] cron:", err); }
});
