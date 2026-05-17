/// <reference path="../pb_data/types.d.ts" />

// First registered user becomes site admin.
onRecordAfterCreateSuccess((e) => {
  try {
    const totalUsers = e.app.countRecords("users");
    const role = totalUsers <= 1 ? "admin" : "member";
    e.record.set("role", role);
    e.app.save(e.record);
  } catch (err) {
    console.log("user post-create:", err);
  }
  e.next();
}, "users");

// Generate a unique join code on event create; default modules to ["drinks"].
onRecordCreateRequest((e) => {
  if (!e.record.get("code")) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 30; attempt++) {
      let code = "";
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
      let taken = true;
      try { e.app.findFirstRecordByFilter("events", `code = "${code}"`); }
      catch (_) { taken = false; }
      if (!taken) { e.record.set("code", code); break; }
    }
  }
  const mods = e.record.get("modules");
  if (!mods || (Array.isArray(mods) && mods.length === 0)) {
    e.record.set("modules", ["drinks"]);
  }
  e.next();
}, "events");

// Auto-add creator as member of the event they just created, mark
// them as the initial event-host, and seed the per-event flunky row.
onRecordAfterCreateSuccess((e) => {
  try {
    const creator = e.record.get("createdBy");
    if (creator) {
      const memCol = e.app.findCollectionByNameOrId("event_members");
      const m = new Record(memCol);
      m.set("event", e.record.id);
      m.set("user", creator);
      e.app.save(m);

      const hosts = e.record.get("hostUsers");
      if (!Array.isArray(hosts) || !hosts.includes(creator)) {
        e.record.set("hostUsers", [creator]);
        e.app.save(e.record);
      }
    }
  } catch (err) {
    console.log("event member post-create:", err);
  }
  try {
    const flunkyCol = e.app.findCollectionByNameOrId("flunky");
    const f = new Record(flunkyCol);
    f.set("event", e.record.id);
    f.set("pointsPerWin", 3);
    f.set("games", []);
    e.app.save(f);
  } catch (err) {
    console.log("flunky seed:", err);
  }
  try {
    const jCol = e.app.findCollectionByNameOrId("jeopardy");
    const j = new Record(jCol);
    j.set("event", e.record.id);
    j.set("categories", [
      "Geographie",
      "Zurück in die Schule",
      "Reality TV Deutschland",
      "Twitch & Youtube Deutschland",
      "Songtexte 2000er",
    ]);
    j.set("pointsPerPosition", [5, 3, 2, 1]);
    j.set("participants", []);
    j.set("rounds", []);
    j.set("hostPlays", false);
    e.app.save(j);
  } catch (err) {
    console.log("jeopardy seed:", err);
  }
  e.next();
}, "events");

// Privilege guard: only the event creator (or site admin) may change
// `createdBy` or `hostUsers`. Event-hosts have other update rights
// (active toggle, modules, settings) but not the ability to promote
// themselves or unmask the creator.
onRecordUpdateRequest((e) => {
  try {
    const auth = e.auth;
    if (!auth) { e.next(); return; }
    if (auth.get("role") === "admin") { e.next(); return; }

    const original = e.app.findRecordById("events", e.record.id);
    if (original.get("createdBy") === auth.id) { e.next(); return; }

    // Non-creator, non-admin: lock these fields
    const lockedFields = ["createdBy", "hostUsers"];
    for (const f of lockedFields) {
      const before = JSON.stringify(original.get(f) ?? null);
      const after = JSON.stringify(e.record.get(f) ?? null);
      if (before !== after) {
        throw new BadRequestError(`field "${f}" can only be changed by the event creator`);
      }
    }
  } catch (err) {
    if (err && err.constructor && err.constructor.name === "BadRequestError") throw err;
    console.log("event update guard:", err);
  }
  e.next();
}, "events");

// Auto-create stats row when a user joins an event.
onRecordAfterCreateSuccess((e) => {
  try {
    const event = e.record.get("event");
    const user = e.record.get("user");
    if (event && user) {
      const statsCol = e.app.findCollectionByNameOrId("stats");
      const stats = new Record(statsCol);
      stats.set("event", event);
      stats.set("user", user);
      stats.set("beer", 0);
      stats.set("mische", 0);
      e.app.save(stats);
    }
  } catch (err) {
    console.log("event_members post-create:", err);
  }
  e.next();
}, "event_members");
