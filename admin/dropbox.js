(() => {
"use strict";
var A = window.__admin;
function CID() { return window.__DROPBOX_CLIENT_ID || ""; }
var REDIRECT = location.origin + location.pathname;
if (REDIRECT.charAt(REDIRECT.length - 1) !== "/") REDIRECT += "/";
var SCOPES = "files.content.read files.metadata.read sharing.read sharing.write";
var API = "https://api.dropboxapi.com";
var CONTENT = "https://content.dropboxapi.com";
var $ = A.$;
var tok = sessionStorage.getItem("simona:dbx:tok") || "";
var acct = null;               // { id, email, name } — account connesso (get_current_account)
try { acct = JSON.parse(sessionStorage.getItem("simona:dbx:acct") || "null"); } catch (e){ acct = null; }
var cwd = "", cwdName = "Dropbox", cwdId = "";
var entries = [];
var sel = new Set();          // path_lower delle foto selezionate (persiste tra cartelle)
var selMap = new Map();       // path_lower → entry completa (id/rev/name, anche di altre cartelle)
var mapIds = null;              // id cartelle Dropbox già usate in gallerie (gallery-map)
var mapPaths = null;            // percorsi cartelle già usate (id non sempre noto)
var zoomMemo = {};            // path → { prevUrl, key, origUrl } — niente re-fetch alla riapertura
var targetSlot = null;        // se impostato: il picker aggiunge foto a questa bozza (modalità editor)
var galleryIds = new Set();   // dropboxId già presenti nella galleria in modifica (badge + preselezione)

var st = document.createElement("style");
st.textContent = ".dbxFolder{padding:.45rem .6rem;border:1px solid var(--border);border-radius:0;margin:.25rem 0;cursor:pointer;font-size:.9rem}.dbxFolder:hover{border-color:var(--ink)}.dbxFn{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.55);font-size:.6rem;padding:.15rem .3rem;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
  "#dbxList .cell{position:relative}" +
  ".dbxChk{position:absolute;top:6px;left:6px;width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.45);cursor:pointer;opacity:.85;transition:opacity .15s;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;line-height:1;touch-action:manipulation}" +
  ".cell:hover .dbxChk,.cell.sel:hover .dbxChk{opacity:1}" +
  ".cell.sel .dbxChk{opacity:1;background:var(--terra);border-color:var(--terra)}" +
  ".cell{touch-action:manipulation}" +
  ".cell.ingal{opacity:.38;cursor:default}" +
  ".cell.ingal .dbxChk{display:none}" +
  ".cell.ingal:hover{opacity:.38}" +
  ".dbxZoomIco{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.45);cursor:zoom-in;opacity:.85;color:#fff;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center;touch-action:manipulation}" +
  ".cell:hover .dbxZoomIco{opacity:1}" +
  "#dbxZoom{position:fixed;inset:0;background:rgba(10,10,10,.96);z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center}" +
  "#dbxZoom .wrap{overflow:hidden;max-width:92vw;max-height:76vh;touch-action:none;cursor:grab;position:relative;background:hsl(45 10% 90%)}" +
  "#dbxZoom .wrap img{display:block;max-width:92vw;max-height:76vh;object-fit:contain;transform-origin:0 0}" +
  "#dbxZoom .fn{position:fixed;top:1rem;left:1.2rem;color:rgba(255,255,255,.85);font-size:.75rem;letter-spacing:.06em;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
  "#dbxZoom .zoomlv{position:fixed;top:1rem;right:1.2rem;color:rgba(255,255,255,.85);font-size:.75rem}" +
  "#dbxZoom .bar{display:flex;gap:.6rem;align-items:center;margin-top:1.1rem;flex-wrap:wrap;justify-content:center}" +
  "#dbxZoom .bar button{background:transparent;border:1px solid rgba(255,255,255,.8);color:#fff;min-height:42px;min-width:52px;touch-action:manipulation}" +
  "#dbxZoom .bar button:hover{background:#fff;color:#111}" +
  "#dbxZoom .spin{color:#fff;font-size:.85rem;letter-spacing:.1em}" +
  "#dbxSelPanel{margin-top:.9rem;padding:.8rem;border:1px dashed var(--border)}" +
  "#dbxSelPanel .grp{margin:.4rem 0}" +
  "#dbxSelPanel .grp .pth{font-size:.72rem;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-bottom:.25rem}" +
  "#dbxSelPanel img{width:64px;height:48px;object-fit:cover;margin:2px;border-radius:0;cursor:pointer}" +
  "#dbxSelPanel .rmv{background:transparent;border:0;color:var(--terra);cursor:pointer;font-size:.75rem;padding:.2rem .4rem;min-height:auto;min-width:auto;letter-spacing:.04em}";
document.head.appendChild(st);

function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function note(m, isErr){ var el = statusEl(); if (el){ el.textContent = m || ""; el.style.color = isErr ? "var(--danger)" : "var(--muted)"; } }

// --- identità account connesso (blocco per-account + chip nell'header admin) ---
function setAcct(a){
  acct = a;
  try {
    if (a) sessionStorage.setItem("simona:dbx:acct", JSON.stringify(a));
    else sessionStorage.removeItem("simona:dbx:acct");
    window.dispatchEvent(new CustomEvent("simona:dbx-acct", { detail: a }));
  } catch (e){ /* sessionStorage pieno/disabilitato: il chip vive senza cache */ }
  renderAcctRow();
}
async function loadAccount(force){
  if (!tok) { setAcct(null); return; }
  if (acct && !force) return;
  try {
    var j = await dbx(API, "/2/users/get_current_account", {});
    setAcct({ id: j.account_id, email: j.email || "", name: (j.name && j.name.display_name) || "" });
  } catch (e){ /* best-effort: senza identità niente chip, nessun blocco */ }
}
function acctRef(){
  return acct && acct.id ? { id: acct.id, email: acct.email || undefined, name: acct.name || undefined } : undefined;
}
// riga "Connesso: …" nel pannello (se esiste nel DOM corrente)
function renderAcctRow(){
  var el = document.getElementById("dbxAcctName");
  if (!el) return;
  el.textContent = acct ? ((acct.name || "Dropbox") + (acct.email ? " — " + acct.email : "")) : "…";
}
// riga identità + Esci/cambia account — condivisa da render() e dallo stato
// "galleria di un altro account" (che non passa da render())
function acctRowHtml(){
  return '<div class="row" style="align-items:center;margin-bottom:.4rem">' +
    '<div class="muted" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem">Connesso: <strong id="dbxAcctName">…</strong></div>' +
    '<div style="flex:0"><button class="ghost" id="dbxLogout" title="Scollega questo account Dropbox (revoca il consenso) e torna alla connessione" style="min-width:0;font-size:.72rem;padding:.35rem .7rem">Esci / cambia account</button></div>' +
  '</div>';
}
function wireAcctRow(){
  var b = document.getElementById("dbxLogout");
  if (b) b.onclick = logout;
  renderAcctRow();
}
// esci: revoca il token, pulisce access+refresh+identità, torna a "Connetti"
function logout(){
  if (tok) dbx(API, "/2/auth/token/revoke", {}).catch(function(){ /* revoca best-effort */ });
  tok = "";
  setAcct(null);
  sessionStorage.removeItem("simona:dbx:tok");
  localStorage.removeItem("simona:dbx:refresh");
  sel.clear(); selMap.clear(); entries = []; cwd = ""; cwdName = "Dropbox";
  render();
  note("Dropbox scollegato — connetti l'account che ti serve");
}
// formati foto gestiti dal pipeline: derivati da Bun.Image (jpeg/png/webp/avif,
// heic/heif e tiff su macOS) + RAW comuni best-effort (scartati per-file col
// report se il decode non passa)
function isImg(e){ return e[".tag"] === "file" && /\.(jpe?g|png|webp|avif|heic|heif|tiff?|dng|cr2|cr3|nef|arw|raf|orf|rw2|pef|srw)$/i.test(e.name); }
function cssEsc(p){ return window.CSS && CSS.escape ? CSS.escape(p) : String(p).replace(/"/g, '\\"'); }

// --- PKCE (spec: src/pkce.ts, test lì) ---
function b64url(u8){ var s = ""; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function verifier(){ var u = new Uint8Array(32); crypto.getRandomValues(u); return b64url(u); }
async function s256(v){ var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)); return b64url(new Uint8Array(d)); }

// --- HTTP Dropbox (Bearer del dispositivo; refresh automatico col refresh token) ---
async function dbx(base, path, args, _retried){
  var r = await fetch(base + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  if (r.status === 401 || r.status === 400){
    var t0 = await r.text().catch(function(){ return ""; });
    // token scaduto/invalido: Dropbox a volte risponde 400 con questo messaggio
    var expired = r.status === 401 || /Invalid authorization value/i.test(t0);
    if (expired){
      if (!_retried && await refreshToken()) return dbx(base, path, args, true);
      tok = ""; sessionStorage.removeItem("simona:dbx:tok");
      render();
      loadAccount(); // tok vuoto → azzera anche l'identità (chip header)
      throw new Error("Sessione Dropbox scaduta — premi «Connetti Dropbox» per rientrare");
    }
  }
  if (!r.ok){
    var t = await r.text().catch(function(){ return ""; });
    throw new Error("Dropbox " + path + ": " + r.status + " " + t.slice(0, 180));
  }
  return r.json();
}

// --- OAuth PKCE (offline: refresh token 30gg, autorizzazione SOLO sul dispositivo — mai sul server) ---
async function connect(){
  var v = verifier(), stO = crypto.randomUUID();
  sessionStorage.setItem("simona:dbx:v", v);
  sessionStorage.setItem("simona:dbx:st", stO);
  // il token VECCHIO (magari scaduto) non deve sopravvivere al giro OAuth:
  // al rientro il pannello deve partire pulito e usare SOLO il codice nuovo
  tok = "";
  acct = null;
  sessionStorage.removeItem("simona:dbx:tok");
  sessionStorage.removeItem("simona:dbx:acct");
  var b = document.getElementById("dbxConn");
  if (b){ b.disabled = true; b.textContent = "Passo a Dropbox…"; }
  var q = new URLSearchParams({
    client_id: CID(), redirect_uri: REDIRECT, response_type: "code",
    code_challenge: await s256(v), code_challenge_method: "S256",
    state: stO, scope: SCOPES, token_access_type: "offline",
  });
  location.href = "https://www.dropbox.com/oauth2/authorize?" + q.toString();
}

// silenzioso: usa il refresh token (localStorage, 30gg) per un nuovo access token
async function refreshToken(){
  var rt = localStorage.getItem("simona:dbx:refresh");
  if (!rt || !CID()) return false;
  try {
    var body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: CID() });
    var r = await fetch(API + "/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body,
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined, // mai pendere: blocca lo scambio OAuth al rientro
    });
    if (!r.ok){
      // 400 = invalid_grant (revocato/scaduto DAVVERO): butta il refresh token.
      // 5xx/rete: transitorio — NON buttarlo, altrimenti un'interruzione momentanea
      // disconnette l'admin per 30 giorni e il bottone "Connetti" ricompare
      // senza che l'utente abbia mai fatto logout.
      if (r.status === 400) localStorage.removeItem("simona:dbx:refresh");
      return false;
    }
    var j = await r.json();
    tok = j.access_token;
    sessionStorage.setItem("simona:dbx:tok", tok);
    if (j.refresh_token) localStorage.setItem("simona:dbx:refresh", j.refresh_token);
    return true;
  } catch (e){ return false; }
}

async function resumeFromRedirect(){
  var q = new URLSearchParams(location.search);
  var code = q.get("code"), stO = q.get("state"), err = q.get("error");
  if (!code && !err) return;
  history.replaceState({}, "", "/admin/");
  if (err){ note("Dropbox: " + err + " " + (q.get("error_description") || ""), true); return; }
  if (stO !== sessionStorage.getItem("simona:dbx:st")){ note("OAuth: state mismatch", true); return; }
  var body = new URLSearchParams({
    code: code, grant_type: "authorization_code", client_id: CID(),
    code_verifier: sessionStorage.getItem("simona:dbx:v") || "", redirect_uri: REDIRECT,
  });
  var r = await fetch(API + "/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body,
    signal: (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(10000) : undefined, // mai pendere all'infinito
  });
  if (!r.ok){ note("token exchange fallito: " + r.status + " " + (await r.text()).slice(0, 180), true); return; }
  var j = await r.json();
  tok = j.access_token;
  sessionStorage.setItem("simona:dbx:tok", tok);
  if (j.refresh_token) localStorage.setItem("simona:dbx:refresh", j.refresh_token); // 30gg, solo dispositivo
  sessionStorage.removeItem("simona:dbx:v");
  sessionStorage.removeItem("simona:dbx:st");
  note("Dropbox connesso ✓");
  render();
  loadAccount(true); // identità fresca: l'account può essere CAMBIATO
  // la vista riparte dal CONTESTO giusto: se un editor è aperto, il picker
  // della galleria (che sa se l'account è quello giusto) — non il browse
  // della root, che nelle gallerie di altri account è solo confusione
  if (targetSlot) { await A.mountPicker(targetSlot); }
  else { await openFolder("", "Dropbox", ""); }
}

// --- registro gallery-map (badge "importata"): id E percorsi delle cartelle usate ---
async function loadMap(){
  if (mapIds) return mapIds;
  try {
    var r = await A.api("/api/gallery-map");
    var j = await r.json();
    mapIds = new Set(); mapPaths = new Set();
    (j.entries || []).forEach(function(e){
      if (e.state === "retired") return;
      if (e.dropboxId) mapIds.add(e.dropboxId);
      if (e.dropboxPath) mapPaths.add(e.dropboxPath);
      (e.folders || []).forEach(function(f){
        if (f.dropboxId) mapIds.add(f.dropboxId);
        if (f.dropboxPath) mapPaths.add(f.dropboxPath);
      });
    });
  } catch (e){ mapIds = new Set(); mapPaths = new Set(); }
  return mapIds;
}

// --- navigazione ---
async function openFolder(path, name, id){
  cwd = path; cwdName = name || "Dropbox"; cwdId = id || "";
  // la selezione PERSISTE tra cartelle (sel/selMap non vengono svuotati)
  note("apro " + (path === "" ? "radice" : name) + "…");
  var res = await dbx(API, "/2/files/list_folder", { path: path, recursive: false, limit: 500 });
  var list = res.entries || [];
  while (res.has_more){
    res = await dbx(API, "/2/files/list_folder/continue", { cursor: res.cursor });
    list = list.concat(res.entries || []);
  }
  entries = list;
  renderCrumb();
  renderList();
  await loadMap();
  renderBadges();
  suggestSlug();
  note(""); // niente conteggi: servono solo errori/stato breve
  loadThumbs(list.filter(isImg).slice(0, 150)); // thumbs per TUTTE (anche già-in-galleria, visibili opache)
}

// foto della cartella corrente selezionabili: in modifica ESCLUDE quelle già nella galleria
function availImgs(){
  return entries.filter(isImg).filter(function(f){
    return !(targetSlot && f.id && galleryIds.has(f.id));
  });
}

async function loadThumbs(files){
  for (var i = 0; i < files.length; i += 25){
    var chunk = files.slice(i, i + 25);
    try {
      var res = await dbx(CONTENT, "/2/files/get_thumbnail_batch", {
        entries: chunk.map(function(f){ return { path: f.path_lower, format: "jpeg", size: "w256h256" }; }),
      });
      (res.entries || []).forEach(function(t){
        if (t[".tag"] !== "success" || !t.metadata) return;
        var img = document.querySelector('#dbxList .cell[data-path="' + cssEsc(t.metadata.path_lower) + '"] img');
        if (img) img.src = "data:image/jpeg;base64," + t.thumbnail;
      });
    } catch (e){ /* thumbs opzionali */ }
  }
}

function suggestSlug(){
  if (cwd === "" || targetSlot) return;
  var s = cwdName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "";
  var sl = A.$("eslug"), ti = A.$("etit"), te = A.$("etien");
  if (s && sl && !sl.value.trim()) sl.value = s;
  if (ti && !ti.value.trim()) ti.value = cwdName;
  if (te && !te.value.trim()) te.value = cwdName;
}

// --- render: SEMPRE incorporato nell'editor (dbxBodyIn); stessa UI per crea/modifica ---
var selGen = 0;       // generazione del pannello selezione (fix race duplicati)

function bodyEl(){ return document.getElementById("dbxBodyIn"); }
function statusEl(){ return document.getElementById("dbxStatusIn"); }

function render(){
  var body = bodyEl();
  if (!body) return;
  if (!tok || !CID()){
    body.innerHTML = '<p class="muted">Connetti l\'account Dropbox per scegliere le foto: l\'autorizzazione resta solo su questo dispositivo — mai sul server.</p>' +
      '<button id="dbxConn" class="ghost">Connetti Dropbox</button>';
    document.getElementById("dbxConn").onclick = connect;
    return;
  }
  body.innerHTML =
    acctRowHtml() +
    '<div class="row" style="align-items:center">' +
      '<div id="dbxCrumb" style="flex:3;font-size:.85rem"></div>' +
      '<div style="flex:0"><button class="ghost" id="dbxReload">Ricarica</button></div>' +
    '</div>' +
    '<div id="dbxList"><p class="muted">…</p></div>' +
    '<div class="row" style="margin-top:.8rem">' +
      '<div style="flex:0"><button class="ghost" id="dbxAll">Tutte</button></div>' +
      '<div style="flex:0"><button class="ghost" id="dbxNone">Nessuna</button></div>' +
      (targetSlot ? '' : '<div style="flex:1"><button id="dbxImport">Crea bozza dalla selezione</button></div>') +
    '</div>' +
    '<div id="dbxSelPanel"></div>';
  wireAcctRow();
  $("dbxReload").onclick = function(){ openFolder(cwd, cwdName, cwdId).catch(function(e){ note(e.message, true); }); };
  $("dbxAll").onclick = function(){ availImgs().forEach(function(f){ sel.add(f.path_lower); selMap.set(f.path_lower, f); }); paintSel(); };
  $("dbxNone").onclick = function(){ availImgs().forEach(function(f){ sel.delete(f.path_lower); selMap.delete(f.path_lower, f); }); paintSel(); };
  if ($("dbxImport")) $("dbxImport").onclick = function(){ createDraft().catch(function(e){ note(e.message, true); }); };
  renderCrumb();
  renderSelPanel();
}

// (closePicker rimosso: il picker non si chiude mai da solo — è Salva, nell'editor, a orchestrare)

// CREAZIONE: selezione → bozza in staging (no git) → editor
async function createDraft(){
  var c = await collectItems();
  // provenienza: cartelle madri di TUTTE le selezionate (la selezione può
  // attraversare più cartelle); id noto solo per la cartella navigata
  var byDir = new Map();
  c.items.forEach(function(it){
    var e = selMap.get(it.path);
    var dir = e && e.path_lower ? (e.path_lower.split("/").slice(0, -1).join("/") || "/") : cwd;
    if (!byDir.has(dir)) byDir.set(dir, { dropboxPath: dir, dropboxId: (dir === cwd && cwdId) ? cwdId : undefined });
  });
  var folders = Array.from(byDir.values());
  var payload = {
    slug: c.slug,
    title: { it: (A.$("etit")?.value || "").trim() || c.slug, en: (A.$("etien")?.value || "").trim() || c.slug },
    source: { kind: "tempLinks", items: payloadItems(c.items), folders: folders, account: acctRef() },
    mode: { kind: "preview", previewMax: 600 },
  };
  var r = await (await A.api("/api/jobs", { method: "POST", body: JSON.stringify(payload) })).json();
  note("bozza in creazione (job " + r.jobId + ")…");
  await waitJob(r.jobId);
  sel.clear(); selMap.clear();
  note("bozza «" + c.slug + "» pronta — apro l\'editor");
  if (A.openSlot) A.openSlot(c.slug);
  if (A.showTab) A.showTab("galleries");
}

// AGGIUNTA: foto già nello slot → semplice PATCH selezione (istantaneo);
// solo foto mai viste → job di import (le vecchie dalla cache, zero download)
async function addToSlot(){
  var slug = targetSlot;
  if (!slug) throw new Error("nessuna bozza di destinazione");
  var c = await collectItems();
  var m = await (await A.api("/staging/" + slug + "/manifest.json")).json();
  var byId = new Map();
  m.items.forEach(function(it){ if (it.dropboxId) byId.set(it.dropboxId, it); });
  var toImport = c.items.filter(function(i){ return !byId.has(i.dropboxId); });
  var note_txt = "";
  if (toImport.length){
    // preserva TUTTI gli item (anche deselezionati: rimuovere = escludere, non cancellare)
    var allOld = m.items.map(function(it){ return { name: it.name, dropboxId: it.dropboxId, rev: it.rev }; });
    // provenienza: cartelle madri delle foto NUOVE (per il registro gallery-map)
    var byDir = new Map();
    toImport.forEach(function(it){
      var e = selMap.get(it.path);
      var dir = e && e.path_lower ? e.path_lower.replace(/\/[^/]+$/, "") : cwd;
      if (!byDir.has(dir)) byDir.set(dir, { dropboxPath: dir, dropboxId: dir === cwd && cwdId ? cwdId : undefined });
    });
    var folders = Array.from(byDir.values());
    var st = await (await A.api("/api/staging/" + slug + "/state")).json();
    var payload = {
      slug: slug,
      title: m.title,
      source: { kind: "tempLinks", items: allOld.concat(payloadItems(toImport)), folders: folders, account: acctRef() },
      mode: st.stage === "proof" || st.stage === "published"
        ? { kind: "client-gallery", pageSize: 24, fullMax: 600, proof: { watermark: true } }
        : { kind: "preview", previewMax: 600 },
    };
    var r = await (await A.api("/api/jobs", { method: "POST", body: JSON.stringify(payload) })).json();
    note_txt = "aggiungo " + toImport.length + " foto nuove a «" + slug + "»…";
    note(note_txt);
    // job proof → serve il manifest dal browser: sentinel + hash fanno partire l'auto-wizard
    if (payload.mode.kind === "client-gallery") {
      var pw = (A.$("epw") && A.$("epw").value) || "";
      sessionStorage.setItem("simona:pw:" + r.jobId, pw || "__NOPW__");
      location.hash = "#job-" + r.jobId;
      if (A.loadJobsOnce) A.loadJobsOnce();
    }
    await waitJob(r.jobId);
    // ricarica il manifest dopo l'import
    m = await (await A.api("/staging/" + slug + "/manifest.json")).json();
    byId = new Map();
    m.items.forEach(function(it){ if (it.dropboxId) byId.set(it.dropboxId, it); });
  }
  // selezione finale = attuale ∪ foto appena scelte (rende robusto anche il ri-aggiungere)
  var selNames = new Set(m.items.filter(function(it){ return it.selected; }).map(function(it){ return it.name; }));
  c.items.forEach(function(i){ var it = byId.get(i.dropboxId); if (it) selNames.add(it.name); });
  await A.api("/staging/" + slug + "/selection", { method: "PATCH", body: JSON.stringify({ selected: Array.from(selNames) }) });
  // resta aperto: in modifica è Salva a orchestrare; svuota solo la selezione consumata
  sel.clear(); selMap.clear(); paintSel();
  note(toImport.length ? "foto aggiunte ✓" : "selezione aggiornata ✓");
  return { added: toImport.length };
}

// attende la fine di un job (polling breve, max 3 min)
async function waitJob(jobId){
  for (var i = 0; i < 90; i++){
    await new Promise(function(res){ setTimeout(res, 2000); });
    var j;
    try { j = await (await A.api("/api/jobs/" + jobId)).json(); }
    catch (e) { continue; }
    if (j.state === "done") return j;
    if (j.state === "failed" || j.state === "cancelled") throw new Error("job fallito: " + (j.error || j.state));
  }
  throw new Error("timeout attesa job");
}

// esposto all'editor (admin.ts): monta il picker nella sezione «Foto — Dropbox»
// dell'editor unificato (dbxBodyIn). slug=null → modalità nuova galleria.
// Se slug esiste: le foto già nella galleria NON vengono mostrate (solo nuove).
A.mountPicker = async function(slug){
  if (targetSlot !== slug){ sel.clear(); selMap.clear(); }
  targetSlot = slug || null;
  galleryIds = new Set();
  // connesso ma identità non ancora caricata (rientro OAuth): aspettala,
  // altrimenti il blocco per-account decide con acct nullo e mostra il
  // picker normale di un account che non è quello della galleria
  if (tok && !acct) { try { await loadAccount(); } catch (e){ /* best-effort */ } }
  var foreignWho = "";   // galleria di un ALTRO account: messaggi contestuali
  if (targetSlot){
    try {
      var m = await (await A.api("/staging/" + targetSlot + "/manifest.json")).json();
      if (m.account && m.account.id){
        foreignWho = m.account.email || m.account.id;
        // blocco per-account: aggiungere foto di un account a una galleria di
        // un altro mescolerebbe provenienze e link originali impossibili.
        // Identità + Esci/cambia account RESTANO disponibili per lo switch.
        if (acct && acct.id && m.account.id !== acct.id){
          bodyEl().innerHTML = acctRowHtml() +
            '<p class="muted" style="margin:.6rem 0 .2rem">🔒 Questa galleria contiene foto dell\'account Dropbox <strong>' + esc(foreignWho) + '</strong>.</p>' +
            '<p class="muted" style="margin:.2rem 0">Per aggiungere foto o modificarla premi <strong>«Esci / cambia account»</strong> qui sopra e connetti ' + esc(foreignWho) + ' — poi riapri la galleria.</p>';
          wireAcctRow();
          if (statusEl()) statusEl().textContent = "";
          return;
        }
      }
      (m.items || []).forEach(function(it){ if (it.dropboxId) galleryIds.add(it.dropboxId); });
    } catch (e){ /* manifest assente: modalità nuova */ }
  }
  render();          // il filtro è già pronto: niente foto già-in-galleria al primo paint
  await openFolder(cwd, cwdName, cwdId);
  // non connesso + galleria di un altro account: il bottone "Connetti Dropbox"
  // va accompagnato da CHI connettere, altrimenti sembra un malfunzionamento
  if (foreignWho && !tok) {
    note("Questa galleria contiene foto dell'account Dropbox " + foreignWho + " — dopo la connessione verifica di usare proprio quell'account.");
  }
};

// usato da Salva/Pubblica nell'editor: fonde la selezione picker nella galleria
A.applyPickerSelection = function(){
  if (!targetSlot) return Promise.resolve({ added: 0 });
  return addToSlot();
};
// quante foto nuove sono selezionate ora (per il dirty tracking dell'editor)
A.pickerSelCount = function(){ return sel.size; };

function renderCrumb(){
  var el = $("dbxCrumb"); if (!el) return;
  var parts = cwd === "" ? [] : cwd.replace(/^\/+/, "").split("/");
  var h = '<a href="#" data-p="" data-n="Dropbox">Dropbox</a>';
  var acc = "";
  parts.forEach(function(p, i){
    acc += (i ? "/" : "") + p;
    h += ' / <a href="#" data-p="' + esc(acc.toLowerCase()) + '" data-n="' + esc(p) + '">' + esc(p) + '</a>';
  });
  el.innerHTML = h;
  el.querySelectorAll("a").forEach(function(a){
    a.style.color = "var(--terra)";
    a.onclick = function(ev){ ev.preventDefault(); openFolder(a.dataset.p, a.dataset.n, "").catch(function(e){ note(e.message, true); }); };
  });
}

function renderList(){
  var el = $("dbxList"); if (!el) return;
  var folders = entries.filter(function(e){ return e[".tag"] === "folder"; });
  var imgs = entries.filter(isImg);
  var h = "";
  folders.forEach(function(f){
    h += '<div class="dbxFolder" data-path="' + esc(f.path_lower) + '" data-id="' + esc(f.id) + '" data-name="' + esc(f.name) + '">📁 ' + esc(f.name) + '</div>';
  });
  if (!folders.length && cwd !== "") h += '<p class="muted" style="margin:.2rem 0">nessuna sottocartella</p>';
  if (targetSlot && imgs.length && imgs.every(function(f){ return f.id && galleryIds.has(f.id); })) {
    h += '<p class="muted" style="margin:.4rem 0 0">Tutte le foto di questa cartella sono già nella galleria ✓</p>';
  }
  h += '<div id="grid" style="margin-top:.6rem">';
  imgs.forEach(function(f){
    var inGal = !!(targetSlot && f.id && galleryIds.has(f.id));
    h += '<div class="cell' + (inGal ? " ingal" : (sel.has(f.path_lower) ? " sel" : "")) + '" data-path="' + esc(f.path_lower) + '" data-id="' + esc(f.id || "") + '" data-rev="' + esc(f.rev || "") + '" data-name="' + esc(f.name) + '" data-ingal="' + (inGal ? 1 : 0) + '" title="' + esc(f.name) + (inGal ? " — già nella galleria" : " — click = seleziona") + '"><img alt=""><span class="dbxChk"></span><span class="dbxZoomIco" title="vedi grande">⤢</span><span class="dbxFn">' + esc(f.name) + '</span></div>';
  });
  h += '</div>';
  if (!imgs.length) h += '<p class="muted">nessuna foto in questa cartella</p>';
  el.innerHTML = h;
  el.querySelectorAll(".dbxFolder").forEach(function(d){
    d.onclick = function(){ openFolder(d.dataset.path, d.dataset.name, d.dataset.id).catch(function(e){ note(e.message, true); }); };
  });
  el.querySelectorAll(".cell").forEach(function(c){
    // click ovunque = seleziona (le già-in-galleria restano solo visibili, opache)
    c.onclick = function(){ if (c.dataset.ingal === "1") return; toggleSel(c); };
    var zi = c.querySelector(".dbxZoomIco");
    if (zi) zi.onclick = function(ev){ ev.stopPropagation(); openZoom(c); };
  });
  paintSel();
}

// seleziona/deseleziona tenendo l'entry completa (serve per cartelle non correnti)
function toggleSel(c){
  var p = c.dataset.path;
  if (sel.has(p)) { sel.delete(p); selMap.delete(p); }
  else {
    sel.add(p);
    var e = entries.find(function(x){ return x.path_lower === p; });
    if (e) selMap.set(p, e);
  }
  paintSel();
}

// --- zoom: anteprima grande (1000px) poi originale (max 1600, I9) — memoizzata,
// con pan/zoom (bottoni + doppio click + drag + pinch) e ritorno all'anteprima ---
var zoomState = { scale: 1, tx: 0, ty: 0 };

function zoomApply(z){
  var img = z && z.querySelector(".wrap img");
  if (!img) return;
  img.style.transform = "translate(" + zoomState.tx + "px," + zoomState.ty + "px) scale(" + zoomState.scale + ")";
  var lv = z.querySelector(".zoomlv");
  if (lv) lv.textContent = Math.round(zoomState.scale * 100) + "%";
  var fit = z.querySelector("#dbxZoomFit");
  if (fit) fit.textContent = zoomState.scale > 1.01 ? "Adatta" : "1:1";
}
function zoomReset(z){ zoomState = { scale: 1, tx: 0, ty: 0 }; zoomApply(z); }
// 1:1 VERO: scala naturale dei pixel (l'immagine «fit» viene ingrandita ai suoi px reali)
function zoomNatural(z){
  var img = z && z.querySelector(".wrap img");
  if (!img) return;
  var fitW = img.offsetWidth || 1;
  var nat = (img.naturalWidth || fitW) / fitW;
  zoomState = { scale: nat, tx: 0, ty: 0 };
  zoomApply(z);
}
function zoomBy(z, f){
  var ns = Math.min(6, Math.max(1, zoomState.scale * f));
  if (ns === 1) { zoomReset(z); return; }
  zoomState.scale = ns; zoomApply(z);
}
function wireZoomBox(z){
  var wrap = z.querySelector(".wrap");
  if (!wrap) return;
  var img0 = wrap.querySelector("img");
  if (img0) img0.draggable = false; // il drag nativo dell'img hijacka il pan col mouse
  // drag a 1 dito/mouse per pan quando zoom > 1 (pinch = 2 dita)
  var ptrs = new Map();
  var pinchBase = null;
  wrap.addEventListener("dragstart", function(e){ e.preventDefault(); });
  wrap.addEventListener("pointerdown", function(e){
    e.preventDefault();
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    if (zoomState.scale > 1) wrap.style.cursor = "grabbing";
  });
  wrap.addEventListener("pointermove", function(e){
    if (!ptrs.has(e.pointerId)) return;
    var prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1 && zoomState.scale > 1){
      zoomState.tx += e.clientX - prev.x; zoomState.ty += e.clientY - prev.y; zoomApply(z);
    } else if (ptrs.size === 2){
      var pts = Array.from(ptrs.values());
      var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchBase) { zoomState.scale = Math.min(6, Math.max(1, pinchBase.scale * (dist / pinchBase.dist))); zoomApply(z); }
      else pinchBase = { dist: dist, scale: zoomState.scale };
    }
  });
  var up = function(e){ ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchBase = null; if (!ptrs.size) wrap.style.cursor = zoomState.scale > 1 ? "grab" : ""; };
  wrap.addEventListener("pointerup", up); wrap.addEventListener("pointercancel", up);
  wrap.addEventListener("dblclick", function(){ zoomState.scale > 1 ? zoomReset(z) : zoomBy(z, 2.5); });
  wrap.addEventListener("wheel", function(e){ e.preventDefault(); zoomBy(z, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
}

function zoomBoxHtml(z, name, memo){
  var cur = memo.origUrl ? "originale" : "anteprima";
  z.innerHTML = '<div class="fn">' + esc(name) + '</div><div class="zoomlv">100%</div>' +
    '<div class="wrap"><img alt="' + esc(name) + '"></div>' +
    '<div class="bar">' +
      '<span class="seg" style="margin:0 .6rem 0 0"><span class="lb">risoluzione</span>' +
        '<button id="dbxResPrev" class="' + (cur === "anteprima" ? "on" : "") + '">anteprima</button>' +
        '<button id="dbxResOrig" class="' + (cur === "originale" ? "on" : "") + '">' + (memo.origUrl ? "originale" : "originale 1600px") + '</button></span>' +
      '<button id="dbxZoomOut" class="ghost" title="riduci">−</button>' +
      '<button id="dbxZoomFit" class="ghost" title="scala 1:1 dei pixel, o torna a adattare alla finestra">1:1</button>' +
      '<button id="dbxZoomIn" class="ghost" title="ingrandisci">+</button>' +
      '<button id="dbxClose" class="ghost">Chiudi</button>' +
    '</div>';
  var img = z.querySelector("img");
  img.src = memo.origUrl || memo.prevUrl;
  zoomReset(z);
  wireZoomBox(z);
  var markRes = function (which) {
    var p = z.querySelector("#dbxResPrev"), o = z.querySelector("#dbxResOrig");
    if (p) p.classList.toggle("on", which === "anteprima");
    if (o) o.classList.toggle("on", which === "originale");
  };
  z.querySelector("#dbxClose").onclick = function(){ z.remove(); };
  z.querySelector("#dbxZoomIn").onclick = function(){ zoomBy(z, 1.4); };
  z.querySelector("#dbxZoomOut").onclick = function(){ zoomBy(z, 1 / 1.4); };
  z.querySelector("#dbxZoomFit").onclick = function(){ zoomState.scale > 1.01 ? zoomReset(z) : zoomNatural(z); };
  z.querySelector("#dbxResPrev").onclick = function(){
    img.src = memo.prevUrl; zoomReset(z); markRes("anteprima");
  };
  z.querySelector("#dbxResOrig").onclick = async function(){
    if (memo.origUrl) { img.src = memo.origUrl; zoomReset(z); markRes("originale"); return; }
    var b = this;
    b.disabled = true; b.textContent = "elaboro…";
    try {
      var o = await A.api("/api/media/" + memo.key + "/original?w=1600");
      memo.origUrl = URL.createObjectURL(await o.blob());
      img.src = memo.origUrl; zoomReset(z);
      b.textContent = "originale"; b.disabled = false;
      markRes("originale");
    } catch (e){ b.disabled = false; b.textContent = "riprova"; alert(e.message); }
  };
}

async function openZoom(cell){
  var path = cell.dataset.path, name = cell.dataset.name;
  var id = cell.dataset.id || "", rev = cell.dataset.rev || "";
  var z = document.getElementById("dbxZoom");
  if (!z){
    z = document.createElement("div");
    z.id = "dbxZoom";
    document.body.appendChild(z);
    z.addEventListener("click", function(e){ if (e.target === z) z.remove(); });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") z.remove(); });
  }
  var memo = zoomMemo[path];
  if (memo){
    // già vista in questa sessione: istantanea, nessun re-download (né client né server)
    zoomBoxHtml(z, name, memo);
    return;
  }
  z.innerHTML = '<div class="spin">preparo la foto…</div>';
  try {
    // link temporaneo (browser-side) → preview 1000px via /api/cache (server cachea l'originale)
    var r = await dbx(API, "/2/files/get_temporary_link", { path: path });
    var res = await A.api("/api/cache", { method: "POST", body: JSON.stringify({ tempLink: r.link, dropboxId: id, rev: rev, name: name }) });
    var key = res.headers.get("X-Cache-Key") || "";
    var memoObj = { prevUrl: URL.createObjectURL(await res.blob()), key: key, origUrl: null };
    zoomMemo[path] = memoObj;
    zoomBoxHtml(z, name, memoObj);
  } catch (e){
    z.innerHTML = '<div class="spin">errore: ' + esc(String(e.message || e)) + '</div><div class="bar"><button id="dbxClose" class="ghost">Chiudi</button></div>';
    z.querySelector("#dbxClose").onclick = function(){ z.remove(); };
  }
}

// derivata 1600 on-demand: la chiave contiene ":" (URL-safe in path), NON encodeURIComponent
// (che la maschera in %3A e rompe il match della rotta lato server).
// dopo il passaggio all'originale offre il ritorno all'anteprima 1000px
async function fetchOriginal(z, memo){
  var b = z.querySelector("#dbxOrig");
  if (!b || !memo.key) return;
  b.disabled = true; b.textContent = "elaboro…";
  try {
    var o = await A.api("/api/media/" + memo.key + "/original?w=1600");
    memo.origUrl = URL.createObjectURL(await o.blob());
    var img = z.querySelector(".wrap img");
    if (img){ img.src = memo.origUrl; zoomReset(z); }
    b.textContent = "originale ✓";
    if (!z.querySelector("#dbxPrevRes")){
      var pr = document.createElement("button");
      pr.id = "dbxPrevRes"; pr.className = "ghost"; pr.textContent = "Torna all\'anteprima";
      pr.onclick = function(){ if (img) img.src = memo.prevUrl; zoomReset(z); pr.remove(); };
      b.parentNode.insertBefore(pr, b);
    }
  } catch (e){ b.disabled = false; b.textContent = "riprova originale"; alert(e.message); }
}

function renderBadges(){
  if (!mapIds) return;
  document.querySelectorAll("#dbxList .dbxFolder").forEach(function(d){
    var usata = mapIds.has(d.dataset.id) || mapPaths.has(d.dataset.path);
    if (usata && !d.querySelector(".tag")){
      d.insertAdjacentHTML("beforeend", ' <span class="tag ok">importata</span>');
    }
  });
}

function paintSel(){
  document.querySelectorAll("#dbxList .cell").forEach(function(c){
    // le foto già nella galleria non vengono proprio renderizzate (availImgs)
    c.classList.toggle("sel", sel.has(c.dataset.path));
    var chk = c.querySelector(".dbxChk");
    if (chk) chk.textContent = sel.has(c.dataset.path) ? "✓" : "";
    var fn = c.querySelector(".dbxFn");
    if (fn) fn.textContent = c.dataset.name;
    c.title = c.dataset.name + " — click = seleziona";
  });
  renderSelPanel();
}

// --- riepilogo selezione: raggruppato per cartella, persiste tra navigazioni ---
function renderSelPanel(){
  var panel = document.getElementById("dbxSelPanel");
  if (!panel) return;
  selGen++; // invalida le thumb batch in volo delle render precedenti (fix duplicati)
  var gen = selGen;
  if (!sel.size){
    panel.innerHTML = '<p class="muted" style="margin:0">' + (targetSlot
      ? 'Nessuna foto selezionata — clicca le foto da aggiungere e premi Salva.'
      : 'Nessuna foto selezionata — clicca le foto (anche in più cartelle) e poi crea la bozza.') + '</p>';
    return;
  }
  var groups = {};
  sel.forEach(function(p){
    var dir = p.lastIndexOf("/") === -1 ? "/" : p.slice(0, p.lastIndexOf("/")) || "/";
    (groups[dir] = groups[dir] || []).push(p);
  });
  var dirs = Object.keys(groups).sort();
  var h = '<div style="display:flex;align-items:baseline;gap:.8rem;flex-wrap:wrap">' +
    '<strong>' + sel.size + ' foto selezionate</strong><span class="muted">· ' + dirs.length + ' cartelle</span>' +
    '<button class="rmv" id="dbxSelClear" style="margin-left:auto">svuota selezione</button></div>';
  dirs.forEach(function(dir){
    h += '<div class="grp" data-dir="' + esc(dir) + '"><div class="pth">Dropbox' + esc(dir === "/" ? "" : dir) +
      ' <button class="rmv" data-rmgroup="' + esc(dir) + '">rimuovi gruppo</button></div><div class="thumbs"></div></div>';
  });
  panel.innerHTML = h;
  document.getElementById("dbxSelClear").onclick = function(){ sel.clear(); selMap.clear(); paintSel(); };
  panel.querySelectorAll("[data-rmgroup]").forEach(function(b){
    b.onclick = function(){
      var dir = b.dataset.rmgroup;
      groups[dir].forEach(function(p){ sel.delete(p); selMap.delete(p); });
      paintSel();
    };
  });
  // thumbnail batch per TUTTE le selezionate (funziona per path di qualsiasi cartella)
  var all = [];
  sel.forEach(function(p){ all.push(p); });
  for (var i = 0; i < all.length; i += 20)(function(chunk){
    dbx(CONTENT, "/2/files/get_thumbnail_batch", {
      entries: chunk.map(function(p){ return { path: p, format: "jpeg", size: "w256h256" }; }),
    }).then(function(res){
      if (gen !== selGen) return; // render superata: scarta
      (res.entries || []).forEach(function(t){
        if (t[".tag"] !== "success" || !t.metadata) return;
        var dir = t.metadata.path_lower.slice(0, t.metadata.path_lower.lastIndexOf("/")) || "/";
        var grp = panel.querySelector('.grp[data-dir="' + cssEsc(dir) + '"] .thumbs');
        if (!grp) return;
        if (grp.querySelector('img[data-p="' + cssEsc(t.metadata.path_lower) + '"]')) return; // già presente
        var img = document.createElement("img");
        img.src = "data:image/jpeg;base64," + t.thumbnail;
        img.alt = t.metadata.name;
        img.title = t.metadata.name;
        img.dataset.p = t.metadata.path_lower;
        img.onclick = function(){ // click sul thumb del riepilogo = rimuovi dalla selezione
          sel.delete(t.metadata.path_lower); selMap.delete(t.metadata.path_lower); paintSel();
        };
        grp.appendChild(img);
      });
    }).catch(function(){ /* thumbs opzionali */ });
  })(all.slice(i, i + 20));
}

// --- import: temp link per selezionati → job esistente (fase 1+2 admin) ---
// usa selMap (selezione persistente: anche foto di cartelle non correnti)
async function collectItems(){
  if (!sel.size) throw new Error("nessuna foto selezionata");
  if (!A.state.token) throw new Error("prima fai login GitHub (serve per creare il job)");
  var slug = (targetSlot || (A.$("eslug") ? A.$("eslug").value : "") || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) throw new Error("slug non valido (compila il campo Slug nell\'editor: minuscole, numeri, - e _)");
  note("genero " + sel.size + " temporary link…");
  var items = [];
  var paths = [];
  sel.forEach(function(p){ paths.push(p); });
  for (var i = 0; i < paths.length; i++){
    var e = selMap.get(paths[i]);
    if (!e) continue;
    var r = await dbx(API, "/2/files/get_temporary_link", { path: e.path_lower });
    items.push({ name: e.name.replace(/.[^.]+$/, ""), url: r.link, dropboxId: e.id, rev: e.rev, path: e.path_lower });
    note("temp link " + (i + 1) + "/" + paths.length);
  }
  return { slug: slug, items: items };
}

// item per il payload al server: SOLO i campi usati dal runner. Il path resta
// client-side (cartelle di provenienza in addToSlot) — un percorso Dropbox NON
// è un file locale e non deve mai raggiungere il resolver del server.
function payloadItems(items){
  return items.map(function(i){ return { name: i.name, url: i.url, dropboxId: i.dropboxId, rev: i.rev }; });
}

// --- STEP 1: anteprima (D7 L1) — staging only, git mai toccato ---
async function makePreview(){
  var c = await collectItems();
  var prevMax = Number($("dbxPrevRes") ? $("dbxPrevRes").value : 600) || 600;
  var payload = {
    slug: c.slug,
    title: { it: $("tit").value.trim() || c.slug, en: $("tien").value.trim() || c.slug },
    source: { kind: "tempLinks", items: payloadItems(c.items), folder: cwdId ? { dropboxId: cwdId, dropboxPath: cwd } : undefined },
    mode: { kind: "preview", previewMax: prevMax },
  };
  var r = await (await A.api("/api/jobs", { method: "POST", body: JSON.stringify(payload) })).json();
  note("anteprima avviata (job " + r.jobId + ") — staging, nessuna pubblicazione");
  var box = document.getElementById("dbxPrevBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "dbxPrevBox";
    box.style.cssText = "margin-top:.8rem;padding:.8rem;border:1px solid var(--border);border-radius:8px";
    $("dbxBody").appendChild(box);
  }
  box.innerHTML = '<strong>Anteprima «' + esc(c.slug) + '»</strong> — job ' + esc(r.jobId) + ' <span class="tag run">pending</span>';
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  sessionStorage.setItem("simona:prev:" + c.slug, r.jobId);
  await pollPreviewDone(r.jobId, c.slug, prevMax);
}

async function pollPreviewDone(jobId, slug, prevMax){
  var box = document.getElementById("dbxPrevBox");
  for (var i = 0; i < 60; i++){
    await new Promise(function(res){ setTimeout(res, 2000); });
    var j;
    try { j = await (await A.api("/api/jobs/" + jobId)).json(); }
    catch (e) { continue; }
    if (j.state === "done") { renderPreviewActions(slug, prevMax); note("anteprima pronta ✓ (staging, TTL 7gg)"); return; }
    if (j.state === "failed" || j.state === "cancelled") { note("anteprima fallita: " + (j.error || j.state), true); return; }
    if (box) {
      var res = j.result || {};
      box.innerHTML = '<strong>Anteprima «' + esc(slug) + '»</strong> — job ' + esc(jobId) +
        ' <span class="tag run">' + esc(j.state) + "</span>" +
        (res.ok != null ? ' <span class="muted">' + res.ok + "/" + res.total + " foto</span>" : "") +
        '<pre style="margin-top:.5rem;max-height:140px">' + (j.log || []).slice(-6).map(esc).join("\n") + "</pre>";
    }
  }
  note("anteprima: timeout polling", true);
}

function renderPreviewActions(slug, prevMax){
  var box = document.getElementById("dbxPrevBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "dbxPrevBox";
    box.style.cssText = "margin-top:.8rem;padding:.8rem;border:1px solid var(--border);border-radius:8px";
    $("dbxBody").appendChild(box);
  }
  box.innerHTML =
    '<strong>Bozza «' + esc(slug) + '»</strong>' +
    '<div class="row" style="margin-top:.5rem">' +
      '<div style="flex:0"><button class="ghost" id="dbxL1">Vedi le foto</button></div>' +
      '<div style="flex:0"><button class="ghost" id="dbxProof">Salva</button></div>' +
      '<div style="flex:0"><button id="dbxPub">Pubblica</button></div>' +
      '<div style="flex:0"><button class="danger" id="dbxDrop">Elimina bozza</button></div>' +
    '</div>' +
    '<p class="muted" style="margin-top:.4rem;font-size:.8rem">Dopo «Salva bozza online» il link del sito compare in Gallerie → Bozze («Copia link bozza»).</p>' +
    '<div id="dbxPrevOut" class="link" style="margin-top:.5rem"></div>';
  $("dbxL1").onclick = async function(){
    try {
      var m = await (await A.api("/staging/" + slug + "/manifest.json")).json();
      var out = $("dbxPrevOut");
      out.innerHTML = "";
      for (var k = 0; k < m.items.length; k++) {
        (function(it){
          var img = document.createElement("img");
          img.alt = it.name;
          img.style.cssText = "width:110px;border-radius:6px;margin:2px";
          A.api("/staging/" + slug + "/" + it.thumb)
            .then(function(r){ return r.blob(); })
            .then(function(b){ img.src = URL.createObjectURL(b); });
          out.appendChild(img);
        })(m.items[k]);
      }
    } catch (e) { note(String(e.message || e), true); }
  };
  $("dbxProof").onclick = function(){ publishFromSelection(true).catch(function(e){ note(e.message, true); }); };
  $("dbxPub").onclick = function(){ publishFromSelection(false).catch(function(e){ note(e.message, true); }); };
  $("dbxDrop").onclick = async function(){
    await A.api("/api/staging/" + slug, { method: "DELETE" });
    box.remove();
    note("slot eliminato");
  };
}

// campo mancante → evidenzia e porta a lui (prima di lanciare il job)
function requireField(id, label){
  var el = $(id);
  var v = (el.value || "").trim();
  if (!v || (id === "pw" && v.length < 12)) {
    el.style.borderColor = "var(--danger)";
    el.focus();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(function(){ el.style.borderColor = ""; }, 2500);
    throw new Error(label + " mancante (campo evidenziato nel form sotto)");
  }
  return v;
}

// --- STEP 2: publish (proof = watermark 600 | completa = web size + link) ---
async function publishFromSelection(proof){
  // password facoltativa: vuota = bozza/galleria libera (protetta dal token URL)
  var pw = "";
  var pwEl = $("epw");
  if (pwEl) {
    pw = (pwEl.value || "").trim();
    if (pw && pw.length < 12) throw new Error("password troppo corta (≥12 char) — o svuota il campo per non usarla");
  }
  var c = await collectItems();
  // link originali: checkbox editor → riuso/creazione automatica (solo galleria definitiva)
  var originalsUrl;
  if (!proof && A.$("eidrop") && A.$("eidrop").checked){
    try { originalsUrl = await ensureOriginalsLink(c.slug, pw); }
    catch (e){ if (!confirm("Link originali Dropbox non creato: " + e.message + "\n\nContinuo senza?")) return; }
  }
  var payload = {
    slug: c.slug,
    title: { it: (A.$("etit")?.value || "").trim() || c.slug, en: (A.$("etien")?.value || "").trim() || c.slug },
    source: { kind: "tempLinks", items: c.items, folder: cwdId ? { dropboxId: cwdId, dropboxPath: cwd } : undefined, account: acctRef() },
    mode: {
      kind: "client-gallery",
      pageSize: Number($("ps")?.value) || 24,
      fullMax: proof ? 600 : (Number($("fm")?.value) || 1600),
      proof: proof ? { watermark: true } : undefined,
      dropboxOriginalsUrl: originalsUrl,
    },
  };
  var r = await (await A.api("/api/jobs", { method: "POST", body: JSON.stringify(payload) })).json();
  sessionStorage.setItem("simona:pw:" + r.jobId, pw || "__NOPW__");
  note((proof ? "proof" : "galleria") + " avviata — job " + r.jobId + " (il wizard password completa)");
  location.hash = "#job-" + r.jobId;
  A.loadJobsOnce();
  $("jobs").scrollIntoView({ behavior: "smooth" });
}

async function importSelection(){
  await publishFromSelection(false);
}

// --- link condiviso originali (D22): AUTOMATICO da checkbox nell'editor.
// Riusa il link esistente della cartella di provenienza; se assente lo crea
// con la STESSA password della galleria (se impostata; su account free senza
// password-link il fallback è pubblico, con avviso). ---
async function folderPathForSlug(slug){
  // 1) registro gallery-map (cartella di provenienza registrata a publish)
  try {
    var r = await A.api("/api/gallery-map");
    var j = await r.json();
    var e = (j.entries || []).find(function(x){ return x.slug === slug && x.state !== "retired"; });
    if (e && e.dropboxPath) return e.dropboxPath;
  } catch (e){ /* best-effort */ }
  // 2) picker corrente in modalità aggiunta alla stessa galleria
  if (targetSlot === slug && cwd !== "") return cwd;
  return null;
}

async function ensureOriginalsLink(slug, galleryPw){
  if (!tok) throw new Error("connetti Dropbox per generare il link originali");
  var folder = await folderPathForSlug(slug);
  if (!folder) throw new Error("cartella di provenienza sconosciuta: apri la cartella Dropbox della galleria e riprova");
  note("controllo link originali esistenti…");
  // riuso: link già presente per quella cartella
  try {
    var ex = await dbx(API, "/2/sharing/list_shared_links", { path: folder });
    if ((ex.links || []).length){ note("link originali riusato ✓"); return ex.links[0].url; }
  } catch (e){ /* nessun link: prosegui con la creazione */ }
  var mk = async function(vis, pw){
    var settings = { requested_visibility: vis.toLowerCase() };
    if (vis === "PASSWORD") settings.link_password = pw;
    var c = await dbx(API, "/2/sharing/create_shared_link_with_settings", { path: folder, settings: settings });
    return c.url;
  };
  try {
    var url = galleryPw
      ? await mk("PASSWORD", galleryPw)
      : await mk("PUBLIC", "");
    note("link originali creato ✓");
    return url;
  } catch (e){
    var m = String(e.message || e);
    if (m.indexOf("shared_link_already_exists") >= 0 || m.indexOf("409") >= 0){
      var ex2 = await dbx(API, "/2/sharing/list_shared_links", { path: folder });
      var l2 = ex2.links || [];
      if (l2.length){ note("link originali riusato ✓"); return l2[0].url; }
    }
    // password non disponibile (free) → fallback pubblico con avviso
    if (galleryPw && /password|visibility|professional/i.test(m)){
      note("Dropbox free: link originali creato pubblico (il piano Professional permette la password)", true);
      return await mk("PUBLIC", "");
    }
    throw e;
  }
}
A.ensureOriginalsLink = ensureOriginalsLink;
A.dbxAccount = function(){ return acct; };

// --- bootstrap ---
// 1) rientro dall'OAuth (?code=…): lo scambio del codice È la connessione —
//    PRIMA di tutto, senza passare dal refresh (lento/pendente) e senza
//    aprire la root: la vista la decide il contesto (resumeFromRedirect).
// 2) avvio normale: refresh silenzioso col token a 30gg, poi picker.
(async function(){
  var q = new URLSearchParams(location.search);
  if (q.get("code") || q.get("error")){
    try { await resumeFromRedirect(); } catch (e){ note(String(e.message || e), true); }
    return;
  }
  if (!tok) await refreshToken(); // sessione nuova/tab nuovo → access token fresco senza login
  render();
  loadAccount(); // identità (cache immediata + refresh best-effort)
  if (tok){
    openFolder("", "Dropbox", "").catch(function(e){ note(String(e.message || e), true); });
  }
})();
})();
