# 🎬 Emby Duplicate Finder

A lightweight, browser-based tool that connects to your [Emby](https://emby.media/) media server, scans your movie libraries for duplicate files, and helps you clean them up — all without installing anything.

---

## Features

- **Duplicate detection by TVDB ID** — flags movies that share the same TVDB metadata ID and live in the same folder (avoids false positives like remakes sharing an ID across different folders)
- **Same-folder duplicate detection** — finds separate Emby items whose video files live in the same directory
- **Merged-source detection** — identifies Emby items that have multiple video files merged into a single entry
- **One-click deletion** — select files and delete them directly from Emby and disk via the API (requires admin credentials)
- **Downloadable reports** — export a plain-text duplicate report per library
- **Remember Me** — optionally saves credentials to `localStorage` for convenience
- **Connection test** — verify your server URL and API key before scanning

---

## Getting Started

### Prerequisites

- An Emby media server (tested against Emby 4.x)
- An Emby API key (generated in **Dashboard → Advanced → API Keys**)
- Admin username & password (only required if you want to delete files)

### Usage

1. Open `index.html` in any modern browser.
2. Fill in your **Server URL** (e.g. `http://192.168.1.10:8096`) and **API Key**.
3. *(Optional)* Enter your **Username** and **Password** to enable file deletion.
4. Click **🔍 Scan for Duplicates**.
5. Review the results grouped by library. Each duplicate set is expandable.
6. Check the files you want to remove, then click **🗑️ Delete selected**.

---

## Project Structure

```
.
├── index.html   # UI — form, styles, and layout
└── script.js    # Logic — API calls, duplicate detection, deletion flow
```

### `index.html`
Pure HTML/CSS single-page app. No build step, no frameworks. Styles are inlined for portability.

### `script.js`
Vanilla JavaScript. Key functions:

| Function | Description |
|---|---|
| `testConnection()` | Pings `/emby/System/Info` to validate the server URL and API key |
| `authenticateUser()` | Authenticates via `/emby/Users/AuthenticateByName` and returns an access token + user ID |
| `findDuplicates()` | Main scan: fetches all movie libraries, iterates movies, runs duplicate detection, renders results |
| `fetchLibraries()` | Calls `/emby/Library/VirtualFolders` to list all virtual libraries |
| `fetchMoviesFromLibrary()` | Paginates through `/emby/Items` (100 per page) to fetch all movies in a library |
| `findTvdbDuplicates()` | Groups movies by TVDB provider ID; flags groups where 2+ copies share the same folder |
| `findSameFolderDuplicates()` | Groups movies by folder path; also detects Emby-merged multi-source items |
| `executeDelete()` | Tries three DELETE endpoints in order to handle Emby version inconsistencies |
| `downloadDuplicates()` | Generates and downloads a `.txt` report for a library |

---

## Duplicate Detection Logic

### TVDB Duplicates
Movies are grouped by their `ProviderIds.Tvdb` value. A group is only flagged as duplicates if at least one folder contains **more than one copy** of that TVDB ID. This avoids flagging legitimate cases like a 1984 original and a 2010 remake that happen to share a metadata ID but live in separate folders.

### Same-Folder Duplicates
Two sub-cases are handled:

1. **Separate Emby items** — distinct library entries whose video files resolve to the same parent directory.
2. **Merged Emby items** — a single library entry with multiple `MediaSources` (Emby can merge versions). These are shown under a `merged:` label.

---

## Deletion

Deletion requires an admin **username and password** (not just an API key) because Emby's delete-with-file endpoint requires a user-scoped token.

The tool tries three API endpoints in order to handle differences across Emby 4.x versions:

1. `DELETE /emby/Users/{userId}/Items/{itemId}?deleteFiles=true` with `X-Emby-Token` header
2. `DELETE /emby/Items/{itemId}?deleteFiles=true&api_key={userToken}`
3. `DELETE /emby/Items/{itemId}?deleteFiles=true&api_key={apiKey}`

After a successful deletion, the tool automatically triggers a library refresh via `POST /emby/Library/Refresh`.

> ⚠️ **Deletion is permanent.** Files are removed from disk and cannot be recovered. Always review the confirmation modal carefully before proceeding.

---

## Supported Video Formats

The tool recognises these extensions when scanning `MediaSources`:

`mkv` · `mp4` · `avi` · `m4v` · `mov` · `wmv` · `ts` · `m2ts` · `mpg` · `mpeg` · `flv` · `webm` · `iso` · `rmvb`

---

## Security Notes

- Credentials stored via **Remember Me** are saved only in the browser's `localStorage` — they never leave your machine.
- The API key and user token are held in memory only for the duration of the page session.
- No backend server is involved; all requests go directly from your browser to your Emby instance.

---

## Browser Compatibility

Any modern browser with `fetch` and `localStorage` support (Chrome, Firefox, Edge, Safari).

---

## License

MIT — use freely, modify as needed.