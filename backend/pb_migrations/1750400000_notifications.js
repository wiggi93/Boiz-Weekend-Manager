/// <reference path="../pb_data/types.d.ts" />

// In-app notification feed: one row per event-wide notification (mirrors what
// goes out as a push). The app shows these under a bell; tapping one deep-links
// to the relevant section via `url`. Host announcements are the same shape with
// type="announcement". Rows are written server-side (push hooks + the announce
// route via $app.save), so clients only read.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  const users = app.findCollectionByNameOrId("users");

  const notifs = new Collection({
    name: "notifications",
    type: "base",
    fields: [
      { name: "event",     type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "type",      type: "text", max: 20 },     // announcement | challenge | event | wine | jeopardy | kitty | …
      { name: "title",     type: "text", required: true, max: 140 },
      { name: "body",      type: "text", max: 600 },
      { name: "url",       type: "text", max: 300 },     // deep-link path, e.g. /?event=X&goto=challenges
      { name: "createdBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "created",   type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_notif_event ON notifications (event)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    // Created server-side only (push hooks + announce route use $app.save).
    createRule: '@request.auth.role = "admin"',
    updateRule: null,
    // Hosts/admins can clear feed entries.
    deleteRule: '@request.auth.id != "" && (@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id)',
  });
  app.save(notifs);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("notifications")); } catch (_) {}
});
