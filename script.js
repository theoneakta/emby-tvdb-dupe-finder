// script.js - Emby Duplicate Movie Finder (TVDB IDs + same-folder detection)

const VIDEO_EXTENSIONS = new Set(['mkv','mp4','avi','m4v','mov','wmv','ts','m2ts','mpg','mpeg','flv','webm','iso','rmvb']);

async function testConnection(event) {
    if (event) event.preventDefault();

    const url = document.getElementById('embyServerUrl').value.trim();
    const key = document.getElementById('apiKey').value.trim();

    if (!url || !key) {
        alert('Enter URL + API key first');
        return;
    }

    try {
        const base = url.startsWith('http') ? url : 'http://' + url;
        const resp = await fetch(`${base}/emby/System/Info?api_key=${key}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        const data = await resp.json();
        alert(`✅ Success! Emby ${data.Version} on ${data.OperatingSystem}`);
    } catch (e) {
        alert('❌ Failed: ' + e.message + '\n\nCheck URL/port/protocol/API key');
    }
}

async function findDuplicates(event) {
    if (event) event.preventDefault();

    let embyServerUrl = document.getElementById('embyServerUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const resultsDiv = document.getElementById('results');
    const loadingOverlay = document.getElementById('loading-overlay');
    const prog = document.getElementById('progress');

    resultsDiv.innerHTML = '';

    // Validate before doing anything — no throws, just return
    if (!apiKey) {
        resultsDiv.innerHTML = '<p style="color:red;font-weight:700">❌ API Key is required.</p>';
        return;
    }
    if (!embyServerUrl) {
        resultsDiv.innerHTML = '<p style="color:red;font-weight:700">❌ Server URL is required.</p>';
        return;
    }

    if (!/^https?:\/\//i.test(embyServerUrl)) {
        embyServerUrl = 'http://' + embyServerUrl;
    }

    loadingOverlay.classList.remove('hidden');
    prog.textContent = '0%';

    try {
        const libraries = await fetchLibraries(embyServerUrl, apiKey);

        const movieLibraries = libraries.filter(lib => lib.CollectionType === 'movies');

        const duplicateResults = [];

        for (let i = 0; i < movieLibraries.length; i++) {
            const library = movieLibraries[i];
            // VirtualFolders uses ItemId; SelectableMediaFolders used Id
            const libId = library.ItemId || library.Id;
            const movies = await fetchMoviesFromLibrary(embyServerUrl, apiKey, libId);

            prog.textContent = (((i + 1) / movieLibraries.length) * 100 | 0) + '%';

            const tvdbDuplicates = findTvdbDuplicates(movies);
            const folderDuplicates = findSameFolderDuplicates(movies);

            const tvdbCount = Object.keys(tvdbDuplicates).length;
            const folderCount = Object.keys(folderDuplicates).length;

            if (tvdbCount > 0 || folderCount > 0) {
                duplicateResults.push({
                    libraryName: library.Name,
                    tvdbDuplicates,
                    folderDuplicates,
                    tvdbCount,
                    folderCount
                });
            }
        }

        displayResults(duplicateResults);
    } catch (error) {
        console.error('Full error:', error);
        resultsDiv.innerHTML = `
            <p style="color:red;font-weight:700">❌ ${error.message}</p>
            <details style="margin-top:10px;">
                <summary>Debug info (click to expand)</summary>
                <pre>${error.stack || 'No stack trace'}</pre>
            </details>`;
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

async function fetchLibraries(embyServerUrl, apiKey) {
    // /Library/VirtualFolders returns CollectionType correctly; SelectableMediaFolders does not
    const url = `${embyServerUrl}/emby/Library/VirtualFolders?api_key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Libraries fetch failed (${response.status}): ${response.statusText}. Check API key, server URL, and CORS.`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

async function fetchMoviesFromLibrary(embyServerUrl, apiKey, libraryId) {
    let allMovies = [];
    let startIndex = 0;
    const limit = 100;

    while (true) {
        // MediaSources is needed to detect multiple files merged into one Emby item
        const url = `${embyServerUrl}/emby/Items?Recursive=true&ParentId=${libraryId}&IncludeItemTypes=Movie&Fields=Path,ProductionYear,ProviderIds,MediaSources&StartIndex=${startIndex}&Limit=${limit}&api_key=${apiKey}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Movies fetch failed (${response.status}) for library ${libraryId}`);
        }

        const data = await response.json();
        const movies = data.Items || [];
        allMovies = allMovies.concat(movies);

        if (!data.TotalRecordCount || movies.length < limit) break;
        startIndex += limit;
    }

    return allMovies;
}

function movieToEntry(movie) {
    // Path is sometimes absent at item level; fall back to first MediaSource path
    const sourcePaths = (movie.MediaSources || [])
        .map(s => s.Path)
        .filter(Boolean);
    const path = movie.Path || sourcePaths[0] || 'No path';
    const filename = path.split('/').pop().split('\\').pop();
    return {
        name: movie.Name || 'Unknown',
        path,
        filename,
        year: movie.ProductionYear || 'N/A',
        tvdb: movie.ProviderIds?.Tvdb || '',
        imdb: movie.ProviderIds?.Imdb || '',
    };
}

function getFolder(filePath) {
    if (!filePath) return null;
    // Works for both / and \ separators
    const parts = filePath.replace(/\\/g, '/').split('/');
    parts.pop(); // remove filename
    return parts.join('/') || '/';
}

function getExtension(filePath) {
    if (!filePath) return '';
    // Use regex to safely grab extension, ignoring spaces and special chars
    const match = filePath.match(/\.([a-z0-9]{2,5})$/i);
    return match ? match[1].toLowerCase() : '';
}

function findTvdbDuplicates(movies) {
    // First group by TVDB ID
    const byTvdb = {};
    movies.forEach(movie => {
        const tvdbId = movie.ProviderIds?.Tvdb;
        if (!tvdbId) return;
        if (!byTvdb[tvdbId]) byTvdb[tvdbId] = [];
        byTvdb[tvdbId].push(movieToEntry(movie));
    });

    const duplicates = {};
    for (const [tvdbId, items] of Object.entries(byTvdb)) {
        if (items.length < 2) continue;

        // Only flag as duplicate if ALL items share the same parent folder
        // Different folders = different movies with a TVDB metadata conflict
        const folders = items.map(item => getFolder(item.path));
        const allSameFolder = folders.every(f => f === folders[0]);

        if (allSameFolder) {
            duplicates[tvdbId] = items;
        }
    }
    return duplicates;
}

function findSameFolderDuplicates(movies) {
    const byFolder = {};

    movies.forEach(movie => {
        const name = movie.Name || 'Unknown';
        const year = movie.ProductionYear || 'N/A';

        // Get all real file paths: prefer MediaSources, fall back to item Path
        const sources = movie.MediaSources || [];
        let paths = sources
            .map(s => s.Path)
            .filter(p => p && VIDEO_EXTENSIONS.has(getExtension(p)));

        if (paths.length === 0 && movie.Path && VIDEO_EXTENSIONS.has(getExtension(movie.Path))) {
            paths.push(movie.Path);
        }

        // Add every path into the folder bucket
        paths.forEach(p => {
            const folder = getFolder(p);
            if (!folder) return;
            if (!byFolder[folder]) byFolder[folder] = [];
            byFolder[folder].push({ name, path: p, year });
        });
    });

    // Debug: log everything we grouped

    // Only return folders with more than one video file
    const duplicates = {};
    for (const [folder, items] of Object.entries(byFolder)) {
        if (items.length > 1) duplicates[folder] = items;
    }
    return duplicates;
}

function displayResults(duplicateResults) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    if (duplicateResults.length === 0) {
        resultsDiv.innerHTML = '<p style="color:green;font-size:18px;">✅ No duplicates found in any movie library!</p>';
        return;
    }

    duplicateResults.forEach((result, index) => {
        const libraryBox = document.createElement('div');
        libraryBox.className = 'library-box';
        libraryBox.style.animationDelay = `${index * 0.1}s`;

        // --- TVDB duplicates section ---
        let tvdbHtml = '';
        if (result.tvdbCount > 0) {
            tvdbHtml += `<h4 style="margin:10px 0 5px">🔁 Same TVDB ID (${result.tvdbCount} set${result.tvdbCount !== 1 ? 's' : ''})</h4>`;
            for (const [tvdbId, items] of Object.entries(result.tvdbDuplicates)) {
                const label = `${items[0].name} (${items[0].year}) — ${items.length} copies`;
                tvdbHtml += `<details><summary>${label}</summary><ul style="margin:8px 0;padding-left:20px;">`;
                items.forEach(item => {
                    const imdbLink = item.imdb ? `<a href="https://www.imdb.com/title/${item.imdb}" target="_blank" style="margin-left:6px;font-size:11px">IMDb</a>` : '';
                    tvdbHtml += `<li style="margin-bottom:8px">
                        <strong>${item.filename || item.name}</strong>${imdbLink}<br>
                        <span style="color:#666;font-size:12px">📁 ${item.path}</span>
                    </li>`;
                });
                tvdbHtml += '</ul></details>';
            }
        }

        // --- Same-folder duplicates section ---
        let folderHtml = '';
        if (result.folderCount > 0) {
            folderHtml += `<h4 style="margin:15px 0 5px">📂 Multiple files in same folder (${result.folderCount} folder${result.folderCount !== 1 ? 's' : ''})</h4>`;
            for (const [folder, items] of Object.entries(result.folderDuplicates)) {
                const shortFolder = folder.length > 60 ? '…' + folder.slice(-57) : folder;
                folderHtml += `<details><summary>${shortFolder} — ${items.length} files</summary><ul style="margin:8px 0;padding-left:20px;">`;
                items.forEach(item => {
                    folderHtml += `<li style="margin-bottom:8px">
                        <strong>${item.filename || item.name}</strong><br>
                        <span style="color:#666;font-size:12px">📁 ${item.path}</span>
                    </li>`;
                });
                folderHtml += '</ul></details>';
            }
        }

        const totalSets = result.tvdbCount + result.folderCount;
        libraryBox.innerHTML = `
            <h3>📁 ${result.libraryName}</h3>
            <p><strong>🔍 ${totalSets} duplicate set${totalSets !== 1 ? 's' : ''} found</strong></p>
            <div style="margin:15px 0;">${tvdbHtml}${folderHtml}</div>
            <button class="download-btn" onclick="downloadDuplicates(${JSON.stringify(result).replace(/"/g, '&quot;')})">📥 Download TXT</button>
        `;
        resultsDiv.appendChild(libraryBox);
    });
}



function downloadDuplicates(result) {
    let content = `Emby Duplicates Report - Library: ${result.libraryName}\nGenerated: ${new Date().toISOString()}\n\n`;

    if (result.tvdbCount > 0) {
        content += `=== SAME TVDB ID (${result.tvdbCount} sets) ===\n\n`;
        for (const [tvdbId, items] of Object.entries(result.tvdbDuplicates)) {
            content += `TVDB ${tvdbId} — ${items.length} copies:\n`;
            items.forEach((item, idx) => {
                content += `  ${idx + 1}. "${item.name}" (${item.year})\n     ${item.path}\n`;
            });
            content += '\n';
        }
    }

    if (result.folderCount > 0) {
        content += `=== MULTIPLE FILES IN SAME FOLDER (${result.folderCount} folders) ===\n\n`;
        for (const [folder, items] of Object.entries(result.folderDuplicates)) {
            content += `Folder: ${folder}\n`;
            items.forEach((item, idx) => {
                content += `  ${idx + 1}. "${item.name}" (${item.year})\n     ${item.path}\n`;
            });
            content += '\n';
        }
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emby_${result.libraryName.replace(/[^a-zA-Z0-9]/g, '_')}_duplicates_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
