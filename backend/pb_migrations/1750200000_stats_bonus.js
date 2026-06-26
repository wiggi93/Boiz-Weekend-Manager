/// <reference path="../pb_data/types.d.ts" />

// Manual host point adjustments: a signed `bonus` on each stats row that the
// host can hand out or dock. Also widen the stats updateRule so event hosts
// (not just site admins) can edit any participant's row in their event — they
// need that to set the bonus.

migrate((app) => {
  const stats = app.findCollectionByNameOrId("stats");
  if (!stats.fields.getByName("bonus")) {
    stats.fields.add(new NumberField({ name: "bonus" }));
  }
  stats.updateRule = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)';
  app.save(stats);
}, (app) => {
  const stats = app.findCollectionByNameOrId("stats");
  if (stats.fields.getByName("bonus")) stats.fields.removeByName("bonus");
  stats.updateRule = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")';
  app.save(stats);
});
