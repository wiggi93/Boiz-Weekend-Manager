/// <reference path="../pb_data/types.d.ts" />

// Multi-event refactor:
// - drop old singleton `event` collection
// - drop old `stats` (was per-user); replace with per-(event,user)
// - new `events` collection: name, date, code, active, modules, settings
// - new `event_members` collection links users to events
// Server-side hooks (see pb_hooks/main.pb.js) generate the join code
// and auto-create stats rows on join.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  for (const oldName of ["event", "stats"]) {
    try { app.delete(app.findCollectionByNameOrId(oldName)); } catch (_) {}
  }

  const events = new Collection({
    name: "events",
    type: "base",
    fields: [
      { name: "name", type: "text", required: true, max: 60 },
      { name: "date", type: "text", required: false, max: 20 },
      { name: "code", type: "text", required: false, max: 12 },
      { name: "active", type: "bool" },
      { name: "modules", type: "json", maxSize: 2000 },
      { name: "beerLabel", type: "text", required: false, max: 20 },
      { name: "drinkLabel", type: "text", required: false, max: 20 },
      { name: "pointsPerBeer", type: "number", min: 0, max: 100 },
      { name: "pointsPerMische", type: "number", min: 0, max: 100 },
      { name: "createdBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false, required: false },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_events_code` ON `events` (`code`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin" || createdBy = @request.auth.id',
    deleteRule: '@request.auth.role = "admin" || createdBy = @request.auth.id',
  });
  app.save(events);

  const members = new Collection({
    name: "event_members",
    type: "base",
    fields: [
      { name: "event", type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_members_eu` ON `event_members` (`event`, `user`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && user = @request.auth.id',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")',
  });
  app.save(members);

  const stats = new Collection({
    name: "stats",
    type: "base",
    fields: [
      { name: "event", type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "beer", type: "number", min: 0 },
      { name: "mische", type: "number", min: 0 },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_stats_eu` ON `stats` (`event`, `user`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")',
    updateRule: '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(stats);
}, (app) => {
  for (const name of ["stats", "event_members", "events"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
