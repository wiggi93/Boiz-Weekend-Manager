/// <reference path="../pb_data/types.d.ts" />

// Shared push helpers. NOTE: PocketBase JSVM runs every hook handler in an
// ISOLATED scope — top-level functions defined in a *.pb.js file are NOT
// visible inside its hook callbacks (that caused "sendPushToUsers is not
// defined"). The supported way to share code is a plain .js module (not
// *.pb.js, so it isn't auto-registered) pulled in with require() *inside*
// each handler. JSVM globals ($http, $os) are available here.

// Collect subscriptions for the given user ids and POST them to the
// push-sender sidecar. Prunes subscriptions the push service reports dead.
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

module.exports = { sendPushToUsers, eventMemberIds };
