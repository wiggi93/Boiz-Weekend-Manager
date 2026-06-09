/// <reference path="../pb_data/types.d.ts" />

// Kitty extras:
//  • `externals` — people who took part in the costs but aren't app users,
//    so their share can still be split. Array of { id, name }.
//  • `done` — user ids who marked "I'm finished, everything submitted", so
//    the crew knows when it's safe to settle up. Array of user id strings.

migrate((app) => {
  const kitty = app.findCollectionByNameOrId("kitty");
  if (!kitty.fields.getByName("externals")) {
    kitty.fields.add(new JSONField({ name: "externals", maxSize: 50000 }));
  }
  if (!kitty.fields.getByName("done")) {
    kitty.fields.add(new JSONField({ name: "done", maxSize: 50000 }));
  }
  app.save(kitty);
}, (app) => {
  const kitty = app.findCollectionByNameOrId("kitty");
  for (const f of ["externals", "done"]) {
    if (kitty.fields.getByName(f)) kitty.fields.removeByName(f);
  }
  app.save(kitty);
});
