/// <reference path="../pb_data/types.d.ts" />

// Mark all existing users as verified so enabling REQUIRE_EMAIL_VERIFICATION
// doesn't lock out anyone who registered before email verification existed.
// New signups from here on must verify.

migrate((app) => {
  try {
    const users = app.findAllRecords("users");
    for (const u of users) {
      if (!u.get("verified")) {
        u.set("verified", true);
        app.save(u);
      }
    }
  } catch (err) {
    console.log("grandfather verified failed:", err);
  }
}, (app) => { /* no-op */ });
