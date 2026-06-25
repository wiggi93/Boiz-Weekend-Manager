/// <reference path="../pb_data/types.d.ts" />

// "Wer würde eher" / Most-Likely-To. Anyone poses a question
// ("Wer würde am ehesten im Knast landen?"); everyone votes for a participant;
// the most-voted person wins the question's points. Two collections, mirroring
// wines + wine_ratings so the multi-writer voting stays race-free (one row per
// vote, not a shared json array):
//
//   ml_questions — one row per question (creator owns it; host can close/override)
//   ml_votes     — one row per (question, voter)
//
// On close, the closer computes + freezes winnerId, so scoring only needs the
// questions (no votes).

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  const users = app.findCollectionByNameOrId("users");

  const questions = new Collection({
    name: "ml_questions",
    type: "base",
    fields: [
      { name: "event",     type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "text",      type: "text", required: true, max: 200 },
      { name: "createdBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "points",    type: "number" },          // points the winner gets (default 2)
      { name: "closed",    type: "bool" },
      { name: "winnerId",  type: "text", max: 30 },    // frozen winner on close (user id)
      { name: "created",   type: "autodate", onCreate: true },
      { name: "updated",   type: "autodate", onCreate: true, onUpdate: true },
    ],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && createdBy = @request.auth.id',
    // Creator closes their own question; event hosts / site admins can step in.
    updateRule: '@request.auth.id != "" && (createdBy = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
    deleteRule: '@request.auth.id != "" && (createdBy = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
  });
  app.save(questions);

  const votes = new Collection({
    name: "ml_votes",
    type: "base",
    fields: [
      { name: "question", type: "relation", collectionId: questions.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "event",    type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "voter",    type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "target",   type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "created",  type: "autodate", onCreate: true },
      { name: "updated",  type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_ml_vote ON ml_votes (question, voter)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && voter = @request.auth.id',
    updateRule: '@request.auth.id != "" && voter = @request.auth.id',
    deleteRule: '@request.auth.id != "" && (voter = @request.auth.id || @request.auth.role = "admin")',
  });
  app.save(votes);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("ml_votes")); } catch (_) {}
  try { app.delete(app.findCollectionByNameOrId("ml_questions")); } catch (_) {}
});
