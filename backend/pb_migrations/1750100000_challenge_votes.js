/// <reference path="../pb_data/types.d.ts" />

// Group voting for non-secret challenges. Everyone except the challenged player
// votes — first on the fair point value, then on whether it was pulled off.
// One row per (challenge, voter, phase), mirroring ml_votes so the multi-writer
// voting stays race-free.
//
//   phase = "points" → points holds the voter's fair-value vote
//   phase = "done"   → verdict holds "done" | "failed"

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  const users = app.findCollectionByNameOrId("users");
  const challenges = app.findCollectionByNameOrId("challenges");

  const votes = new Collection({
    name: "challenge_votes",
    type: "base",
    fields: [
      { name: "challenge", type: "relation", collectionId: challenges.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "event",     type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "voter",     type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "phase",     type: "text", required: true, max: 10 }, // "points" | "done"
      { name: "points",    type: "number" },
      { name: "verdict",   type: "text", max: 10 },                  // "done" | "failed"
      { name: "created",   type: "autodate", onCreate: true },
      { name: "updated",   type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_chal_vote ON challenge_votes (challenge, voter, phase)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && voter = @request.auth.id',
    updateRule: '@request.auth.id != "" && voter = @request.auth.id',
    deleteRule: '@request.auth.id != "" && (voter = @request.auth.id || @request.auth.role = "admin")',
  });
  app.save(votes);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("challenge_votes")); } catch (_) {}
});
