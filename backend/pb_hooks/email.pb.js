/// <reference path="../pb_data/types.d.ts" />

// Email features: enforced verification (env-gated), and a host broadcast
// endpoint. SMTP itself is configured in the PocketBase Admin UI
// (Settings → Mail settings) with the Gmail App Password — that's the
// officially supported, restart-safe way and avoids touching app settings
// from code.

// ---- Require verified email for password login --------------------------
// Gated on REQUIRE_EMAIL_VERIFICATION=true so we never lock anyone out
// before SMTP is actually configured. Existing users are grandfathered
// verified by migration 1748500000.
onRecordAuthWithPasswordRequest((e) => {
  try {
    if ($os.getenv("REQUIRE_EMAIL_VERIFICATION") === "true" && e.record && !e.record.get("verified")) {
      throw new BadRequestError("Bitte bestätige zuerst deine E-Mail-Adresse (Link in deiner Inbox).");
    }
  } catch (err) {
    if (err && err.constructor && err.constructor.name === "BadRequestError") throw err;
    console.log("[email] verify-gate error:", err);
  }
  e.next();
}, "users");

// ---- Host broadcast: email every member of an event ---------------------
// POST /api/broadcast  { eventId, subject, body }
// Only site admin / event creator / event-host may send.
routerAdd("POST", "/api/broadcast", (e) => {
  const auth = e.auth;
  if (!auth) return e.unauthorizedError("auth required", null);

  const data = new DynamicModel({ eventId: "", subject: "", body: "" });
  e.bindBody(data);
  if (!data.eventId || !data.subject || !data.body) {
    return e.badRequestError("eventId, subject und body erforderlich", null);
  }

  let ev;
  try { ev = e.app.findRecordById("events", data.eventId); }
  catch (_) { return e.notFoundError("event not found", null); }

  const isAdmin = auth.get("role") === "admin";
  const isCreator = ev.get("createdBy") === auth.id;
  const hosts = ev.get("hostUsers") || [];
  const isHost = Array.isArray(hosts) && hosts.includes(auth.id);
  if (!isAdmin && !isCreator && !isHost) {
    return e.forbiddenError("nur Host/Admin", null);
  }

  const settings = e.app.settings();
  if (!settings.smtp.enabled) {
    return e.internalServerError("SMTP ist nicht konfiguriert (Admin → Mail settings)", null);
  }

  let members = [];
  try {
    members = e.app.findRecordsByFilter("event_members", `event = "${data.eventId}"`, "", 1000, 0);
  } catch (err) {
    return e.internalServerError("Mitglieder konnten nicht geladen werden: " + err, null);
  }

  const evName = ev.get("name") || "Event";
  const safeBody = String(data.body).replace(/\n/g, "<br>");
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">` +
    `<h2 style="color:#d68a0c">🍺 ${evName}</h2>` +
    `<div style="font-size:15px;line-height:1.5;color:#222">${safeBody}</div>` +
    `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0">` +
    `<div style="font-size:12px;color:#888">Diese Nachricht kam vom Host über den Boiz Weekend Manager.</div>` +
    `</div>`;

  let sent = 0, failed = 0;
  for (const m of members) {
    let user;
    try { user = e.app.findRecordById("users", m.get("user")); } catch (_) { continue; }
    const email = user.get("email");
    if (!email) continue;
    try {
      const msg = new MailerMessage({
        from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
        to: [{ address: email }],
        subject: `[${evName}] ${data.subject}`,
        html: html,
      });
      e.app.newMailClient().send(msg);
      sent++;
    } catch (err) {
      failed++;
      console.log("[email] broadcast send failed for", email, err);
    }
  }

  return e.json(200, { sent, failed });
});
