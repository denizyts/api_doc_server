const { Collection } = require("postman-collection");

async function generatePostmanHtml(params) {
  const failHtml = `<html><body>Failed to generate documentation.</body></html>`;

  try {
    if (!params?.json) throw new Error("json is required");

    const collection = new Collection(params.json);
    let totalRequests = 0;
    let totalFolders = 0;

    function esc(text) {
      if (!text) return "";
      return String(text).replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[m]));
    }

    function mdToHtml(text) {
      if (!text) return "";
      let h = esc(text);
      h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
      h = h.replace(/^## (.+)$/gm, "<h2>$1</h2>");
      h = h.replace(/^# (.+)$/gm, "<h1>$1</h1>");
      h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      h = h.replace(/\*(.+?)\*/g, "<em>$1</em>");
      h = h.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
      h = h.replace(/`(.+?)`/g, "<code>$1</code>");
      h = h.replace(/\n/g, "<br>");
      return h;
    }

    function fmtJson(str) {
      try { return JSON.stringify(JSON.parse(str), null, 2); }
      catch { return str; }
    }

    function extractQuery(url) {
      if (!url?.query) return [];
      const list = Array.isArray(url.query)
        ? url.query
        : Object.entries(url.query).map(([k, v]) => ({ key: k, value: v }));
      return list.filter(q => q.key && !q.key.startsWith("_postman")).map(q => ({
        key: q.key, value: q.value || "", description: q.description || ""
      }));
    }

    function methodBadge(method, extra = "") {
      return `<span class="badge method-${esc(method)}${extra ? ' ' + extra : ''}">${esc(method)}</span>`;
    }

    let navHtml = "";
    let requestsData = [];

    function processRequest(item, folderPath, folderId) {
      totalRequests++;
      const req = item.request;
      const method = req.method;
      const name = item.name;
      const url = req.url.toString();
      const description = item.description || req.description;
      const urlParams = extractQuery(req.url);
      const headers = (req.headers?.members || []).map(h => ({ key: h.key, value: h.value }));

      let body = null, bodyType = "none";
      if (req.body) {
        if (req.body.mode === "raw") { body = req.body.raw; bodyType = "raw"; }
        else if (req.body.mode === "urlencoded") { body = req.body.urlencoded; bodyType = "urlencoded"; }
        else if (req.body.mode === "formdata") { body = req.body.formdata; bodyType = "formdata"; }
      }

      const authType = req.auth?.type || null;

      const responses = [];
      if (item.responses?.members?.length) {
        item.responses.members.forEach((resp, idx) => {
          let rb = resp.body || "";
          try { rb = JSON.stringify(JSON.parse(rb), null, 2); } catch {}
          responses.push({
            name: resp.name || `Response ${idx + 1}`,
            status: resp.code || 200,
            statusText: resp.status || "",
            headers: resp.headers || [],
            body: rb
          });
        });
      }

      const id = `req_${totalRequests}`;
      requestsData.push({ id, folderPath, folderId, name, method, url, description, urlParams, headers, body, bodyType, responses, authType });

      navHtml += `
        <div class="nav-item" data-id="${id}" data-method="${method}" data-name="${esc(name)}" data-url="${esc(url)}" data-folder="${folderId || ''}">
          <span class="nav-badge method-${method}">${esc(method)}</span>
          <span class="nav-label" title="${esc(name)}">${esc(name)}</span>
        </div>`;
    }

    function processItem(item, folderPath = "", parentFolderId = "") {
      if (item.items) {
        totalFolders++;
        const fid = `folder_${totalFolders}`;
        navHtml += `
          <div class="nav-folder-wrap" id="${fid}_wrap">
            <div class="nav-folder" onclick="toggleFolder('${fid}')" data-folder-id="${fid}">
              <span class="folder-arrow open" id="${fid}_arrow">&#9656;</span>
              <span>${esc(item.name)}</span>
              <span class="folder-count" id="${fid}_count"></span>
            </div>
            <div class="nav-folder-items" id="${fid}_items">`;
        item.items.each(sub => {
          if (sub.request) processRequest(sub, folderPath + item.name + " / ", fid);
          else if (sub.items) processItem(sub, folderPath + item.name + " / ", fid);
        });
        navHtml += `</div></div>`;
      } else if (item.request) {
        processRequest(item, folderPath, parentFolderId);
      }
    }

    collection.items.each(item => processItem(item));

    function copyBtn(targetId) {
      return `<button class="copy-btn" onclick="copyCode('${targetId}',this)" title="Copy to clipboard">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy
      </button>`;
    }

    function buildCard(req) {
      let h = `<div class="card" id="${req.id}" data-name="${esc(req.name)}" data-url="${esc(req.url)}" data-method="${req.method}" data-folder="${req.folderId || ''}">`;

      h += `<div class="card-head" onclick="toggle('${req.id}')">`;
      h += `<div class="card-title-row">`;
      h += methodBadge(req.method);
      h += `<span class="card-name">${esc(req.name)}</span>`;
      if (req.authType) h += `<span class="auth-pill">${esc(req.authType.toUpperCase())}</span>`;
      h += `<div class="card-actions" onclick="event.stopPropagation()">`;
      h += `<button class="icon-btn" onclick="copyUrl(this,'${esc(req.url).replace(/'/g, "\\'")}')" title="Copy URL">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </button>`;
      h += `</div></div>`;
      h += `<div class="card-url-row">`;
      h += `<span class="card-url">${esc(req.url)}</span>`;
      if (req.folderPath) h += `<span class="card-folder">${esc(req.folderPath.replace(/ \/ $/, ''))}</span>`;
      h += `</div>`;
      h += `<div class="chevron" id="chev_${req.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div>`;
      h += `</div>`;

      h += `<div class="card-body" id="body_${req.id}">`;

      if (req.description) {
        h += `<div class="section"><div class="sec-title">Description</div><div class="prose">${mdToHtml(req.description)}</div></div>`;
      }

      if (req.urlParams?.length) {
        h += `<div class="section"><div class="sec-title">Query parameters</div><table class="tbl">`;
        h += `<thead><tr><th>Parameter</th><th>Value</th><th>Description</th></tr></thead><tbody>`;
        req.urlParams.forEach(p => {
          if (p.key != "members") return;
          h += `<tr><td><code>${esc(p.key)}</code></td><td class="mono-val">${esc(p.value)}</td><td class="muted">${esc(p.description)}</td></tr>`;
        });
        h += `</tbody></table></div>`;
      }

      if (req.headers?.length) {
        h += `<div class="section"><div class="sec-title">Headers</div><table class="tbl">`;
        h += `<thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>`;
        req.headers.forEach(hd => {
          h += `<tr><td><code>${esc(hd.key)}</code></td><td class="mono-val">${esc(hd.value)}</td></tr>`;
        });
        h += `</tbody></table></div>`;
      }

      if (req.body && req.bodyType !== "none") {
        const bid = `cbody_${req.id}`;
        const bodyContent = req.bodyType === "raw" ? fmtJson(req.body) : JSON.stringify(req.body, null, 2);
        h += `<div class="section">`;
        h += `<div class="sec-title-row"><span class="sec-title">Request body</span><span class="body-mode-pill">${req.bodyType}</span>${copyBtn(bid)}</div>`;
        h += `<div class="codeblock" id="${bid}"><pre>${esc(bodyContent)}</pre></div></div>`;
      }

      h += `<div class="section"><div class="sec-title">Responses</div>`;
      if (req.responses?.length) {
        h += `<div class="resp-tabs">`;
        req.responses.forEach((r, i) => {
          const sc = r.status >= 500 ? "tab-5xx" : r.status >= 400 ? "tab-err" : r.status >= 300 ? "tab-redir" : "tab-ok";
          h += `<button class="rtab ${i === 0 ? "active" : ""} ${sc}" onclick="switchTab('${req.id}',${i})">${r.status} ${esc(r.name)}</button>`;
        });
        h += `</div>`;
        req.responses.forEach((r, i) => {
          const rbId = `rb_${req.id}_${i}`;
          const sc = r.status >= 500 ? "var(--c-5xx)" : r.status >= 400 ? "var(--c-err)" : r.status >= 300 ? "var(--c-redir)" : "var(--c-ok)";
          h += `<div class="resp-body ${i === 0 ? "active" : ""}" id="rt_${req.id}_${i}">`;
          h += `<div class="status-line" style="color:${sc}"><span class="status-dot" style="background:${sc}"></span>${r.status} ${esc(r.statusText)}</div>`;
          if (r.headers?.length) {
            h += `<details class="resp-headers"><summary>Response headers (${r.headers.length})</summary><table class="tbl" style="margin-top:8px"><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>`;
            r.headers.forEach(rh => { h += `<tr><td><code>${esc(rh.key)}</code></td><td class="mono-val">${esc(rh.value)}</td></tr>`; });
            h += `</tbody></table></details>`;
          }
          if (r.body?.trim()) {
            h += `<div class="codeblock-wrap">${copyBtn(rbId)}<div class="codeblock" id="${rbId}"><pre>${esc(r.body)}</pre></div></div>`;
          } else {
            h += `<div class="empty-resp">No response body</div>`;
          }
          h += `</div>`;
        });
      } else {
        h += `<div class="empty-resp">No example responses in this collection.</div>`;
      }
      h += `</div></div></div>`;
      return h;
    }

    let cards = requestsData.map(buildCard).join("");
    if (!cards) cards = `<div class="empty-state">No requests found in this collection.</div>`;

    const uniqueMethods = [...new Set(requestsData.map(r => r.method))].sort();
    const filterButtons = uniqueMethods.map(m =>
      `<button class="filter-btn method-${m}" data-method="${m}" onclick="filterMethod('${m}',this)">${m}</button>`
    ).join("");

    const html = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(collection.name)} — API Docs</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Sora:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#F9F8F6;--surface:#FFFFFF;--surface2:#F4F3F0;
  --border:#E5E3DF;--border2:#D1CFC9;
  --text:#1A1916;--muted:#6B6963;--subtle:#9C9890;
  --accent:#1C6EF5;--accent-bg:#EFF5FF;
  --code-bg:#1A1A1A;--code-text:#D4D4D4;--code-border:#2D2D2D;
  --mark-bg:#FEF08A;--tbl-head:#F7F6F3;
  --c-ok:#166534;--c-redir:#B45309;--c-err:#B91C1C;--c-5xx:#9A3412;
  --sidebar-w:300px;
  --font-sans:"Sora",sans-serif;--font-mono:"IBM Plex Mono",monospace;
  --radius:6px;--radius-lg:10px;
  --trans:background .18s,color .18s,border-color .18s;
  --m-get-bg:#DCFCE7;--m-get-text:#166534;--m-get-border:#86EFAC;
  --m-post-bg:#DBEAFE;--m-post-text:#1E40AF;--m-post-border:#93C5FD;
  --m-put-bg:#FEF3C7;--m-put-text:#92400E;--m-put-border:#FCD34D;
  --m-patch-bg:#FEF3C7;--m-patch-text:#92400E;--m-patch-border:#FCD34D;
  --m-delete-bg:#FEE2E2;--m-delete-text:#991B1B;--m-delete-border:#FCA5A5;
  --m-def-bg:#F3F4F6;--m-def-text:#374151;--m-def-border:#E5E7EB;
}
[data-theme="dark"]{
  --bg:#0F1117;--surface:#1A1D27;--surface2:#222534;
  --border:#2D3148;--border2:#3D4166;
  --text:#E8EAF0;--muted:#8B90A8;--subtle:#5C6080;
  --accent:#5B9BFF;--accent-bg:#1A2540;
  --code-bg:#111318;--code-text:#D4D4D4;--code-border:#2D3148;
  --mark-bg:#78350F;--tbl-head:#222534;
  --c-ok:#4ADE80;--c-redir:#FCD34D;--c-err:#FCA5A5;--c-5xx:#FDA4AF;
  --m-get-bg:#14532D;--m-get-text:#86EFAC;--m-get-border:#166534;
  --m-post-bg:#1E3A8A;--m-post-text:#93C5FD;--m-post-border:#1D4ED8;
  --m-put-bg:#78350F;--m-put-text:#FCD34D;--m-put-border:#B45309;
  --m-patch-bg:#78350F;--m-patch-text:#FCD34D;--m-patch-border:#B45309;
  --m-delete-bg:#7F1D1D;--m-delete-text:#FCA5A5;--m-delete-border:#DC2626;
  --m-def-bg:#1F2937;--m-def-text:#9CA3AF;--m-def-border:#374151;
}

