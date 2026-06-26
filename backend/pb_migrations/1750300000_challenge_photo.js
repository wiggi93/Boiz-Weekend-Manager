/// <reference path="../pb_data/types.d.ts" />

// Photo-proof challenges: the challenged player uploads a photo. Add a `photo`
// file field and widen the updateRule so the toUser can update (to upload it).
// A guard hook (challenges.pb.js) restricts the toUser to ONLY the photo field
// so they can't tamper with status/reward/etc.
//
// Visibility is handled in the app: public challenges show the photo to all,
// secret ones only to the two involved.

migrate((app) => {
  const challenges = app.findCollectionByNameOrId("challenges");
  if (!challenges.fields.getByName("photo")) {
    challenges.fields.add(new FileField({
      name: "photo",
      maxSelect: 1,
      maxSize: 8388608, // 8 MB
      mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"],
    }));
  }
  challenges.updateRule = '@request.auth.id != "" && (fromUser = @request.auth.id || toUser = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)';
  app.save(challenges);
}, (app) => {
  const challenges = app.findCollectionByNameOrId("challenges");
  if (challenges.fields.getByName("photo")) challenges.fields.removeByName("photo");
  challenges.updateRule = '@request.auth.id != "" && (fromUser = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)';
  app.save(challenges);
});
