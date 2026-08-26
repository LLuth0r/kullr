# Plan: Backend + Sonarr/Radarr + Docker

## Summary of changes

The current app is a pure Angular SPA that calls Plex/Tautulli APIs directly from the browser, with credentials re-entered every session. This work introduces a small Node/Express backend so we can (a) persist config to disk, (b) integrate Sonarr/Radarr (multiple instances each), (c) act on deletions through those services, and (d) ship the whole thing as a single Docker image suitable for Unraid.

---

## 1. Architecture shift

```
Before:
  Browser (Angular SPA) ──direct──► Plex / Tautulli

After:
  Browser (Angular SPA) ──► Express backend ──► Plex / Tautulli / Sonarr[] / Radarr[]
                                  │
                                  └─► /config/config.json  (persistent volume)
```

Why a backend (not localStorage):
- Survives browser data clears, works across devices on the LAN
- API keys never leave the server (browser only talks to our backend)
- Solves CORS once and for all (Sonarr/Radarr behind reverse proxies often block browser-origin requests)
- Required for a clean "set it and forget it" Unraid deployment

---

## 2. Repo layout (post-change)

```
kullr/
├── server/                          # NEW — Node/Express backend
│   ├── src/
│   │   ├── index.ts                 # Express bootstrap, static serve, /api routes
│   │   ├── config/
│   │   │   ├── store.ts             # Read/write /config/config.json (atomic)
│   │   │   └── schema.ts            # Zod schema + types shared with frontend
│   │   ├── routes/
│   │   │   ├── config.ts            # GET/PUT /api/config, POST /api/config/test
│   │   │   ├── plex.ts              # Proxy: GET /api/plex/*
│   │   │   ├── tautulli.ts          # Proxy: GET /api/tautulli/*
│   │   │   ├── sonarr.ts            # GET series, DELETE, PUT (unmonitor)
│   │   │   ├── radarr.ts            # GET movies, DELETE, PUT (unmonitor)
│   │   │   └── media.ts             # POST /api/media/delete (resolves *arr instance + acts)
│   │   ├── services/
│   │   │   ├── arr-resolver.ts      # path-prefix → instance lookup
│   │   │   └── arr-client.ts        # Thin Sonarr/Radarr v3 client
│   │   └── util/logger.ts
│   ├── tsconfig.json
│   └── package.json                 # Separate from Angular's; lives under server/
├── src/                             # Existing Angular app (mostly unchanged shape)
│   └── app/
│       ├── core/
│       │   ├── models/
│       │   │   ├── media.models.ts          # Existing (extended)
│       │   │   └── config.models.ts         # NEW — multi-instance config types
│       │   └── services/
│       │       ├── config.service.ts        # NEW — GET/PUT /api/config
│       │       ├── arr.service.ts           # NEW — delete/unmonitor calls
│       │       ├── tautulli.service.ts      # CHANGED — now hits /api/tautulli/*
│       │       └── plex.service.ts          # CHANGED — now hits /api/plex/*
│       └── features/
│           ├── config/                      # CHANGED — add Sonarr/Radarr instance arrays, prefilled from saved config
│           └── dashboard/components/
│               ├── delete-modal/            # NEW — confirmation dialog
│               ├── bulk-action-bar/         # NEW — appears when items checked
│               └── media-row/               # CHANGED — checkbox + delete button
├── Dockerfile                       # NEW — multi-stage (build Angular + build server, runtime: node:20-alpine)
├── docker-compose.yml               # NEW — example for Unraid users
├── unraid-template.xml              # NEW — Community Apps template
└── package.json                     # CHANGED — add scripts: `dev:server`, `dev:web`, `build:all`, `start`
```

---

## 3. Config schema (persisted at `/config/config.json`)

```ts
interface AppConfig {
  plex:     { url: string; token: string };
  tautulli: { url: string; apiKey: string };
  sonarr:   ArrInstance[];   // 0..N
  radarr:   ArrInstance[];   // 0..N
}

interface ArrInstance {
  id:           string;       // stable uuid, generated server-side
  name:         string;       // user-facing label, e.g. "Sonarr 4K"
  url:          string;       // e.g. http://sonarr-4k:8989
  apiKey:       string;
  rootFolders:  string[];     // auto-fetched from /api/v3/rootFolder on save, cached
  enabled:      boolean;      // soft-disable without deleting
}
```

- File is written atomically (temp file + rename) to avoid corruption on power loss.
- API keys are returned to the frontend masked (`••••••••1234`) on `GET /api/config`; full values only sent back on save.

---

## 4. *arr instance resolution

When a Plex item needs to be acted on:

1. Take the file path from Plex (`Media[0].Part[0].file`, e.g. `/movies-4k/Inception (2010)/Inception.mkv`).
2. Walk all enabled instances (correct media type — Sonarr for shows, Radarr for movies).
3. The instance whose `rootFolders` contains a prefix of the path wins.
4. Fall back: if no match, surface a clear "no *arr instance configured for this path" error in the UI rather than silently failing.
5. Once we know the instance, look up the series/movie by `path` (Sonarr/Radarr both index by path) — fastest match. Fallback: by IMDb/TMDB/TVDB ID parsed from the Plex GUID.

Resolution results are cached in-memory on the backend per session (cleared on config change).

---

## 5. Delete UX

Three orthogonal flags the user can pick in the modal:

