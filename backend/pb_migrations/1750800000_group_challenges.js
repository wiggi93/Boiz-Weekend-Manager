/// <reference path="../pb_data/types.d.ts" />

// Group challenges, redesigned. The old behaviour spawned ONE challenge row per
// targeted member (so a group dare with N players created N rows, each running
// its own points-vote → an O(N²) push storm). Now a group challenge is a SINGLE
// `challenges` row that carries the list of `participants`, and every taker gets
// their own `challenge_entries` row holding their personal photo proof + result.
//
//   challenges.group        — true → this is one combined group challenge
//   challenges.participants — json array of the taking-part user ids
//
// One push per participant (handled in push.pb.js), one combined card in the UI
// with all photos collected together. The creator decides whether they take
// part themselves (their id is simply in/out of `participants`).
//
// Additive only — existing (legacy) single/random/group rows keep working.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  const users = app.findCollectionByNameOrId("users");
  const challenges = app.findCollectionByNameOrId("challenges");

  if (!challenges.fields.getByName("group")) {
    challenges.fields.add(new BoolField({ name: "group" }));
  }
  if (!challenges.fields.getByName("participants")) {
    challenges.fields.add(new JSONField({ name: "participants", maxSize: 20000 }));
  }
  app.save(challenges);

  // One row per (challenge, participant): personal photo + per-player verdict.
  let exists = true;
  try { app.findCollectionByNameOrId("challenge_entries"); } catch (_) { exists = false; }
  if (!exists) {
    const entries = new Collection({
      name: "challenge_entries",
      type: "base",
      fields: [
        { name: "event",     type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
        { name: "challenge", type: "relation", collectionId: challenges.id, required: true, maxSelect: 1, cascadeDelete: true },
        { name: "user",      type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
        { name: "status",    type: "text", max: 10 }, // pending | done | failed
        { name: "photo",     type: "file", maxSelect: 1, maxSize: 8388608,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"] },
        { name: "created",   type: "autodate", onCreate: true },
        { name: "updated",   type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_chal_entry ON challenge_entries (challenge, user)"],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      // Entries are seeded by the challenge creator (or an event host / admin).
      createRule: '@request.auth.id != "" && (challenge.fromUser = @request.auth.id || challenge.event.createdBy = @request.auth.id || challenge.event.hostUsers ~ @request.auth.id || @request.auth.role = "admin")',
      // The participant may update their OWN entry (to upload the photo); the
      // creator / host / admin may update any (to set the verdict). A guard hook
      // (challenges.pb.js) restricts a plain participant to the photo field only.
      updateRule: '@request.auth.id != "" && (user = @request.auth.id || challenge.fromUser = @request.auth.id || challenge.event.createdBy = @request.auth.id || challenge.event.hostUsers ~ @request.auth.id || @request.auth.role = "admin")',
      deleteRule: '@request.auth.id != "" && (challenge.fromUser = @request.auth.id || challenge.event.createdBy = @request.auth.id || challenge.event.hostUsers ~ @request.auth.id || @request.auth.role = "admin")',
    });
    app.save(entries);
  }
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("challenge_entries")); } catch (_) {}
  try {
    const challenges = app.findCollectionByNameOrId("challenges");
    if (challenges.fields.getByName("group")) challenges.fields.removeByName("group");
    if (challenges.fields.getByName("participants")) challenges.fields.removeByName("participants");
    app.save(challenges);
  } catch (_) {}
});
