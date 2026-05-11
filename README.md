# 🍺 Boiz Weekend Manager

> Die Web-App, um ein Jungs-Wochenende zu managen — Anmeldung, Essens- & Getränkewünsche, Live-Counter und Punkte-Leaderboard.

![Tech: React](https://img.shields.io/badge/react-18-61dafb?style=flat-square&logo=react&logoColor=white)
![Tech: Vite](https://img.shields.io/badge/vite-6-646cff?style=flat-square&logo=vite&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-f5a524?style=flat-square)

---

## Was es kann

- 🧔 **Anmeldung** mit Name + Avatar
- 🍴 **Essens- und Getränkewünsche** pro Person, inkl. Allergien
- 🍺 **Riesige Tap-Buttons** für Bier & Mische — ein Tipper = +1
- 🏆 **Live-Leaderboard** mit Punkten und Balken-Visualisierung
- 👥 **Crew-Übersicht** mit allen Wünschen auf einen Blick
- ⚙️ **Admin-Settings:** Event-Name, Datum, Labels, Punkte pro Drink, Reset

## Roadmap

- [ ] 🎯 Aktivitäten-Modul (Flunkyball, Cornhole, Go-Kart-Zeiten)
- [ ] 🧠 Quiz-Modul mit live Multiplayer
- [ ] 🗺️ Schnitzeljagd mit QR-Codes / GPS
- [ ] 📸 Foto-Wall mit Voting
- [ ] 🏆 Achievements & Badges
- [ ] ☁️ Echtes Backend für Multi-Device-Sync (Supabase oder Firebase)

## Quick Start

```bash
# Dependencies installieren
npm install

# Dev-Server starten
npm run dev

# Produktions-Build
npm run build

# Build lokal anschauen
npm run preview
```

Die App läuft dann unter `http://localhost:5173/Boiz-Weekend-Manager/`.

## Architektur

- **Frontend:** React + Vite, im Docker-Image als nginx-served Static Bundle
- **Backend:** PocketBase (SQLite + Auth + REST + Realtime + Admin-UI), eigenes Docker-Image
- **Auth:** E-Mail + Passwort, erster registrierter User wird automatisch Admin (über PB-Hook)
- **Rollen:** `admin` (Settings + User-Mgmt) und `member`. Rechte werden serverseitig über PocketBase API Rules durchgesetzt.
- **Realtime:** Counter und Crew-Liste poppen sofort auf allen Geräten hoch (PB SSE-Subscription).

### PocketBase Admin-UI

Unter `https://boiz-api.dr-disco.eu/_/` erreichbar. Beim ersten Start einen Superuser anlegen — getrennt von App-Usern.

## Self-Hosting via Docker

Die App wird bei jedem Push auf `master` als Docker-Image gebaut und nach Docker Hub gepusht (`<dockerhub-user>/boiz-weekend-manager:latest`). Auf dem HTPC läuft sie hinter Traefik unter `boiz.dr-disco.eu`. Watchtower zieht neue Images automatisch nachts.

**Einmalige Setup-Schritte:**

1. Docker-Hub-Account anlegen, Access Token erzeugen.
2. In den GitHub-Repo-Settings unter **Secrets and variables → Actions** zwei Secrets anlegen:
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`
3. Im Compose-File auf dem HTPC (`services/docker-compose-boiz-weekend.yml`) ggf. den Image-Namen an deinen Docker-Hub-User anpassen (Default: `profdrdisco/boiz-weekend-manager:latest`).
4. DNS-Record für `boiz.dr-disco.eu` auf den HTPC zeigen lassen.

## Projekt-Struktur

```
Boiz-Weekend-Manager/
├── Dockerfile                     # Multi-Stage: Vite-Build → nginx
├── nginx.conf                     # SPA-Fallback + asset caching
├── .github/workflows/docker.yml   # Build & push to Docker Hub
├── public/favicon.svg
├── src/
│   ├── App.jsx                    # Hauptkomponente
│   ├── App.css                    # Styles
│   ├── index.css                  # Globale Styles + Fonts
│   ├── main.jsx                   # Entry Point
│   └── storage.js                 # Storage-Abstraktion (localStorage)
├── index.html
├── package.json
├── vite.config.js
└── LICENSE
```

## Design

Dark Theme im "Stadium-Scoreboard"-Stil — Bebas Neue Display-Font, IBM Plex Mono für Stats und Labels, Manrope für UI-Texte. Amber/Gold als Akzent, Rot als Sekundär-Akzent. Subtle grain overlay.

## License

MIT — frei zum Forken, Anpassen und Verwenden.
