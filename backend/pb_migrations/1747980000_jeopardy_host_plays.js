/// <reference path="../pb_data/types.d.ts" />

// Host-plays mode for Jeopardy + default categories.
// Adds hostPlays bool field; backfills default categories on rows that
// still have an empty categories[] so the host sees a usable starting set.

const DEFAULT_CATEGORIES = [
  "Geographie",
  "Zurück in die Schule",
  "Reality TV Deutschland",
  "Twitch & Youtube Deutschland",
  "Songtexte 2000er",
];

migrate((app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (!j.fields.getByName("hostPlays")) {
    j.fields.add(new BoolField({ name: "hostPlays" }));
    app.save(j);
  }

  try {
    const all = app.findAllRecords("jeopardy");
    for (const r of all) {
      const cats = r.get("categories");
      if (!Array.isArray(cats) || cats.length === 0) {
        r.set("categories", DEFAULT_CATEGORIES);
        try { app.save(r); } catch (_) {}
      }
    }
  } catch (_) {}
}, (app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (j.fields.getByName("hostPlays")) {
    j.fields.removeByName("hostPlays");
    app.save(j);
  }
});
