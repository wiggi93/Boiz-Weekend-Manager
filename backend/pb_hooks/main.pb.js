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

// Auto-add creator as member of the event they just created and seed
// the per-event flunky state row.
onRecordAfterCreateSuccess((e) => {
  try {
    const creator = e.record.get("createdBy");
    if (creator) {
      const memCol = e.app.findCollectionByNameOrId("event_members");
      const m = new Record(memCol);
      m.set("event", e.record.id);
      m.set("user", creator);
      e.app.save(m);
    }
  } catch (err) {
    console.log("event member post-create:", err);
  }
  try {
    const flunkyCol = e.app.findCollectionByNameOrId("flunky");
    const f = new Record(flunkyCol);
    f.set("event", e.record.id);
    f.set("setsTotal", 5);
    f.set("pointsPerWin", 3);
    f.set("teamA", []);
    f.set("teamB", []);
    f.set("sets", []);
    e.app.save(f);
  } catch (err) {
    console.log("flunky seed:", err);
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
