# Kullr

A self-hosted dashboard that cross-references Tautulli session history with Plex-native watch state across **all users** to give you a complete picture of what's actually been watched — and lets you delete what's safe through one or more **Sonarr** and **Radarr** instances, including 4K side-by-side setups.

## The Problem

Tautulli only tracks sessions it actively observes. If it was down during a container restart, update, or array operation, those plays are lost forever. Plex maintains its own watch state, but it's per-user and buried behind multiple screens. This tool merges both data sources, highlights discrepancies, and gives you one-click deletion that goes through the right *arr instance.

## Features

- **Dual-source watch tracking** — Tautulli session history + Plex-native watch state side by side
- **Multi-user aggregation** — admin, Plex Home managed users, and shared users
- **Discrepancy detection** — flags items where Plex and Tautulli disagree
- **Inline TV drill-down** — expand seasons → episodes with per-episode dual-source status
- **Storage reclamation stats** — total size, never-watched, stale media, reclaimable storage
- **Smart filters & sorting** — search, library, watch status, discrepancies, staleness
- **Sonarr / Radarr deletion** — one-click delete for individual items, or bulk-select via checkboxes
- **Multiple *arr instances** — run separate Sonarr/Radarr per quality (e.g. main + 4K) and the dashboard auto-routes each item to the right one based on file path
- **Persistent config** — enter credentials once, stored in `/config` on the server, never re-entered
- **Single Docker image** — runs anywhere; first-class Unraid template

## Architecture

```
Browser ──► Express backend ──► Plex / Tautulli / Sonarr[] / Radarr[]
                  │
                  └─► /config/config.json   (persistent)
```

Credentials live server-side and are stamped into outbound API calls. The browser never sees an API key after the initial save.

## Install

### Option 1: Unraid (Community Apps template)

Every push to `main` builds and publishes an image to `ghcr.io/lluth0r/kullr:latest` via GitHub Actions ([.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)) — no local build needed.

Until this lands in Community Apps, install via the included template:

1. Open the Unraid web UI → Docker → Add Container → Template → paste `https://raw.githubusercontent.com/LLuth0r/kullr/main/unraid-template.xml`.
2. Adjust the WebUI port (default `8088`) and the appdata path (default `/mnt/user/appdata/kullr`), then Apply.
3. Browse to `http://[unraid-ip]:8088` and fill in the config form.

> **Note:** GitHub Container Registry packages default to **private**. After the first Actions run, go to the package page (linked from the repo sidebar) → Package settings → Change visibility → Public, or Unraid won't be able to pull it anonymously.

### Option 2: docker-compose

```bash
git clone <this repo>
cd kullr
docker compose up -d --build
# open http://localhost:8088
```

Edit `docker-compose.yml` to join your existing media network so containers like `sonarr`, `radarr`, `plex`, and `tautulli` are reachable by name.

### Option 3: bare-metal Node

```bash
# build
npm install && npm run build:all

# run
PORT=8080 CONFIG_DIR=./data node server/dist/index.js
```

## First-time configuration

Open the dashboard and you'll see the configuration screen:

- **Plex Server** — URL (e.g. `http://plex:32400`) and `X-Plex-Token`. For Unraid, the permanent token lives in `/mnt/user/appdata/plex/Library/Application Support/Plex Media Server/Preferences.xml` as `PlexOnlineToken`.
- **Tautulli** — URL and API key (Settings → Web Interface → API key).
- **Sonarr / Radarr (optional)** — add as many instances as you have (e.g. `Sonarr` + `Sonarr 4K`). Each needs URL + API key. Click **Test** on each — the dashboard fetches the instance's root folders and uses them to route deletions.

Click **Save & Continue**. The config is persisted to `/config/config.json` on the server. On future visits, the dashboard skips the form and goes straight to the data.

## Routing items to the right *arr instance

When you set up multiple instances (e.g. main Radarr + 4K Radarr), the dashboard matches each Plex item to its owning instance by **file-path prefix**. If a file lives under `/movies-4k/...` and your "Radarr 4K" instance has `/movies-4k` as its root folder, that's the instance the dashboard uses for delete/unmonitor actions.

Items whose path doesn't sit under any configured root folder show a `—` in the actions column with a tooltip explaining why.

## Deletion options

Per-row trash icon or bulk select via row checkboxes → confirmation modal with three flags:

- **Delete files from disk** — passes `deleteFiles=true` to Sonarr/Radarr (removes both files and the *arr DB entry)
- **Unmonitor** — sets `monitored=false` on the series/movie (so *arr won't re-grab it). Ignored if "Delete files" is also checked.
- **Add to import-list exclusion** — prevents auto re-add from import lists

The modal shows total reclaimable space and which *arr instance(s) will handle the request before you confirm.

## Development

```bash
# both web + api with live reload
npm install
npm --prefix server install
npm run dev
# web: http://localhost:4200 (proxies /api → :8080)
# api: http://localhost:8080
```

`ng serve` proxies `/api/*` to the backend via `proxy.conf.json`. Backend uses `tsx watch` for live reload.

### Repo layout

```
kullr/
├── server/                    # Express backend
│   └── src/
│       ├── config/            # persistent config (Zod-validated, atomic write)
│       ├── routes/            # /api/{config,plex,tautulli,arr,media}
│       ├── services/          # *arr client + path-prefix resolver
│       └── util/              # http + logger helpers
├── src/app/                   # Angular frontend
│   ├── core/{models,services} # ConfigService, PlexService (proxy), etc.
│   └── features/
│       ├── config/            # multi-instance config form
│       └── dashboard/         # stats, filters, table, delete modal, bulk bar
├── Dockerfile                 # multi-stage build
├── docker-compose.yml         # example
└── unraid-template.xml        # Community Apps template
```

## Backend API

| Method | Path | Notes |
|---|---|---|
| `GET`  | `/api/health` | Liveness probe |
| `GET`  | `/api/config` | Saved config, secrets masked |
| `PUT`  | `/api/config` | Saves config (refreshes *arr root folders) |
| `POST` | `/api/config/test` | Test a single block without saving |
| `*`    | `/api/plex/*` | Authenticated proxy (incl. `tv/api/v2/*` → plex.tv) |
| `GET`  | `/api/tautulli` | Authenticated proxy |
| `GET`  | `/api/arr/instances` | Lists configured *arr instances (no keys) |
| `POST` | `/api/media/resolve` | Maps `[{ratingKey, filePath, mediaType}]` → owning *arr instance |
| `POST` | `/api/media/delete` | Performs delete/unmonitor through the matched *arr |

All `/api/*` returns are JSON: `{ok: boolean, data?, error?}`.

## Security

This app is **trust-the-LAN by design** — no auth out of the box. That's the same posture as Sonarr/Radarr/Plex themselves. Fine on a home network, *not* safe to expose directly to the internet without an auth proxy in front (Authelia, Cloudflare Access, Nginx with basic auth, etc.).

The config file at `/config/config.json` contains your API keys in plaintext — same as Sonarr/Radarr's own configs. Permissions are set to `0600`.

## Limitations

- **Shared/friend users** (not Plex Home managed): per-user tokens can't be derived from the admin token alone, so their Plex watch state isn't captured. Tautulli still tracks their sessions.
- **Per-episode delete via Sonarr** isn't supported — deletion operates at series level. Per-season delete is technically possible but not yet wired up.
- **No auth** — see Security above.

## License

MIT
