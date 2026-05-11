/// <reference path="../pb_data/types.d.ts" />

// Flunkyball module state, one row per event. Auto-seeded by hook
// when an event is created. Team assignments are stored as JSON
// arrays of user ids; sets is an array of {n, winner: "A"|"B"|null}.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");

  const flunky = new Collection({
    name: "flunky",
    type: "base",
    fields: [
      { name: "event", type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "setsTotal", type: "number", min: 1, max: 99 },
      { name: "pointsPerWin", type: "number", min: 0, max: 1000 },
      { name: "teamA", type: "json", maxSize: 5000 },
      { name: "teamB", type: "json", maxSize: 5000 },
      { name: "sets", type: "json", maxSize: 5000 },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_flunky_event` ON `flunky` (`event`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.role = "admin" || event.createdBy = @request.auth.id',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(flunky);

  // Backfill: seed a flunky row for every existing event so the
  // frontend can always assume the row exists.
  try {
    const existing = app.findAllRecords("events");
    for (const ev of existing) {
      const f = new Record(flunky);
      f.set("event", ev.id);
      f.set("setsTotal", 5);
      f.set("pointsPerWin", 3);
      f.set("teamA", []);
      f.set("teamB", []);
      f.set("sets", []);
      try { app.save(f); } catch (_) { /* unique violation = already seeded */ }
    }
  } catch (_) { /* no events yet */ }
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("flunky")); } catch (_) {}
});
