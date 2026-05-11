/// <reference path="../pb_data/types.d.ts" />

// `role` was declared required in the initial migration, which made
// signup impossible: the create-record validation runs before the
// onRecordAfterCreateSuccess hook can assign admin/member.
// Relax the field so the hook owns role assignment end-to-end.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const field = users.fields.getByName("role");
  if (field) {
    field.required = false;
    app.save(users);
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  const field = users.fields.getByName("role");
  if (field) {
    field.required = true;
    app.save(users);
  }
});
