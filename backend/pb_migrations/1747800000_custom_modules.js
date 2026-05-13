/// <reference path="../pb_data/types.d.ts" />

// Per-event custom competition modules. Host names them, picks team
// or solo mode, configures number of teams / participants, total sets
// and points-per-set. Each row is one competition; an event can have
// many. Scoring flows into the global leaderboard.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");

  const cm = new Collection({
    name: "custom_modules",
    type: "base",
    fields: [
      { name: "event",        type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "name",         type: "text",   required: true, max: 60 },
      { name: "icon",         type: "text",   max: 8 },
      { name: "mode",         type: "select", maxSelect: 1, required: true, values: ["teams", "solo"] },
      { name: "teamCount",    type: "number", min: 2, max: 20 },
      { name: "pointsPerWin", type: "number", min: 0, max: 10000 },
      { name: "totalSets",    type: "number", min: 1, max: 99 },
      { name: "teams",        type: "json",   maxSize: 30000 },
      { name: "participants", type: "json",   maxSize: 10000 },
      { name: "sets",         type: "json",   maxSize: 20000 },
      { name: "created",      type: "autodate", onCreate: true },
      { name: "updated",      type: "autodate", onCreate: true, onUpdate: true },
    ],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && (@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
    updateRule: '@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id',
    deleteRule: '@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id',
  });
  app.save(cm);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("custom_modules")); } catch (_) {}
});
