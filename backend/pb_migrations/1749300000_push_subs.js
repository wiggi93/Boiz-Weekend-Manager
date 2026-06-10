/// <reference path="../pb_data/types.d.ts" />

// Web-Push subscriptions: one row per browser/device a user enabled
// notifications on. `endpoint` is the push-service URL (unique), `keys`
// holds the p256dh/auth crypto keys the sender needs for encryption.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  const subs = new Collection({
    name: "push_subs",
    type: "base",
    fields: [
      { name: "user",     type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "endpoint", type: "text", required: true, max: 1000 },
      { name: "keys",     type: "json", maxSize: 5000 },
      { name: "ua",       type: "text", max: 300 },
      { name: "created",  type: "autodate", onCreate: true },
      { name: "updated",  type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_pushsub_endpoint` ON `push_subs` (`endpoint`)"],
    listRule:   '@request.auth.id != "" && user = @request.auth.id',
    viewRule:   '@request.auth.id != "" && user = @request.auth.id',
    createRule: '@request.auth.id != "" && user = @request.auth.id',
    updateRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "admin")',
  });
  app.save(subs);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("push_subs")); } catch (_) {}
});
