# 🎬 Emby Duplicate Finder

A lightweight, self-contained browser tool that connects directly to your [Emby](https://emby.media/) media server, scans your **movie and TV libraries** for duplicates, cross-references with **Radarr and Sonarr**, and helps you clean up files — no backend, no database, no installation required beyond Docker.

> All requests go straight from your browser to your Emby/Radarr/Sonarr servers. Nothing is sent to any third-party service.

---

## Features

### Movies Tab
- **Name + year duplicate detection** — normalises titles and groups by title + year across different folders
- **TVDB duplicate detection** — flags movies sharing the same TVDB metadata ID in the same folder
- **Same-folder duplicate detection** — finds separate Emby items whose files live in the same directory
- **Merged-source detection** — identifies single Emby entries with multiple video files merged into one item
- **Mixed-folder detection** — finds folders containing both Radarr-managed and unmanaged files
- **Radarr integration** — each file is tagged ✓ Radarr (exact match), ⚠ Radarr duplicate, or ✗ Not in Radarr
- **Select not in Radarr** — one click to select all unmanaged files for deletion

### TV Shows Tab
- **Episode-level duplicate detection** — groups by show + season + episode number, flags any with 2+ files
- **Sonarr integration** — each file is tagged ✓ Sonarr or ✗ Not in Sonarr at the episode file level
- **Select not in Sonarr** — one click to select all unmanaged episodes for deletion

### General
- **Emby custom tags** — displays your Emby metadata tags (Action, Horror, etc.) on each file
- **One-click deletion** — select files and delete from Emby and disk via the API
- **Downloadable reports** — export a plain-text duplicate report per library (Movies and TV)
- **Activity log** — collapsible panel showing all API calls, scan results, and deletions in real time
- **Connection test** — validates Emby, Radarr, and Sonarr connections before scanning
- **Remember Me** — optionally persists credentials in `localStorage`

---

## Prerequisites

- An **Emby media server** (tested against Emby 4.x)
- An **Emby API key** — Dashboard → Advanced → API Keys → New Key
- Admin **username + password** *(only required for file deletion)*
- *(Optional)* **Radarr** with API key — Settings → General → API Key
- *(Optional)* **Sonarr** with API key — Settings → General → API Key

---

## Running with Docker (recommended)

```bash
git clone https://github.com/YOUR_USERNAME/emby-duplicate-finder.git
cd emby-duplicate-finder

docker compose up -d --build
```

Open **http://localhost:8766** (or replace `localhost` with your server's IP).

### Change the port

Edit the left side of `ports` in `docker-compose.yml`:

```yaml
ports:
  - "8766:80"   # ← change 8766 to any free port
```

### Useful Docker commands

```bash
# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after pulling updates
docker compose down && git pull && docker compose up -d --build
```

---

## Running locally (no install needed)

Everything is self-contained in `index.html` — just open it in a browser:

| OS | Command |
|----|---------|
| macOS | `open index.html` |
| Linux | `xdg-open index.html` |
| Windows | Double-click `index.html` in Explorer |

Or serve with a local HTTP server to avoid any browser `file://` quirks:

```bash
# Python 3
python3 -m http.server 8766
# then open http://localhost:8766
```

---

## Usage

### Movies
1. Enter your **Emby Server URL** (e.g. `http://192.168.1.10:8096`) and **API Key**
2. *(Optional)* Enter **Username** and **Password** to enable file deletion
3. *(Optional)* Enter **Radarr URL** and **Radarr API Key**
4. *(Optional)* Enter **Sonarr URL** and **Sonarr API Key**
5. Click **Test Connection** to verify all services
6. Click **Scan Movies**
7. Browse results — each file shows its Radarr status and your Emby tags
8. Use **Select not in Radarr** to auto-select unmanaged files, then **Delete selected**

### TV Shows
1. Fill in Emby credentials (and optionally Sonarr)
2. Click **Scan TV Shows**
3. Results are grouped by show → season → episode number
4. Each file shows ✓ Sonarr or ✗ Not in Sonarr
5. Use **Select not in Sonarr** to auto-select unmanaged episodes, then **Delete selected**

---

## Duplicate detection logic

### Movies — Name + year
Grouped by normalised title + year. Normalisation strips punctuation, articles (`the`/`a`/`an`), and edition words (`Extended`, `Unrated`, `Remastered`, etc.). Only flagged if copies are in **different folders**.

### Movies — TVDB ID
Grouped by `ProviderIds.Tvdb`. Only flagged if a folder has **2+ copies** of the same TVDB ID (prevents remakes sharing an ID across different folders from being flagged).

### Movies — Same folder
Two sub-cases: (1) separate Emby items in the same directory, (2) a single Emby item with multiple `MediaSources` merged (shown as `merged:`).

### Movies — Mixed folder *(Radarr required)*
Scans all folders (not just duplicates) for any folder containing both a Radarr-managed file and an unmanaged file — the classic "manually downloaded next to a proper Radarr download" case.

### TV — Duplicate episodes
Groups by `SeriesName + Season number + Episode number`. Flags any group with 2+ files. Works across differently-named season folders (e.g. `Season 4` vs `Season 04`) since matching is done on Emby's metadata numbers, not folder names.

### Radarr matching
Radarr match requires both **filename** and **parent folder name** to match the file Radarr manages — immune to different mount paths between Radarr and Emby. Only movies where `hasFile: true` are considered managed.

### Sonarr matching
Sonarr match is done at the **episode file level** using filenames from `/api/v3/episodefile` — not just series-level TVDB IDs. This correctly identifies which specific episode files Sonarr tracks vs manual downloads.

---

## Deletion

Requires admin **username and password** (API key alone is not sufficient for deletion).

The tool tries three DELETE endpoints in order for Emby 4.x compatibility:

1. `DELETE /emby/Users/{userId}/Items/{itemId}?deleteFiles=true` with `X-Emby-Token` header
2. `DELETE /emby/Items/{itemId}?deleteFiles=true&api_key={userToken}`
3. `DELETE /emby/Items/{itemId}?deleteFiles=true&api_key={apiKey}`

After deletion, triggers `POST /emby/Library/Refresh` automatically.

> ⚠️ **Deletion is permanent.** Files are removed from disk and cannot be recovered. Always review the confirmation modal before proceeding.

---

## Project structure

```
emby-duplicate-finder/
├── index.html          # The entire app — UI, styles, and all logic self-contained
├── nginx.conf          # nginx config for the Docker image
├── Dockerfile          # nginx:alpine serving index.html
├── docker-compose.yml  # One-command Docker setup
└── .gitignore
```

> `script.js` and `styles.css` are legacy files from the original version — they are no longer used. Everything is inlined in `index.html`.

---

## Security notes

- **Remember Me** stores credentials only in your browser's `localStorage` — they never leave your machine
- API keys and tokens are held in memory for the page session only
- All requests go directly from your browser to your Emby/Radarr/Sonarr instances
- The Docker image is a read-only nginx static file server — no write access, no secrets needed

---

## Browser compatibility

Any modern browser with `fetch` and `localStorage` support: Chrome, Firefox, Edge, Safari.

---

## License

MIT
