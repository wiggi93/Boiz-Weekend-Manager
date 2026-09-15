# 🍺 Boiz Weekend Manager

> Die App fürs Jungs-Wochenende: Events anlegen, Leute einladen, Drinks zählen, Spiele spielen, Punkte sammeln, Kosten teilen — live auf allen Handys.

![Tech: React](https://img.shields.io/badge/react-18-61dafb?style=flat-square&logo=react&logoColor=white)
![Tech: Vite](https://img.shields.io/badge/vite-6-646cff?style=flat-square&logo=vite&logoColor=white)
![Backend: PocketBase](https://img.shields.io/badge/pocketbase-0.38-b8dbe4?style=flat-square)
![License: MIT](https://img.shields.io/badge/license-MIT-8b7bff?style=flat-square)

Live unter **https://boiz.dr-disco.eu** — als PWA auf dem Handy installierbar.

---

## Was es kann

### Events & Crew
- 🎉 **Mehrere Events** parallel, jedes mit eigenem Join-Code, Datum/Zeitraum und frei wählbaren Modulen
- ✉️ **Einladungen** zusätzlich zum Code: Hosts laden Leute ein, mit denen sie schon ein Event hatten — per Push + E-Mail mit Beitreten-Link
- 🛡️ **Rollen:** `admin` (alles), `host` (darf Events erstellen), `member` (darf beitreten). Innerhalb eines Events kann der Ersteller weitere Event-Hosts ernennen.
- ✅ **Onboarding:** Neue Accounts brauchen E-Mail-Bestätigung **und** Admin-Freigabe — beides läuft parallel und ist live sichtbar. Admins bekommen bei jeder Registrierung Push + E-Mail und können notfalls manuell verifizieren.
- 🏆 **Live-Leaderboard** über alle Module, mit Punkte-Aufschlüsselung pro Person; Hosts können Bonuspunkte vergeben oder abziehen

### Spiele-Module
| Modul | Kurz |
|---|---|
| 🍺 **Bier-Counter** | Tap-Buttons pro Getränk, frei konfigurierbar (Emoji, Name, Punkte), mit Zeitstempel-Historie |
| 🎳 **Flunkyball** | Spiele eintragen, Sieger bekommen Punkte |
| 🎤 **Jeopardy** | KI-generierte Fragen (eigene oder Überraschungs-Kategorien, offline Flaggen-Kategorie), rundenbasiert mit Wer-ist-dran, Team-Modus, Antwort-Timer, Remote-Modus (dran-Spieler tippt), versteckte Lösungen (jeder deckt nur für sich auf), Frage neu generieren, Spicy-Komplimente |
| ⚡ **5 Schnelle** | Fragenkatalog, 5 Fragen pro Runde |
| 🗓️ **Programm** | Zeitplan mit Uhrzeiten, Orten und Karten-Links |
| 🎯 **Challenges** | Einzel-, Zufalls- und Gruppen-Challenges, Challenge-Katalog, geheime Challenges, Fotobeweis (Kamera oder Galerie), Gruppen-Voting über Punkte und Ergebnis |
| 🍷 **Weinwanderung** | Weine eintragen, 1–5 Gläser bewerten, Ranking (berücksichtigt Anzahl der Bewertungen), Wein-Fun-Facts per Push im einstellbaren Takt |
| 🤔 **Wer würde eher** | Rundenbasiert, eigene Fragen oder Zufallskatalog, Mehrheit gewinnt Punkte |
| 🐺 **Werwolf** | Host moderiert, App verteilt geheime Rollen (Werwolf, Seherin, Hexe, Jäger), Nacht/Tag-Phasen, Gewinner-Erkennung |
| ➕ **Eigene Module** | Freie Wettbewerbe mit Sieger-Wertung |

### Tools
- 💰 **Kassensturz** — Ausgaben eintragen und bearbeiten, gleichmäßig **oder** mit festen Beträgen / Prozenten pro Person aufteilen, externe Personen ohne App, fertiger Ausgleich „wer schuldet wem". Beteiligte bekommen bei neuen Ausgaben eine Push mit ihrem Anteil.
- 📊 **Umfragen**
- 🎲 **Team-Aufteilung**
- ⏱️ **Schachuhr**

### Benachrichtigungen
- 🔔 **Web-Push** für Challenges, Event-Start, Jeopardy-Runden, Einladungen, neue Ausgaben, Wein-Facts, Host-Ansagen
- 🛎️ **Glocke** mit Verlauf aller Benachrichtigungen — Antippen springt direkt zur richtigen Stelle
- 📢 **Nachricht an alle** vom Host (Push + E-Mail + Eintrag in der Glocke)
- 🔴 Ungelesen-Markierungen an Modulen, Tabs und Navigation

## Claude-Anbindung (MCP)

Die App lässt sich per Sprache über Claude steuern — „starte Jeopardy in Kassel mit Kategorie 90er Musik", „trag 100 € Einkauf ein, Anna zahlt 50 %".

**Einrichten:** In Claude (Web oder Handy) unter *Einstellungen → Connectors* einen Custom Connector mit dieser URL anlegen:

```
https://boiz-mcp.dr-disco.eu/mcp
```

Anmeldung erfolgt mit dem normalen Boiz-Account. Der Server hat kein gemeinsames Geheimnis: Jede Person verbindet sich mit ihrem eigenen Login und hat über Claude genau die Rechte, die sie auch in der App hat.

**Tools (19):** Events auflisten, anzeigen, erstellen, ändern, löschen · Module an/aus · Teilnehmer · Jeopardy-Runde starten + Stand · Kassensturz: Ausgabe eintragen, bearbeiten, Stand · Challenge stellen · Wer-würde-eher-Runde · Wein eintragen + Fun-Fact pushen · Getränke konfigurieren · Nachricht an alle · Test-Push an sich selbst

Events und Personen werden über ihren Namen gefunden, nicht über IDs.

Für die lokale Entwicklung gibt es zusätzlich eine stdio-Variante:

```bash
cd mcp-server && npm install
claude mcp add boiz --env BOIZ_EMAIL=… --env BOIZ_PASSWORD=… -- node "$(pwd)/index.js"
```

## Als App installieren (PWA)

### iOS (Safari)
1. `https://boiz.dr-disco.eu` in Safari öffnen
2. Teilen-Symbol → **Zum Home-Bildschirm** → Hinzufügen

### Android (Chrome)
1. `https://boiz.dr-disco.eu` in Chrome öffnen
2. Install-Banner antippen oder Menü (⋮) → **App installieren**

### Push-Benachrichtigungen aktivieren
In der App unter **Profil → Benachrichtigungen erlauben**. Auf dem iPhone funktioniert Web-Push **nur aus der installierten App** vom Home-Bildschirm, nicht aus einem Safari-Tab. Wer das nie aktiviert hat, bekommt keine Pushes — mit dem MCP-Tool „Test-Push" lässt sich das pro Person prüfen.

Updates: Die App erkennt neue Versionen selbst und zeigt einen Banner zum Neuladen.

## Quick Start

```bash
npm install
npm run dev        # Dev-Server
npm run build      # Produktions-Build prüfen
npm run preview    # Build lokal anschauen
```

Der Dev-Server läuft unter `http://localhost:5173/Boiz-Weekend-Manager/`. Im Docker-Build wird `VITE_BASE=/` gesetzt, die App liegt dort also im Root. Die API-Adresse kommt aus `VITE_PB_URL`.

App-Icons neu bauen (Quelle: `public/pwa-icon.svg`):

```bash
npm run generate-pwa-assets
```

## Architektur

Vier Container auf dem HTPC, hinter Traefik:

| Container | Image | Erreichbar |
|---|---|---|
| `boiz-weekend-manager` | React-Bundle, von nginx ausgeliefert | `boiz.dr-disco.eu` |
| `boiz-weekend-backend` | PocketBase 0.38 (SQLite, Auth, REST, Realtime, JS-Hooks) | `boiz-api.dr-disco.eu` |
| `boiz-weekend-push` | Web-Push-Sender (VAPID), nur intern erreichbar | — |
| `boiz-weekend-mcp` | MCP-Server (Streamable HTTP + OAuth 2.1) | `boiz-mcp.dr-disco.eu` |

- **Rechte** werden serverseitig über PocketBase API Rules und Hooks durchgesetzt.
- **Realtime:** Änderungen erscheinen per SSE-Subscription sofort auf allen Geräten. Auf iOS erkennt die App hängende Verbindungen nach dem Aufwachen und baut sie neu auf; bei fehlender Verbindung erscheint ein Offline-Banner.
- **Push:** Die JS-Hooks im Backend können die Web-Push-Verschlüsselung nicht selbst, deshalb übernimmt das der `push`-Container im internen Docker-Netz.
- **Jeopardy-Fragen** generiert das Backend über die Anthropic API — serverseitig, damit die Runde auch fertig wird, wenn das Handy gesperrt ist.
- **E-Mails** (Bestätigung, Passwort-Reset, Einladungen, Ansagen) laufen über den in PocketBase konfigurierten SMTP-Server. Die Bestätigungs- und Reset-Links zeigen auf die App, nicht aufs PocketBase-Dashboard.
- **Datenbank:** `pb_data` als Volume auf dem HTPC. Schema-Änderungen kommen als neue Migrationen in `backend/pb_migrations/` und laufen beim Container-Start automatisch.

## Deployment

Jeder Merge nach `master` deployt automatisch, etwa 2–3 Minuten später ist er live:

1. `.github/workflows/docker.yml` baut alle vier Images (amd64 + arm64) und pusht sie nach Docker Hub (`profdrdisco/boiz-weekend-*`)
2. Der `deploy`-Job ruft den Watchtower-Webhook auf dem HTPC auf
3. Watchtower zieht die neuen Images und startet die Container neu — Backend zuerst, dann Push-Sender, MCP und Frontend

Pushes auf `claude/**`-Branches werden von `.github/workflows/auto-pr.yml` automatisch als PR geöffnet, per Squash gemergt und deployt.

**GitHub-Secrets / Variablen:** `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `WATCHTOWER_TOKEN` (Secrets), `WATCHTOWER_URL` (Variable).

**Umgebungsvariablen auf dem HTPC** (Compose: `services/docker-compose-boiz-weekend.yml`):

| Container | Variablen |
|---|---|
| backend | `ANTHROPIC_API_KEY` bzw. `CLAUDE_OAUTH_TOKEN`, `JEOPARDY_MODEL` (optional), `VAPID_PUBLIC_KEY`, `PUSH_SENDER_URL`, `PUSH_SENDER_TOKEN`, `APP_URL`, `APP_FRONTEND_URL` (optional), `REQUIRE_EMAIL_VERIFICATION` (optional, `true` blockiert den Login bis zur Bestätigung) |
| push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_SENDER_TOKEN` |
| mcp | `MCP_PUBLIC_URL`, `BOIZ_PB_URL`, `MCP_STATE_FILE` — OAuth-Clients und Tokens liegen im Volume unter `/data` und überstehen Neustarts |

## Projekt-Struktur

```
Boiz-Weekend-Manager/
├── Dockerfile                  # Frontend: Vite-Build → nginx
├── nginx.conf                  # SPA-Fallback + Asset-Caching
├── src/
│   ├── App.jsx                 # Die gesamte App-Oberfläche
│   ├── App.css                 # Styles
│   ├── api.js                  # PocketBase-Zugriffe + Realtime
│   ├── modules.js              # Modul-Registry (Spiele & Tools)
│   ├── main.jsx                # Einstieg, PWA-Update, Offline-Banner
│   └── *Bank.js                # Fragen-, Challenge- und Flaggen-Kataloge
├── backend/
│   ├── Dockerfile
│   ├── pb_migrations/          # Datenbank-Schema
│   └── pb_hooks/               # Server-Logik (Push, Jeopardy, Einladungen, Werwolf, …)
├── push-sender/                # Web-Push-Container
├── mcp-server/                 # Claude-Anbindung (http.js gehostet, index.js lokal)
└── .github/workflows/          # docker.yml (Build + Deploy), auto-pr.yml
```

## Design

Dunkles „Electric"-Theme: Violett (`#8b7bff`) mit Cyan als Akzent auf blau getöntem Schwarz, Verläufe auf den Haupt-Buttons, runde Karten. Schriften: Bebas Neue für Überschriften, IBM Plex Mono für Zahlen und Labels, Manrope für Text. Optimiert fürs iPhone: Safe-Areas, kein Zoom, Eingabefelder bleiben über der Tastatur.

## License

MIT — frei zum Forken, Anpassen und Verwenden.