.method-GET{background:var(--m-get-bg);color:var(--m-get-text);border-color:var(--m-get-border)}
.method-POST{background:var(--m-post-bg);color:var(--m-post-text);border-color:var(--m-post-border)}
.method-PUT{background:var(--m-put-bg);color:var(--m-put-text);border-color:var(--m-put-border)}
.method-PATCH{background:var(--m-patch-bg);color:var(--m-patch-text);border-color:var(--m-patch-border)}
.method-DELETE{background:var(--m-delete-bg);color:var(--m-delete-text);border-color:var(--m-delete-border)}

body{font-family:var(--font-sans);background:var(--bg);color:var(--text);font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased;transition:var(--trans)}
.layout{display:flex;min-height:100vh}

/* ── Sidebar ── */
.sidebar{width:var(--sidebar-w);background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;overflow:hidden;transition:var(--trans);z-index:100}
.sb-head{padding:16px 14px 12px;border-bottom:1px solid var(--border);flex-shrink:0}
.sb-head-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px}
.sb-title{font-size:13px;font-weight:600;color:var(--text);line-height:1.35;word-break:break-word;flex:1}
.sb-meta{font-size:10px;color:var(--subtle);font-family:var(--font-mono)}

.theme-btn{width:26px;height:26px;border-radius:var(--radius);border:1px solid var(--border2);background:var(--surface2);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:var(--trans)}
.theme-btn:hover{background:var(--border);color:var(--text)}
.icon-sun,.icon-moon{display:none}
[data-theme="light"] .icon-sun{display:block}
[data-theme="dark"] .icon-moon{display:block}

