/// <reference path="../pb_data/types.d.ts" />

// Weinwanderung module: members log wines they drink along the way and
// everyone rates them 1–5 glasses. Wines are one row each (so concurrent
// additions never clobber), ratings live in their own collection (one row
// per wine+user, unique) so simultaneous raters don't overwrite a shared
// JSON blob — same pattern as polls/poll_votes.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  const users = app.findCollectionByNameOrId("users");

  const wines = new Collection({
    name: "wines",
    type: "base",
    fields: [
      { name: "event",   type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "name",    type: "text", required: true, max: 120 },
      { name: "note",    type: "text", max: 200 },          // optional: winery / region / spot
      { name: "addedBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && addedBy = @request.auth.id',
    updateRule: '@request.auth.id != "" && (addedBy = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
    deleteRule: '@request.auth.id != "" && (addedBy = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
  });
  app.save(wines);

  const ratings = new Collection({
    name: "wine_ratings",
    type: "base",
    fields: [
      { name: "wine",   type: "relation", collectionId: wines.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "user",   type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "rating", type: "number", required: true, min: 1, max: 5 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_winerating_wu` ON `wine_ratings` (`wine`, `user`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && user = @request.auth.id',
    updateRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")',
  });
  app.save(ratings);
}, (app) => {
  for (const name of ["wine_ratings", "wines"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
