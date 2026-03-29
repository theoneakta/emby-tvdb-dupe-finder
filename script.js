// script.js - Emby Duplicate Movie Finder

const VIDEO_EXTENSIONS = new Set(['mkv','mp4','avi','m4v','mov','wmv','ts','m2ts','mpg','mpeg','flv','webm','iso','rmvb']);

// Global state
let _embyUrl   = '';
let _apiKey    = '';
let _userToken = '';
let _userId    = '';

// ─── Remember Me ─────────────────────────────────────────────────────────────

function saveCredentials() {
    const remember = document.getElementById('rememberMe').checked;
    if (remember) {
        localStorage.setItem('emby_creds', JSON.stringify({
            serverUrl: document.getElementById('embyServerUrl').value.trim(),
            apiKey:    document.getElementById('apiKey').value.trim(),
            username:  document.getElementById('embyUsername').value.trim(),
            password:  document.getElementById('embyPassword').value,
        }));
    } else {
        localStorage.removeItem('emby_creds');
    }
}

function loadCredentials() {
    try {
        const saved = localStorage.getItem('emby_creds');
        if (!saved) return;
        const creds = JSON.parse(saved);
        if (creds.serverUrl) document.getElementById('embyServerUrl').value = creds.serverUrl;
        if (creds.apiKey)    document.getElementById('apiKey').value          = creds.apiKey;
        if (creds.username)  document.getElementById('embyUsername').value    = creds.username;
        if (creds.password)  document.getElementById('embyPassword').value    = creds.password;
        document.getElementById('rememberMe').checked = true;
    } catch (_) {}
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConnection(event) {
    if (event) event.preventDefault();
    const url = document.getElementById('embyServerUrl').value.trim();
    const key = document.getElementById('apiKey').value.trim();
    if (!url || !key) { alert('Enter URL + API key first'); return; }
    try {
        const base = url.startsWith('http') ? url : 'http://' + url;
        const resp = await fetch(`${base}/emby/System/Info?api_key=${key}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        const data = await resp.json();
        alert(`✅ Connected! Emby ${data.Version} on ${data.OperatingSystem}`);
    } catch (e) {
        alert('❌ Failed: ' + e.message + '\n\nCheck URL / port / API key');
    }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authenticateUser(embyServerUrl, username, password) {
    const resp = await fetch(`${embyServerUrl}/emby/Users/AuthenticateByName`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Emby-Authorization': 'MediaBrowser Client="EmbyDuplicateFinder", Device="Browser", DeviceId="emby-dup-finder-1", Version="1.0.0"',
        },
        body: JSON.stringify({ Username: username, Pw: password }),
    });
    if (!resp.ok) throw new Error(`Login failed (${resp.status}): ${await resp.text().catch(() => resp.statusText)}`);
    const data = await resp.json();
    // Emby returns { AccessToken, User: { Id, Name, ... } }
    const token  = data.AccessToken;
    const userId = data.User?.Id || data.SessionInfo?.UserId || data.UserId;
    if (!token)  throw new Error('No access token in response');
    if (!userId) throw new Error('No user ID in response — check Emby logs');
    return { token, userId };
}

// ─── Main scan ────────────────────────────────────────────────────────────────

async function findDuplicates(event) {
    if (event) event.preventDefault();

    let embyServerUrl = document.getElementById('embyServerUrl').value.trim();
    const apiKey      = document.getElementById('apiKey').value.trim();
    const resultsDiv  = document.getElementById('results');
    const prog        = document.getElementById('progress');

    resultsDiv.innerHTML = '';
    saveCredentials();

    if (!apiKey)        { resultsDiv.innerHTML = '<p style="color:red;font-weight:700">❌ API Key is required.</p>'; return; }
    if (!embyServerUrl) { resultsDiv.innerHTML = '<p style="color:red;font-weight:700">❌ Server URL is required.</p>'; return; }
    if (!/^https?:\/\//i.test(embyServerUrl)) embyServerUrl = 'http://' + embyServerUrl;

    _embyUrl = embyServerUrl;
    _apiKey  = apiKey;

    // Authenticate for user token (required for delete API)
    const username = document.getElementById('embyUsername').value.trim();
    const password = document.getElementById('embyPassword').value;
    if (username) {
        try {
            const auth = await authenticateUser(embyServerUrl, username, password);
            _userToken = auth.token;
            _userId    = auth.userId;
        } catch (e) {
            resultsDiv.innerHTML = `<p style="color:red;font-weight:700">❌ ${e.message}</p>`;
            return;
        }
    } else {
        _userToken = '';
        _userId    = '';
    }

    document.getElementById('loading-overlay').classList.remove('hidden');
    prog.textContent = '0%';

    try {
        const libraries      = await fetchLibraries(embyServerUrl, apiKey);
        const movieLibraries = libraries.filter(lib => lib.CollectionType === 'movies');
        const duplicateResults = [];

        for (let i = 0; i < movieLibraries.length; i++) {
            const library = movieLibraries[i];
            const libId   = library.ItemId || library.Id;
            const movies  = await fetchMoviesFromLibrary(embyServerUrl, apiKey, libId);
            prog.textContent = (((i + 1) / movieLibraries.length) * 100 | 0) + '%';

            const tvdbDuplicates   = findTvdbDuplicates(movies);
            const folderDuplicates = findSameFolderDuplicates(movies);
            const tvdbCount        = Object.keys(tvdbDuplicates).length;
            const folderCount      = Object.keys(folderDuplicates).length;

            if (tvdbCount > 0 || folderCount > 0) {
                duplicateResults.push({ libraryName: library.Name, tvdbDuplicates, folderDuplicates, tvdbCount, folderCount });
            }
        }
        displayResults(duplicateResults);
    } catch (error) {
        resultsDiv.innerHTML = `<p style="color:red;font-weight:700">❌ ${error.message}</p>
            <details><summary>Debug info</summary><pre>${error.stack || ''}</pre></details>`;
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchLibraries(url, key) {
    const resp = await fetch(`${url}/emby/Library/VirtualFolders?api_key=${key}`);
    if (!resp.ok) throw new Error(`Libraries fetch failed (${resp.status}): ${resp.statusText}`);
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
}

async function fetchMoviesFromLibrary(url, key, libraryId) {
    let all = [], start = 0;
    while (true) {
        const resp = await fetch(`${url}/emby/Items?Recursive=true&ParentId=${libraryId}&IncludeItemTypes=Movie&Fields=Path,ProductionYear,ProviderIds,MediaSources&StartIndex=${start}&Limit=100&api_key=${key}`);
        if (!resp.ok) throw new Error(`Movies fetch failed (${resp.status})`);
        const data = await resp.json();
        all = all.concat(data.Items || []);
        if (!data.TotalRecordCount || (data.Items || []).length < 100) break;
        start += 100;
    }
    return all;
}

// ─── Entry helpers ────────────────────────────────────────────────────────────

function movieToEntry(movie) {
    const sourcePaths = (movie.MediaSources || []).map(s => s.Path).filter(Boolean);
    const path   = movie.Path || sourcePaths[0] || '';
    const parts  = path.replace(/\\/g, '/').split('/');
    const filename = parts.pop() || path;
    const folder   = parts.join('/');
    return { id: movie.Id, name: movie.Name || 'Unknown', path, folder, filename, year: movie.ProductionYear || 'N/A', imdb: movie.ProviderIds?.Imdb || '' };
}

function getFolder(p) {
    if (!p) return null;
    const parts = p.replace(/\\/g, '/').split('/');
    parts.pop();
    return parts.join('/') || '/';
}

function getExtension(p) {
    const m = p && p.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : '';
}


// ─── Duplicate detection ──────────────────────────────────────────────────────

function findTvdbDuplicates(movies) {
    const byTvdb = {};
    movies.forEach(m => {
        const id = m.ProviderIds?.Tvdb;
        if (!id) return;
        if (!byTvdb[id]) byTvdb[id] = [];
        byTvdb[id].push(movieToEntry(m));
    });
    const out = {};
    for (const [id, items] of Object.entries(byTvdb)) {
        if (items.length < 2) continue;
        const folders = items.map(i => getFolder(i.path));
        const folderCounts = {};
        folders.forEach(f => { folderCounts[f] = (folderCounts[f] || 0) + 1; });
        const hasFolderDupe = Object.values(folderCounts).some(c => c > 1);

        if (hasFolderDupe) {
            // At least one folder has 2+ copies of this TVDB ID
            // Show ALL copies (including the one in a different folder) so user sees the full picture
            out[id] = items;
        }
        // If no folder has dupes but TVDB appears in multiple folders = different movies
        // sharing a metadata ID (Karate Kid 1984 vs 2010) — do NOT flag
    }
    return out;
}

function findSameFolderDuplicates(movies) {
    const byExact = {};
    const mergedItems = [];

    movies.forEach(movie => {
        const sources = movie.MediaSources || [];
        let paths = sources.map(s => s.Path).filter(p => p && VIDEO_EXTENSIONS.has(getExtension(p)));
        if (!paths.length && movie.Path && VIDEO_EXTENSIONS.has(getExtension(movie.Path))) paths.push(movie.Path);

        // Case 1: Emby merged multiple files into one item (multiple MediaSources)
        if (paths.length > 1) {
            mergedItems.push({
                label: movie.Name || 'Unknown',
                files: paths.map(p => ({
                    id:       movie.Id,
                    name:     movie.Name || 'Unknown',
                    path:     p,
                    folder:   getFolder(p),
                    filename: p.replace(/\\/g, '/').split('/').pop(),
                    year:     movie.ProductionYear || 'N/A',
                    imdb:     movie.ProviderIds?.Imdb || ''
                }))
            });
            return;
        }

        // Case 2: separate Emby items — group by exact folder
        if (paths.length === 1) {
            const p = paths[0];
            const folder = getFolder(p);
            if (!folder) return;
            if (!byExact[folder]) byExact[folder] = [];
            byExact[folder].push({
                id:       movie.Id,
                name:     movie.Name || 'Unknown',
                path:     p,
                folder,
                filename: p.replace(/\\/g, '/').split('/').pop(),
                year:     movie.ProductionYear || 'N/A',
                imdb:     movie.ProviderIds?.Imdb || ''
            });
        }
    });

    const out = {};
    for (const [f, items] of Object.entries(byExact)) {
        if (items.length > 1) out[f] = items;
    }
    mergedItems.forEach(({ label, files }) => {
        out[`merged:${label}`] = files;
    });
    return out;
}

// ─── Display ──────────────────────────────────────────────────────────────────

let _cbCounter = 0;

function makeItemHtml(item) {
    const cbId     = `cb_${++_cbCounter}`;
    const imdbLink = item.imdb ? `<a href="https://www.imdb.com/title/${item.imdb}" target="_blank">IMDb ↗</a>` : '';
    return `
        <li class="file-item" id="li_${cbId}">
            <input type="checkbox" id="${cbId}" class="delete-cb"
                data-item-id="${item.id}"
                data-filename="${item.filename.replace(/"/g, '&quot;')}"
                data-path="${item.path.replace(/"/g, '&quot;')}">
            <label for="${cbId}" class="file-info" style="cursor:pointer">
                <div class="file-folder">📁 ${item.folder || '—'}</div>
                <div class="file-name">
                    <span>${item.filename}</span>
                    ${item.year !== 'N/A' ? `<span class="file-badge">${item.year}</span>` : ''}
                    ${imdbLink}
                </div>
            </label>
        </li>`;
}

function displayResults(results) {
    const div = document.getElementById('results');
    div.innerHTML = '';
    _cbCounter = 0;

    if (!results.length) {
        div.innerHTML = '<p style="color:#27ae60;font-size:17px;text-align:center;margin-top:30px">✅ No duplicates found!</p>';
        return;
    }

    results.forEach((result, idx) => {
        const box = document.createElement('div');
        box.className = 'library-box';
        box.style.animationDelay = `${idx * 0.08}s`;

        let tvdbHtml = '';
        if (result.tvdbCount > 0) {
            tvdbHtml = `<div class="section-label">🔁 Same TVDB ID — ${result.tvdbCount} set${result.tvdbCount !== 1 ? 's' : ''}</div>`;
            for (const [, items] of Object.entries(result.tvdbDuplicates)) {
                tvdbHtml += `<details open>
                    <summary>${items[0].name} (${items[0].year}) &nbsp;·&nbsp; ${items.length} copies</summary>
                    <ul>${items.map(makeItemHtml).join('')}</ul>
                </details>`;
            }
        }

        let folderHtml = '';
        if (result.folderCount > 0) {
            folderHtml = `<div class="section-label">📂 Multiple files in same folder — ${result.folderCount} folder${result.folderCount !== 1 ? 's' : ''}</div>`;
            for (const [folder, items] of Object.entries(result.folderDuplicates)) {
                let label;
                if (folder.startsWith('merged:')) {
                    label = `${folder.slice(7)} — merged versions`;
                } else {
                    label = folder.length > 55 ? '…' + folder.slice(-52) : folder;
                }
                folderHtml += `<details open>
                    <summary>${label} &nbsp;·&nbsp; ${items.length} files</summary>
                    <ul>${items.map(makeItemHtml).join('')}</ul>
                </details>`;
            }
        }

        const total = result.tvdbCount + result.folderCount;
        const canDelete = !!_userToken;
        const deleteHint = canDelete
            ? 'Check files below then click <em>Delete selected</em>.'
            : '⚠️ Enter your username &amp; password above and re-scan to enable deletion.';

        box.innerHTML = `
            <p class="lib-header">📁 ${result.libraryName}</p>
            <p class="lib-sub">${total} duplicate set${total !== 1 ? 's' : ''} found — ${deleteHint}</p>
            ${tvdbHtml}${folderHtml}
            <div class="action-row">
                <button class="btn btn-blue" onclick="downloadDuplicates(${JSON.stringify(result).replace(/"/g, '&quot;')})">📥 Download report</button>
                ${canDelete ? `<button class="btn btn-red" onclick="reviewSelected()">🗑️ Delete selected</button>` : ''}
            </div>`;
        div.appendChild(box);
    });
}

// ─── Delete flow ──────────────────────────────────────────────────────────────

function reviewSelected() {
    const checked = [...document.querySelectorAll('.delete-cb:checked')];
    if (!checked.length) { alert('No files selected.'); return; }

    const items = checked.map(cb => ({
        id: cb.dataset.itemId, filename: cb.dataset.filename,
        path: cb.dataset.path, liId: cb.closest('li').id,
    }));

    const listHtml = items.map((item, i) => `
        <li style="list-style:none;padding:10px 12px;background:#fdecea;border-left:4px solid #c0392b;border-radius:0 6px 6px 0;margin-bottom:6px">
            <div style="font-size:11px;color:#999">📁 ${getFolder(item.path)}</div>
            <div style="font-weight:700;color:#2c3e50;font-size:14px">${i + 1}. ${item.filename}</div>
        </li>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'delete-modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-box">
            <p class="modal-title">⚠️ Confirm Deletion</p>
            <p style="color:#333;margin:0 0 14px;font-size:14px">
                <strong>${items.length} file${items.length !== 1 ? 's' : ''}</strong> will be permanently deleted from Emby and from disk. This cannot be undone.
            </p>
            <ul style="padding:0;margin:0 0 16px">${listHtml}</ul>
            <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
                <button class="btn" style="border:1px solid #ccc;background:#fff;color:#333" onclick="document.getElementById('delete-modal').remove()">Cancel</button>
                <button class="btn btn-red" id="confirm-delete-btn">🗑️ Delete ${items.length} file${items.length !== 1 ? 's' : ''}</button>
            </div>
            <div id="delete-progress" style="margin-top:14px;font-size:14px;color:#555"></div>
        </div>`;
    overlay.dataset.items = JSON.stringify(items);
    document.body.appendChild(overlay);
    document.getElementById('confirm-delete-btn').addEventListener('click', () => executeDelete(items, overlay));
}

async function executeDelete(items, overlay) {
    const btn  = document.getElementById('confirm-delete-btn');
    const prog = document.getElementById('delete-progress');
    btn.disabled = true;
    btn.textContent = 'Deleting…';

    const succeeded = [], failed = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        prog.innerHTML = `⏳ Deleting ${i + 1} of ${items.length}: <em>${item.filename}</em>… (Item ID: ${item.id})`;
        try {
            // Try three endpoints in order — Emby 4.x is inconsistent across versions
            const endpoints = [
                // 1. User-scoped with token header
                () => fetch(`${_embyUrl}/emby/Users/${_userId}/Items/${item.id}?deleteFiles=true`, {
                    method: 'DELETE', headers: { 'X-Emby-Token': _userToken }
                }),
                // 2. Generic Items endpoint with token as query param
                () => fetch(`${_embyUrl}/emby/Items/${item.id}?deleteFiles=true&api_key=${_userToken}`, {
                    method: 'DELETE'
                }),
                // 3. Generic Items endpoint with api_key
                () => fetch(`${_embyUrl}/emby/Items/${item.id}?deleteFiles=true&api_key=${_apiKey}`, {
                    method: 'DELETE'
                }),
            ];

            let resp, lastError;
            for (const call of endpoints) {
                resp = await call();
                if (resp.ok || resp.status === 204) break;
                const detail = await resp.text().catch(() => '');
                lastError = `HTTP ${resp.status} — ${detail || resp.statusText}`;
            }
            if (!resp.ok && resp.status !== 204) throw new Error(lastError);
            succeeded.push(item);
            document.getElementById(item.liId)?.remove();
        } catch (e) {
            failed.push({ ...item, error: e.message });
        }
    }

    overlay.remove();

    // Trigger Emby library refresh
    if (succeeded.length) {
        await fetch(`${_embyUrl}/emby/Library/Refresh?api_key=${_apiKey}`, { method: 'POST' }).catch(() => {});
    }

    const lines = [];
    if (succeeded.length) lines.push(`✅ ${succeeded.length} file${succeeded.length !== 1 ? 's' : ''} deleted.`);
    if (failed.length)    lines.push(`❌ ${failed.length} failed:\n` + failed.map(f => `  • ${f.filename}: ${f.error}`).join('\n'));
    alert(lines.join('\n\n'));

    if (succeeded.length) findDuplicates(null);
}

// ─── Download ─────────────────────────────────────────────────────────────────

function downloadDuplicates(result) {
    let c = `Emby Duplicates Report — ${result.libraryName}\nGenerated: ${new Date().toISOString()}\n\n`;
    if (result.tvdbCount > 0) {
        c += `=== SAME TVDB ID (${result.tvdbCount} sets) ===\n\n`;
        for (const [id, items] of Object.entries(result.tvdbDuplicates)) {
            c += `TVDB ${id} — ${items.length} copies:\n`;
            items.forEach((item, i) => { c += `  ${i+1}. "${item.name}" (${item.year})\n     ${item.path}\n`; });
            c += '\n';
        }
    }
    if (result.folderCount > 0) {
        c += `=== MULTIPLE FILES IN SAME FOLDER (${result.folderCount} folders) ===\n\n`;
        for (const [folder, items] of Object.entries(result.folderDuplicates)) {
            c += `Folder: ${folder}\n`;
            items.forEach((item, i) => { c += `  ${i+1}. "${item.name}" (${item.year})\n     ${item.path}\n`; });
            c += '\n';
        }
    }
    const blob = new Blob([c], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `emby_${result.libraryName.replace(/[^a-zA-Z0-9]/g, '_')}_duplicates_${Date.now()}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
