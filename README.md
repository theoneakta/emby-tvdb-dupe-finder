# 🎬 Emby Duplicate Finder

A lightweight, browser-based tool that connects directly to your [Emby](https://emby.media/) media server, scans your movie libraries for duplicate files, and helps you clean them up — no backend, no database, no installation required.

> All requests go straight from your browser to your Emby server. Nothing is sent to any third-party service.

---

## Features

- **TVDB duplicate detection** — flags movies that share the same TVDB metadata ID within the same folder (avoids false positives like remakes that happen to share an ID across different folders)
- **Same-folder duplicate detection** — finds separate Emby items whose video files live in the same directory
- **Merged-source detection** — identifies single Emby entries that have multiple video files merged into one item
- **One-click deletion** — select files and delete them from Emby and disk via the API (requires admin credentials)
- **Downloadable reports** — export a plain-text duplicate report per library
- **Remember Me** — optionally persists credentials in `localStorage` for convenience
- **Connection test** — verify your server URL and API key before scanning

---

## Prerequisites

- An **Emby media server** (tested against Emby 4.x)
- An **Emby API key** — Dashboard → Advanced → API Keys → New Key
- Admin **username + password** *(only required if you want to delete files)*

---

## Running locally (no install needed)

This is a pure static app — just open the HTML file in a browser.

```bash
git clone https://github.com/YOUR_USERNAME/emby-duplicate-finder.git
cd emby-duplicate-finder
```

Then open `index.html` directly:

| OS | Command |
|----|---------|
| macOS | `open index.html` |
| Linux | `xdg-open index.html` |
| Windows | Double-click `index.html` in Explorer, or `start index.html` in cmd |

> No server, no `npm install`, no build step. Any modern browser works.

**Optional — serve with a local HTTP server** (avoids any browser `file://` quirks):

```bash
# Python 3
python3 -m http.server 8766
# then open http://localhost:8766

# Node (npx, no install)
npx serve .
```

---

## Running with Docker

Serves the app via nginx. Useful for running it persistently on a NAS, homelab server, or VM so it's always accessible on your network.

### Quick start

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

## Usage

1. Enter your **Emby Server URL** (e.g. `http://192.168.1.10:8096`)
2. Enter your **API Key**
3. *(Optional)* Enter your **Username** and **Password** to enable file deletion
4. Click **🔍 Scan for Duplicates**
5. Browse results grouped by library — each duplicate set is expandable
6. Check files you want to remove, then click **🗑️ Delete selected**

---

## Duplicate detection logic

### TVDB duplicates
Movies are grouped by their `ProviderIds.Tvdb` value. A group is only flagged if at least one folder contains **more than one copy** of that TVDB ID — this prevents remakes that share a metadata ID but live in separate folders from being incorrectly flagged.

### Same-folder duplicates
Two sub-cases are handled:

1. **Separate Emby items** — distinct library entries whose video files resolve to the same parent directory
2. **Merged Emby items** — a single library entry with multiple `MediaSources` (Emby can merge versions of the same film); shown under a `merged:` label

---

## Deletion

Deletion requires admin **username and password** (not just an API key) because Emby's delete-with-file endpoint requires a user-scoped token.

The tool tries three API endpoints in order to handle differences across Emby 4.x versions:

1. `DELETE /emby/Users/{userId}/Items/{itemId}?deleteFiles=true` with `X-Emby-Token` header
2. `DELETE /emby/Items/{itemId}?deleteFiles=true&api_key={userToken}`
3. `DELETE /emby/Items/{itemId}?deleteFiles=true&api_key={apiKey}`

After a successful deletion, the tool automatically triggers a library refresh via `POST /emby/Library/Refresh`.

> ⚠️ **Deletion is permanent.** Files are removed from disk and cannot be recovered. Always review the confirmation modal before proceeding.

---

## Project structure

```
emby-duplicate-finder/
├── index.html          # UI — layout, styles, and inline rendering logic
├── script.js           # All API calls, duplicate detection, deletion flow
├── styles.css          # Base styles (legacy — current styles are inlined in index.html)
├── nginx.conf          # nginx config used by the Docker image
├── Dockerfile          # nginx:alpine image serving the static files
├── docker-compose.yml  # One-command Docker setup
└── .gitignore
```

### Key functions in `script.js`

| Function | Description |
|---|---|
| `testConnection()` | Pings `/emby/System/Info` to validate the server URL and API key |
| `authenticateUser()` | POST to `/emby/Users/AuthenticateByName`, returns access token + user ID |
| `findDuplicates()` | Main entry point — fetches libraries, iterates movies, runs detection, renders |
| `fetchLibraries()` | `GET /emby/Library/VirtualFolders` — lists all virtual libraries |
| `fetchMoviesFromLibrary()` | Paginates `GET /emby/Items` (100/page) to fetch all movies in a library |
| `findTvdbDuplicates()` | Groups movies by TVDB ID; flags groups with 2+ copies in the same folder |
| `findSameFolderDuplicates()` | Groups by folder path; detects both separate items and merged multi-source entries |
| `reviewSelected()` | Builds the confirmation modal listing selected files |
| `executeDelete()` | Tries 3 DELETE endpoints in order; triggers library refresh on success |
| `downloadDuplicates()` | Generates and downloads a `.txt` report for a library |

---

## Supported video formats

`mkv` · `mp4` · `avi` · `m4v` · `mov` · `wmv` · `ts` · `m2ts` · `mpg` · `mpeg` · `flv` · `webm` · `iso` · `rmvb`

---

## Security notes

- **Remember Me** stores credentials only in the browser's own `localStorage` — they never leave your machine
- The API key and user token are held in memory only for the duration of the page session
- No backend server is involved; all requests go directly from your browser to your Emby instance
- The Docker image is a read-only nginx static file server — no write access, no environment secrets needed

---

## Browser compatibility

Any modern browser with `fetch` and `localStorage` support: Chrome, Firefox, Edge, Safari.

---

## License

MIT — see [LICENSE](LICENSE).