.sb-search{padding:8px 12px;border-bottom:1px solid var(--border);flex-shrink:0;position:relative}
.sb-search input{width:100%;height:30px;padding:0 28px 0 28px;border:1px solid var(--border2);border-radius:var(--radius);font-family:var(--font-sans);font-size:12px;background:var(--bg);color:var(--text);outline:none;transition:var(--trans)}
.sb-search input:focus{border-color:var(--accent)}
.sb-search input::placeholder{color:var(--subtle)}
.search-icon{position:absolute;left:22px;top:50%;transform:translateY(-50%);color:var(--subtle);pointer-events:none}
.search-shortcut{position:absolute;right:20px;top:50%;transform:translateY(-50%);font-family:var(--font-mono);font-size:9px;color:var(--subtle);background:var(--surface2);border:1px solid var(--border2);border-radius:3px;padding:1px 4px;pointer-events:none}

.sb-filters{padding:7px 12px;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:4px;flex-shrink:0}
.filter-btn{font-family:var(--font-mono);font-size:9px;font-weight:500;padding:2px 7px;border-radius:4px;border:1px solid;cursor:pointer;transition:opacity .15s,transform .1s;letter-spacing:.04em;opacity:.5}
.filter-btn:hover{opacity:.8;transform:translateY(-1px)}
.filter-btn.active{opacity:1}
.filter-btn.all-btn{background:var(--surface2);color:var(--muted);border-color:var(--border2);opacity:1}
.filter-btn.all-btn.active{background:var(--text);color:var(--surface);border-color:var(--text)}

