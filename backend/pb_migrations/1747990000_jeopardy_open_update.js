/// <reference path="../pb_data/types.d.ts" />

// In host-plays mode every participant (not just the host) marks
// RICHTIG / FALSCH on a question. The stricter update rule blocked
// non-host participants from writing the resolution, so the host-
// plays UI just errored on every click. Open the update rule to any
// authenticated user; only members of the event will reach it via the
// UI anyway, and the data being changed is per-event game state.

migrate((app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  j.updateRule = '@request.auth.id != ""';
  app.save(j);
}, (app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  j.updateRule = '@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id';
  app.save(j);
});
