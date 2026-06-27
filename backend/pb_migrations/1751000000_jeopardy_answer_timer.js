/// <reference path="../pb_data/types.d.ts" />

// Jeopardy answer timer: optional per-question countdown so the dran team/player
// doesn't have unlimited time to answer. `answerSeconds` = 0 means no limit
// (default — everything behaves exactly as before).

migrate((app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (!j.fields.getByName("answerSeconds")) {
    j.fields.add(new NumberField({ name: "answerSeconds" }));
    app.save(j);
  }
}, (app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (j.fields.getByName("answerSeconds")) {
    j.fields.removeByName("answerSeconds");
    app.save(j);
  }
});
