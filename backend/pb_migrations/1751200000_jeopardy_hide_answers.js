/// <reference path="../pb_data/types.d.ts" />

// "Antworten verstecken" mode for Jeopardy: when on, NOBODY (not even the host
// or the judging players) sees the solution when a tile is opened — everyone
// guesses for themselves until someone taps "Antwort aufdecken", which reveals
// it on every device at once. Only the toggle needs a column; the per-question
// reveal state lives in the `rounds` json (`answerShown`).

migrate((app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (!j.fields.getByName("hideAnswers")) {
    j.fields.add(new BoolField({ name: "hideAnswers" }));
    app.save(j);
  }
}, (app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (j.fields.getByName("hideAnswers")) {
    j.fields.removeByName("hideAnswers");
    app.save(j);
  }
});
