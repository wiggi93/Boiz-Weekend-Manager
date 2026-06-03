/// <reference path="../pb_data/types.d.ts" />

// New users must be approved by an admin before they can use the app.
// Add `approved` bool; grandfather all existing users as approved so
// nobody currently registered gets locked out.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("approved")) {
    users.fields.add(new BoolField({ name: "approved" }));
    app.save(users);
  }
  try {
    for (const u of app.findAllRecords("users")) {
      if (!u.get("approved")) { u.set("approved", true); app.save(u); }
    }
  } catch (err) { console.log("grandfather approved failed:", err); }
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  if (users.fields.getByName("approved")) {
    users.fields.removeByName("approved");
    app.save(users);
  }
});
