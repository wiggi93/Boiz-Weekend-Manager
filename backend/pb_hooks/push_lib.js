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
    if (!url) { console.log("[push] PUSH_SENDER_URL not set — skip"); return; }
    if (!Array.isArray(userIds) || userIds.length === 0) { console.log("[push] no target users"); return; }

    const subs = [];
    const subIdByEndpoint = {};
    for (const uid of userIds) {
      if (!uid) continue;
      let records = [];
      try { records = app.findRecordsByFilter("push_subs", `user = "${uid}"`, "", 50, 0); }
      catch (err) { console.log("[push] subs lookup failed for", uid, err); continue; }
      for (const r of records) {
        const endpoint = r.get("endpoint");
        if (!endpoint) continue;
        // PocketBase returns a json field in a form that doesn't always
        // JSON.stringify back into a plain { p256dh, auth } object (it can
        // come through as a string / JSONRaw), which left web-push without
        // usable encryption keys → every send "failed". Normalise to a plain
        // object with the two string keys it needs.
        const raw = r.get("keys");
        let parsed = null;
        if (raw && typeof raw === "object" && (raw.p256dh || raw.auth)) {
          parsed = { p256dh: raw.p256dh, auth: raw.auth };
        } else {
          // string / JSONRaw / []byte — coerce to text, then parse
          try {
            const s = typeof raw === "string" ? raw : String(raw);
            if (s && s.indexOf("{") !== -1) parsed = JSON.parse(s);
          } catch (_) {}
        }
        const p256dh = parsed && parsed.p256dh;
        const auth = parsed && parsed.auth;
        if (!p256dh || !auth) { console.log("[push] sub missing keys, skip"); continue; }
        subs.push({ endpoint: endpoint, keys: { p256dh: String(p256dh), auth: String(auth) } });
        subIdByEndpoint[endpoint] = r.id;
      }
    }
    console.log("[push] target users " + JSON.stringify(userIds) + " -> " + subs.length + " subscription(s)");
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

    const bodyStr = typeof res.body === "string" ? res.body : toString(res.body);
    console.log("[push] sidecar status " + res.statusCode + " body " + (bodyStr || "").slice(0, 120));
    try {
      const out = JSON.parse(bodyStr);
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

// Read a JSON-array field reliably. PocketBase's record.get() on a json field
// can hand back a real array, a JSON string, OR a raw byte array (JSONRaw) —
// the last one made `participants` iterate over bytes (target users came out
// as [91,34,109,…] = the JSON text's char codes). Normalise to a JS array.
function parseArr(record, field) {
  try {
    const s = record.getString(field);
    if (s && s.charAt(0) === "[") { const v = JSON.parse(s); if (Array.isArray(v)) return v; }
  } catch (_) {}
  try {
    const v = record.get(field);
    if (Array.isArray(v)) {
      if (v.length === 0) return v;
      if (typeof v[0] !== "number") return v; // real array of strings/objects
      let s = ""; for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);
      const p = JSON.parse(s); return Array.isArray(p) ? p : [];
    }
    if (typeof v === "string") { const p = JSON.parse(v); return Array.isArray(p) ? p : []; }
    const s = String(v); if (s && s.charAt(0) === "[") { const p = JSON.parse(s); return Array.isArray(p) ? p : []; }
  } catch (_) {}
  return [];
}

module.exports = { sendPushToUsers, eventMemberIds, parseArr };
