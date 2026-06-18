/// <reference path="../pb_data/types.d.ts" />

// Remote-play mode for Jeopardy: the player who is "dran" types their answer
// instead of saying it out loud; it's broadcast so the others can judge it.
// (The typed answer itself lives inside the rounds JSON; only this toggle
// needs a column.)

migrate((app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (!j.fields.getByName("remoteMode")) {
    j.fields.add(new BoolField({ name: "remoteMode" }));
    app.save(j);
  }
}, (app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (j.fields.getByName("remoteMode")) {
    j.fields.removeByName("remoteMode");
    app.save(j);
  }
});
