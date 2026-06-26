/// <reference path="../pb_data/types.d.ts" />

// Host broadcast: send a free-text message to every event member as a push AND
// drop it into the in-app notification feed. Host/admin only.
routerAdd("POST", "/api/notify/announce", (e) => {
  const data = new DynamicModel({ eventId: "", text: "" });
  e.bindBody(data);
  if (!data.eventId || !String(data.text || "").trim()) {
    return e.badRequestError("eventId und text erforderlich", null);
  }
  const gate = require(`${__hooks}/jeopardy_lib.js`).jeoAuthOk(e, data.eventId);
  if (gate.err) return gate.err;

  try {
    const push = require(`${__hooks}/push_lib.js`);
    const text = String(data.text).trim().slice(0, 600);
    const hostName = (e.auth && e.auth.get("displayName")) || "Host";
    const url = `/?event=${data.eventId}`;

    const members = push.eventMemberIds(e.app, data.eventId, e.auth ? e.auth.id : null);
    if (members.length) {
      push.sendPushToUsers(e.app, members, {
        title: "📢 " + hostName,
        body: text,
        url: url,
        tag: `announce-${data.eventId}-${Date.now()}`,
      });
    }
    push.logNotif(e.app, {
      event: data.eventId, type: "announcement",
      title: "📢 Ansage von " + hostName,
      body: text,
      url: url,
      createdBy: e.auth ? e.auth.id : null,
    });
  } catch (err) { console.log("[notify] announce:", err); }
  return e.json(200, { ok: true });
});
