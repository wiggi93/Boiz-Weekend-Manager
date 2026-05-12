/// <reference path="../pb_data/types.d.ts" />

// The earlier migration mutated role.values in place and saved the
// collection, which doesn't always persist for select-field options
// in PocketBase. This migration force-replaces the field config while
// preserving the field id so existing values stay mapped.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const existing = users.fields.getByName("role");
  if (!existing) return;

  const newField = new SelectField({
    id: existing.id,
    name: "role",
    required: false,
    maxSelect: 1,
    values: ["admin", "host", "member"],
  });
  users.fields.removeByName("role");
  users.fields.add(newField);
  app.save(users);
}, (app) => { /* no-op */ });
