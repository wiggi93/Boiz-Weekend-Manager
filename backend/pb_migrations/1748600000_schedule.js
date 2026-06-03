/// <reference path="../pb_data/types.d.ts" />

// Programm / Zeitplan module — one row per event holding an array of
// schedule entries. Host edits; everyone reads. Entry shape (frontend):
// { id, day: "YYYY-MM-DD", time: "HH:MM", title, location, address, note }

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");

  const c = new Collection({
    name: "schedule",
    type: "base",
    fields: [
      { name: "event",   type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "entries", type: "json", maxSize: 50000 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_schedule_event` ON `schedule` (`event`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && (@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
    updateRule: '@request.auth.id != "" && (@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(c);

  // Backfill one row per existing event.
  try {
    for (const ev of app.findAllRecords("events")) {
      const r = new Record(c);
      r.set("event", ev.id);
      r.set("entries", []);
      try { app.save(r); } catch (_) {}
    }
  } catch (_) {}
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("schedule")); } catch (_) {}
});
