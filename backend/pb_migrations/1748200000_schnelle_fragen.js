/// <reference path="../pb_data/types.d.ts" />

// "5 Schnelle Fragen" tool module — non-competitive, every event member
// can navigate (next/previous question). One row per event.
// Frontend keeps a static question bank and uses `qIds` as the seed-shuffled
// ordering. `currentIdx` is the active position.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");

  const c = new Collection({
    name: "schnelle_fragen",
    type: "base",
    fields: [
      { name: "event",      type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "currentIdx", type: "number", min: 0 },
      { name: "qIds",       type: "json",   maxSize: 50000 },
      { name: "created",    type: "autodate", onCreate: true },
      { name: "updated",    type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_schnelle_event` ON `schnelle_fragen` (`event`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    // Every authenticated user can advance (the design demands this — any
    // participant in the event can click "next" and everyone else's screen
    // syncs). Membership is checked at the UI level; the data is purely UX.
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(c);

  // Backfill: one row per existing event so the realtime subscription has
  // something to watch even for events that existed before this migration.
  try {
    const existing = app.findAllRecords("events");
    for (const ev of existing) {
      const r = new Record(c);
      r.set("event", ev.id);
      r.set("currentIdx", 0);
      r.set("qIds", []);
      try { app.save(r); } catch (_) {}
    }
  } catch (_) {}
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("schnelle_fragen")); } catch (_) {}
});
