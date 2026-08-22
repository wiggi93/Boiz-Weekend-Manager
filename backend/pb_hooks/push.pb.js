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

// ---- Trigger 1: new challenge → ping the challenged player, and (for a
// non-secret challenge) the rest of the crew so they vote on the points -------
onRecordAfterCreateSuccess((e) => {
  try {
    const push = require(`${__hooks}/push_lib.js`);
    const rec = e.record;
    const toUser = rec.get("toUser");
    const fromUser = rec.get("fromUser");
    const eventId = rec.get("event");
    const secret = !!rec.get("secret");
    const group = !!rec.get("group");
    const text = rec.get("text") || "";
    const nameOf = (id) => { try { return e.app.findRecordById("users", id).get("displayName") || "Jemand"; } catch (_) { return "Jemand"; } };
    const fromName = nameOf(fromUser);

    // Group challenge: exactly ONE push per participant (no per-pairing voting
    // storm), plus a single feed entry.
    if (group) {
      const participants = push.parseArr(rec, "participants");
      const recipients = participants.filter((id) => id && id !== fromUser);
      if (recipients.length) {
        push.sendPushToUsers(e.app, recipients, {
          title: "🎯 Gruppen-Challenge!",
          body: `${fromName}: ${text}`,
          url: `/?event=${eventId}&goto=challenges&challenge=${rec.id}`,
          tag: `chal-${rec.id}`,
        });
      }
      push.logNotif(e.app, {
        event: eventId, type: "challenge",
        title: "🎯 Neue Gruppen-Challenge",
        body: `${fromName}: ${text}`,
        url: `/?event=${eventId}&goto=challenges&challenge=${rec.id}`,
      });
      e.next();
      return;
    }

    if (toUser && toUser !== fromUser) {
      push.sendPushToUsers(e.app, [toUser], {
        title: "🎯 Neue Challenge!",
        body: `${fromName}: ${text}`,
        url: `/?event=${eventId}&goto=challenges&challenge=${rec.id}`,
        tag: `chal-${rec.id}`,
      });
    }

    // Non-secret challenges go to group voting → notify everyone else + feed.
    if (!secret) {
      const all = push.eventMemberIds(e.app, eventId, null);
      const voters = all.filter((id) => id !== toUser && id !== fromUser);
      if (voters.length) {
        push.sendPushToUsers(e.app, voters, {
          title: "🗳️ Challenge-Voting",
          body: `${fromName} → ${nameOf(toUser)}: Stimm ab, wie viele Punkte fair sind.`,
          url: `/?event=${eventId}&goto=challenges&challenge=${rec.id}`,
          tag: `chalvote-${rec.id}`,
        });
      }
      push.logNotif(e.app, {
        event: eventId, type: "challenge",
        title: "🎯 Neue Challenge",
        body: `${fromName} → ${nameOf(toUser)}: ${text}`,
        url: `/?event=${eventId}&goto=challenges&challenge=${rec.id}`,
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
      const lib = require(`${__hooks}/push_lib.js`);
      lib.sendPushToUsers(e.app, lib.eventMemberIds(e.app, e.record.id, actor), {
        title: "🍻 Es geht los!",
        body: `"${e.record.get("name")}" ist jetzt live — rein da!`,
        url: `/?event=${e.record.id}`,
        tag: `event-live-${e.record.id}`,
      });
      lib.logNotif(e.app, {
        event: e.record.id, type: "event",
        title: "🍻 Event ist live!",
        body: `"${e.record.get("name")}" läuft jetzt.`,
        url: `/?event=${e.record.id}`,
      });
    }
  } catch (err) { console.log("[push] event trigger:", err); }
}, "events");

// ---- Trigger 3 (jeopardy round) is handled directly in the /start-round
//      route (jeopardy.pb.js): the round is built + saved server-side, so a
//      request hook wouldn't fire — it pushes the participants itself there.

// ---- Trigger 4a: new kitty expense → push everyone who shares in it -------
// Fires on any kitty update, but only acts on expense ids that weren't there
// before. Each recipient gets THEIR own share in the message, which matters
// now that expenses can carry fixed/percent splits.
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/push_lib.js`);
  let prev = [];
  try { prev = lib.parseArr(e.app.findRecordById("kitty", e.record.id), "expenses"); }
  catch (_) {}
  const next = lib.parseArr(e.record, "expenses");
  const eventId = e.record.get("event");
  e.next(); // persist first — only notify about writes that actually landed
  try {
    const known = {};
    for (const x of prev) if (x && x.id) known[x.id] = true;
    const added = next.filter((x) => x && x.id && !known[x.id]);
    if (added.length === 0) return;

    const nameOf = (id) => { try { return e.app.findRecordById("users", id).get("displayName") || "Jemand"; } catch (_) { return "Jemand"; } };
    const eur = (n) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",") + " €";

    for (const exp of added) {
      const payer = nameOf(exp.paidBy);
      const author = exp.createdBy || exp.paidBy;
      const owed = lib.expenseShares(exp);
      const desc = exp.desc || "Ausgabe";
      const total = Number(exp.amount) || 0;

      // Personalised: everyone involved except whoever entered it.
      for (const uid of Object.keys(owed)) {
        if (!uid || uid === author) continue;
        const share = owed[uid];
        if (!(share > 0.005)) continue;
        lib.sendPushToUsers(e.app, [uid], {
          title: `💸 ${desc} — dein Anteil ${eur(share)}`,
          body: `${payer} hat ${eur(total)} ausgelegt. Tippen für den Kassensturz.`,
          url: `/?event=${eventId}&goto=kitty`,
          tag: `kitty-exp-${exp.id}`,
        });
      }

      lib.logNotif(e.app, {
        event: eventId, type: "kitty",
        title: `💸 Neue Ausgabe: ${desc}`,
        body: `${payer} hat ${eur(total)} ausgelegt.`,
        url: `/?event=${eventId}&goto=kitty`,
        createdBy: author,
      });
    }
  } catch (err) { console.log("[push] kitty expense trigger:", err); }
}, "kitty");

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
      lib.logNotif(e.app, {
        event: eventId, type: "kitty",
        title: "💸 Kassensturz komplett",
        body: "Alle Ausgaben sind drin — ihr könnt ausgleichen.",
        url: `/?event=${eventId}&goto=kitty`,
      });
    }
  } catch (err) { console.log("[push] kitty trigger:", err); }
}, "kitty");
