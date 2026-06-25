/// <reference path="../pb_data/types.d.ts" />

// Notify site admins whenever a new user registers, so nobody waits unseen in
// the approval queue. Two channels: a Web Push to every admin's devices, and
// an email to every admin address. Both are best-effort — a failure here must
// never break the actual signup.
//
// New users land with approved=false (migration 1748700000) and must verify
// their email before login (email.pb.js), so this is purely a heads-up.
//
// JSVM scope isolation: helpers are require()d INSIDE the handler.

onRecordAfterCreateSuccess((e) => {
  try {
    const push = require(`${__hooks}/push_lib.js`);
    const rec = e.record;
    const name = rec.get("displayName") || (rec.get("email") || "Jemand").split("@")[0];
    const email = rec.get("email") || "";

    let admins = [];
    try { admins = e.app.findRecordsByFilter("users", `role = "admin"`, "", 50, 0); }
    catch (err) { console.log("[signup] admin lookup:", err); }

    const adminIds = [];
    for (const a of admins) { if (a.id !== rec.id) adminIds.push(a.id); }

    // 1) Push to admin devices.
    try {
      if (adminIds.length) {
        push.sendPushToUsers(e.app, adminIds, {
          title: "👤 Neue Registrierung",
          body: `${name} (${email}) wartet auf deine Freigabe.`,
          url: `/?goto=users`,
          tag: "new-signup",
        });
      }
    } catch (err) { console.log("[signup] push:", err); }

    // 2) Email to admin addresses.
    try {
      const settings = e.app.settings();
      if (settings.smtp && settings.smtp.enabled) {
        const html =
          `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">` +
          `<h2 style="color:#d68a0c">🍺 Neue Registrierung</h2>` +
          `<p style="font-size:15px;line-height:1.5;color:#222">` +
          `<b>${name}</b> (${email}) hat sich gerade im Boiz Weekend Manager registriert ` +
          `und wartet auf deine Freigabe.</p>` +
          `<p style="font-size:14px;color:#444">Öffne die App → Tab <b>USER</b>, um freizuschalten.</p>` +
          `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0">` +
          `<div style="font-size:12px;color:#888">Automatische Nachricht vom Boiz Weekend Manager.</div>` +
          `</div>`;
        for (const a of admins) {
          const to = a.get("email");
          if (!to) continue;
          try {
            e.app.newMailClient().send(new MailerMessage({
              from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
              to: [{ address: to }],
              subject: `🍺 Neue Registrierung: ${name}`,
              html: html,
            }));
          } catch (err) { console.log("[signup] email send failed for", to, err); }
        }
      }
    } catch (err) { console.log("[signup] email:", err); }
  } catch (err) { console.log("[signup] notify:", err); }
  e.next();
}, "users");
