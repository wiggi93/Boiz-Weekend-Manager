/// <reference path="../pb_data/types.d.ts" />

// Allow event hosts (createdBy) to remove members from their own events.
// Site admins and self-leaves were already covered.

migrate((app) => {
  const members = app.findCollectionByNameOrId("event_members");
  members.deleteRule = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id)';
  app.save(members);
}, (app) => {
  const members = app.findCollectionByNameOrId("event_members");
  members.deleteRule = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")';
  app.save(members);
});
