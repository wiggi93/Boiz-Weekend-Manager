/// <reference path="../pb_data/types.d.ts" />

// Jeopardy module state, one row per event (seeded by the events hook).
// rounds[] each has its own 5x5 question board, scoring, and finished flag;
// pointsPerPosition gives event-points to leaderboard positions after a round.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");

  const j = new Collection({
    name: "jeopardy",
    type: "base",
    fields: [
      { name: "event",             type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "categories",        type: "json",   maxSize: 5000 },
      { name: "pointsPerPosition", type: "json",   maxSize: 1000 },
      { name: "participants",      type: "json",   maxSize: 5000 },
      { name: "rounds",            type: "json",   maxSize: 500000 },
      { name: "created",           type: "autodate", onCreate: true },
      { name: "updated",           type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_jeopardy_event` ON `jeopardy` (`event`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id',
    deleteRule: '@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id',
  });
  app.save(j);

  // Backfill for existing events.
  try {
    const existing = app.findAllRecords("events");
    for (const ev of existing) {
      const r = new Record(j);
      r.set("event", ev.id);
      r.set("categories", []);
      r.set("pointsPerPosition", [5, 3, 2, 1]);
      r.set("participants", []);
      r.set("rounds", []);
      try { app.save(r); } catch (_) {}
    }
  } catch (_) {}
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("jeopardy")); } catch (_) {}
});
