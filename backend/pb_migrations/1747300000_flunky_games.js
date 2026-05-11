/// <reference path="../pb_data/types.d.ts" />

// Flunkyball moves from "sets within a single match" to "multiple
// independent games" model. Each game has its own teamA/teamB assignment
// and a winner. Hosts can start as many games as they want during the event.

migrate((app) => {
  const flunky = app.findCollectionByNameOrId("flunky");

  for (const name of ["setsTotal", "sets", "teamA", "teamB"]) {
    const f = flunky.fields.getByName(name);
    if (f) flunky.fields.removeByName(name);
  }

  if (!flunky.fields.getByName("games")) {
    flunky.fields.add(new JSONField({ name: "games", maxSize: 100000 }));
  }

  app.save(flunky);

  // Reset existing flunky rows since the data shape changed
  try {
    const all = app.findAllRecords("flunky");
    for (const r of all) {
      r.set("games", []);
      app.save(r);
    }
  } catch (_) {}
}, (app) => {
  // No-op; this would require recreating sets/teamA/teamB structures.
});
