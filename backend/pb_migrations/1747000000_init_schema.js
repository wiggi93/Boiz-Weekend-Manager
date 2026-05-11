/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // ---- Extend the built-in `users` auth collection ----
  const users = app.findCollectionByNameOrId("users");

  users.fields.add(new TextField({
    name: "displayName",
    max: 40,
  }));
  users.fields.add(new TextField({
    name: "emoji",
    max: 8,
  }));
  users.fields.add(new SelectField({
    name: "role",
    maxSelect: 1,
    values: ["admin", "member"],
    required: true,
  }));
  users.fields.add(new TextField({
    name: "foodWishes",
    max: 500,
  }));
  users.fields.add(new TextField({
    name: "drinkWishes",
    max: 500,
  }));
  users.fields.add(new TextField({
    name: "allergies",
    max: 500,
  }));

  // Anyone signed in can see the crew. First-time signup is open;
  // tighten by setting createRule to admin-only after onboarding.
  users.listRule    = '@request.auth.id != ""';
  users.viewRule    = '@request.auth.id != ""';
  users.createRule  = '';
  users.updateRule  = '@request.auth.id != "" && (id = @request.auth.id || @request.auth.role = "admin")';
  users.deleteRule  = '@request.auth.role = "admin"';

  app.save(users);

  // ---- stats: per-user counters ----
  const stats = new Collection({
    name: "stats",
    type: "base",
    fields: [
      {
        name: "user",
        type: "relation",
        required: true,
        collectionId: users.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      { name: "beer",   type: "number", required: false, min: 0 },
      { name: "mische", type: "number", required: false, min: 0 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_stats_user ON stats (user)",
    ],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")',
    updateRule: '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(stats);

  // ---- event: single-row settings collection ----
  const event = new Collection({
    name: "event",
    type: "base",
    fields: [
      { name: "name",            type: "text",   required: true,  max: 60 },
      { name: "date",            type: "text",   required: false, max: 20 },
      { name: "beerLabel",       type: "text",   required: false, max: 20 },
      { name: "drinkLabel",      type: "text",   required: false, max: 20 },
      { name: "pointsPerBeer",   type: "number", required: false, min: 0, max: 100 },
      { name: "pointsPerMische", type: "number", required: false, min: 0, max: 100 },
    ],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(event);

  // Seed the singleton event row with defaults so the frontend has
  // something to read on first boot.
  const seed = new Record(event);
  seed.set("name", "Boiz Weekend");
  seed.set("date", "2026-06-05");
  seed.set("beerLabel", "Bier");
  seed.set("drinkLabel", "Mische");
  seed.set("pointsPerBeer", 1);
  seed.set("pointsPerMische", 1);
  app.save(seed);
}, (app) => {
  // down: best-effort teardown
  for (const name of ["stats", "event"]) {
    try {
      const c = app.findCollectionByNameOrId(name);
      app.delete(c);
    } catch (_) { /* noop */ }
  }
});
