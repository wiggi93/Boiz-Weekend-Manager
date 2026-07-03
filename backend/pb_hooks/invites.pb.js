/// <reference path="../pb_data/types.d.ts" />

// Event invitations. On create → ping the invitee (push + email) with a link to
// accept/decline. Plus a contacts endpoint so a host only sees people they've
// actually shared an event with (not the whole user base).

// --- New invite → push + email the invitee ---
onRecordAfterCreateSuccess((e) => {
  try {
    const push = require(`${__hooks}/push_lib.js`);
    const rec = e.record;
    const invitedUser = rec.get("invitedUser");
    const invitedBy = rec.get("invitedBy");
    const eventId = rec.get("event");
    const nameOf = (col, id, field) => { try { return e.app.findRecordById(col, id).get(field) || ""; } catch (_) { return ""; } };
    const evName = nameOf("events", eventId, "name") || "einem Event";
    const hostName = nameOf("users", invitedBy, "displayName") || "Jemand";
    const url = `/?invite=${rec.id}`;

    push.sendPushToUsers(e.app, [invitedUser], {
      title: "🎉 Einladung: " + evName,
      body: `${hostName} lädt dich zu "${evName}" ein — tippen zum Beitreten.`,
      url: url,
      tag: `invite-${rec.id}`,
    });

    try {
      const settings = e.app.settings();
      if (settings.smtp && settings.smtp.enabled) {
        const to = nameOf("users", invitedUser, "email");
        if (to) {
          const front = ($os.getenv("APP_FRONTEND_URL") || "https://boiz.dr-disco.eu").replace(/\/$/, "");
          const link = front + url;
          const html =
            `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">` +
            `<h2 style="color:#d68a0c">🍻 Du bist eingeladen!</h2>` +
            `<p style="font-size:15px;line-height:1.5;color:#222"><b>${hostName}</b> lädt dich zum Event <b>„${evName}"</b> ein.</p>` +
            `<p style="margin:24px 0"><a href="${link}" style="background:#d68a0c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Zum Event & beitreten</a></p>` +
            `<p style="font-size:13px;color:#666">Oder öffne die App und schau unter deinen Einladungen. Kein Interesse? Einfach ignorieren.</p>` +
            `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0">` +
            `<div style="font-size:12px;color:#888">Automatische Nachricht vom Boiz Weekend Manager.</div>` +
            `</div>`;
          e.app.newMailClient().send(new MailerMessage({
            from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
            to: [{ address: to }],
            subject: `🍻 Einladung zu „${evName}"`,
            html: html,
          }));
        }
      }
    } catch (err) { console.log("[invite] email:", err); }
  } catch (err) { console.log("[invite] notify:", err); }
  e.next();
}, "invites");

// --- Contacts: users the host has shared any event with (minus current members
//     and already-pending invites). POST { eventId }. Host only. ---
routerAdd("POST", "/api/invite/contacts", (e) => {
  if (!e.auth) return e.unauthorizedError("auth required", null);
  const data = new DynamicModel({ eventId: "" });
  e.bindBody(data);
  if (!data.eventId) return e.badRequestError("eventId required", null);
  const gate = require(`${__hooks}/jeopardy_lib.js`).jeoAuthOk(e, data.eventId);
  if (gate.err) return gate.err;

  try {
    const hostId = e.auth.id;
    const myEvents = {};
    for (const m of e.app.findRecordsByFilter("event_members", `user = "${hostId}"`, "", 1000, 0)) myEvents[m.get("event")] = true;

    const contacts = {};
    for (const eid of Object.keys(myEvents)) {
      for (const m of e.app.findRecordsByFilter("event_members", `event = "${eid}"`, "", 1000, 0)) contacts[m.get("user")] = true;
    }
    delete contacts[hostId];
    for (const m of e.app.findRecordsByFilter("event_members", `event = "${data.eventId}"`, "", 1000, 0)) delete contacts[m.get("user")];
    for (const inv of e.app.findRecordsByFilter("invites", `event = "${data.eventId}" && status = "pending"`, "", 1000, 0)) delete contacts[inv.get("invitedUser")];

    const out = [];
    for (const uid of Object.keys(contacts)) {
      try {
        const u = e.app.findRecordById("users", uid);
        out.push({ id: u.id, displayName: u.get("displayName"), emoji: u.get("emoji") });
      } catch (_) {}
    }
    return e.json(200, { contacts: out });
  } catch (err) { console.log("[invite] contacts:", err); return e.internalServerError("contacts failed", null); }
});
