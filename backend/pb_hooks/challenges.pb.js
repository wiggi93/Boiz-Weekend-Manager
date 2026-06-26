/// <reference path="../pb_data/types.d.ts" />

// Guard: the challenged player (toUser) may update a challenge ONLY to upload
// the photo proof — never to change status / reward / etc. The fromUser, event
// hosts and site admins keep full update rights.
onRecordUpdateRequest((e) => {
  try {
    const auth = e.auth;
    if (!auth) { e.next(); return; }
    if (auth.get("role") === "admin") { e.next(); return; }

    const rec = e.record; // record with the requested changes applied
    if (rec.get("fromUser") === auth.id) { e.next(); return; }

    // Event host?
    let isHost = false;
    try {
      const ev = e.app.findRecordById("events", rec.get("event"));
      const hosts = ev.get("hostUsers") || [];
      isHost = ev.get("createdBy") === auth.id || (Array.isArray(hosts) && hosts.indexOf(auth.id) !== -1);
    } catch (_) {}
    if (isHost) { e.next(); return; }

    // Otherwise: must be the toUser, and only the photo may differ.
    const original = e.app.findRecordById("challenges", rec.id);
    if (original.get("toUser") !== auth.id) {
      throw new ForbiddenError("Nur der Auftraggeber oder Host darf das ändern.");
    }
    const guarded = ["text", "reward", "penalty", "status", "secret", "isPhoto", "fromUser", "toUser", "event"];
    for (const f of guarded) {
      if (String(rec.get(f)) !== String(original.get(f))) {
        throw new ForbiddenError("Du darfst hier nur den Fotobeweis hochladen.");
      }
    }
  } catch (err) {
    if (err && err.constructor && err.constructor.name === "ForbiddenError") throw err;
    console.log("[challenge] guard:", err);
  }
  e.next();
}, "challenges");
