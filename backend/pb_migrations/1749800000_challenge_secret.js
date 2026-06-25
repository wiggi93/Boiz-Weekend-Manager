/// <reference path="../pb_data/types.d.ts" />

// Challenge overhaul, stage 1: secret challenges + photo flag.
//
//   secret  — a private dare between fromUser and toUser. The text is hidden
//             from the rest of the group in the UI; only the proposer decides
//             done/failed AND pays the reward out of their OWN points.
//   isPhoto — marks a photo-proof challenge (random bank prompts can set it);
//             purely a UI hint for now (📸), in-app upload comes later.
//
// Additive only — existing challenges keep working unchanged.

migrate((app) => {
  const challenges = app.findCollectionByNameOrId("challenges");
  if (!challenges.fields.getByName("secret")) {
    challenges.fields.add(new BoolField({ name: "secret" }));
  }
  if (!challenges.fields.getByName("isPhoto")) {
    challenges.fields.add(new BoolField({ name: "isPhoto" }));
  }
  app.save(challenges);
}, (app) => {
  const challenges = app.findCollectionByNameOrId("challenges");
  if (challenges.fields.getByName("secret")) challenges.fields.removeByName("secret");
  if (challenges.fields.getByName("isPhoto")) challenges.fields.removeByName("isPhoto");
  app.save(challenges);
});
