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

## ⚠️ Wichtig: Storage-Modell

Diese Version nutzt **`localStorage`** als Datenspeicher. Das heißt:

- ✅ Daten überleben Refreshes und Browser-Neustarts
- ❌ **Keine Synchronisation zwischen Geräten** — jedes Handy hat seine eigenen Daten

Für das echte Jungs-Wochenende, bei dem alle auf ihren eigenen Handys teilnehmen, braucht ihr ein gemeinsames Backend.

### Backend-Optionen für richtigen Multi-Device-Sync

| Option | Aufwand | Free-Tier | Best für |
|---|---|---|---|
| **Supabase** | mittel | ja | Postgres + REST + Realtime |
| **Firebase Realtime DB** | gering | ja | Live-Sync out of the box |
| **Cloudflare KV + Workers** | mittel | ja | Simpel und schnell |
| **Eigener Node-Server** | hoch | – | Volle Kontrolle |

Das Storage-Modul ist sauber abstrahiert (`src/storage.js`), sodass beim Backend-Swap nur diese eine Datei getauscht werden muss.

## Deployment auf GitHub Pages

1. Pushe auf GitHub (siehe unten).
2. In den Repo-Settings → **Pages** → Source auf **GitHub Actions** stellen.
3. Der Workflow in `.github/workflows/deploy.yml` baut und deployt automatisch bei jedem Push auf `master`.
4. App ist dann erreichbar unter `https://<dein-username>.github.io/Boiz-Weekend-Manager/`

## Projekt-Struktur

```
Boiz-Weekend-Manager/
├── .github/workflows/deploy.yml   # Auto-Deploy auf GitHub Pages
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
