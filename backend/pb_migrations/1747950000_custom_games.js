/// <reference path="../pb_data/types.d.ts" />

// Add games[] archive to custom_modules so a host can start a fresh game
// (resetting teams/sets) while preserving previous games for scoring.

migrate((app) => {
  const cm = app.findCollectionByNameOrId("custom_modules");
  if (!cm.fields.getByName("games")) {
    cm.fields.add(new JSONField({ name: "games", maxSize: 200000 }));
    app.save(cm);
  }
}, (app) => {
  const cm = app.findCollectionByNameOrId("custom_modules");
  if (cm.fields.getByName("games")) {
    cm.fields.removeByName("games");
    app.save(cm);
  }
});
