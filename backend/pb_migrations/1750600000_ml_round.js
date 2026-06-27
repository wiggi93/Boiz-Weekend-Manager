/// <reference path="../pb_data/types.d.ts" />

// "Wer würde eher": tag each question with the round (batch) it was created in,
// so the app can group questions into collapsible round sections. A random
// round shares one id across its questions; a single custom question gets its
// own. Existing questions have an empty round and just group as singles.

migrate((app) => {
  const ml = app.findCollectionByNameOrId("ml_questions");
  if (!ml.fields.getByName("round")) {
    ml.fields.add(new TextField({ name: "round", max: 30 }));
    app.save(ml);
  }
}, (app) => {
  const ml = app.findCollectionByNameOrId("ml_questions");
  if (ml.fields.getByName("round")) { ml.fields.removeByName("round"); app.save(ml); }
});
