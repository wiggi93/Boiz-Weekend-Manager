/// <reference path="../pb_data/types.d.ts" />

// Per-event control over the wine fun-fact schedule + which facts have already
// popped up (so the app only shows delivered ones, not the whole pool):
//   wineFactsSeen     json   — global indices of facts already pushed here
//   wineFactEnabled   bool   — auto-schedule on/off (default ON; treated as on unless explicitly false)
//   wineFactIntervalH number — hours between auto fun-facts (default 1)
//   wineFactLastAt    text   — ISO timestamp of the last fun-fact push

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  if (!events.fields.getByName("wineFactsSeen")) events.fields.add(new JSONField({ name: "wineFactsSeen", maxSize: 4000 }));
  if (!events.fields.getByName("wineFactEnabled")) events.fields.add(new BoolField({ name: "wineFactEnabled" }));
  if (!events.fields.getByName("wineFactIntervalH")) events.fields.add(new NumberField({ name: "wineFactIntervalH" }));
  if (!events.fields.getByName("wineFactLastAt")) events.fields.add(new TextField({ name: "wineFactLastAt", max: 40 }));
  app.save(events);

  // Existing events: turn the schedule on explicitly + default the interval,
  // so behaviour matches the previous always-hourly default.
  try {
    for (const ev of app.findAllRecords("events")) {
      let changed = false;
      if (ev.get("wineFactEnabled") !== true) { ev.set("wineFactEnabled", true); changed = true; }
      if (!Number(ev.get("wineFactIntervalH"))) { ev.set("wineFactIntervalH", 1); changed = true; }
      if (changed) { try { app.save(ev); } catch (_) {} }
    }
  } catch (err) { console.log("wine fact config backfill:", err); }
}, (app) => {
  const events = app.findCollectionByNameOrId("events");
  for (const f of ["wineFactsSeen", "wineFactEnabled", "wineFactIntervalH", "wineFactLastAt"]) {
    if (events.fields.getByName(f)) events.fields.removeByName(f);
  }
  app.save(events);
});