.sb-nav{flex:1;overflow-y:auto;padding-bottom:20px}
.nav-folder{display:flex;align-items:center;gap:5px;padding:10px 14px 4px;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--subtle);cursor:pointer;user-select:none;transition:color .15s}
.nav-folder:hover{color:var(--muted)}
.folder-arrow{font-size:9px;display:inline-block;transition:transform .2s;flex-shrink:0}
.folder-arrow.open{transform:rotate(90deg)}
.folder-count{margin-left:auto;font-size:9px;font-family:var(--font-mono);background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:0 5px;color:var(--muted)}
.nav-folder-items{overflow:hidden}
.nav-item{display:flex;align-items:center;gap:7px;padding:5px 14px 5px 24px;cursor:pointer;border-left:2px solid transparent;transition:background .1s,border-color .1s}
.nav-item:hover{background:var(--surface2)}
.nav-item.active{border-left-color:var(--accent);background:var(--accent-bg)}
.nav-badge{font-family:var(--font-mono);font-size:9px;font-weight:500;padding:2px 5px;border-radius:4px;border:1px solid;flex-shrink:0;min-width:42px;text-align:center;letter-spacing:.03em}
.nav-label{font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.sb-footer{border-top:1px solid var(--border);padding:8px 10px;display:flex;gap:5px;flex-shrink:0}
.sb-foot-btn{flex:1;height:26px;font-family:var(--font-sans);font-size:11px;font-weight:500;border:1px solid var(--border2);border-radius:var(--radius);background:var(--surface2);color:var(--muted);cursor:pointer;transition:var(--trans)}
.sb-foot-btn:hover{background:var(--border);color:var(--text)}

/* ── Main ── */
.main{margin-left:var(--sidebar-w);flex:1;min-width:0}
.main-inner{max-width:900px;padding:32px 32px 80px}

.page-header{margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid var(--border)}
.page-title{font-size:20px;font-weight:600;color:var(--text);margin-bottom:4px}
.page-desc{font-size:12px;color:var(--muted)}
.stats-row{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
.stat-chip{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:3px 9px}
.stat-chip strong{color:var(--text);font-weight:600}
.method-summary{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}

/* ── Cards ── */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:8px;overflow:hidden;transition:box-shadow .15s,border-color .15s}
.card:hover{box-shadow:0 2px 10px rgba(0,0,0,.07);border-color:var(--border2)}
.card-head{padding:12px 14px;cursor:pointer;position:relative;user-select:none;transition:background .1s}
.card-head:hover{background:var(--surface2)}
.card-title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;padding-right:26px}
.badge{font-family:var(--font-mono);font-size:10px;font-weight:500;padding:2px 7px;border-radius:5px;border:1px solid;letter-spacing:.04em;flex-shrink:0;min-width:50px;text-align:center}
.card-name{font-size:13px;font-weight:600;color:var(--text)}
.auth-pill{font-family:var(--font-mono);font-size:9px;font-weight:500;padding:2px 6px;border-radius:20px;background:#EDE9FE;color:#5B21B6;border:1px solid #DDD6FE}
[data-theme="dark"] .auth-pill{background:#2E1065;color:#C4B5FD;border-color:#4C1D95}
.card-actions{margin-left:auto;display:flex;align-items:center;gap:4px}
.icon-btn{width:24px;height:24px;border-radius:var(--radius);border:1px solid var(--border2);background:var(--bg);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:var(--trans);flex-shrink:0}
.icon-btn:hover{background:var(--border);color:var(--text)}
.icon-btn.copied{background:#DCFCE7;color:#166534;border-color:#86EFAC}
[data-theme="dark"] .icon-btn.copied{background:#14532D;color:#86EFAC;border-color:#166534}
.card-url-row{display:flex;align-items:center;flex-wrap:wrap;gap:7px}
.card-url{font-family:var(--font-mono);font-size:11px;color:var(--muted);word-break:break-all}
.card-folder{font-size:9px;color:var(--subtle);background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-family:var(--font-mono);white-space:nowrap}
.chevron{position:absolute;right:14px;top:50%;transform:translateY(-50%);color:var(--subtle);transition:transform .2s;display:flex;align-items:center}
.chevron.open{transform:translateY(-50%) rotate(180deg)}
.card-body{display:none;border-top:1px solid var(--border)}

/* ── Sections ── */
.section{padding:16px 18px;border-bottom:1px solid var(--border);background:var(--bg)}
.section:last-child{border-bottom:none}
.sec-title{font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--subtle);margin-bottom:9px}
.sec-title-row{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.sec-title-row .sec-title{margin-bottom:0}
.body-mode-pill{font-family:var(--font-mono);font-size:9px;padding:2px 6px;border-radius:4px;background:var(--surface2);border:1px solid var(--border);color:var(--muted)}

.prose{font-size:13px;line-height:1.75;color:var(--text);background:var(--surface);padding:11px 13px;border-radius:var(--radius);border:1px solid var(--border)}
.prose h1,.prose h2,.prose h3{color:var(--text);margin:8px 0 4px;font-weight:600}
.prose code{font-family:var(--font-mono);font-size:11px;background:var(--surface2);color:var(--accent);padding:1px 4px;border-radius:3px}
.prose pre{background:var(--code-bg);color:var(--code-text);padding:10px 12px;border-radius:var(--radius);overflow-x:auto;margin:8px 0;font-family:var(--font-mono);font-size:11px}
.prose pre code{background:none;color:inherit;padding:0}

.tbl{width:100%;border-collapse:collapse;font-size:12px;background:var(--surface);border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);transition:var(--trans)}
.tbl th{background:var(--tbl-head);font-size:9px;font-weight:600;color:var(--muted);text-align:left;padding:7px 11px;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:.05em}
.tbl td{padding:7px 11px;border-bottom:1px solid var(--border);color:var(--text);vertical-align:top}
.tbl tr:last-child td{border-bottom:none}
.tbl code{font-family:var(--font-mono);font-size:11px;background:var(--surface2);color:var(--accent);padding:1px 4px;border-radius:3px}
.mono-val{font-family:var(--font-mono);font-size:11px;color:var(--muted)}
.muted{color:var(--muted);font-size:11px}

.codeblock-wrap{position:relative}
.codeblock-wrap .copy-btn{position:absolute;top:8px;right:8px;z-index:1}
.codeblock{background:var(--code-bg);border-radius:var(--radius);overflow-x:auto;border:1px solid var(--code-border)}
.codeblock pre{padding:13px 15px;font-family:var(--font-mono);font-size:12px;line-height:1.65;color:var(--code-text);white-space:pre-wrap;word-break:break-word;margin:0}

.copy-btn{display:inline-flex;align-items:center;gap:4px;font-family:var(--font-sans);font-size:10px;font-weight:500;padding:3px 8px;border-radius:4px;border:1px solid var(--border2);background:var(--surface);color:var(--muted);cursor:pointer;margin-left:auto;transition:var(--trans);white-space:nowrap}
.copy-btn:hover{background:var(--surface2);color:var(--text)}
.copy-btn.copied{background:#DCFCE7;color:#166534;border-color:#86EFAC}
[data-theme="dark"] .copy-btn.copied{background:#14532D;color:#86EFAC;border-color:#166534}

.resp-tabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}
.rtab{font-family:var(--font-mono);font-size:10px;font-weight:500;padding:3px 9px;border-radius:var(--radius);border:1px solid;cursor:pointer;transition:opacity .15s}
.rtab:not(.active){opacity:.4}
.tab-ok{color:var(--m-get-text);background:var(--m-get-bg);border-color:var(--m-get-border)}
.tab-redir{color:var(--m-put-text);background:var(--m-put-bg);border-color:var(--m-put-border)}
.tab-err{color:var(--m-delete-text);background:var(--m-delete-bg);border-color:var(--m-delete-border)}
.tab-5xx{color:var(--m-delete-text);background:var(--m-delete-bg);border-color:var(--m-delete-border);opacity:.7}

.resp-body{display:none}
.resp-body.active{display:block}
.status-line{font-family:var(--font-mono);font-size:11px;font-weight:500;margin-bottom:9px;display:flex;align-items:center;gap:5px}
.status-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}
.resp-headers{margin-bottom:9px}
.resp-headers summary{font-size:9px;font-weight:600;color:var(--muted);cursor:pointer;user-select:none;letter-spacing:.05em;text-transform:uppercase}
.resp-headers summary:hover{color:var(--text)}
.empty-resp{font-size:12px;color:var(--subtle);font-style:italic;padding:5px 0}

.empty-state{text-align:center;padding:80px 40px;font-size:14px;color:var(--subtle)}
mark{background:var(--mark-bg);color:var(--text);border-radius:2px;padding:0 1px}

#back-top{position:fixed;bottom:24px;right:24px;width:34px;height:34px;border-radius:50%;background:var(--surface);border:1px solid var(--border2);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.1);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:200}
#back-top.visible{opacity:1;pointer-events:auto}
#back-top:hover{background:var(--surface2);transform:translateY(-2px)}

::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--subtle)}

@media(max-width:768px){
  .sidebar{transform:translateX(-100%)}
  .main{margin-left:0}
  .main-inner{padding:20px 16px 80px}
}
</style>
</head>
<body>
<div class="layout">

<aside class="sidebar">
  <div class="sb-head">
    <div class="sb-head-row">
      <div class="sb-title">${esc(collection.name)}</div>
      <button class="theme-btn" onclick="toggleTheme()" title="Toggle theme">
        <svg class="icon-sun" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg class="icon-moon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
    </div>
    <div class="sb-meta" id="sb-meta">${totalRequests} endpoints &middot; ${totalFolders} folders</div>
  </div>

  <div class="sb-search">
    <svg class="search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input type="text" id="search" placeholder="Search endpoints…" autocomplete="off" spellcheck="false">
    <span class="search-shortcut">/</span>
  </div>

  <div class="sb-filters">
    <button class="filter-btn all-btn active" data-method="ALL" onclick="filterMethod('ALL',this)">ALL</button>
    ${filterButtons}
  </div>

  <nav class="sb-nav" id="nav">${navHtml}</nav>

  <div class="sb-footer">
    <button class="sb-foot-btn" onclick="expandAll()">Expand all</button>
    <button class="sb-foot-btn" onclick="collapseAll()">Collapse all</button>
  </div>
</aside>

<main class="main">
  <div class="main-inner">
    <div class="page-header">
      <div class="page-title">${esc(collection.name)}</div>
      <div class="page-desc">API Collection Documentation</div>
      <div class="stats-row">
        <div class="stat-chip"><strong id="stat-ep">${totalRequests}</strong>&nbsp;endpoints</div>
        <div class="stat-chip"><strong>${totalFolders}</strong>&nbsp;folders</div>
      </div>
      <div class="method-summary" id="method-summary"></div>
    </div>
    <div id="content">${cards}</div>
  </div>
</main>
</div>

<button id="back-top" onclick="window.scrollTo({top:0,behavior:'smooth'})" title="Back to top">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
</button>

<script>
/* ── Theme (apply before paint) ── */
(function(){
  const t = localStorage.getItem('pm-theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
})();

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pm-theme', next);
}

/* ── Folder toggle ── */
function toggleFolder(fid) {
  const items = document.getElementById(fid + '_items');
  const arrow = document.getElementById(fid + '_arrow');
  if (!items) return;
  const isOpen = items.style.display !== 'none';
  items.style.display = isOpen ? 'none' : '';
  arrow.classList.toggle('open', !isOpen);
}

/* ── Init folder item counts ── */
document.querySelectorAll('.nav-folder[data-folder-id]').forEach(f => {
  const fid = f.getAttribute('data-folder-id');
  const n = document.querySelectorAll('.nav-item[data-folder="' + fid + '"]').length;
  const el = document.getElementById(fid + '_count');
  if (el) el.textContent = n;
});

/* ── Card toggle ── */
function toggle(id) {
  const body = document.getElementById('body_' + id);
  const chev = document.getElementById('chev_' + id);
  if (!body) return;
  const open = body.style.display === 'block';
  body.style.display = open ? 'none' : 'block';
  chev.classList.toggle('open', !open);
}

function expandAll() {
  document.querySelectorAll('.card-body').forEach(b => b.style.display = 'block');
  document.querySelectorAll('.chevron').forEach(c => c.classList.add('open'));
}
function collapseAll() {
  document.querySelectorAll('.card-body').forEach(b => b.style.display = 'none');
  document.querySelectorAll('.chevron').forEach(c => c.classList.remove('open'));
}

/* ── Response tabs ── */
function switchTab(reqId, idx) {
  document.querySelectorAll('[id^="rt_' + reqId + '_"]').forEach(el => el.classList.remove('active'));
  document.getElementById('rt_' + reqId + '_' + idx)?.classList.add('active');
  document.querySelectorAll('#body_' + reqId + ' .rtab').forEach((t, i) => t.classList.toggle('active', i === idx));
}

/* ── Copy ── */
function doCopy(text, btn) {
  const ok = () => {
    const orig = btn.innerHTML;
    btn.classList.add('copied');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = orig; }, 1500);
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(ok).catch(() => fallback(text, btn, ok));
  } else { fallback(text, btn, ok); }
}
function fallback(text, btn, cb) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta); cb();
}
function copyCode(id, btn) {
  const el = document.getElementById(id);
  if (el) doCopy(el.innerText || el.textContent, btn);
}
function copyUrl(btn, url) { doCopy(url, btn); }

