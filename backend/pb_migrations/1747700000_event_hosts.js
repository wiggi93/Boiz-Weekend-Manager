/// <reference path="../pb_data/types.d.ts" />

// Per-event host role (independent of the global users.role).
// The event creator picks members of the event who can also manage
// the event live (start games, toggle modules, kick, etc.).
//
// Stored denormalised on the event itself as `hostUsers` (json array
// of user ids) so PB API rules can reference it without joins.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  if (!events.fields.getByName("hostUsers")) {
    events.fields.add(new JSONField({ name: "hostUsers", maxSize: 10000 }));
  }
  // Allow event-hosts to update event fields too. Hook below prevents
  // them from changing createdBy or hostUsers (privilege escalation).
  events.updateRule = '@request.auth.role = "admin" || createdBy = @request.auth.id || hostUsers ~ @request.auth.id';
  events.deleteRule = '@request.auth.role = "admin" || createdBy = @request.auth.id';
  app.save(events);

  // Backfill: existing events get hostUsers = [createdBy].
  try {
    const existing = app.findAllRecords("events");
    for (const ev of existing) {
      const cur = ev.get("hostUsers");
      if (!Array.isArray(cur) || cur.length === 0) {
        const creator = ev.get("createdBy");
        ev.set("hostUsers", creator ? [creator] : []);
        app.save(ev);
      }
    }
  } catch (_) {}

  // Flunky writes allowed for event-hosts too (so they can score games).
  const flunky = app.findCollectionByNameOrId("flunky");
  flunky.updateRule = '@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id';
  app.save(flunky);

  // Kick allowed for event-hosts.
  const members = app.findCollectionByNameOrId("event_members");
  members.deleteRule = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)';
  app.save(members);
}, (app) => {
  const events = app.findCollectionByNameOrId("events");
  if (events.fields.getByName("hostUsers")) {
    events.fields.removeByName("hostUsers");
  }
  events.updateRule = '@request.auth.role = "admin" || createdBy = @request.auth.id';
  events.deleteRule = '@request.auth.role = "admin" || createdBy = @request.auth.id';
  app.save(events);
});
