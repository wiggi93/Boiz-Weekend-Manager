/// <reference path="../pb_data/types.d.ts" />

// Poll / survey tool. Hosts create polls (multiple choice + optional free
// text); members vote. Votes live in a separate poll_votes collection (one
// row per poll+user) so concurrent voters never clobber a shared JSON blob.
// Polls work even before the event is active (shown on the waiting screen).

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  const users = app.findCollectionByNameOrId("users");

  const polls = new Collection({
    name: "polls",
    type: "base",
    fields: [
      { name: "event",     type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "question",  type: "text", required: true, max: 200 },
      { name: "options",   type: "json", maxSize: 5000 },   // [{ id, label }]
      { name: "allowText", type: "bool" },
      { name: "closed",    type: "bool" },
      { name: "createdBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "created",   type: "autodate", onCreate: true },
      { name: "updated",   type: "autodate", onCreate: true, onUpdate: true },
    ],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && (@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
    updateRule: '@request.auth.id != "" && (@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
    deleteRule: '@request.auth.id != "" && (@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
  });
  app.save(polls);

  const votes = new Collection({
    name: "poll_votes",
    type: "base",
    fields: [
      { name: "poll",     type: "relation", collectionId: polls.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "user",     type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "optionId", type: "text", max: 40 },
      { name: "text",     type: "text", max: 500 },
      { name: "created",  type: "autodate", onCreate: true },
      { name: "updated",  type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_pollvote_pu` ON `poll_votes` (`poll`, `user`)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && user = @request.auth.id',
    updateRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")',
  });
  app.save(votes);
}, (app) => {
  for (const name of ["poll_votes", "polls"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
