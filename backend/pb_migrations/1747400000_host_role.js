/// <reference path="../pb_data/types.d.ts" />

// Add 'host' role between admin and member. Hosts can create events
// (and manage events they created); admins manage everything.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const role = users.fields.getByName("role");
  if (role) {
    role.values = ["admin", "host", "member"];
    app.save(users);
  }

  const events = app.findCollectionByNameOrId("events");
  events.createRule = '@request.auth.role = "admin" || @request.auth.role = "host"';
  app.save(events);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  const role = users.fields.getByName("role");
  if (role) {
    role.values = ["admin", "member"];
    app.save(users);
  }
  const events = app.findCollectionByNameOrId("events");
  events.createRule = '@request.auth.role = "admin"';
  app.save(events);
});
