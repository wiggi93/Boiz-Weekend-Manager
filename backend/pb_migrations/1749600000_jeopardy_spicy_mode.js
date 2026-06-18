/// <reference path="../pb_data/types.d.ts" />

// Spicy-compliment mode for Jeopardy: when on, every correct answer pops a
// cheeky compliment on the winner's screen that they have to dismiss before
// playing on. Only this toggle needs a column (the compliments live in the
// frontend).

migrate((app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (!j.fields.getByName("spicyMode")) {
    j.fields.add(new BoolField({ name: "spicyMode" }));
    app.save(j);
  }
}, (app) => {
  const j = app.findCollectionByNameOrId("jeopardy");
  if (j.fields.getByName("spicyMode")) {
    j.fields.removeByName("spicyMode");
    app.save(j);
  }
});