| Flag | Default | What it does |
|---|---|---|
| Delete files from disk | ✅ on | Passes `deleteFiles=true` to *arr |
| Unmonitor (don't re-grab) | ✅ on | For movies: `monitored=false`. For shows: unmonitor whole series, or per-season if drilled down |
| Add to import-list exclusion | ❌ off | Prevents auto-re-add from lists |

Modal shows: title, library, file size to be reclaimed, which *arr instance will handle it.

Bulk action bar appears when ≥1 row is checked: "Delete N items (X.X GB)" → opens a single confirmation modal that lists everything.

---

## 6. Backend API surface

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/config` | Returns config with masked keys |
| `PUT`  | `/api/config` | Saves full config; tests every connection first; returns per-service status |
| `POST` | `/api/config/test` | Ad-hoc test of a single service block (used by "Test" buttons in form) |
| `GET`  | `/api/plex/*` | Pass-through to Plex (server adds token) |
| `GET`  | `/api/tautulli/*` | Pass-through to Tautulli (server adds API key) |
| `GET`  | `/api/arr/instances` | Lists configured Sonarr+Radarr instances (no keys) |
| `POST` | `/api/media/resolve` | Body: array of `{ratingKey, filePath, mediaType}` → returns matched instance per item |
| `POST` | `/api/media/delete` | Body: `{items: [...], deleteFiles, unmonitor, exclude}` → executes; returns per-item result |
| `GET`  | `/api/health` | Liveness probe for Docker |

All `/api/*` returns are JSON with `{ok: boolean, data?, error?}`.

---

## 7. Docker / Unraid

**Single image, single container, single port.** No nginx sidecar.

- `Dockerfile`: multi-stage build
  - Stage 1: `node:20-alpine`, run `npm ci && npm run build` (Angular → `dist/`)
  - Stage 2: `node:20-alpine`, copy compiled server + Angular `dist/` + `node_modules` (prod-only)
  - Express serves Angular static files at `/` and API at `/api/*`
  - `EXPOSE 8080`
  - `VOLUME /config`
  - `HEALTHCHECK` on `/api/health`
  - Runs as non-root user (uid 99, gid 100 — Unraid defaults)
- `docker-compose.yml`: example that drops into a typical *arr stack (same network as Plex/Sonarr/Radarr, container names resolvable as hostnames).
- `unraid-template.xml`: Community Apps template with fields for port, `/config` path, and `PUID`/`PGID`/`TZ` env vars (Unraid convention). I'll target the linuxserver.io conventions.

Config volume layout:
```
/config/
  config.json       # persistent state
  logs/server.log   # rotated
```

---

## 8. Frontend changes

- **Config page**: on init, `GET /api/config`. If `plex.url` and `tautulli.url` are populated, show a "Connected" summary card and a "Reconfigure" button instead of the empty form. Adds repeating sections for Sonarr/Radarr instances ("+ Add another instance"). Each instance has a "Test" button.
- **Routing**: if config exists and is valid, skip straight to dashboard. Add `/settings` route to get back to config page on demand.
- **Services**: `tautulli.service.ts` and `plex.service.ts` lose the user-supplied URL/token plumbing — they call relative paths `/api/plex/...` and `/api/tautulli/...`. The backend stamps in the credentials.
- **Media row**: add a leading checkbox column and a trailing delete button (trash icon). Disabled if no *arr instance matches the item's path (with a tooltip explaining why).
- **Bulk action bar**: floating bar at the bottom when selections exist, with "Delete N items" / "Clear selection".
- **Delete modal**: confirmation dialog; for multi-item, scrolling list of what's about to go.
- **Toast/alert system**: needed for surfacing per-item delete results (e.g., "5 succeeded, 1 failed: Inception — no Radarr instance for /movies-4k").

---

## 9. Security notes (for the README)

- Backend is **trust-the-LAN** by design — no auth out of the box. Fine on a home network behind a firewall; not safe to expose to the internet without putting it behind something like Authelia / Cloudflare Access. Will say so in the README.
- Config file has API keys in plaintext on disk. Same security model as Sonarr/Radarr themselves use. File is `chmod 600`.
- A future enhancement could add basic auth or a single shared password — out of scope for this pass.

---

## 10. Build order (when you give the green light)

1. **Backend skeleton + persistent config** — Express, config store, `GET/PUT /api/config`. Frontend config page reads/writes against it. End state: creds persist across restarts. *(Smallest shippable slice.)*
2. **Proxy Plex + Tautulli through backend** — frontend services point at `/api/plex/*` and `/api/tautulli/*`. App functionally identical, but creds no longer in the browser.
3. **Sonarr/Radarr config + read-only matching** — multi-instance config UI, root-folder fetch, `/api/media/resolve` endpoint. Dashboard shows which instance owns each item (no actions yet).
4. **Delete actions** — modal, single-item delete via `/api/media/delete`.
5. **Bulk select + bulk delete** — checkboxes, action bar, multi-item delete.
6. **Dockerfile + compose + Unraid template** — container build, README updates with install instructions.

Each step ends in a runnable, working app. We can ship after any of them.

---

## 11. Open questions / things I'm assuming

- **Tech**: keeping TypeScript everywhere; backend is plain Express (no Nest, no Fastify) for simplicity. Zod for config validation. Holler if you'd prefer something else.
- **Dev workflow**: `npm run dev` will spin up Angular dev server (port 4200) and backend (port 8080) concurrently, with Angular proxying `/api/*` to the backend. Production build serves Angular from Express directly.
- **Sonarr per-season delete**: Sonarr v3 doesn't have a clean "delete only these episode files" API. I'll support delete-whole-series and delete-whole-season (delete files in the folder + unmonitor episodes). Per-episode delete is doable but messier — defer unless you want it.
- **Tautulli is no longer strictly required** if we're going through Sonarr/Radarr for actions, but the dashboard still uses it for play history, so it stays in config as required.
