/// <reference path="../pb_data/types.d.ts" />

// First user becomes admin, all others member.
// Also auto-create the stats record so counters work immediately.
onRecordAfterCreateSuccess((e) => {
  try {
    const totalUsers = e.app.countRecords("users");
    const role = totalUsers <= 1 ? "admin" : "member";
    e.record.set("role", role);
    e.app.save(e.record);

    const statsCol = e.app.findCollectionByNameOrId("stats");
    const stats = new Record(statsCol);
    stats.set("user", e.record.id);
    stats.set("beer", 0);
    stats.set("mische", 0);
    e.app.save(stats);
  } catch (err) {
    console.log("post-signup hook failed:", err);
  }
  e.next();
}, "users");
