/// <reference path="../pb_data/types.d.ts" />

// Event invitations: a host can invite people they've shared an event with
// (see the /api/invite/contacts route). Each invite pings the invitee via push
// + email with a link; they accept/decline in-app. One row per (event, user).

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  const users = app.findCollectionByNameOrId("users");
  const hostRule = '@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id';

  const invites = new Collection({
    name: "invites",
    type: "base",
    fields: [
      { name: "event",       type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "invitedUser", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "invitedBy",   type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "status",      type: "text", max: 10 }, // pending | accepted | declined
      { name: "created",     type: "autodate", onCreate: true },
      { name: "updated",     type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_invite_eu ON invites (event, invitedUser)"],
    // Invitee sees their own; host sees their event's.
    listRule:   '@request.auth.id != "" && (invitedUser = @request.auth.id || ' + hostRule + ')',
    viewRule:   '@request.auth.id != "" && (invitedUser = @request.auth.id || ' + hostRule + ')',
    // Only an event host may invite, and only on their own behalf.
    createRule: '@request.auth.id != "" && invitedBy = @request.auth.id && (' + hostRule + ')',
    // Invitee responds (accept/decline); host can also update (cancel).
    updateRule: '@request.auth.id != "" && (invitedUser = @request.auth.id || ' + hostRule + ')',
    deleteRule: '@request.auth.id != "" && (invitedUser = @request.auth.id || ' + hostRule + ')',
  });
  app.save(invites);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("invites")); } catch (_) {}
});
