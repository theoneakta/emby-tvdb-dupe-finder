# 🎬 Emby Duplicate Finder

A lightweight browser-based tool that scans your Emby movie libraries for duplicate files.

## Features

- **Same-folder detection** — flags multiple video files in the same folder, including nested subfolders
- **TVDB duplicate detection** — finds movies sharing the same TVDB ID in the same folder (true duplicates), ignoring remakes or metadata conflicts
- **Delete via Emby API** — delete duplicates directly from the browser using your Emby credentials
- **IMDb links** — each result links to the IMDb page for easy identification
- **Downloadable report** — export results per library as a `.txt` file

## Requirements

- An Emby server (tested on Emby 4.x)
- A valid Emby API key
- A local web server to serve the files (required to avoid CORS issues)

## Setup

1. Place `index.html` and `script.js` in the same folder.

2. Serve via a local web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

> ⚠️ Opening `index.html` directly as a `file://` URL will not work due to CORS restrictions.

## Usage

1. Enter your **Emby server URL** and **API key**
2. Enter your **admin username and password** — required to enable file deletion
3. Click **🧪 Test Connection** to verify
4. Click **🔍 Scan for Duplicates**

Results are grouped by library into two sections:

- **🔁 Same TVDB ID** — movies sharing the same TVDB ID within the same folder
- **📂 Multiple files in same folder** — folders containing more than one video file (including nested subfolders)

Check the files you want to remove, then click **🗑️ Delete selected**. A confirmation modal shows exactly what will be deleted before anything happens. After deletion, Emby's library is automatically refreshed.

## How duplicate detection works

### Same-folder detection
Every movie's file path (via `MediaSources`) is grouped by parent folder. Any folder with more than one video file is flagged. A second pass groups by the parent's parent folder to catch files nested one level deeper (e.g. `Fantasia (1940)/Fantasia/movie.avi`).

Recognised video extensions: `mkv`, `mp4`, `avi`, `m4v`, `mov`, `wmv`, `ts`, `m2ts`, `mpg`, `mpeg`, `flv`, `webm`, `iso`, `rmvb`.

### TVDB ID detection
Movies are grouped by TVDB provider ID. A group is only flagged if all items share the same parent folder — this prevents remakes (e.g. *The Karate Kid 1984* vs *2010*) from being incorrectly flagged due to metadata conflicts.

## File structure

```
├── index.html   # UI
├── script.js    # All logic
└── README.md
```

## Notes

- The tool is read-only until you provide credentials — scanning never modifies anything
- Large libraries are fetched in paginated batches of 100 items
- Deletion uses the Emby user-scoped API (`DELETE /emby/Users/{userId}/Items/{itemId}`) which requires a valid user session
- After deletion, an Emby library scan is triggered automatically