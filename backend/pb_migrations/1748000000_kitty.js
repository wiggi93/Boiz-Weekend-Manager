/// <reference path="../pb_data/types.d.ts" />

// Kitty-Split module: one row per event, expenses stored as a JSON array.
// Each expense: { id, desc, amount, paidBy, participants[], createdBy, createdAt }
// Any authenticated user (event member) may add/remove expenses via the update rule.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");

  const k = new Collection({
    name: "kitty",
    type: "base",
    fields: [
      { name: "event",    type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "expenses", type: "json",   maxSize: 200000 },
      { name: "created",  type: "autodate", onCreate: true },
      { name: "updated",  type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_kitty_event` ON `kitty` (`event`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.role = "admin" || event.createdBy = @request.auth.id',
  });
  app.save(k);

  // Backfill for existing events
  try {
    const existing = app.findAllRecords("events");
    for (const ev of existing) {
      const r = new Record(k);
      r.set("event", ev.id);
      r.set("expenses", []);
      try { app.save(r); } catch (_) {}
    }
  } catch (_) {}
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("kitty")); } catch (_) {}
});