/* ── Search + Method filter ── */
const searchEl = document.getElementById('search');
const metaEl   = document.getElementById('sb-meta');
const statEp   = document.getElementById('stat-ep');
const TOTAL_REQS = ${totalRequests};
const TOTAL_FOLS = ${totalFolders};
let activeMethod = 'ALL';

searchEl.addEventListener('input', applyFilters);

function applyFilters() {
  const q = searchEl.value.toLowerCase().trim();
  let visible = 0;
  document.querySelectorAll('.nav-item').forEach(el => {
    const mOk = activeMethod === 'ALL' || el.dataset.method === activeMethod;
    const sOk = !q || (el.dataset.name||'').toLowerCase().includes(q) || (el.dataset.url||'').toLowerCase().includes(q) || (el.dataset.method||'').toLowerCase().includes(q);
    const show = mOk && sOk;
    el.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  document.querySelectorAll('.card').forEach(el => {
    const mOk = activeMethod === 'ALL' || el.dataset.method === activeMethod;
    const sOk = !q || (el.dataset.name||'').toLowerCase().includes(q) || (el.dataset.url||'').toLowerCase().includes(q) || (el.dataset.method||'').toLowerCase().includes(q);
    el.style.display = (mOk && sOk) ? '' : 'none';
  });
  if (statEp) statEp.textContent = visible;
  metaEl.textContent = (q || activeMethod !== 'ALL')
    ? visible + ' result' + (visible !== 1 ? 's' : '')
    : TOTAL_REQS + ' endpoints \u00b7 ' + TOTAL_FOLS + ' folders';
}

function filterMethod(method, btn) {
  activeMethod = method;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== searchEl && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault(); searchEl.focus();
  }
  if (e.key === 'Escape') { searchEl.blur(); }
});

