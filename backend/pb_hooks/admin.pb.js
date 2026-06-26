/// <reference path="../pb_data/types.d.ts" />

// Admin escape hatch: manually mark a user's email as verified. `verified` is a
// PocketBase system field that a non-superuser can't set via the normal update
// API even with an admin updateRule, so this route uses $app.save() (system
// level). Handy when a verification email can't be delivered (e.g. a recipient
// domain that greylists/blocks). Site-admins only.

routerAdd("POST", "/api/admin/set-verified", (e) => {
  const auth = e.auth;
  if (!auth) return e.unauthorizedError("auth required", null);
  if (auth.get("role") !== "admin") return e.forbiddenError("admin only", null);

  const data = new DynamicModel({ userId: "", verified: true });
  e.bindBody(data);
  if (!data.userId) return e.badRequestError("userId required", null);

  let u;
  try { u = e.app.findRecordById("users", data.userId); }
  catch (_) { return e.notFoundError("user not found", null); }

  u.set("verified", !!data.verified);
  try { e.app.save(u); }
  catch (err) { return e.internalServerError("save failed: " + err, null); }

  return e.json(200, { ok: true, verified: !!data.verified });
});
