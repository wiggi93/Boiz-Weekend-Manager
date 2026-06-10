/// <reference path="../pb_data/types.d.ts" />

// Web-Push triggers. The actual Web Push protocol (VAPID ES256 signing +
// payload encryption) is impossible in the JSVM, so sending is delegated to
// the push-sender sidecar (see /push-sender) reachable on the internal
// Docker network. Everything here is best-effort: a push failure must never
// break the actual write that triggered it.
//
// Env (backend container):
//   VAPID_PUBLIC_KEY   — served to the frontend for pushManager.subscribe()
//   PUSH_SENDER_URL    — e.g. http://boiz-weekend-push:8030
//   PUSH_SENDER_TOKEN  — shared secret, must match the sidecar

// Frontend fetches the VAPID public key from here (so it lives in the HTPC
// .env, not in the repo / JS bundle).
routerAdd("GET", "/api/push/pubkey", (e) => {
  const key = $os.getenv("VAPID_PUBLIC_KEY") || "";
  return e.json(200, { key });
});

// Collect subscriptions for the given user ids and hand them to the sidecar.
// Prunes subscriptions the push service reports as dead (404/410).
function sendPushToUsers(app, userIds, payload) {
  try {
    const url = $os.getenv("PUSH_SENDER_URL");
    if (!url || !Array.isArray(userIds) || userIds.length === 0) return;

    const subs = [];
    const subIdByEndpoint = {};
    for (const uid of userIds) {
      if (!uid) continue;
      let records = [];
      try { records = app.findRecordsByFilter("push_subs", `user = "${uid}"`, "", 50, 0); }
      catch (_) { continue; }
      for (const r of records) {
        const keys = r.get("keys");
        const endpoint = r.get("endpoint");
        if (!endpoint || !keys) continue;
        subs.push({ endpoint: endpoint, keys: keys });
        subIdByEndpoint[endpoint] = r.id;
      }
    }
    if (subs.length === 0) return;

    const res = $http.send({
      url: url.replace(/\/$/, "") + "/send",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Authorization": "Bearer " + ($os.getenv("PUSH_SENDER_TOKEN") || ""),
      },
      body: JSON.stringify({ subscriptions: subs, payload: payload }),
      timeout: 20,
    });

    // Prune dead subscriptions so we stop hammering expired endpoints.
    try {
      const out = JSON.parse(typeof res.body === "string" ? res.body : toString(res.body));
      for (const ep of out.gone || []) {
        const id = subIdByEndpoint[ep];
        if (!id) continue;
        try { app.delete(app.findRecordById("push_subs", id)); } catch (_) {}
      }
    } catch (_) {}
  } catch (err) {
    console.log("[push] send failed:", err);
  }
}

// Member ids of an event (excluding `exceptId` when given).
function eventMemberIds(app, eventId, exceptId) {
  const ids = [];
  try {
    const members = app.findRecordsByFilter("event_members", `event = "${eventId}"`, "", 500, 0);
    for (const m of members) {
      const uid = m.get("user");
      if (uid && uid !== exceptId) ids.push(uid);
    }
  } catch (_) {}
  return ids;
}

// ---- Trigger 1: new challenge → push to the challenged player -------------
onRecordAfterCreateSuccess((e) => {
  try {
    const toUser = e.record.get("toUser");
    const fromUser = e.record.get("fromUser");
    const eventId = e.record.get("event");
    if (toUser && toUser !== fromUser) {
      let fromName = "Jemand";
      try {
        const u = e.app.findRecordById("users", fromUser);
        fromName = u.get("displayName") || fromName;
      } catch (_) {}
      const reward = Number(e.record.get("reward")) || 0;
      sendPushToUsers(e.app, [toUser], {
        title: "🎯 Neue Challenge!",
        body: `${fromName}: ${e.record.get("text")} (+${reward} Pkt)`,
        url: `/?event=${eventId}&goto=challenges`,
        tag: `chal-${e.record.id}`,
      });
    }
  } catch (err) { console.log("[push] challenge trigger:", err); }
  e.next();
}, "challenges");

// ---- Trigger 2: event flips to active → push to all members ---------------
onRecordUpdateRequest((e) => {
  let wasActive = true;
  try {
    const original = e.app.findRecordById("events", e.record.id);
    wasActive = !!original.get("active");
  } catch (_) {}
  const nowActive = !!e.record.get("active");
  const actor = e.auth ? e.auth.id : null;
  e.next(); // persist first — only push when the update actually succeeded
  try {
    if (!wasActive && nowActive) {
      sendPushToUsers(e.app, eventMemberIds(e.app, e.record.id, actor), {
        title: "🍻 Es geht los!",
        body: `"${e.record.get("name")}" ist jetzt live — rein da!`,
        url: `/?event=${e.record.id}`,
        tag: `event-live-${e.record.id}`,
      });
    }
  } catch (err) { console.log("[push] event trigger:", err); }
}, "events");

// ---- Trigger 3: jeopardy round started → push to participants -------------
onRecordUpdateRequest((e) => {
  let prevCount = -1;
  try {
    const original = e.app.findRecordById("jeopardy", e.record.id);
    const prev = original.get("rounds");
    prevCount = Array.isArray(prev) ? prev.length : 0;
  } catch (_) {}
  const next = e.record.get("rounds");
  const nextCount = Array.isArray(next) ? next.length : 0;
  const actor = e.auth ? e.auth.id : null;
  const eventId = e.record.get("event");
  e.next();
  try {
    const lastUnfinished = nextCount > 0 && !(next[nextCount - 1] || {}).finishedAt;
    if (prevCount >= 0 && nextCount > prevCount && lastUnfinished) {
      const parts = (e.record.get("participants") || []).filter((id) => id && id !== actor);
      sendPushToUsers(e.app, parts, {
        title: "🎤 Jeopardy-Runde gestartet!",
        body: "Eine neue Runde läuft — du bist dabei. Handy raus!",
        url: `/?event=${eventId}&goto=jeopardy`,
        tag: `jeo-${e.record.id}-${nextCount}`,
      });
    }
  } catch (err) { console.log("[push] jeopardy trigger:", err); }
}, "jeopardy");

// ---- Trigger 4: kitty — everyone marked done → push to all members --------
onRecordUpdateRequest((e) => {
  let prevDone = [];
  try {
    const original = e.app.findRecordById("kitty", e.record.id);
    const d = original.get("done");
    prevDone = Array.isArray(d) ? d : [];
  } catch (_) {}
  const nextDoneRaw = e.record.get("done");
  const nextDone = Array.isArray(nextDoneRaw) ? nextDoneRaw : [];
  const eventId = e.record.get("event");
  e.next();
  try {
    const memberIds = eventMemberIds(e.app, eventId, null);
    const wasComplete = memberIds.length > 0 && memberIds.every((id) => prevDone.includes(id));
    const isComplete = memberIds.length > 0 && memberIds.every((id) => nextDone.includes(id));
    if (!wasComplete && isComplete) {
      sendPushToUsers(e.app, memberIds, {
        title: "💸 Kassensturz komplett!",
        body: "Alle haben ihre Ausgaben eingereicht — ihr könnt jetzt ausgleichen.",
        url: `/?event=${eventId}&goto=kitty`,
        tag: `kitty-done-${e.record.id}`,
      });
    }
  } catch (err) { console.log("[push] kitty trigger:", err); }
}, "kitty");
