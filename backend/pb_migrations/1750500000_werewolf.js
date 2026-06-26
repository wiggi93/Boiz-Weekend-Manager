/// <reference path="../pb_data/types.d.ts" />

// Werwolf (Werewolf/Mafia) host module.
//
//   werewolf       — one PUBLIC row per event: phase, round, who's alive, the
//                    death log, winner, config, and (only after game over) the
//                    full role reveal. No secret role info while playing.
//   werewolf_roles — one row per player with their SECRET role. Readable only
//                    by that player (and the event host/admin for moderation),
//                    so nobody can peek at the API to cheat.
//
// Roles are assigned + the night "Seherin" check happen server-side
// (werewolf.pb.js routes); phase/death management is host-gated record updates.

migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  const users = app.findCollectionByNameOrId("users");
  const hostRule = '@request.auth.role = "admin" || event.createdBy = @request.auth.id || event.hostUsers ~ @request.auth.id';

  const ww = new Collection({
    name: "werewolf",
    type: "base",
    fields: [
      { name: "event",     type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "moderator", type: "text", max: 30 },               // the host running the game (not a player)
      { name: "phase",     type: "text", max: 10 },               // lobby | night | day | over
      { name: "round",     type: "number" },
      { name: "alive",   type: "json", maxSize: 20000 },          // [userId]
      { name: "deaths",  type: "json", maxSize: 40000 },          // [{ round, phase, userId, role }]
      { name: "config",  type: "json", maxSize: 4000 },           // { wolves, seer, witch, hunter }
      { name: "winner",  type: "text", max: 10 },                 // '' | wolves | village
      { name: "reveal",  type: "json", maxSize: 20000 },          // { userId: role } — only once over
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_ww_event ON werewolf (event)"],
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: hostRule,
    updateRule: hostRule,
    deleteRule: hostRule,
  });
  app.save(ww);

  const roles = new Collection({
    name: "werewolf_roles",
    type: "base",
    fields: [
      { name: "event", type: "relation", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "user",  type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "role",  type: "text", required: true, max: 12 },   // wolf | villager | seer | witch | hunter
    ],
    indexes: ["CREATE UNIQUE INDEX idx_wwrole_eu ON werewolf_roles (event, user)"],
    // You see only YOUR own role; the host sees all (for moderation).
    listRule:   '@request.auth.id != "" && (user = @request.auth.id || ' + hostRule + ')',
    viewRule:   '@request.auth.id != "" && (user = @request.auth.id || ' + hostRule + ')',
    createRule: hostRule,
    updateRule: hostRule,
    deleteRule: hostRule,
  });
  app.save(roles);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("werewolf_roles")); } catch (_) {}
  try { app.delete(app.findCollectionByNameOrId("werewolf")); } catch (_) {}
});
