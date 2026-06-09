/// <reference path="../pb_data/types.d.ts" />

// Per-drink timestamps: the stats row keeps the running beer/mische counters
// AND an append-only `log` of individual drink events so a player's detail
// view can show WHEN each drink was logged. Each entry is { t: epochMs, k:
// "beer" | "mische" }. Existing counters keep working; the log just starts
// empty and fills as new drinks are tapped.

migrate((app) => {
  const stats = app.findCollectionByNameOrId("stats");
  if (!stats.fields.getByName("log")) {
    stats.fields.add(new JSONField({ name: "log", maxSize: 200000 }));
    app.save(stats);
  }
}, (app) => {
  const stats = app.findCollectionByNameOrId("stats");
  if (stats.fields.getByName("log")) {
    stats.fields.removeByName("log");
    app.save(stats);
  }
});
