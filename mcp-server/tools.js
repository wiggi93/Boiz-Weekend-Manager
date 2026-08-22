/**
 * All Boiz MCP tools in one place, so the stdio entrypoint (index.js) and the
 * hosted HTTP server (http.js) expose exactly the same capabilities.
 *
 * ctx = { pb, withAuth, PB_URL }
 *   pb        — an authenticated PocketBase client for THIS user/session
 *   withAuth  — runs a fn, refreshing/reporting auth as the transport allows
 *   PB_URL    — API base, for the custom (non-collection) routes
 */
import { z } from 'zod';

export function registerTools(server, ctx) {
  const { pb, withAuth, PB_URL } = ctx;
  const me = () => pb.authStore.record;

  // ---------- helpers ----------
  const MODULE_IDS = {
    drinks: 'Bier-Counter', flunky: 'Flunkyball', jeopardy: 'Jeopardy',
    schnelle_fragen: '5 Schnelle', schedule: 'Programm', challenges: 'Challenges',
    wine: 'Weinwanderung', mostlikely: 'Wer würde eher', werewolf: 'Werwolf',
  };
  const MODULE_ALIASES = {
    bier: 'drinks', drinks: 'drinks', getränke: 'drinks', biercounter: 'drinks',
    flunky: 'flunky', flunkyball: 'flunky',
    jeopardy: 'jeopardy', quiz: 'jeopardy',
    schnelle: 'schnelle_fragen', schnelle_fragen: 'schnelle_fragen', '5schnelle': 'schnelle_fragen',
    programm: 'schedule', schedule: 'schedule', plan: 'schedule',
    challenges: 'challenges', challenge: 'challenges',
    wein: 'wine', wine: 'wine', weinwanderung: 'wine',
    mostlikely: 'mostlikely', werwürdeeher: 'mostlikely', werwuerdeeher: 'mostlikely',
    werwolf: 'werewolf', werewolf: 'werewolf', mafia: 'werewolf',
  };
  function normModule(input) {
    const key = String(input || '').toLowerCase().replace(/[\s\-']/g, '');
    if (MODULE_IDS[key]) return key;
    if (MODULE_ALIASES[key]) return MODULE_ALIASES[key];
    throw new Error(
      `Unbekanntes Modul "${input}". Verfügbar: ${Object.entries(MODULE_IDS).map(([id, n]) => `${id} (${n})`).join(', ')}`
    );
  }

  /** Find one of MY events by id or (fuzzy) name. */
  async function resolveEvent(nameOrId) {
    const memberships = await pb.collection('event_members').getFullList({
      filter: `user="${me().id}"`, expand: 'event',
    });
    const events = memberships.map(m => m.expand?.event).filter(Boolean);
    const needle = String(nameOrId || '').trim().toLowerCase();
    if (!needle) {
      if (events.length === 1) return events[0];
      throw new Error(`Welches Event? Deine Events: ${events.map(e => e.name).join(', ') || '(keine)'}`);
    }
    const exactId = events.find(e => e.id === nameOrId);
    if (exactId) return exactId;
    const exact = events.filter(e => (e.name || '').toLowerCase() === needle);
    if (exact.length === 1) return exact[0];
    const partial = events.filter(e => (e.name || '').toLowerCase().includes(needle));
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) throw new Error(`Mehrdeutig — passt auf: ${partial.map(e => e.name).join(', ')}`);
    throw new Error(`Kein Event "${nameOrId}" gefunden. Deine Events: ${events.map(e => e.name).join(', ') || '(keine)'}`);
  }

  async function eventMembers(eventId) {
    const rows = await pb.collection('event_members').getFullList({
      filter: `event="${eventId}"`, expand: 'user',
    });
    return rows.map(r => ({ memberId: r.id, ...(r.expand?.user || {}) })).filter(u => u.id);
  }

  /** Resolve display names → user ids within an event. "alle"/"all" = everyone. */
  function resolveMemberNames(members, names) {
    if (!names || names.length === 0) return members.map(m => m.id);
    const all = names.some(n => ['alle', 'all', 'jeder', 'everyone'].includes(String(n).toLowerCase().trim()));
    if (all) return members.map(m => m.id);
    return names.map(raw => {
      const needle = String(raw).trim().toLowerCase();
      const byId = members.find(m => m.id === raw);
      if (byId) return byId.id;
      const cands = members.filter(m =>
        (m.displayName || '').toLowerCase() === needle ||
        (m.email || '').toLowerCase().split('@')[0] === needle
      );
      if (cands.length === 1) return cands[0].id;
      const partial = members.filter(m => (m.displayName || '').toLowerCase().includes(needle));
      if (partial.length === 1) return partial[0].id;
      throw new Error(
        `Kein/mehrdeutiger Teilnehmer "${raw}". Im Event: ${members.map(m => m.displayName || m.email).join(', ')}`
      );
    });
  }

  const nameOf = (members, id) => {
    const u = members.find(m => m.id === id);
    return u ? (u.displayName || u.email?.split('@')[0] || '?') : '?';
  };
  const eur = (n) => `${(Math.round(n * 100) / 100).toFixed(2)} €`;
  const ok = (text) => ({ content: [{ type: 'text', text }] });
  const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });
  /** Wrap a handler so errors come back as readable tool errors, not crashes. */
  const handler = (fn) => async (args) => {
    try { return await withAuth(() => fn(args)); }
    catch (e) {
      const detail = e?.response?.data
        ? Object.entries(e.response.data).map(([k, v]) => `${k}: ${v?.message || v}`).join(', ')
        : '';
      return fail(`❌ ${e?.message || 'Fehler'}${detail ? ` (${detail})` : ''}`);
    }
  };

  /** Same math as the app's kittySettlement, so numbers match exactly. */
  /** Mirrors expenseShares() in src/App.jsx — keep the two in sync. */
  function expenseShares(exp, validIds) {
    const parts = (exp.participants || []).filter(pid => validIds.includes(pid));
    if (parts.length === 0) return {};
    const amount = Number(exp.amount) || 0;
    const shares = (exp.shares && typeof exp.shares === 'object') ? exp.shares : {};
    const out = {};
    const evenly = [];
    let allocated = 0;
    for (const pid of parts) {
      const s = shares[pid];
      const val = Number(s?.value);
      if (s?.type === 'fixed' && val > 0) { out[pid] = val; allocated += val; }
      else if (s?.type === 'percent' && val > 0) { const a = amount * val / 100; out[pid] = a; allocated += a; }
      else evenly.push(pid);
    }
    if (evenly.length) {
      const each = Math.max(0, amount - allocated) / evenly.length;
      for (const pid of evenly) out[pid] = each;
    }
    return out;
  }

  function kittySettlement(expenses, partyIds) {
    const balances = {};
    for (const p of partyIds) balances[p] = 0;
    for (const exp of expenses) {
      const owed = expenseShares(exp, partyIds);
      for (const [pid, share] of Object.entries(owed)) {
        if (pid === exp.paidBy) continue;
        balances[pid] = (balances[pid] || 0) - share;
        if (balances[exp.paidBy] !== undefined) balances[exp.paidBy] += share;
      }
    }
    const debtors = Object.entries(balances).filter(([, b]) => b < -0.005).map(([id, b]) => ({ id, b })).sort((a, c) => a.b - c.b);
    const creditors = Object.entries(balances).filter(([, b]) => b > 0.005).map(([id, b]) => ({ id, b })).sort((a, c) => c.b - a.b);
    const txs = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amt = Math.min(-debtors[i].b, creditors[j].b);
      txs.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
      debtors[i].b += amt; creditors[j].b -= amt;
      if (Math.abs(debtors[i].b) < 0.005) i++;
      if (Math.abs(creditors[j].b) < 0.005) j++;
    }
    return { txs, balances };
  }

  /** POST to a custom backend route with the current auth token. */
  async function apiPost(path, body, timeoutMs = 30000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${PB_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }


  // ---------- Events ----------
  server.registerTool('list_events', {
    title: 'Events auflisten',
    description: 'Listet alle Events, in denen ich Mitglied bin (mit Join-Code, Status und aktiven Modulen).',
    inputSchema: {},
  }, handler(async () => {
    const rows = await pb.collection('event_members').getFullList({ filter: `user="${me().id}"`, expand: 'event' });
    const events = rows.map(r => r.expand?.event).filter(Boolean)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!events.length) return ok('Du bist in keinem Event.');
    return ok(events.map(e =>
      `• ${e.name}${e.date ? ` (${e.date})` : ''} — ${e.active ? '🟢 live' : '⏸️ pausiert'} · Code ${e.code}\n` +
      `  Module: ${(e.modules || []).map(m => MODULE_IDS[m] || m).join(', ') || '—'}\n  id: ${e.id}`
    ).join('\n'));
  }));

  server.registerTool('get_event', {
    title: 'Event-Details',
    description: 'Zeigt ein Event im Detail: Status, Join-Code, Module, Teilnehmer, Getränke-Konfiguration.',
    inputSchema: { event: z.string().describe('Event-Name oder -ID') },
  }, handler(async ({ event }) => {
    const ev = await resolveEvent(event);
    const members = await eventMembers(ev.id);
    const drinks = Array.isArray(ev.drinks) && ev.drinks.length ? ev.drinks : [];
    return ok(
      `🍻 ${ev.name}${ev.date ? ` (${ev.date})` : ''}\n` +
      `Status: ${ev.active ? '🟢 live' : '⏸️ pausiert'} · Join-Code: ${ev.code}\n` +
      `Module: ${(ev.modules || []).map(m => MODULE_IDS[m] || m).join(', ') || '—'}\n` +
      `Teilnehmer (${members.length}): ${members.map(m => `${m.emoji || '🍺'} ${m.displayName || m.email}`).join(', ')}\n` +
      `Getränke: ${drinks.length ? drinks.map(d => `${d.emoji || ''} ${d.label} = ${d.points} Pkt`).join(', ') : '(Standard)'}\n` +
      `id: ${ev.id}`
    );
  }));

  server.registerTool('create_event', {
    title: 'Event erstellen',
    description: 'Erstellt ein neues Event. Join-Code wird automatisch vergeben, ich werde Host.',
    inputSchema: {
      name: z.string().describe('Name des Events'),
      date: z.string().optional().describe('Startdatum YYYY-MM-DD'),
      endDate: z.string().optional().describe('Enddatum YYYY-MM-DD'),
      modules: z.array(z.string()).optional().describe('Module, z.B. ["jeopardy","wine","challenges"]'),
    },
  }, handler(async ({ name, date, endDate, modules }) => {
    const mods = (modules && modules.length ? modules.map(normModule) : ['drinks']);
    const ev = await pb.collection('events').create({
      name, date: date || '', endDate: endDate || '',
      modules: mods, active: false,
      beerLabel: 'Bier', drinkLabel: 'Mische', pointsPerBeer: 1, pointsPerMische: 1,
      drinks: [
        { id: 'beer', emoji: '🍺', label: 'Bier', points: 1 },
        { id: 'mische', emoji: '🍷', label: 'Mische', points: 1 },
      ],
      createdBy: me().id,
    });
    // Creator joins their own event so it shows up for them right away.
    try { await pb.collection('event_members').create({ event: ev.id, user: me().id }); }
    catch (e) { if (e?.status !== 400) throw e; }
    return ok(`✅ Event "${ev.name}" erstellt.\nJoin-Code: ${ev.code}\nModule: ${mods.map(m => MODULE_IDS[m]).join(', ')}\nid: ${ev.id}\n\n(Noch pausiert — mit update_event active=true startest du es.)`);
  }));

  server.registerTool('update_event', {
    title: 'Event ändern',
    description: 'Ändert Name, Datum oder startet/pausiert ein Event.',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      name: z.string().optional(),
      date: z.string().optional().describe('YYYY-MM-DD'),
      active: z.boolean().optional().describe('true = Event live schalten, false = pausieren'),
    },
  }, handler(async ({ event, name, date, active }) => {
    const ev = await resolveEvent(event);
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (date !== undefined) patch.date = date;
    if (active !== undefined) patch.active = active;
    if (!Object.keys(patch).length) return fail('Nichts zu ändern angegeben.');
    const up = await pb.collection('events').update(ev.id, patch);
    return ok(`✅ "${up.name}" aktualisiert — ${up.active ? '🟢 live' : '⏸️ pausiert'}${date !== undefined ? ` · Datum ${up.date}` : ''}`);
  }));

  server.registerTool('set_modules', {
    title: 'Module verwalten',
    description: 'Fügt Module hinzu oder entfernt sie (Jeopardy, Weinwanderung, Challenges, Werwolf, …).',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      add: z.array(z.string()).optional().describe('Module zum Aktivieren'),
      remove: z.array(z.string()).optional().describe('Module zum Deaktivieren'),
    },
  }, handler(async ({ event, add, remove }) => {
    const ev = await resolveEvent(event);
    let mods = [...(ev.modules || [])];
    const added = [], removed = [];
    for (const m of (add || [])) { const id = normModule(m); if (!mods.includes(id)) { mods.push(id); added.push(id); } }
    for (const m of (remove || [])) { const id = normModule(m); if (mods.includes(id)) { mods = mods.filter(x => x !== id); removed.push(id); } }
    if (!added.length && !removed.length) return ok(`Nichts geändert. Aktive Module: ${mods.map(m => MODULE_IDS[m] || m).join(', ') || '—'}`);
    await pb.collection('events').update(ev.id, { modules: mods });
    return ok(
      `✅ ${ev.name}\n` +
      (added.length ? `➕ ${added.map(m => MODULE_IDS[m]).join(', ')}\n` : '') +
      (removed.length ? `➖ ${removed.map(m => MODULE_IDS[m]).join(', ')}\n` : '') +
      `Jetzt aktiv: ${mods.map(m => MODULE_IDS[m] || m).join(', ') || '—'}`
    );
  }));

  server.registerTool('delete_event', {
    title: 'Event löschen',
    description: 'Löscht ein Event UNWIDERRUFLICH inklusive aller Punkte, Spiele und Ausgaben.',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      confirm: z.boolean().describe('Muss true sein — Sicherheitsabfrage.'),
    },
  }, handler(async ({ event, confirm }) => {
    const ev = await resolveEvent(event);
    if (!confirm) return fail(`⚠️ Löschen von "${ev.name}" nicht bestätigt. Nochmal mit confirm=true aufrufen.`);
    await pb.collection('events').delete(ev.id);
    return ok(`🗑️ Event "${ev.name}" gelöscht.`);
  }));

  server.registerTool('list_members', {
    title: 'Teilnehmer auflisten',
    description: 'Zeigt alle Teilnehmer eines Events mit ihren Punkten aus Getränken/Bonus.',
    inputSchema: { event: z.string().describe('Event-Name oder -ID') },
  }, handler(async ({ event }) => {
    const ev = await resolveEvent(event);
    const members = await eventMembers(ev.id);
    const stats = await pb.collection('stats').getFullList({ filter: `event="${ev.id}"` });
    const byUser = Object.fromEntries(stats.map(s => [s.user, s]));
    const drinks = Array.isArray(ev.drinks) && ev.drinks.length ? ev.drinks : [];
    return ok(members.map(m => {
      const s = byUser[m.id];
      const counts = (s?.counts && typeof s.counts === 'object') ? s.counts : {};
      const drinkTxt = drinks.map(d => `${d.emoji || ''}${counts[d.id] || 0}`).join(' ');
      const bonus = Number(s?.bonus) || 0;
      return `• ${m.emoji || '🍺'} ${m.displayName || m.email}${drinkTxt ? ` — ${drinkTxt}` : ''}${bonus ? ` · Bonus ${bonus > 0 ? '+' : ''}${bonus}` : ''}`;
    }).join('\n') || 'Keine Teilnehmer.');
  }));

  // ---------- Jeopardy ----------
  server.registerTool('jeopardy_start_round', {
    title: 'Jeopardy-Runde starten',
    description: 'Startet eine neue Jeopardy-Runde. Entweder mit eigenen Kategorien oder surprise=true (KI denkt sich welche aus). Die Fragen werden serverseitig generiert — das dauert bis zu ~2 Minuten.',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      categories: z.array(z.string()).optional().describe('1–5 Kategorien, z.B. ["90er Musik","Kassel","Bier"]'),
      surprise: z.boolean().optional().describe('true = KI wählt die Kategorien selbst'),
      participants: z.array(z.string()).optional().describe('Namen der Mitspieler (Default: alle Event-Teilnehmer)'),
    },
  }, handler(async ({ event, categories, surprise, participants }) => {
    const ev = await resolveEvent(event);
    if (!(ev.modules || []).includes('jeopardy')) {
      return fail(`Jeopardy ist in "${ev.name}" nicht aktiviert. Erst mit set_modules add=["jeopardy"] aktivieren.`);
    }
    const cats = (categories || []).map(c => String(c).trim()).filter(Boolean).slice(0, 5);
    if (!cats.length && !surprise) return fail('Gib entweder categories an oder setze surprise=true.');

    const members = await eventMembers(ev.id);
    const partIds = resolveMemberNames(members, participants);
    if (partIds.length === 0) return fail('Keine Teilnehmer für die Runde.');

    // Ensure the jeopardy row exists and carries the participants.
    let jeo;
    try { jeo = await pb.collection('jeopardy').getFirstListItem(`event="${ev.id}"`); }
    catch { jeo = await pb.collection('jeopardy').create({ event: ev.id, categories: [], pointsPerPosition: [5, 3, 2, 1], participants: [], rounds: [] }); }
    await pb.collection('jeopardy').update(jeo.id, { participants: partIds, categories: cats });

    try {
      await apiPost('/api/jeopardy/start-round', {
        eventId: ev.id, categories: cats, aiCategories: cats,
        flagQuestions: JSON.stringify([]), surprise: !!surprise,
      }, 150000);
    } catch (e) {
      // The server finishes + saves even if our request times out.
      if (String(e?.name) === 'AbortError') {
        return ok('⏳ Generierung läuft noch (dauert manchmal >2 Min) — die Runde taucht gleich in der App auf.');
      }
      throw e;
    }
    return ok(
      `🎤 Jeopardy-Runde in "${ev.name}" gestartet!\n` +
      `Kategorien: ${surprise ? '🎲 Überraschung (KI-gewählt)' : cats.join(', ')}\n` +
      `Mitspieler (${partIds.length}): ${partIds.map(id => nameOf(members, id)).join(', ')}\n` +
      `Alle haben eine Push bekommen.`
    );
  }));

  server.registerTool('jeopardy_status', {
    title: 'Jeopardy-Stand',
    description: 'Zeigt den aktuellen Jeopardy-Stand: laufende Runde, offene Felder, Punkte.',
    inputSchema: { event: z.string().describe('Event-Name oder -ID') },
  }, handler(async ({ event }) => {
    const ev = await resolveEvent(event);
    const members = await eventMembers(ev.id);
    let jeo;
    try { jeo = await pb.collection('jeopardy').getFirstListItem(`event="${ev.id}"`); }
    catch { return ok('Noch keine Jeopardy-Daten für dieses Event.'); }
    const rounds = jeo.rounds || [];
    if (!rounds.length) return ok('Noch keine Runde gespielt.');
    const cur = rounds[rounds.length - 1];
    const qs = cur.questions || [];
    const done = qs.filter(q => q.winnerUserId || (q.triedUsers || []).length).length;
    const scores = {};
    for (const q of qs) {
      const pts = (Number(q.level) || 0) >= 10 ? Number(q.level) : (Number(q.level) || 0) * 100;
      if (q.winnerUserId) scores[q.winnerUserId] = (scores[q.winnerUserId] || 0) + pts;
      for (const u of (q.triedUsers || [])) if (u !== q.winnerUserId) scores[u] = (scores[u] || 0) - Math.floor(pts / 2);
    }
    const board = Object.entries(scores).sort((a, b) => b[1] - a[1])
      .map(([id, p], i) => `  ${i + 1}. ${nameOf(members, id)} — ${p}`).join('\n');
    return ok(
      `🎤 Runde ${rounds.length}${cur.finishedAt ? ' (beendet)' : ' (läuft)'}\n` +
      `Kategorien: ${(cur.categories || []).join(', ')}\n` +
      `Felder gespielt: ${done}/${qs.length}\n` +
      (board ? `Stand:\n${board}` : 'Noch keine Punkte.')
    );
  }));

  // ---------- Kassensturz ----------
  server.registerTool('kitty_add_expense', {
    title: 'Ausgabe eintragen',
    description: 'Trägt eine Ausgabe in den Kassensturz ein, z.B. "füge 40€ Pizza für Marcus hinzu". Standardmäßig teilen alle Beteiligten gleich. Mit `shares` kann man einzelne Personen auf einen festen Betrag oder Prozentsatz festlegen ("Anna zahlt 50%", "Ben zahlt 20€") — der Rest wird gleichmäßig auf die übrigen verteilt.',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      description: z.string().describe('Wofür, z.B. "Einkauf"'),
      amount: z.number().describe('Gesamtbetrag in Euro, z.B. 40.5'),
      paidBy: z.string().describe('Wer hat bezahlt (Name)'),
      participants: z.array(z.string()).optional().describe('Wer teilt sich das (Namen). Default: alle'),
      shares: z.array(z.object({
        person: z.string().describe('Name der Person'),
        fixed: z.number().optional().describe('Fester Betrag in Euro, z.B. 20'),
        percent: z.number().optional().describe('Prozent vom Gesamtbetrag, z.B. 50'),
      })).optional().describe('Feste Anteile einzelner Personen. Pro Eintrag entweder fixed ODER percent.'),
    },
  }, handler(async ({ event, description, amount, paidBy, participants, shares }) => {
    const ev = await resolveEvent(event);
    const members = await eventMembers(ev.id);
    const payer = resolveMemberNames(members, [paidBy])[0];
    const parts = resolveMemberNames(members, participants);
    if (!(amount > 0)) return fail('Betrag muss größer als 0 sein.');

    // Build the per-person overrides, resolving names → ids.
    const shareMap = {};
    for (const s of (shares || [])) {
      const id = resolveMemberNames(members, [s.person])[0];
      if (!parts.includes(id)) {
        return fail(`${nameOf(members, id)} hat einen Anteil, ist aber nicht unter den Beteiligten.`);
      }
      if (s.fixed != null && s.percent != null) {
        return fail(`Für ${nameOf(members, id)} bitte entweder fixed ODER percent angeben, nicht beides.`);
      }
      if (s.fixed > 0) shareMap[id] = { type: 'fixed', value: Math.round(s.fixed * 100) / 100 };
      else if (s.percent > 0) shareMap[id] = { type: 'percent', value: s.percent };
      else return fail(`Für ${nameOf(members, id)} fehlt ein gültiger Betrag oder Prozentsatz.`);
    }

    let kitty;
    try { kitty = await pb.collection('kitty').getFirstListItem(`event="${ev.id}"`); }
    catch { kitty = await pb.collection('kitty').create({ event: ev.id, expenses: [] }); }
    const expenses = Array.isArray(kitty.expenses) ? kitty.expenses : [];
    const expense = {
      id: String(Date.now()),
      desc: String(description).trim(),
      amount: Math.round(amount * 100) / 100,
      paidBy: payer,
      participants: parts,
      ...(Object.keys(shareMap).length ? { shares: shareMap } : {}),
      createdBy: me().id,
      createdAt: new Date().toISOString(),
    };
    // Any change invalidates the "everyone confirmed" state — same as the app.
    await pb.collection('kitty').update(kitty.id, { expenses: [...expenses, expense], done: [] });

    // Report the resulting split so it's obvious what was booked.
    const owed = expenseShares(expense, parts);
    const allocated = Object.values(shareMap).reduce(
      (s, v) => s + (v.type === 'fixed' ? v.value : expense.amount * v.value / 100), 0);
    const over = allocated > expense.amount + 0.005;
    return ok(
      `💸 ${expense.desc} — ${eur(expense.amount)}\n` +
      `Bezahlt von: ${nameOf(members, payer)}\n` +
      `Aufteilung:\n` +
      parts.map(id => {
        const s = shareMap[id];
        const tag = s ? (s.type === 'fixed' ? ' (fest)' : ` (${s.value}%)`) : '';
        return `  • ${nameOf(members, id)}: ${eur(owed[id] || 0)}${tag}`;
      }).join('\n') +
      (over ? `\n⚠️ Die festen Anteile ergeben ${eur(allocated)} — mehr als die Ausgabe. Die übrigen zahlen 0.` : '')
    );
  }));

  server.registerTool('kitty_update_expense', {
    title: 'Ausgabe bearbeiten',
    description: 'Ändert eine bereits eingetragene Ausgabe — Betrag, Beschreibung, wer bezahlt hat, wer beteiligt ist und die Aufteilung. Nur angegebene Felder werden geändert; `shares: []` setzt auf gleichmäßige Teilung zurück. Die Ausgabe wird per Beschreibung (oder id) gefunden.',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      expense: z.string().describe('Beschreibung der Ausgabe (oder ihre id), z.B. "Einkauf"'),
      description: z.string().optional().describe('Neue Beschreibung'),
      amount: z.number().optional().describe('Neuer Gesamtbetrag in Euro'),
      paidBy: z.string().optional().describe('Wer hat bezahlt (Name)'),
      participants: z.array(z.string()).optional().describe('Neue Beteiligten-Liste (Namen). Ersetzt die bisherige.'),
      shares: z.array(z.object({
        person: z.string().describe('Name der Person'),
        fixed: z.number().optional().describe('Fester Betrag in Euro'),
        percent: z.number().optional().describe('Prozent vom Gesamtbetrag'),
      })).optional().describe('Neue feste Anteile. Leeres Array = wieder gleichmäßig teilen.'),
    },
  }, handler(async ({ event, expense, description, amount, paidBy, participants, shares }) => {
    const ev = await resolveEvent(event);
    const members = await eventMembers(ev.id);

    let kitty;
    try { kitty = await pb.collection('kitty').getFirstListItem(`event="${ev.id}"`); }
    catch { return fail('Für dieses Event gibt es noch keine Ausgaben.'); }
    const expenses = Array.isArray(kitty.expenses) ? kitty.expenses : [];
    if (!expenses.length) return fail('Für dieses Event gibt es noch keine Ausgaben.');

    // Find it by id, then exact description, then a unique partial match.
    const needle = String(expense).trim().toLowerCase();
    const byId = expenses.filter(e => e.id === expense);
    const exact = expenses.filter(e => (e.desc || '').toLowerCase() === needle);
    const partial = expenses.filter(e => (e.desc || '').toLowerCase().includes(needle));
    const hits = byId.length ? byId : exact.length ? exact : partial;
    if (hits.length === 0) {
      return fail(`Keine Ausgabe "${expense}" gefunden. Vorhanden: ${expenses.map(e => e.desc).join(', ')}`);
    }
    if (hits.length > 1) {
      return fail(`Mehrdeutig — passt auf: ${hits.map(e => `${e.desc} (${eur(e.amount)})`).join(', ')}`);
    }
    const target = hits[0];

    const nextAmount = amount != null ? Math.round(amount * 100) / 100 : Number(target.amount) || 0;
    if (!(nextAmount > 0)) return fail('Betrag muss größer als 0 sein.');
    const nextParts = participants ? resolveMemberNames(members, participants) : (target.participants || []);
    const nextPayer = paidBy ? resolveMemberNames(members, [paidBy])[0] : target.paidBy;

    // shares: undefined = keep, [] = reset to even, otherwise replace.
    let nextShares = target.shares;
    if (shares) {
      const map = {};
      for (const s of shares) {
        const id = resolveMemberNames(members, [s.person])[0];
        if (!nextParts.includes(id)) {
          return fail(`${nameOf(members, id)} hat einen Anteil, ist aber nicht unter den Beteiligten.`);
        }
        if (s.fixed != null && s.percent != null) {
          return fail(`Für ${nameOf(members, id)} bitte entweder fixed ODER percent angeben.`);
        }
        if (s.fixed > 0) map[id] = { type: 'fixed', value: Math.round(s.fixed * 100) / 100 };
        else if (s.percent > 0) map[id] = { type: 'percent', value: s.percent };
        else return fail(`Für ${nameOf(members, id)} fehlt ein gültiger Betrag oder Prozentsatz.`);
      }
      nextShares = Object.keys(map).length ? map : undefined;
    }
    // A participant who dropped out must not keep a stale override.
    if (nextShares) {
      nextShares = Object.fromEntries(Object.entries(nextShares).filter(([id]) => nextParts.includes(id)));
      if (!Object.keys(nextShares).length) nextShares = undefined;
    }

    const updated = {
      ...target,
      desc: description != null ? String(description).trim() : target.desc,
      amount: nextAmount,
      paidBy: nextPayer,
      participants: nextParts,
      editedBy: me().id,
      editedAt: new Date().toISOString(),
    };
    if (nextShares) updated.shares = nextShares; else delete updated.shares;

    await pb.collection('kitty').update(kitty.id, {
      expenses: expenses.map(e => (e.id === target.id ? updated : e)),
      done: [], // any change invalidates the confirmations, same as the app
    });

    const owed = expenseShares(updated, nextParts);
    return ok(
      `✏️ "${updated.desc}" aktualisiert — ${eur(updated.amount)}\n` +
      `Bezahlt von: ${nameOf(members, nextPayer)}\n` +
      `Aufteilung:\n` +
      nextParts.map(id => {
        const s = nextShares?.[id];
        const tag = s ? (s.type === 'fixed' ? ' (fest)' : ` (${s.value}%)`) : '';
        return `  • ${nameOf(members, id)}: ${eur(owed[id] || 0)}${tag}`;
      }).join('\n')
    );
  }));

  server.registerTool('kitty_status', {
    title: 'Kassensturz-Stand',
    description: 'Zeigt alle Ausgaben und wer wem am Ende wie viel schuldet.',
    inputSchema: { event: z.string().describe('Event-Name oder -ID') },
  }, handler(async ({ event }) => {
    const ev = await resolveEvent(event);
    const members = await eventMembers(ev.id);
    let kitty;
    try { kitty = await pb.collection('kitty').getFirstListItem(`event="${ev.id}"`); }
    catch { return ok('Noch keine Ausgaben eingetragen.'); }
    const expenses = Array.isArray(kitty.expenses) ? kitty.expenses : [];
    if (!expenses.length) return ok('Noch keine Ausgaben eingetragen.');
    const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const { txs } = kittySettlement(expenses, members.map(m => m.id));
    return ok(
      `💰 Kassensturz "${ev.name}" — gesamt ${eur(total)}\n\n` +
      expenses.map(e => `• ${e.desc}: ${eur(e.amount)} (${nameOf(members, e.paidBy)} ausgelegt, ${(e.participants || []).length} teilen)`).join('\n') +
      `\n\nAusgleich:\n` +
      (txs.length
        ? txs.map(t => `  ${nameOf(members, t.from)} → ${nameOf(members, t.to)}: ${eur(t.amount)}`).join('\n')
        : '  Alles ausgeglichen 🎉')
    );
  }));

  // ---------- Kommunikation ----------
  server.registerTool('send_announcement', {
    title: 'Nachricht an alle',
    description: 'Schickt allen Teilnehmern eine Push-Nachricht (erscheint auch im Glocken-Feed). Nur als Host.',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      text: z.string().describe('Die Nachricht'),
    },
  }, handler(async ({ event, text }) => {
    const ev = await resolveEvent(event);
    await apiPost('/api/notify/announce', { eventId: ev.id, text });
    return ok(`📢 An alle in "${ev.name}" verschickt:\n"${text}"`);
  }));

  // ---------- Challenges ----------
  server.registerTool('create_challenge', {
    title: 'Challenge stellen',
    description: 'Stellt jemandem eine Challenge. Nicht-geheime Challenges gehen in die Gruppen-Abstimmung.',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      to: z.string().describe('Wer soll die Challenge machen (Name)'),
      text: z.string().describe('Die Aufgabe'),
      reward: z.number().optional().describe('Punkte-Vorschlag (Default 3)'),
      secret: z.boolean().optional().describe('true = geheime Challenge (nur ihr beide seht sie)'),
      photoProof: z.boolean().optional().describe('true = Fotobeweis nötig'),
    },
  }, handler(async ({ event, to, text, reward, secret, photoProof }) => {
    const ev = await resolveEvent(event);
    const members = await eventMembers(ev.id);
    const target = resolveMemberNames(members, [to])[0];
    const rec = await pb.collection('challenges').create({
      event: ev.id, fromUser: me().id, toUser: target,
      text: String(text).trim(), reward: Number(reward) || 3, penalty: 0,
      status: secret ? 'open' : 'voting',
      secret: !!secret, isPhoto: !!photoProof,
    });
    return ok(
      `🎯 Challenge an ${nameOf(members, target)}: "${rec.text}"\n` +
      `${secret ? '🤫 Geheim — du entscheidest allein und zahlst die Punkte.' : '🗳️ Die Gruppe stimmt jetzt über faire Punkte ab.'}` +
      `${photoProof ? '\n📸 Fotobeweis nötig.' : ''}`
    );
  }));

  // ---------- Wein ----------
  server.registerTool('wine_add_bottle', {
    title: 'Wein eintragen',
    description: 'Trägt einen Wein zur Verkostung ein (alle können ihn dann bewerten).',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      name: z.string().describe('Name des Weins'),
      note: z.string().optional().describe('Winzer / Ort / Notiz'),
    },
  }, handler(async ({ event, name, note }) => {
    const ev = await resolveEvent(event);
    const rec = await pb.collection('wines').create({ event: ev.id, name: String(name).trim(), note: note || '', addedBy: me().id });
    return ok(`🍷 "${rec.name}" eingetragen${note ? ` (${note})` : ''} — alle können jetzt bewerten.`);
  }));

  server.registerTool('wine_push_fact', {
    title: 'Wein-Fun-Fact pushen',
    description: 'Schickt allen sofort einen zufälligen Wein-Fun-Fact als Push.',
    inputSchema: { event: z.string().describe('Event-Name oder -ID') },
  }, handler(async ({ event }) => {
    const ev = await resolveEvent(event);
    await apiPost('/api/wine/fact-push', { eventId: ev.id });
    return ok(`🍷 Spontaner Wein-Fact an alle in "${ev.name}" verschickt.`);
  }));

  // ---------- Getränke ----------
  server.registerTool('set_drinks', {
    title: 'Getränke konfigurieren',
    description: 'Legt fest, womit gepunktet wird — z.B. Großer Wein = 2 Punkte, Kleiner Wein = 1 Punkt.',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      drinks: z.array(z.object({
        label: z.string().describe('Name, z.B. "Großer Wein"'),
        points: z.number().describe('Punkte pro Getränk'),
        emoji: z.string().optional().describe('Emoji, z.B. 🍷'),
      })).describe('Die komplette Getränke-Liste (ersetzt die bisherige)'),
    },
  }, handler(async ({ event, drinks }) => {
    const ev = await resolveEvent(event);
    if (!drinks?.length) return fail('Mindestens ein Getränk angeben.');
    const list = drinks.slice(0, 8).map((d, i) => ({
      id: `dr${i + 1}`, emoji: d.emoji || '🍺',
      label: String(d.label).trim() || `Drink ${i + 1}`,
      points: Math.max(0, Number(d.points) || 0),
    }));
    await pb.collection('events').update(ev.id, {
      drinks: list,
      beerLabel: list[0]?.label || 'Bier', pointsPerBeer: list[0]?.points ?? 1,
      drinkLabel: list[1]?.label || 'Mische', pointsPerMische: list[1]?.points ?? 1,
    });
    return ok(`🍺 Getränke für "${ev.name}":\n` + list.map(d => `  ${d.emoji} ${d.label} = ${d.points} Pkt`).join('\n'));
  }));

  // ---------- Wer würde eher ----------
  server.registerTool('mostlikely_start_round', {
    title: 'Wer-würde-eher-Runde',
    description: 'Startet eine Runde "Wer würde eher" — entweder mit eigenen Fragen oder zufälligen aus dem Katalog.',
    inputSchema: {
      event: z.string().describe('Event-Name oder -ID'),
      questions: z.array(z.string()).optional().describe('Eigene Fragen. Ohne Angabe: zufällige aus dem Katalog.'),
      count: z.number().optional().describe('Anzahl zufälliger Fragen (Default 5)'),
      points: z.number().optional().describe('Punkte pro Frage (Default 2)'),
    },
  }, handler(async ({ event, questions, count, points }) => {
    const ev = await resolveEvent(event);
    if (!(ev.modules || []).includes('mostlikely')) {
      return fail(`"Wer würde eher" ist nicht aktiviert. Erst mit set_modules add=["mostlikely"] aktivieren.`);
    }
    const BANK = [
      'im Knast landen', 'einen Promi heiraten', 'als Erster heute einschlafen',
      'bei einer Quizshow gewinnen', 'sich auf einer Wanderung verlaufen',
      'die teuerste Runde ausgeben', 'mit Fremden Freundschaft schließen',
      'ein Tattoo aus einer Bierlaune bereuen', 'als Erster betrunken sein',
      'die ganze Nacht durchmachen', 'die Karaoke-Bühne nicht mehr verlassen',
      'auswandern und nie zurückkommen', 'reich und berühmt werden',
      'beim Trinkspiel als Erster aussteigen', 'ein Geheimnis ausplaudern',
    ];
    let texts = (questions || []).map(q => String(q).trim()).filter(Boolean);
    if (!texts.length) {
      const n = Math.max(1, Math.min(Number(count) || 5, BANK.length));
      const pool = [...BANK].sort(() => Math.random() - 0.5).slice(0, n);
      texts = pool.map(t => `Wer würde am ehesten ${t}?`);
    }
    const round = `r-${Date.now()}`;
    const pts = Number(points) || 2;
    for (const text of texts) {
      await pb.collection('ml_questions').create({
        event: ev.id, createdBy: me().id, text, points: pts, round, closed: false, winnerId: '',
      });
    }
    return ok(`🤔 Runde mit ${texts.length} Fragen gestartet (je ${pts} Pkt):\n` + texts.map(t => `  • ${t}`).join('\n'));
  }));


}
