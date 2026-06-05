/// <reference path="../pb_data/types.d.ts" />

// Peer challenges: any member can dare another member to do something for a
// reward (points they gain if they pull it off). If they don't, the
// challenger sets a penalty (points lost) at their own discretion when
// resolving. One row per challenge (multi-row per event, like polls).

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  const users = app.findCollectionByNameOrId("users");

  const challenges = new Collection({
    name: "challenges",
    type: "base",
    fields: [
      { name: "event",     type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "fromUser",  type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "toUser",    type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "text",      type: "text", required: true, max: 280 },
      { name: "reward",    type: "number" },
      { name: "penalty",   type: "number" },
      { name: "status",    type: "text", max: 12 }, // open | done | failed
      { name: "created",   type: "autodate", onCreate: true },
      { name: "updated",   type: "autodate", onCreate: true, onUpdate: true },
    ],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    // Any member may issue a challenge, but only on their own behalf.
    createRule: '@request.auth.id != "" && fromUser = @request.auth.id',
    // The challenger resolves their own challenges (done / failed + penalty);
    // event hosts and site admins can also step in.
    updateRule: '@request.auth.id != "" && (fromUser = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
    deleteRule: '@request.auth.id != "" && (fromUser = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
  });
  app.save(challenges);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("challenges")); } catch (_) {}
});
