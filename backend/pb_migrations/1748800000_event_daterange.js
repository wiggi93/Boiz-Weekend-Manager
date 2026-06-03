/// <reference path="../pb_data/types.d.ts" />

// Events can span a date range (e.g. a whole weekend) or be open-ended
// (no fixed dates — e.g. a daily game with the same crew). Add `endDate`;
// `date` stays the start. Both empty = open-ended.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  if (!events.fields.getByName("endDate")) {
    events.fields.add(new TextField({ name: "endDate", max: 20 }));
    app.save(events);
  }
}, (app) => {
  const events = app.findCollectionByNameOrId("events");
  if (events.fields.getByName("endDate")) {
    events.fields.removeByName("endDate");
    app.save(events);
  }
});
