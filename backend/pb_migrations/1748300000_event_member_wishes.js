/// <reference path="../pb_data/types.d.ts" />

// Event-specific food/drink wishes live on the event_members join row, so
// they're scoped to a single event. The user's general preferences +
// allergies stay on the `users` record (profile-level, constant per person).
//
// Also relax event_members.updateRule so a member can edit their OWN row
// (their wishes). Hosts/admins keep their existing rights.

migrate((app) => {
  const members = app.findCollectionByNameOrId("event_members");

  if (!members.fields.getByName("foodWishes")) {
    members.fields.add(new TextField({ name: "foodWishes", max: 500 }));
  }
  if (!members.fields.getByName("drinkWishes")) {
    members.fields.add(new TextField({ name: "drinkWishes", max: 500 }));
  }

  members.updateRule = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)';

  app.save(members);
}, (app) => {
  const members = app.findCollectionByNameOrId("event_members");
  for (const f of ["foodWishes", "drinkWishes"]) {
    if (members.fields.getByName(f)) members.fields.removeByName(f);
  }
  members.updateRule = '@request.auth.role = "admin"';
  app.save(members);
});
