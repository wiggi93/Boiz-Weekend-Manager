# Boiz Weekend Manager — Agent Instructions

You are working on a React + Vite frontend with a PocketBase backend that powers a private "boys' weekend" event-tracking PWA. Real users are the maintainer (`@wiggi93`) and a handful of his friends.

## Tech stack at a glance

- **Frontend**: React 18, Vite 6, vite-plugin-pwa, lucide-react. Single source file `src/App.jsx`, helpers in `src/api.js`, modules registry in `src/modules.js`, styling in `src/App.css`. Production = nginx serving the static bundle.
- **Backend**: PocketBase v0.38 in a thin Docker wrapper (`backend/Dockerfile`). Schema lives in `backend/pb_migrations/`, hooks (JS) in `backend/pb_hooks/main.pb.js`. SQLite under `/pb_data` (volume-mounted on the HTPC).
- **Build**: GitHub Actions (`.github/workflows/docker.yml`) builds multi-arch images on every push to `master` and pushes to Docker Hub (`profdrdisco/boiz-weekend-manager`, `profdrdisco/boiz-weekend-backend`). A `deploy` job then calls a Watchtower HTTP API webhook on the HTPC which pulls + recreates the boiz containers automatically. **No manual `docker pull` needed after merging.**
- **Auth model**: PocketBase users with three global roles — `admin` (everything), `host` (can create events), `member` (can only join). Inside an event, the creator can also delegate "event-host" rights via `events.hostUsers` (json array).

## Data model essentials

- `users` (PB auth collection, extended) — `displayName`, `emoji`, `role`, food/drink/allergy wishes
- `events` — name, date, code, active, modules[], hostUsers[], createdBy, ...
- `event_members` — (event, user) join with unique index
- `stats` — (event, user) drink counters (`beer`, `mische`)
- `flunky` — one row per event, points-per-win + `games[]`
- `custom_modules` — multi-row per event, generic competitions

API rules enforce that:
- Members can only edit their own stats / profile
- Event hosts can update event live state, modules, score games, kick members
- Only the event creator (or a site admin) can change `createdBy` / `hostUsers` (enforced by a hook guard, see `pb_hooks/main.pb.js`)
- Only site admins can change global user roles

## Maintainer's working preferences

1. **Act directly, no permission-asking.** Maintainer has said multiple times he wants commits/pushes/PRs/merges to happen autonomously. Don't ask "should I commit?" — just do it.
2. **Always open a PR _yourself_ and enable auto-merge.** Don't leave a "click here to open a PR" link for the user. The full sequence at the end of every task is:
   ```bash
   git checkout -b <type>/<short-slug>
   git add -A
   git commit -m "..."
   git push -u origin HEAD
   gh pr create --title "..." --body "..."
   gh pr merge --squash --delete-branch --auto
   ```
   `gh` is pre-authenticated via the `GH_TOKEN` env (no `gh auth login` needed). `--auto` waits for required CI checks; if none are required, merges immediately. If anything in the chain errors, fix and retry — do not just push to a branch and stop.
3. **One feature = one branch + one PR**, even when working from `master`. Branch names: `feat/...`, `fix/...`, `chore/...`, `perf/...`, `ci/...`.
4. **PR descriptions: include a Summary, What changed, and a Test plan checklist.** Look at recent PRs (`gh pr list --state merged --limit 5`) for the established format.
5. **Speak German in user-facing strings and toasts**; commit messages and PR bodies in English.
6. **Don't add files (esp. docs) unless asked.** Edit existing ones.
7. **PWA + iOS friendliness matters**: respect `100dvh`, safe-area-insets, no zoom (already blocked in `main.jsx`), counters and toggles must feel native (optimistic UI, debounced writes for rapid taps).

## After-merge auto-deploy chain

Push to master → `docker.yml` builds amd64+arm64 → Docker Hub → Watchtower HTTP API on `wt.dr-disco.eu` (token in repo variable `WATCHTOWER_URL` + secret `WATCHTOWER_TOKEN`) → HTPC pulls + recreates `boiz-weekend-backend` first, then `boiz-weekend-manager`. End-to-end ~2 min after merge.

If you change the backend schema or hooks, the Watchtower step will redeploy the backend image which runs new migrations on container start. No manual migration step needed.

## Commands

- `npm install` then `npm run dev` for local dev
- `npm run build` to verify production bundle compiles
- `npm run generate-pwa-assets` if `public/pwa-icon.svg` changes
- `gh pr create --title "..." --body "$(cat <<'EOF' ... EOF)"` for PRs (see existing for format)
- `gh pr merge --squash --delete-branch --auto` to enable auto-merge

## Hard rules

- **Never** push directly to `master` for code changes. Open a PR and auto-merge instead. (Tiny chore commits like config tweaks are OK direct.)
- **Never** skip git hooks (`--no-verify`) or signing flags unless explicitly told.
- **Never** modify `.env` files on the SMB share from the GitHub Action — you don't have access. Mention in the PR description if a manual `.env` change on the HTPC is required.
- Pre-existing migration files are **immutable** — write a new one to alter the schema, never edit a past migration.
- Keep `src/App.jsx` and `src/App.css` as the canonical files. Don't split them into many small components unless the file becomes truly unmanageable.
