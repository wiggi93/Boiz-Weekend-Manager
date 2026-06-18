/// <reference path="../pb_data/types.d.ts" />

// Web-Push triggers. The actual Web Push protocol (VAPID ES256 signing +
// payload encryption) is impossible in the JSVM, so sending is delegated to
// the push-sender sidecar (see /push-sender) reachable on the internal
// Docker network. Everything here is best-effort: a push failure must never
// break the actual write that triggered it.
//
// IMPORTANT: each hook handler runs in an isolated JSVM scope, so the shared
// helpers can't be file-level functions here — they live in push_lib.js and
// are require()d INSIDE each handler.
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

// ---- Trigger 1: new challenge → push to the challenged player -------------
onRecordAfterCreateSuccess((e) => {
  try {
    console.log("[push] challenge created hook fired");
    const { sendPushToUsers } = require(`${__hooks}/push_lib.js`);
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
      const { sendPushToUsers, eventMemberIds } = require(`${__hooks}/push_lib.js`);
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
  const lib = require(`${__hooks}/push_lib.js`);
  let prevCount = -1;
  try {
    const original = e.app.findRecordById("jeopardy", e.record.id);
    prevCount = lib.parseArr(original, "rounds").length;
  } catch (_) {}
  const next = lib.parseArr(e.record, "rounds");
  const nextCount = next.length;
  const actor = e.auth ? e.auth.id : null;
  const eventId = e.record.get("event");
  e.next();
  try {
    const lastUnfinished = nextCount > 0 && !(next[nextCount - 1] || {}).finishedAt;
    if (prevCount >= 0 && nextCount > prevCount && lastUnfinished) {
      const parts = lib.parseArr(e.record, "participants").filter((id) => id && id !== actor);
      lib.sendPushToUsers(e.app, parts, {
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
  const lib = require(`${__hooks}/push_lib.js`);
  let prevDone = [];
  try {
    const original = e.app.findRecordById("kitty", e.record.id);
    prevDone = lib.parseArr(original, "done");
  } catch (_) {}
  const nextDone = lib.parseArr(e.record, "done");
  const eventId = e.record.get("event");
  e.next();
  try {
    const { sendPushToUsers, eventMemberIds } = lib;
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
