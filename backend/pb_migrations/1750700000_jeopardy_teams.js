/// <reference path="../pb_data/types.d.ts" />

// Jeopardy team mode: optional teams so 4+ players can play in pairs/groups.
// `teams` = [{ id, name, members: [userId] }]. Empty = classic individual play
// (everything behaves exactly as before).

migrate((app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (!j.fields.getByName("teams")) {
    j.fields.add(new JSONField({ name: "teams", maxSize: 8000 }));
    app.save(j);
  }
}, (app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (j.fields.getByName("teams")) { j.fields.removeByName("teams"); app.save(j); }
});
