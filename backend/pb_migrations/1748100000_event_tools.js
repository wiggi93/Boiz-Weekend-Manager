/// <reference path="../pb_data/types.d.ts" />

// Per-event blob for "tool" modules (helpers that don't score into the
// leaderboard — team splitter, bill split, etc.). Keyed by tool id.
// Example shape: { "team_split": { "n": 2, "teams": [[uid,...],[uid,...]] } }

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  if (!events.fields.getByName("tools")) {
    events.fields.add(new JSONField({ name: "tools", maxSize: 20000 }));
    app.save(events);
  }
}, (app) => {
  const events = app.findCollectionByNameOrId("events");
  if (events.fields.getByName("tools")) {
    events.fields.removeByName("tools");
    app.save(events);
  }
});
