# 🎬 Emby Duplicate Finder

A lightweight browser-based tool that scans your Emby movie libraries for duplicate files and TVDB ID conflicts.

## Features

- **Same-folder detection** — flags multiple video files sitting in the same folder, even when Emby treats them as separate library items
- **TVDB duplicate detection** — finds movies that share the same TVDB ID *and* the same folder (true duplicates), while ignoring remakes or sequels that happen to share a metadata ID
- **IMDb links** — each result includes a direct link to the IMDb page for easy identification
- **Downloadable report** — export results per library as a `.txt` file
- **Test connection** — verify your server URL and API key before scanning

## Requirements

- An Emby server (tested on Emby 4.x)
- A valid Emby API key
- A local web server to serve the files (required to avoid CORS issues)

## Setup

1. Clone or download this repository so you have `index.html` and `script.js` in the same folder.

2. Serve the files via a local web server. The simplest way is with Python:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

> ⚠️ Opening `index.html` directly as a `file://` URL will not work due to browser CORS restrictions.

## Usage

1. Enter your **Emby server URL** including port, e.g. `http://192.168.1.10:8096` or `https://emby.example.com:8920`
2. Enter your **API key** — generate one in Emby under **Settings → API Keys**
3. Click **🧪 Test Connection** to verify everything is working
4. Click **🔍 Scan Duplicates** to start the scan

Results are grouped by library and split into two sections:

- **🔁 Same TVDB ID** — movies sharing the same TVDB ID within the same folder
- **📂 Multiple files in same folder** — folders containing more than one recognised video file

Click **📥 Download TXT** to save the results for a library as a text report.

## How Duplicate Detection Works

### Same-folder detection
Every movie item's file path (via `MediaSources`) is extracted and grouped by parent folder. Any folder containing more than one video file is flagged.

Recognised video extensions: `mkv`, `mp4`, `avi`, `m4v`, `mov`, `wmv`, `ts`, `m2ts`, `mpg`, `mpeg`, `flv`, `webm`, `iso`, `rmvb`.

### TVDB ID detection
Movies are grouped by their TVDB provider ID. A group is only flagged as a duplicate if **all items share the same parent folder** — this prevents remakes and sequels (e.g. *The Karate Kid 1984* vs *2010*) from being incorrectly flagged due to TVDB metadata conflicts.

## File Structure

```
├── index.html   # UI
├── script.js    # All logic
└── README.md
```

## Notes

- The tool is read-only — it does not delete or modify anything on your server
- Large libraries are fetched in paginated batches of 100 items
- The scan progress is shown as a percentage while running