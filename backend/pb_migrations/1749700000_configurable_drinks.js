/// <reference path="../pb_data/types.d.ts" />

// Configurable drinks: instead of the two fixed beer/mische counters, each
// event defines its own list of drinks (emoji, label, points each) — e.g. a
// wine hike with "Großer Wein" = 2 pts and "Kleiner Wein" = 1 pt. Counts move
// to a flexible per-drink map on the stats row.
//
//   events.drinks : [{ id, emoji, label, points }]
//   stats.counts  : { <drinkId>: <count> }
//
// Existing beer/mische data is grandfathered into the new shape so nothing is
// lost; the old columns stay (unused by the new UI) for safety.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  if (!events.fields.getByName("drinks")) {
    events.fields.add(new JSONField({ name: "drinks", maxSize: 20000 }));
    app.save(events);
  }
  const stats = app.findCollectionByNameOrId("stats");
  if (!stats.fields.getByName("counts")) {
    stats.fields.add(new JSONField({ name: "counts", maxSize: 20000 }));
    app.save(stats);
  }

  // Backfill events.drinks from the legacy beer/mische config.
  try {
    for (const ev of app.findAllRecords("events")) {
      const cur = ev.get("drinks");
      if (Array.isArray(cur) && cur.length) continue;
      ev.set("drinks", [
        { id: "beer", emoji: "🍺", label: ev.get("beerLabel") || "Bier", points: Number(ev.get("pointsPerBeer")) || 1 },
        { id: "mische", emoji: "🍷", label: ev.get("drinkLabel") || "Mische", points: Number(ev.get("pointsPerMische")) || 1 },
      ]);
      try { app.save(ev); } catch (_) {}
    }
  } catch (err) { console.log("drinks backfill:", err); }

  // Backfill stats.counts from the legacy beer/mische counters.
  try {
    for (const s of app.findAllRecords("stats")) {
      const cur = s.get("counts");
      const hasCounts = cur && typeof cur === "object" && Object.keys(cur).length;
      if (hasCounts) continue;
      s.set("counts", { beer: Number(s.get("beer")) || 0, mische: Number(s.get("mische")) || 0 });
      try { app.save(s); } catch (_) {}
    }
  } catch (err) { console.log("counts backfill:", err); }
}, (app) => {
  const events = app.findCollectionByNameOrId("events");
  if (events.fields.getByName("drinks")) { events.fields.removeByName("drinks"); app.save(events); }
  const stats = app.findCollectionByNameOrId("stats");
  if (stats.fields.getByName("counts")) { stats.fields.removeByName("counts"); app.save(stats); }
});