/* ── Nav click ── */
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', function() {
    const id = this.dataset.id;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    this.classList.add('active');
    const card = document.getElementById(id);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const body = document.getElementById('body_' + id);
    const chev = document.getElementById('chev_' + id);
    if (body && body.style.display !== 'block') {
      body.style.display = 'block';
      chev?.classList.add('open');
    }
  });
});

/* ── Scroll spy (IntersectionObserver) ── */
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const id = e.target.id;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.id === id));
      document.querySelector('.nav-item[data-id="' + id + '"]')?.scrollIntoView({ block: 'nearest' });
    }
  });
}, { rootMargin: '-5% 0px -85% 0px', threshold: 0 });
document.querySelectorAll('.card').forEach(c => io.observe(c));

/* ── Back to top ── */
const backTop = document.getElementById('back-top');
window.addEventListener('scroll', () => backTop.classList.toggle('visible', window.scrollY > 400), { passive: true });

/* ── Method summary ── */
(function() {
  const counts = {};
  document.querySelectorAll('.card').forEach(c => { const m = c.dataset.method; counts[m] = (counts[m]||0)+1; });
  const wrap = document.getElementById('method-summary');
  if (wrap) {
    wrap.innerHTML = Object.entries(counts)
      .sort((a,b) => b[1]-a[1])
      .map(([m,n]) => '<span class="badge method-' + m + '" style="font-size:9px;min-width:auto;padding:2px 8px">' + m + ' <strong>' + n + '</strong></span>')
      .join('');
  }
})();

/* ── Open first card ── */
const fc = document.querySelector('.card');
if (fc) {
  const body = document.getElementById('body_' + fc.id);
  const chev = document.getElementById('chev_' + fc.id);
  if (body) { body.style.display = 'block'; chev?.classList.add('open'); }
  document.querySelector('.nav-item[data-id="' + fc.id + '"]')?.classList.add('active');
}
</script>
</body>
</html>`;

    return html;
  } catch (e) {
    console.error(e);
    return failHtml;
  }
}

module.exports = { key: "postman", generate: generatePostmanHtml };