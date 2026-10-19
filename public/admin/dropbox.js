(() => {
"use strict";
var A = window.__admin;
function CID() { return window.__DROPBOX_CLIENT_ID || ""; }
var REDIRECT = location.origin + location.pathname;
if (REDIRECT.charAt(REDIRECT.length - 1) !== "/") REDIRECT += "/";
var SCOPES = "account_info.read files.content.read files.content.write files.metadata.read sharing.read sharing.write";
var API = "https://api.dropboxapi.com";
var CONTENT = "https://content.dropboxapi.com";
var $ = A.$;
// access token: sessionStorage E localStorage (cache). Il refresh token
// (30gg, ben più potente) è sempre stato in localStorage: cache-are qui
// l'access (~4h) non cambia la superficie. Motivo: alcuni profili browser
// perdono il sessionStorage tra i caricamenti (ripristino tab, ETP,
// private) — senza cache il pannello dimentica di essere connesso.
function saveTok(t){
  tok = t;
  try { sessionStorage.setItem("simona:dbx:tok", t); } catch (e){ /* ok */ }
  try { localStorage.setItem("simona:dbx:tok", t); } catch (e){ /* ok */ }
}
function clearTok(){
  tok = "";
  try { sessionStorage.removeItem("simona:dbx:tok"); } catch (e){ /* ok */ }
  try { localStorage.removeItem("simona:dbx:tok"); } catch (e){ /* ok */ }
}
var tok = "";
try { tok = sessionStorage.getItem("simona:dbx:tok") || localStorage.getItem("simona:dbx:tok") || ""; } catch (e){ tok = ""; }
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
// --- D26: gestione contenuti + seeding ---
var uiMode = "pick";          // segment del pannello: "pick" (Scegli foto) | "manage" (Gestisci)
var hostId = "dbxBodyIn";     // contenitore attivo: editor ("dbxBodyIn") o tab Dropbox ("dbxTabBody")
var standalone = false;       // true SOLO nel tab Dropbox: gestione libera, niente creazione galleria
var fileReg = new Map();      // path_lower → File caricati in QUESTA sessione (memoria per il seeding)
var seededOk = new Set();     // "id:rev" già inviati al server (il seed non si ripete)
var uplQ = [];                // coda upload visibile {name, file, pct, st, msg, url}

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
  "#dbxSelPanel .rmv{background:transparent;border:0;color:var(--terra);cursor:pointer;font-size:.75rem;padding:.2rem .4rem;min-height:auto;min-width:auto;letter-spacing:.04em}" +
  // --- D26: modalità Gestisci (segment, azioni cartelle, dropzone on-drag, coda upload, tile, dialoghi) ---
  ".dbxSeg{display:inline-flex;border:1px solid var(--border);margin:.2rem 0 .9rem}" +
  ".dbxSeg button{background:transparent;border:0;color:var(--muted);padding:.45rem .95rem;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;min-height:0;min-width:0;cursor:pointer;border-radius:0;font-family:var(--sans);font-weight:500}" +
  ".dbxSeg button.on{background:var(--ink);color:var(--ivory)}" +
  ".dbxSeg button:hover{background:transparent;color:var(--ink)}" +
  ".dbxSeg button.on:hover{background:var(--ink);color:var(--ivory)}" +
  ".dbxAct{background:transparent;border:1px solid var(--border);color:var(--muted);padding:.18rem .4rem;font-size:.82rem;line-height:1;cursor:pointer;border-radius:0;min-height:0;min-width:0;font-family:var(--sans)}" +
  ".dbxAct:hover{border-color:var(--ink);color:var(--ink)}" +
  ".dbxAct.danger{border-color:transparent;color:var(--danger)}" +
  ".dbxAct.danger:hover{border-color:var(--danger);color:var(--danger)}" +
  ".dbxAct:disabled{opacity:.35;cursor:not-allowed}" +
  ".dbxFolders .dbxFolder{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}" +
  ".dbxFolders .dbxFolder .fact{margin-left:auto;display:flex;gap:.3rem;flex-wrap:nowrap;align-items:center}" +
  ".dbxDrop{display:none;border:2px dashed var(--terra);background:var(--card);padding:.9rem 1rem;text-align:center;font-size:.85rem;color:var(--terra);letter-spacing:.05em;margin:.6rem 0}" +
  ".dbxDrop.on{display:block}" +
  "#dbxMGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;margin-top:.6rem}" +
  "#dbxMGrid .cell{position:relative;overflow:hidden;cursor:zoom-in}" +
  "#dbxMGrid .cell img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:var(--card)}" +
  "#dbxMGrid .upltile{border:2px dashed var(--border);aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.3rem;cursor:pointer;color:var(--muted);font-size:.72rem;letter-spacing:.06em;text-align:center;touch-action:manipulation}" +
  "#dbxMGrid .upltile:hover{border-color:var(--terra);color:var(--terra)}" +
  "#dbxMGrid .upltile .ic{font-size:1.4rem;line-height:1}" +
  ".dbxUpl{margin-top:.8rem}" +
  ".dbxUplRow{display:grid;grid-template-columns:50px 1fr;gap:.6rem;align-items:center;padding:.4rem 0;border-bottom:1px solid var(--border)}" +
  ".dbxUplRow img{width:50px;height:38px;object-fit:cover;display:block}" +
  ".dbxPbar{height:5px;background:var(--border);margin-top:4px;position:relative;overflow:hidden}" +
  ".dbxPbar i{position:absolute;inset:0;right:100%;background:var(--terra);transition:right .25s}" +
  ".dbxPlab{font-size:.72rem;color:var(--muted)}" +
  ".dbxPlab b{color:var(--ok);font-weight:500}" +
  ".dbxPlab .err{color:var(--danger)}" +
  "#dbxTree{border:1px solid var(--border);max-height:300px;overflow:auto;margin-top:.5rem}" +
  "#dbxTree .tnode{padding:.35rem .55rem;border-bottom:1px solid var(--border);font-size:.9rem}" +
  "#dbxTree .tn{display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.2rem}" +
  "#dbxTree .tn:hover{background:var(--card)}" +
  "#dbxTree .tn.sel{background:var(--ink);color:var(--ivory)}" +
  "#dbxTree .tn.dis{opacity:.45;cursor:not-allowed}" +
  "#dbxTree .kids{margin-left:1.1rem;border-left:1px solid var(--border);padding-left:.35rem}" +
  "#dbxTree .tw{color:var(--muted);width:1em;text-align:center;cursor:pointer}" +
  "#dbxTree .tw:hover{color:var(--terra)}" +
  "#dbxTree .tnew{color:var(--muted);cursor:pointer;font-size:.85rem;padding:0 .2rem}" +
  "#dbxTree .tnew:hover{color:var(--terra)}" +
  "#dbxTree .tnin{font:inherit;font-size:.85rem;padding:.15rem .35rem;width:11rem;max-width:55%;border:1px solid var(--terra);background:var(--card);color:inherit;border-radius:4px}" +
  "#dbxTree .tnok{color:var(--muted);cursor:pointer;padding:0 .25rem}" +
  "#dbxTree .tnok:hover{color:var(--terra)}" +
  "#dbxTree .tdest{margin-top:.5rem;padding:.45rem .1rem 0;border-top:1px solid var(--border);font-size:.85rem;color:var(--muted)}" +
  "#dbxTree .tdest b{color:var(--terra)}" +
  "#dbxTree .mks{color:var(--muted);font-style:italic;font-size:.85rem}" +
  "#dbxMSelBar{display:flex;gap:.5rem;align-items:center;margin:.2rem 0 .55rem;flex-wrap:wrap}" +
  "#dbxMSelBar .n{font-size:.85rem;color:var(--muted)}" +
  ".nothumb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.72rem;letter-spacing:.08em;color:var(--muted);background:var(--card);pointer-events:none}" +
  // skeleton mentre il thumb Dropbox non è ancora arrivato (src vuoto): niente
  // alt text sparso, solo un shimmer neutro che sparisce appena src si riempie
  "#dbxList .cell img[src=\"\"],#dbxMGrid .cell img[src=\"\"]{color:transparent;font-size:0;background:linear-gradient(100deg,var(--card) 40%,var(--panel) 50%,var(--card) 60%);background-size:200% 100%;animation:dbxSk 1.1s linear infinite}" +
  "@keyframes dbxSk{to{background-position:-200% 0}}" +
  ".skcell{aspect-ratio:1;border-radius:0;background:linear-gradient(100deg,var(--card) 40%,var(--panel) 50%,var(--card) 60%);background-size:200% 100%;animation:dbxSk 1.1s linear infinite}" +
  ".dbxPager{grid-column:1/-1;display:flex;gap:.6rem;align-items:center;justify-content:center;margin-top:.5rem}" +
  ".dbxRes{display:flex;justify-content:space-between;gap:1rem;align-items:baseline;padding:.45rem .55rem;border-bottom:1px solid var(--border);cursor:pointer;font-size:.85rem;flex-wrap:wrap}" +
  ".dbxRes:hover{background:var(--card)}" +
  ".cell.flash{outline:3px solid var(--terra);outline-offset:-3px}" +
  ".dbxDlg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:1rem}" +
  ".dbxDlg[hidden]{display:none}" +
  ".dbxDlg .box{background:var(--panel);border:1px solid var(--border);padding:1.3rem;max-width:440px;width:100%;max-height:85vh;overflow:auto}" +
  ".dbxDlg h3{font-family:var(--serif);font-weight:600;font-size:1.15rem;margin:0 0 .6rem}" +
  ".dbxDlg input[type=text]{width:100%;padding:.55rem .7rem;border:1px solid var(--border);border-radius:0;background:var(--ivory);color:var(--ink);font-size:.95rem;font-family:var(--sans)}" +
  ".dbxMvB{background:transparent;border:0;color:var(--muted);padding:.05rem .3rem;font-size:.78rem;cursor:pointer;line-height:1;min-height:0;min-width:0}" +
  ".dbxMvB:hover{color:var(--terra)}";
document.head.appendChild(st);

function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function note(m, isErr){ var el = statusEl(); if (el){ el.textContent = m || ""; el.style.color = isErr ? "var(--danger)" : "var(--muted)"; } }

// --- diagnostica connessione (localStorage: sopravvive ai reload, si legge nella tab) ---
function diag(obj){
  try { localStorage.setItem("simona:dbx:diag", JSON.stringify(Object.assign({ at: new Date().toISOString() }, obj))); } catch (e){ /* ok */ }
}
function diagHtml(){
  try {
    var d = JSON.parse(localStorage.getItem("simona:dbx:diag") || "null");
    if (!d || !d.msg) return "";
    return '<p class="muted" style="margin:.55rem 0 0;font-size:.75rem">Ultimo tentativo (' + String(d.at || "").slice(11, 19) + '): ' + esc(d.msg) + '</p>';
  } catch (e){ return ""; }
}

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
// esci: revoca il token, pulisce access+refresh+identità, torna a "Connetti".
// Il revoke va con fetch DIRETTO col token morente: passato in dbx(), se il
// token era scaduto scattava refreshToken() che RISALVAVA token+refresh negli
// storage DOPO il clearTok() già avvenuto — il logout si annullava da solo.
function logout(){
  var dying = tok;
  // PRIMA si toglie il refresh: da qui in poi nessun refresh silenzioso
  // può riscrivere credenziali appena pulite
  localStorage.removeItem("simona:dbx:refresh");
  if (dying){
    fetch(API + "/2/auth/token/revoke", {
      method: "POST",
      headers: { Authorization: "Bearer " + dying, "Content-Type": "application/json" },
      body: "{}",
    }).catch(function(){ /* revoca best-effort: comunque scollegato qui */ });
  }
  clearTok();
  setAcct(null);
  try { localStorage.removeItem("simona:dbx:pkce"); } catch (e){ /* ok */ }
  try { localStorage.removeItem("simona:dbx:diag"); } catch (e){ /* ok */ }
  sel.clear(); selMap.clear(); entries = []; cwd = ""; cwdName = "Dropbox"; cwdId = "";
  fileReg.clear(); seededOk.clear(); uplQ = [];
  thumbCache.clear(); noThumb.clear(); mngSel.clear(); zoomMemo = {};
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
    // missing_scope NON è scadenza: il token è valido ma l'AUTORIZZAZIONE non
    // include quel permesso (l'app lo ha, il login non lo ha chiesto). Non si
    // butta la sessione: si spiega che serve riconnettere per il permesso nuovo
    if (t0.indexOf("missing_scope") >= 0){
      var mk = '"required_scope":"';
      var i = t0.indexOf(mk);
      var sc = i >= 0 ? t0.slice(i + mk.length, t0.indexOf('"', i + mk.length)) : "";
      throw new Error("permesso mancante" + (sc ? ": " + sc : "") + " — premi «Esci / cambia account» e riconnetti Dropbox");
    }
    // token scaduto/invalido: Dropbox a volte risponde 400 con questo messaggio
    var expired = r.status === 401 || /Invalid authorization value/i.test(t0);
    if (expired){
      if (!_retried && await refreshToken()) return dbx(base, path, args, true);
      clearTok();
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
  // fallback PKCE in localStorage: alcuni profili browser svuotano il
  // sessionStorage durante il giro OAuth (finestre private, protezioni,
  // container) — senza verifier lo scambio fallisce per sempre. Chiave
  // effimera: rimossa al consumo, scadenza 15 minuti.
  try { localStorage.setItem("simona:dbx:pkce", JSON.stringify({ v: v, st: stO, redirect: REDIRECT, at: Date.now() })); } catch (e){ /* ok */ }
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
    saveTok(j.access_token);
    if (j.refresh_token) localStorage.setItem("simona:dbx:refresh", j.refresh_token); // 30gg, solo dispositivo
    return true;
  } catch (e){ return false; }
}

async function resumeFromRedirect(){
  var q = new URLSearchParams(location.search);
  var code = q.get("code"), stO = q.get("state"), err = q.get("error");
  if (!code && !err) return;
  // location.pathname, non "/admin/" hardcodato: su project page github.io
  // l'admin vive a /<repo>/admin/ e un replaceState assoluto sballerebbe
  // l'URL (reload successivo → 404 di Pages)
  history.replaceState({}, "", location.pathname);
  if (err){ diag({ msg: "consenso negato: " + err }); note("Dropbox: " + err + " " + (q.get("error_description") || ""), true); return; }
  // verifier/state: sessionStorage, con fallback localStorage — se il profilo
  // browser svuota sessionStorage durante il redirect, senza fallback PKCE muore
  var v = sessionStorage.getItem("simona:dbx:v") || "";
  var stLocal = sessionStorage.getItem("simona:dbx:st");
  if (!v || !stLocal){
    try {
      var pk = JSON.parse(localStorage.getItem("simona:dbx:pkce") || "null");
      if (pk && Date.now() - (pk.at || 0) < 15 * 60 * 1000){
        if (!v) v = pk.v;
        if (!stLocal) stLocal = pk.st;
      }
    } catch (e){ /* ok */ }
  }
  if (stO !== stLocal){ diag({ msg: "state non riconosciuto (redirect: " + (stO || "—") + " / atteso: " + (stLocal || "perso") + ")" }); note("OAuth: state mismatch", true); return; }
  var body = new URLSearchParams({
    code: code, grant_type: "authorization_code", client_id: CID(),
    code_verifier: v, redirect_uri: REDIRECT,
  });
  var r;
  try {
    r = await fetch(API + "/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body,
      signal: (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(10000) : undefined, // mai pendere all'infinito
    });
  } catch (e){ diag({ msg: "Dropbox non raggiungibile dal browser: " + e }); note("token exchange fallito: " + e, true); return; }
  if (!r.ok){
    var t = (await r.text().catch(function(){ return ""; })).slice(0, 180);
    diag({ msg: "scambio codice rifiutato (" + r.status + "): " + t.slice(0, 110) });
    note("token exchange fallito: " + r.status + " " + t, true);
    return;
  }
  var j = await r.json();
  saveTok(j.access_token);
  if (j.refresh_token) localStorage.setItem("simona:dbx:refresh", j.refresh_token); // 30gg, solo dispositivo
  sessionStorage.removeItem("simona:dbx:v");
  sessionStorage.removeItem("simona:dbx:st");
  try { localStorage.removeItem("simona:dbx:pkce"); } catch (e){ /* ok */ }
  diag({ msg: "connesso ✓" });
  note("Dropbox connesso ✓");
  loadAccount(true); // identità fresca: l'account può essere CAMBIATO
  // il MOUNT del contesto (tab Dropbox / editor / root) lo decide il boot
  // subito DOPO: qui non si renderizza nulla — l'host giusto potrebbe non
  // esistere nel DOM (tab non montata) e gli errori andrebbero persi
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
var folderGen = 0; // navigazioni sovrapposte: vince l'ULTIMA, mai render stantii
var PAGE_SZ = 60;  // foto per pagina nelle griglie (picker e Gestisci)
var page = 0;      // pagina corrente (per cartella; la ricerca sa saltare a quella giusta)

function pagerHtml(total, pages){
  return '<div class="dbxPager">' +
    '<button class="ghost" data-pg="' + (page - 1) + '"' + (page <= 0 ? " disabled" : "") + ">‹</button>" +
    '<span class="muted" style="font-size:.8rem">pagina ' + (page + 1) + "/" + pages + " · " + total + " foto</span>" +
    '<button class="ghost" data-pg="' + (page + 1) + '"' + (page >= pages - 1 ? " disabled" : "") + ">›</button></div>";
}
function wirePager(scope, onGo){
  scope.querySelectorAll(".dbxPager [data-pg]").forEach(function(b){
    b.onclick = function(){
      var n = parseInt(b.dataset.pg, 10);
      if (isNaN(n) || n < 0) return;
      onGo(n);
    };
  });
}

// --- ricerca per nome: file e cartelle con percorso, click = apri il percorso ---
function closeSearch(){
  if (!dbxQVal) return;
  dbxQVal = "";
  var q = $("dbxQ"); if (q) q.value = "";
  openFolder(cwd, cwdName, cwdId).catch(function(e){ note(e.message, true); });
}

async function runSearch(qstr){
  var host = inManage() ? document.getElementById("dbxListM") : $("dbxList");
  if (!host) return;
  // i risultati prendono il posto dei contenuti (grid e riga stato incluse)
  var g = document.getElementById("dbxMGrid"); if (g) g.innerHTML = "";
  var st0 = $("dbxMStatus"); if (st0) st0.textContent = "";
  host.innerHTML = '<p class="muted" style="padding:.25rem 0 .55rem">cerco «' + esc(qstr) + '»…</p>';
  try {
    var r = await dbx(API, "/2/files/search_v2", { query: qstr, options: { max_results: 50, filename_only: true } });
    var ms = (r.matches || []).map(function(m){ return (m.metadata && m.metadata.metadata) || null; }).filter(Boolean);
    if (!ms.length){
      host.innerHTML = '<p class="muted">nessun risultato per «' + esc(qstr) + '» — <a href="#" id="dbxQx">torna alla cartella</a></p>';
    } else {
      var h = '<p class="muted" style="padding:.25rem 0 .4rem">' + ms.length + ' risultati — <a href="#" id="dbxQx">torna alla cartella</a></p>';
      ms.forEach(function(e){
        var isFolder = e[".tag"] === "folder";
        var parent = (e.path_display || e.path_lower || "").replace(/\/[^/]*$/, "") || "/";
        h += '<div class="dbxRes" data-fold="' + (isFolder ? 1 : 0) + '" data-p="' + esc(e.path_lower || "") + '" data-n="' + esc(e.name) + '" data-id="' + esc(e.id || "") + '" title="' + esc(e.path_display || e.path_lower || "") + '">' +
          "<span>" + (isFolder ? "📁" : "🖼") + " <b>" + esc(e.name) + "</b></span>" +
          '<span class="muted" style="font-size:.78rem">' + esc(parent) + "</span></div>";
      });
      host.innerHTML = h;
    }
    var x = $("dbxQx");
    if (x) x.onclick = function(ev){ ev.preventDefault(); dbxQVal = ""; var qq = $("dbxQ"); if (qq) qq.value = ""; openFolder(cwd, cwdName, cwdId).catch(function(e2){ note(e2.message, true); }); };
    host.querySelectorAll(".dbxRes").forEach(function(rw){
      rw.onclick = function(){
        var p = rw.dataset.p, n = rw.dataset.n;
        if (rw.dataset.fold === "1"){ openFolder(p, n, rw.dataset.id).catch(function(e){ note(e.message, true); }); return; }
        // file → apre la MADRE alla pagina giusta, con la foto evidenziata
        var parentL = p.replace(/\/[^/]*$/, "");
        var segs = parentL.split("/").filter(Boolean);
        var parentN = segs.length ? segs[segs.length - 1] : "Dropbox";
        dbxQVal = ""; var qq = $("dbxQ"); if (qq) qq.value = "";
        openFolder(parentL, parentN, "", { focus: p }).catch(function(e){ note(e.message, true); });
      };
    });
  } catch (e){
    host.innerHTML = '<p class="muted">ricerca non riuscita: ' + esc(String(e.message || e)) + "</p>";
  }
}

// skeleton nel punto esatto (niente overlay): breadcrumb già sulla destinazione,
// riga «carico» + celle shimmer al posto dei contenuti; il resto resta cliccabile
function renderFolderLoading(name){
  var cells = "";
  for (var i = 0; i < 8; i++) cells += '<div class="skcell"></div>';
  var head = '<p class="muted" style="padding:.25rem 0 .55rem">carico «' + esc(name) + '»…</p>';
  if (inManage()){
    var m = document.getElementById("dbxListM");
    if (m) m.innerHTML = head + '<div id="dbxMGrid">' + cells + "</div>" + '<div class="muted" id="dbxMStatus" style="font-size:.85rem;min-height:1.3rem;margin:.35rem 0 0"></div>';
  } else {
    var el = $("dbxList");
    if (el) el.innerHTML = head + '<div id="grid" style="margin-top:.6rem">' + cells + "</div>";
  }
}

async function openFolder(path, name, id, opts){
  var gen = ++folderGen;
  page = 0;
  cwd = path; cwdName = name || "Dropbox"; cwdId = id || "";
  // la selezione PERSISTE tra cartelle (sel/selMap non vengono svuotati)
  renderCrumb();            // breadcrumb subito sulla destinazione
  renderFolderLoading(name || "Dropbox");
  try {
    var res = await dbx(API, "/2/files/list_folder", { path: path, recursive: false, limit: 500 });
    var list = res.entries || [];
    while (res.has_more){
      res = await dbx(API, "/2/files/list_folder/continue", { cursor: res.cursor });
      list = list.concat(res.entries || []);
    }
    if (gen !== folderGen) return; // navigazione più recente ha vinto
    entries = list;
    var imgs = list.filter(isImg);
    // apertura mirata (dalla ricerca): salta ALLA PAGINA del file cercato
    if (opts && opts.focus){
      for (var k = 0; k < imgs.length; k++){
        if (imgs[k].path_lower === opts.focus){ page = Math.floor(k / PAGE_SZ); break; }
      }
    }
    renderList();
    await loadMap();
    if (gen !== folderGen) return;
    renderBadges();
    suggestSlug();
    loadThumbs(imgs.slice(page * PAGE_SZ, (page + 1) * PAGE_SZ)); // solo la pagina visibile
    if (opts && opts.focus){
      var cell = document.querySelector('#dbxList .cell[data-path="' + cssEsc(opts.focus) + '"], #dbxMGrid .cell[data-path="' + cssEsc(opts.focus) + '"]');
      if (cell){ cell.classList.add("flash"); cell.scrollIntoView({ block: "center" }); }
    }
  } catch (e){
    if (gen !== folderGen) return;
    note(e.message, true);
  }
}

// foto della cartella corrente selezionabili: in modifica ESCLUDE quelle già nella galleria
function availImgs(){
  return entries.filter(isImg).filter(function(f){
    return !(targetSlot && f.id && galleryIds.has(f.id));
  });
}

// thumb LOCALE per le foto caricate in questa sessione (il File è in mano al
// browser): istantaneo, zero chiamate API
function localThumb(path){
  var f = fileReg.get(path);
  return f ? URL.createObjectURL(f) : "";
}

// thumb Dropbox (w256, data:URI) in cache per tutta la sessione: i RE-RENDER
// della griglia (toggle selezione, refresh) ricostruiscono gli <img> — senza
// cache tornerebbero a src="" spezzando le anteprime già caricate
var thumbCache = new Map();   // path_lower → data:URI
var noThumb = new Set();      // path_lower senza thumbnail Dropbox (RAW…)

async function loadThumbs(files){
  // le foto locali hanno già il thumb dal File; già in cache o senza thumbnail: skip
  files = files.filter(function(f){ return !fileReg.has(f.path_lower) && !thumbCache.has(f.path_lower) && !noThumb.has(f.path_lower); });
  for (var i = 0; i < files.length; i += 25){
    var chunk = files.slice(i, i + 25);
    // i chunk possono fallire per motivi TRANSITORI (429/5xx del content API,
    // token scaduto a metà sessione → dbx() refresha e rilancia): senza retry
    // quei thumb restavano vuoti finché non si ricaricava la pagina
    for (var attempt = 0; attempt < 3; attempt++){
      try {
        var res = await dbx(CONTENT, "/2/files/get_thumbnail_batch", {
          entries: chunk.map(function(f){ return { path: f.path_lower, format: "jpeg", size: "w256h256" }; }),
        });
        (res.entries || []).forEach(function(t){
          var p = t.metadata && t.metadata.path_lower;
          var img = p ? document.querySelector('#dbxList .cell[data-path="' + cssEsc(p) + '"] img, #dbxMGrid .cell[data-path="' + cssEsc(p) + '"] img') : null;
          if (t[".tag"] === "success" && t.thumbnail){
            var uri = "data:image/jpeg;base64," + t.thumbnail;
            if (p){
              thumbCache.set(p, uri);
              if (thumbCache.size > 600) thumbCache.delete(thumbCache.keys().next().value);
            }
            if (img) img.src = uri;
            return;
          }
          // Dropbox NON genera thumbnail per i RAW (e file illeggibili):
          // ricordalo in noThumb + badge visibile col formato, mai cella vuota
          if (t[".tag"] === "failure"){
            if (p) noThumb.add(p);
            if (img && !img.getAttribute("src")){
              var cell = img.closest(".cell");
              var m = cell && /\.([a-z0-9]+)$/i.exec(cell.dataset.name || "");
              if (cell && !cell.querySelector(".nothumb"))
                cell.insertAdjacentHTML("beforeend", '<span class="nothumb">' + (m ? m[1].toUpperCase() : "no anteprima") + "</span>");
            }
          }
        });
        break; // chunk andato a buon fine
      } catch (e){
        // sessione davvero persa: inutile insistere sugli altri chunk
        if (String(e.message || "").indexOf("Sessione Dropbox scaduta") >= 0) return;
        if (attempt < 2) await new Promise(function(r){ setTimeout(r, 900 * (attempt + 1)); });
      }
    }
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
var dbxQVal = "";     // query di ricerca (sopravvive ai re-render del pannello)

function bodyEl(){ return document.getElementById(hostId); }
function statusEl(){
  var el = document.getElementById(standalone ? "dbxTabStatus" : "dbxStatusIn");
  if (el) return el;
  // fallback: se il pannello non è montato da nessuna parte, gli errori OAuth
  // (exchange fallito, state mismatch…) finirebbero nel vuoto — invisibili
  return document.getElementById("dbxTabStatus") || document.getElementById("dbxStatusIn");
}
function inManage(){ return uiMode === "manage" || standalone; }

function render(){
  var body = bodyEl();
  if (!body) return;
  if (!tok || !CID()){
    body.innerHTML = '<p class="muted">Connetti l\'account Dropbox per scegliere le foto: l\'autorizzazione resta solo su questo dispositivo — mai sul server.</p>' +
      '<button id="dbxConn" class="ghost">Connetti Dropbox</button>' + diagHtml();
    document.getElementById("dbxConn").onclick = connect;
    return;
  }
  var manage = inManage();
  var seg = standalone ? "" :
    '<div class="dbxSeg" id="dbxSeg"><button data-m="pick" class="' + (uiMode === "pick" ? "on" : "") + '">Scegli foto</button>' +
    '<button data-m="manage" class="' + (uiMode === "manage" ? "on" : "") + '">Gestisci</button></div>';
  var qin = '<input type="search" id="dbxQ" placeholder="cerca per nome…" value="' + esc(dbxQVal) + '" style="flex:2;min-width:9rem;max-width:22rem;font-size:.8rem;padding:.4rem .6rem;border:1px solid var(--border);background:var(--card);color:inherit;border-radius:4px">';
  body.innerHTML =
    acctRowHtml() + seg +
    '<div class="row" style="align-items:center;gap:.6rem">' +
      '<div id="dbxCrumb" style="flex:3;font-size:.85rem"></div>' +
      qin +
      (manage ? '<div style="flex:0"><button class="ghost" id="dbxNewFolder" title="Nuova sottocartella di quella aperta" style="padding:.45rem .9rem;font-size:.75rem">＋ Cartella</button></div>' : "") +
      '<div style="flex:0"><button class="ghost" id="dbxReload" title="Ricarica l\'elenco" style="padding:.45rem .9rem">↻</button></div>' +
    '</div>' +
    (manage ? manageHtml() : pickHtml());
  wireAcctRow();
  // ricerca per nome: debounce, min 2 caratteri; ESC o svuota = torna alla cartella
  var q = $("dbxQ");
  if (q){
    var qt = null;
    q.oninput = function(){
      dbxQVal = q.value;
      clearTimeout(qt);
      qt = setTimeout(function(){
        var v = q.value.trim();
        if (v.length >= 2) runSearch(v);
        else if (!q.value) closeSearch();
      }, 350);
    };
    q.onkeydown = function(e){ if (e.key === "Escape"){ q.value = ""; dbxQVal = ""; closeSearch(); } };
  }
  if ($("dbxSeg")) $("dbxSeg").querySelectorAll("button").forEach(function(b){
    b.onclick = function(){
      uiMode = b.dataset.m;
      render();
      openFolder(cwd, cwdName, cwdId).catch(function(e){ note(e.message, true); });
    };
  });
  $("dbxReload").onclick = function(){ openFolder(cwd, cwdName, cwdId).catch(function(e){ note(e.message, true); }); };
  if ($("dbxNewFolder")) $("dbxNewFolder").onclick = askNewFolder;
  renderCrumb();
  if (manage){ wireManage(); } else { wirePick(); }
}

// modalità SCEGLI FOTO: la UI di sempre (cartelle+griglia, selezione persistente)
function pickHtml(){
  return '<div id="dbxList"><p class="muted">…</p></div>' +
    '<div class="row" style="margin-top:.8rem">' +
      '<div style="flex:0"><button class="ghost" id="dbxAll">Tutte</button></div>' +
      '<div style="flex:0"><button class="ghost" id="dbxNone">Nessuna</button></div>' +
      (targetSlot ? '' : '<div style="flex:1"><button id="dbxImport">Crea bozza dalla selezione</button></div>') +
    '</div>' +
    '<div id="dbxSelPanel"></div>';
}
function wirePick(){
  $("dbxAll").onclick = function(){ availImgs().forEach(function(f){ sel.add(f.path_lower); selMap.set(f.path_lower, f); }); paintSel(); };
  $("dbxNone").onclick = function(){ availImgs().forEach(function(f){ sel.delete(f.path_lower); selMap.delete(f.path_lower, f); }); paintSel(); };
  if ($("dbxImport")) $("dbxImport").onclick = function(){ createDraft().catch(function(e){ note(e.message, true); }); };
  renderSelPanel();
}

// modalità GESTISCI: sottocartelle con azioni, foto read-only, tile ⬆, dropzone solo durante il drag
function manageHtml(){
  return '<div class="dbxFolders" id="dbxListM"></div>' +
    '<div class="dbxDrop" id="dbxDrop">Rilascia le foto per caricarle in questa cartella</div>' +
    '<div id="dbxMGrid"></div>' +
    '<div class="muted" id="dbxMStatus" style="font-size:.85rem;min-height:1.3rem;margin:.35rem 0 0"></div>' +
    '<input type="file" id="dbxFile" multiple accept="image/*,.heic,.avif,.dng,.cr2,.cr3,.nef,.arw" style="display:none">' +
    '<div class="dbxUpl" id="dbxUpl"></div>';
}
function wireManage(){
  wireDrop();
  renderQueue();
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
  hostId = "dbxBodyIn";
  standalone = false;
  uiMode = "pick";
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
  // «→ Galleria» da una cartella (tab Dropbox o Gestisci): cartella aperta + TUTTO selezionato
  var ff = null;
  if (!slug){
    try { ff = JSON.parse(sessionStorage.getItem("simona:dbx:fromFolder") || "null"); } catch (e){ ff = null; }
    sessionStorage.removeItem("simona:dbx:fromFolder");
  }
  if (ff && ff.path != null){
    sel.clear(); selMap.clear();
    await openFolder(ff.path, ff.name || "Dropbox", ff.id || "");
    availImgs().forEach(function(f){ sel.add(f.path_lower); selMap.set(f.path_lower, f); });
    paintSel();
  } else {
    await openFolder(cwd, cwdName, cwdId);
  }
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
  var manage = inManage();
  var parts = cwd === "" ? [] : cwd.replace(/^\/+/, "").split("/");
  var h = '<a href="#" data-p="" data-n="Dropbox">Dropbox</a>';
  var acc = "";
  parts.forEach(function(p, i){
    acc += (i ? "/" : "") + p;
    h += ' / <a href="#" data-p="' + esc(acc.toLowerCase()) + '" data-n="' + esc(p) + '">' + esc(p) + '</a>' +
      (manage ? '<button class="dbxMvB" data-mvc="' + esc(acc.toLowerCase()) + '" data-n="' + esc(p) + '" title="Sposta «' + esc(p) + '» in un\u2019altra cartella">⇄</button>' : "");
  });
  el.innerHTML = h;
  el.querySelectorAll("a").forEach(function(a){
    a.style.color = "var(--terra)";
    a.onclick = function(ev){ ev.preventDefault(); openFolder(a.dataset.p, a.dataset.n, "").catch(function(e){ note(e.message, true); }); };
  });
  if (manage) el.querySelectorAll(".dbxMvB").forEach(function(b){
    b.onclick = function(ev){ ev.preventDefault(); ev.stopPropagation(); askMove(b.dataset.mvc, b.dataset.n); };
  });
}

function renderList(){
  if (inManage()){ renderListMng(); return; }
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
  var pgTotal = imgs.length;
  var pgPages = Math.max(1, Math.ceil(pgTotal / PAGE_SZ));
  if (page >= pgPages) page = pgPages - 1;
  imgs.slice(page * PAGE_SZ, (page + 1) * PAGE_SZ).forEach(function(f){
    var inGal = !!(targetSlot && f.id && galleryIds.has(f.id));
    h += '<div class="cell' + (inGal ? " ingal" : (sel.has(f.path_lower) ? " sel" : "")) + '" data-path="' + esc(f.path_lower) + '" data-id="' + esc(f.id || "") + '" data-rev="' + esc(f.rev || "") + '" data-name="' + esc(f.name) + '" data-ingal="' + (inGal ? 1 : 0) + '" title="' + esc(f.name) + (inGal ? " — già nella galleria" : " — click = seleziona") + '"><img alt="" src="' + (thumbCache.get(f.path_lower) || localThumb(f.path_lower)) + '"><span class="dbxChk"></span><span class="dbxZoomIco" title="vedi grande">⤢</span><span class="dbxFn">' + esc(f.name) + '</span></div>';
  });
  if (pgPages > 1) h += pagerHtml(pgTotal, pgPages);
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
  wirePager(el, function(n){
    page = n;
    renderList();
    loadThumbs(entries.filter(isImg).slice(page * PAGE_SZ, (page + 1) * PAGE_SZ));
    var gg = $("grid"); if (gg) gg.scrollIntoView({ block: "start" });
  });
  paintSel();
}

// GESTISCI: sottocartelle con azioni per riga (→ Galleria, ⇄, ✎, 🗑) + foto read-only
function renderListMng(){
  var el = document.getElementById("dbxListM");
  if (!el) return;
  var folders = entries.filter(function(e){ return e[".tag"] === "folder"; });
  var imgs = entries.filter(isImg);
  var h = "";
  folders.forEach(function(f){
    h += '<div class="dbxFolder" data-path="' + esc(f.path_lower) + '" data-id="' + esc(f.id) + '" data-name="' + esc(f.name) + '" title="' + esc(f.name) + '">' +
      '<span>📁 ' + esc(f.name) + '</span>' +
      '<span class="fact">' +
      '<button class="dbxAct" data-gal="1" title="Crea una galleria da questa cartella">→ Galleria</button>' +
      '<button class="dbxAct" data-mv="' + esc(f.path_lower) + '" data-name="' + esc(f.name) + '" title="Sposta in un\u2019altra cartella">⇄</button>' +
      '<button class="dbxAct" data-ren="' + esc(f.path_lower) + '" data-name="' + esc(f.name) + '" title="Rinomina">✎</button>' +
      '<button class="dbxAct danger" data-del="' + esc(f.path_lower) + '" data-name="' + esc(f.name) + '" title="Elimina (solo cartelle vuote)">🗑</button>' +
      '</span></div>';
  });
  el.innerHTML = h;
  el.querySelectorAll(".dbxFolder").forEach(function(d){
    d.onclick = function(){ openFolder(d.dataset.path, d.dataset.name, d.dataset.id).catch(function(e){ note(e.message, true); }); };
  });
  el.querySelectorAll("[data-gal]").forEach(function(b){
    b.onclick = function(e){ e.stopPropagation(); var d = b.closest(".dbxFolder"); galleryFromFolder(d.dataset.path, d.dataset.name, d.dataset.id); };
  });
  el.querySelectorAll("[data-mv]").forEach(function(b){
    b.onclick = function(e){ e.stopPropagation(); askMove(b.dataset.mv, b.dataset.name); };
  });
  el.querySelectorAll("[data-ren]").forEach(function(b){
    b.onclick = function(e){ e.stopPropagation(); askRename(b.dataset.ren, b.dataset.name); };
  });
  el.querySelectorAll("[data-del]").forEach(function(b){
    b.onclick = function(e){ e.stopPropagation(); askDelete(b.dataset.del, b.dataset.name); };
  });
  renderMGrid(imgs);
}

// selezione FILE in Gestisci (per spostarli tra cartelle) — distinta dal
// picker (sel): il cerchietto in alto a sinistra seleziona (come nel picker),
// il click sulla foto resta l'anteprima; le azioni compaiono solo se c'è
// almeno una selezione
var mngSel = new Set();   // path_lower dei file selezionati

// griglia read-only di contesto + tile ⬆ come ultima cella (carica nella cartella aperta)
function renderMGrid(imgs){
  var g = document.getElementById("dbxMGrid");
  if (!g) return;
  // la selezione sopravvive solo alle foto ancora presenti nella cartella
  var paths = new Set(imgs.map(function(f){ return f.path_lower; }));
  Array.from(mngSel).forEach(function(p){ if (!paths.has(p)) mngSel.delete(p); });
  var bar = document.getElementById("dbxMSelBar");
  if (!bar){ bar = document.createElement("div"); bar.id = "dbxMSelBar"; g.parentNode.insertBefore(bar, g); }
  if (mngSel.size){
    bar.style.display = "";
    bar.innerHTML = '<span class="n">' + mngSel.size + ' selezionat' + (mngSel.size === 1 ? "o" : "i") + '</span>' +
      '<button class="dbxAct" id="dbxMoveSel">⇄ Sposta</button>' +
      '<button class="ghost" id="dbxSelAll">Tutte</button>' +
      '<button class="ghost" id="dbxSelNone">Nessuna</button>';
    $("dbxMoveSel").onclick = askMoveFiles;
    $("dbxSelAll").onclick = function(){ imgs.forEach(function(f){ mngSel.add(f.path_lower); }); renderListMng(); };
    $("dbxSelNone").onclick = function(){ mngSel.clear(); renderListMng(); };
  } else {
    bar.style.display = "none";
  }
  var h = "";
  var pgTotal = imgs.length;
  var pgPages = Math.max(1, Math.ceil(pgTotal / PAGE_SZ));
  if (page >= pgPages) page = pgPages - 1;
  imgs.slice(page * PAGE_SZ, (page + 1) * PAGE_SZ).forEach(function(f){
    var u = thumbCache.get(f.path_lower) || localThumb(f.path_lower);
    var isSel = mngSel.has(f.path_lower);
    var mExt = /\.([a-z0-9]+)$/i.exec(f.name || "");
    h += '<div class="cell' + (isSel ? " sel" : "") + '" data-path="' + esc(f.path_lower) + '" data-id="' + esc(f.id || "") + '" data-rev="' + esc(f.rev || "") + '" data-name="' + esc(f.name) + '" title="' + esc(f.name) + ' — click = anteprima">' +
      '<img alt="' + esc(f.name) + '" src="' + u + '">' +
      (noThumb.has(f.path_lower) ? '<span class="nothumb">' + (mExt ? mExt[1].toUpperCase() : "no anteprima") + "</span>" : "") +
      '<span class="dbxChk" title="' + (isSel ? "togli dalla selezione" : "seleziona per spostare") + '">' + (isSel ? "✓" : "") + '</span>' +
      '<span class="dbxZoomIco" title="vedi grande">⤢</span></div>';
  });
  h += '<div class="upltile" id="dbxUplTile" title="Carica foto in questa cartella"><span class="ic">⬆</span><span>Carica foto</span></div>';
  if (pgPages > 1) h += pagerHtml(pgTotal, pgPages);
  g.innerHTML = h;
  var t = $("dbxUplTile");
  if (t) t.onclick = function(){ var inp = $("dbxFile"); if (inp) inp.click(); };
  g.querySelectorAll(".cell").forEach(function(c){
    c.onclick = function(){ openZoom(c); };
    var chk = c.querySelector(".dbxChk");
    if (chk) chk.onclick = function(ev){
      ev.stopPropagation();
      if (mngSel.has(c.dataset.path)) mngSel.delete(c.dataset.path);
      else mngSel.add(c.dataset.path);
      renderListMng();
    };
  });
  wirePager(g, function(n){
    page = n;
    renderListMng();
    loadThumbs(entries.filter(isImg).slice(page * PAGE_SZ, (page + 1) * PAGE_SZ));
    g.scrollIntoView({ block: "start" });
  });
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
  // FOTO SUL DISPOSITIVO (caricata in questa sessione): il File È l'originale —
  // anteprima e "originale" puntano al file stesso, zero rete, zero Dropbox
  var local = fileReg.get(path);
  if (local){
    var u = URL.createObjectURL(local);
    var mLocal = { prevUrl: u, key: "", origUrl: u };
    zoomMemo[path] = mLocal;
    zoomBoxHtml(z, name, mLocal);
    return;
  }
  z.innerHTML = '<div class="spin">controllo la cache del server…</div>';
  try {
    // 1) SONDA: il server ha già l'originale? (senza temp link — D26) —
    //    200 = preview immediata dalla cache del server.
    //    fetch DIRETTO, non A.api: il wrapper throwa su ogni non-ok, ma qui
    //    la 404 è un ESITO (miss) che pilota il download lato browser.
    var probe = await fetch("/api/cache", {
      method: "POST",
      headers: Object.assign(
        { "Content-Type": "application/json" },
        A.state.token ? { Authorization: "Bearer " + A.state.token } : {}
      ),
      body: JSON.stringify({ name: name, dropboxId: id || undefined, rev: rev || undefined }),
    });
    if (probe.status === 404 && tok){
      // 2) il server NON lo ha: se lo scarica il BROWSER (files/download
      //    autenticato — fuori dal tetto link condivisi, D2) → anteprima dal
      //    file locale + seed del server in BACKGROUND (l'originale arriva al
      //    self-hosted dal browser, Dropbox non viene più scaricata dal server)
      var spin = z.querySelector(".spin");
      var blob = await dbxDownload(path, function(pct){
        if (spin) spin.textContent = "scarico l'originale… " + pct + "%";
      });
      var u2 = URL.createObjectURL(blob);
      var mDl = { prevUrl: u2, key: "", origUrl: u2 };
      zoomMemo[path] = mDl;
      zoomBoxHtml(z, name, mDl);
      seedBlob(name, id, rev, blob);
      return;
    }
    if (!probe.ok) throw new Error("cache: HTTP " + probe.status);
    var key = probe.headers.get("X-Cache-Key") || "";
    var memoObj = { prevUrl: URL.createObjectURL(await probe.blob()), key: key, origUrl: null };
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

// download autenticato dell'originale NEL BROWSER (files/download: accesso
// diretto, fuori dal tetto dei link condivisi — D2). XHR per la percentuale.
function dbxDownload(path, onPct, _retried){
  return new Promise(function(res, rej){
    var xhr = new XMLHttpRequest();
    xhr.open("POST", CONTENT + "/2/files/download");
    xhr.setRequestHeader("Authorization", "Bearer " + tok);
    xhr.setRequestHeader("Dropbox-API-Arg", JSON.stringify({ path: path }));
    xhr.responseType = "blob";
    xhr.onprogress = function(ev){
      if (ev.lengthComputable && onPct) onPct(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = function(){
      if (xhr.status >= 200 && xhr.status < 300) return res(xhr.response);
      if ((xhr.status === 401 || xhr.status === 400) && !_retried){
        refreshToken().then(function(ok){
          if (ok) dbxDownload(path, onPct, true).then(res, rej);
          else rej(new Error("Dropbox download " + xhr.status));
        });
        return;
      }
      rej(new Error("Dropbox download " + xhr.status));
    };
    xhr.onerror = function(){ rej(new Error("connessione a Dropbox non riuscita")); };
    xhr.send("");
  });
}

// seed in BACKGROUND dell'originale appena scaricato: il self-hosted se lo
// trova già in cache per derive/publish — silenzioso, il job in fallback
// userebbe comunque il temp link se qualcosa va storto
function seedBlob(name, id, rev, blob){
  if (!id || !rev) return;
  var key = id + ":" + rev;
  if (seededOk.has(key)) return;
  A.api("/api/cache/seed?name=" + encodeURIComponent(name) +
    "&dropboxId=" + encodeURIComponent(id) + "&rev=" + encodeURIComponent(rev),
    { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: blob })
    .then(function(r){ if (r.ok) seededOk.add(key); })
    .catch(function(){ /* best-effort */ });
}

function renderBadges(){
  if (!mapIds) return;
  var scope = inManage() ? "#dbxListM" : "#dbxList";
  document.querySelectorAll(scope + " .dbxFolder").forEach(function(d){
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

// --- import: D26 seeding PRIMA dei temp link, poi link solo per chi resta fuori cache ---
// usa selMap (selezione persistente: anche foto di cartelle non correnti).
// Le foto caricate in QUESTA sessione (fileReg) hanno l'originale in mano al
// browser: lo invia direttamente al server (obbligatorio per pubblicare, non
// un'opzione) → il job risolve cache-first e Dropbox non viene riscaricato.
// Seed fallito o File perso (tab ricaricata) → temp link come sempre.
async function collectItems(){
  if (!sel.size) throw new Error("nessuna foto selezionata");
  if (!A.state.token) throw new Error("prima fai login GitHub (serve per creare il job)");
  var slug = (targetSlot || (A.$("eslug") ? A.$("eslug").value : "") || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) throw new Error("slug non valido (compila il campo Slug nell'editor: minuscole, numeri, - e _)");
  var paths = [];
  sel.forEach(function(p){ paths.push(p); });
  var toSeed = [];
  paths.forEach(function(p){
    var e = selMap.get(p);
    if (e && e.id && e.rev && fileReg.has(p) && !seededOk.has(e.id + ":" + e.rev)) toSeed.push(e);
  });
  var seeded = 0;
  var items = [];
  for (var i = 0; i < paths.length; i++){
    var e = selMap.get(paths[i]);
    if (!e) continue;
    var key = (e.id && e.rev) ? (e.id + ":" + e.rev) : null;
    if (key && toSeed.indexOf(e) >= 0){
      note("Invio originali al server… (" + (seeded + 1) + "/" + toSeed.length + ")");
      try {
        var r = await A.api("/api/cache/seed?name=" + encodeURIComponent(e.name) +
          "&dropboxId=" + encodeURIComponent(e.id) + "&rev=" + encodeURIComponent(e.rev),
          { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: fileReg.get(e.path_lower) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        seededOk.add(key);
        seeded++;
      } catch (err){ /* seed fallito → sotto, temp link */ }
    }
    if (key && seededOk.has(key)){
      // senza url: il runner risolve cache-first
      items.push({ name: e.name.replace(/.[^.]+$/, ""), dropboxId: e.id, rev: e.rev, path: e.path_lower });
    } else {
      var r2 = await dbx(API, "/2/files/get_temporary_link", { path: e.path_lower });
      items.push({ name: e.name.replace(/.[^.]+$/, ""), url: r2.link, dropboxId: e.id, rev: e.rev, path: e.path_lower });
    }
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
// ================= D26 — GESTISCI: upload, cartelle, sposta ad albero, → Galleria =================

function humanDbxErr(e){
  var m = String((e && e.message) || e);
  if (/path\/conflict\/folder/i.test(m)) return "esiste già una cartella con questo nome nella destinazione";
  if (/path\/conflict\/file/i.test(m)) return "esiste già un file con questo nome nella destinazione";
  if (/path\/conflict/i.test(m)) return "nome già in uso nella destinazione";
  if (/too_many_write_operations/i.test(m)) return "Dropbox è momentaneamente impegnata — riprova tra poco";
  if (/403|insufficient_scope|scope/i.test(m)) return "permesso mancante: «Esci / cambia account» e riconnetti Dropbox";
  return m.slice(0, 140);
}

// --- dialoghi minimi (niente dipendenze) ---
function closeDlg(){ var d = document.getElementById("dbxDlg"); if (d) d.remove(); }
function dlgOpen(title, bodyHtml, yesLabel, danger){
  closeDlg();
  var d = document.createElement("div");
  d.className = "dbxDlg"; d.id = "dbxDlg";
  d.innerHTML = '<div class="box"><h3>' + esc(title) + '</h3>' + bodyHtml +
    '<div class="row" style="justify-content:flex-end;margin-top:1rem;gap:.6rem;flex-wrap:nowrap">' +
    '<button class="ghost" id="dbxDlgNo">Annulla</button>' +
    '<button id="dbxDlgYes"' + (danger ? ' class="danger"' : "") + '>' + esc(yesLabel || "OK") + '</button></div></div>';
  document.body.appendChild(d);
  d.addEventListener("click", function(e){ if (e.target === d) closeDlg(); });
  $("dbxDlgNo").onclick = closeDlg;
  return d;
}
function dlgInput(title, def, yes){
  return new Promise(function(res){
    dlgOpen(title, '<input type="text" id="dbxDlgIn" value="' + esc(def || "") + '">', yes);
    var inp = $("dbxDlgIn");
    inp.focus(); inp.select();
    var done = function(v){ closeDlg(); res(v); };
    $("dbxDlgYes").onclick = function(){ done(inp.value.trim()); };
    $("dbxDlgNo").onclick = function(){ done(null); };
    inp.onkeydown = function(e){
      if (e.key === "Enter"){ e.preventDefault(); done(inp.value.trim()); }
      if (e.key === "Escape") done(null);
    };
  });
}

// --- drag&drop: la zona appare SOLO durante il drag (si capisce dove rilasciare) ---
function hasFiles(e){
  return !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") >= 0);
}
function wireDrop(){
  var zone = $("dbxDrop");
  var host = bodyEl();
  if (!zone || !host) return;
  var depth = 0;
  host.ondragenter = function(e){ if (!hasFiles(e)) return; e.preventDefault(); depth++; zone.classList.add("on"); };
  host.ondragover = function(e){ if (!hasFiles(e)) return; e.preventDefault(); };
  host.ondragleave = function(){ depth = Math.max(0, depth - 1); if (!depth) zone.classList.remove("on"); };
  host.ondrop = function(e){ if (!hasFiles(e)) return; e.preventDefault(); depth = 0; zone.classList.remove("on"); handleFiles(e.dataTransfer.files); };
  var fi = $("dbxFile");
  if (fi) fi.onchange = function(){ handleFiles(fi.files); fi.value = ""; };
}

// --- upload verso Dropbox (nella cartella aperta), con progresso reale ---
var IMG_RE = /\.(jpe?g|png|webp|avif|heic|heif|tiff?|dng|cr2|cr3|nef|arw|raf|orf|rw2|pef|srw)$/i;
function handleFiles(list){
  if (!tok){ note("connetti prima Dropbox", true); return; }
  var files = [];
  for (var i = 0; i < list.length; i++){
    var f = list[i];
    if (!IMG_RE.test(f.name)) continue;
    if (f.size > 150 * 1024 * 1024){ note(f.name + ": oltre 150 MB, saltata", true); continue; }
    files.push(f);
  }
  if (!files.length) return;
  if (files.length > 50 && !confirm(files.length + " foto: dal browser i lotti così grandi sono lenti — continuo comunque?")) return;
  files.forEach(function(f){ uplQ.push({ name: f.name, file: f, pct: 0, st: "wait", msg: "", url: "" }); });
  renderQueue();
  uploadNext();
}
function uploadNext(){
  var u = null;
  for (var i = 0; i < uplQ.length; i++){ if (uplQ[i].st === "wait"){ u = uplQ[i]; break; } }
  if (!u){
    if (uplQ.length && uplQ.every(function(x){ return x.st === "done" || x.st === "err"; })){
      var okN = uplQ.filter(function(x){ return x.st === "done"; }).length;
      note(okN === uplQ.length ? "caricate " + okN + " foto ✓" : "caricate " + okN + " di " + uplQ.length + " — le altre sono fallite");
      openFolder(cwd, cwdName, cwdId).catch(function(){});
    }
    return;
  }
  u.st = "dbx"; renderQueue();
  dbxUpload(u.file).then(function(meta){
    u.st = "done"; u.pct = 100;
    if (meta && meta.path_lower) fileReg.set(meta.path_lower, u.file);
    renderQueue(); uploadNext();
  }).catch(function(e){ u.st = "err"; u.msg = humanDbxErr(e); renderQueue(); uploadNext(); });
}
// XHR (non fetch): l'evento upload.onprogress dà la percentuale reale
function dbxUpload(file){
  return new Promise(function(res, rej){
    var arg = JSON.stringify({ path: (cwd === "" ? "" : cwd) + "/" + file.name, mode: "add", autorename: true });
    var xhr = new XMLHttpRequest();
    xhr.open("POST", CONTENT + "/2/files/upload");
    xhr.setRequestHeader("Authorization", "Bearer " + tok);
    xhr.setRequestHeader("Dropbox-API-Arg", arg);
    // il browser imposterebbe il MIME del File (image/png…): files/upload
    // accetta SOLO octet-stream — va forzato
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = function(ev){
      if (!ev.lengthComputable) return;
      for (var i = 0; i < uplQ.length; i++){
        if (uplQ[i].file === file && uplQ[i].st === "dbx"){
          uplQ[i].pct = Math.round((ev.loaded / ev.total) * 100);
          renderQueue();
          break;
        }
      }
    };
    xhr.onload = function(){
      if (xhr.status >= 200 && xhr.status < 300){
        try { res(JSON.parse(xhr.responseText)); } catch (e){ res(null); }
      } else rej(new Error("Dropbox upload " + xhr.status + " " + String(xhr.responseText).slice(0, 120)));
    };
    xhr.onerror = function(){ rej(new Error("connessione a Dropbox non riuscita")); };
    xhr.send(file);
  });
}
function renderQueue(){
  var el = $("dbxUpl"); if (!el) return;
  if (!uplQ.length){ el.innerHTML = ""; return; }
  el.innerHTML = uplQ.map(function(u){
    if (!u.url) u.url = URL.createObjectURL(u.file);
    var main;
    if (u.st === "dbx") main = '<div class="dbxPlab">Dropbox ' + u.pct + '%</div><div class="dbxPbar"><i style="right:' + (100 - u.pct) + '%"></i></div>';
    else if (u.st === "done") main = '<div class="dbxPlab"><b>Dropbox ✓</b></div>';
    else if (u.st === "err") main = '<div class="dbxPlab err">' + esc(u.msg) + '</div>';
    else main = '<div class="dbxPlab">in coda…</div>';
    return '<div class="dbxUplRow"><img alt="" src="' + u.url + '"><div><div style="font-size:.82rem">' + esc(u.name) + '</div>' + main + '</div></div>';
  }).join("");
}

// --- operazioni cartelle (browser-side, scope files.content.write) ---
function folderRefresh(){
  openFolder(cwd, cwdName, cwdId).catch(function(e){ note(e.message, true); });
}
function askNewFolder(){
  dlgInput("Nuova cartella", "", "Crea").then(function(v){
    if (!v) return;
    note("creo «" + v + "»…");
    dbx(API, "/2/files/create_folder_v2", { path: (cwd === "" ? "" : cwd) + "/" + v })
      .then(function(){ note("cartella «" + v + "» creata ✓"); folderRefresh(); })
      .catch(function(e){ note(humanDbxErr(e), true); });
  });
}
function askRename(path, name){
  dlgInput("Rinomina cartella", name, "Rinomina").then(function(v){
    if (!v || v === name) return;
    note("rinomino «" + name + "»…");
    var parent = path.replace(/\/[^/]+$/, "");
    dbx(API, "/2/files/move_v2", { from_path: path, to_path: (parent ? parent : "") + "/" + v, autorename: false })
      .then(function(){ note("rinominata ✓"); folderRefresh(); })
      .catch(function(e){ note(humanDbxErr(e), true); });
  });
}
// eliminazione PRUDENZIALE: guardia live (solo cartelle vuote) + conferma
function askDelete(path, name){
  dbx(API, "/2/files/list_folder", { path: path, limit: 2 }).then(function(r){
    if ((r.entries || []).length){ note("«" + name + "» non è vuota — eliminabili solo le cartelle vuote", true); return; }
    if (!confirm("Eliminare da Dropbox la cartella vuota «" + name + "»?")) return;
    dbx(API, "/2/files/delete_v2", { path: path })
      .then(function(){ note("eliminata ✓"); folderRefresh(); })
      .catch(function(e){ note(humanDbxErr(e), true); });
  }).catch(function(e){ note(humanDbxErr(e), true); });
}

// --- sposta: dialogo con albero a caricamento pigro (list_folder per livello) ---
// generalizzato: ritorna la MADRE di destinazione scelta (o null) — lo spostamento
// VERO avviene solo dopo una CONFIRMAZIONE esplicita (cartelle e file)
function treeDest(title, disFn, creFn){
  // disFn: destinazioni NON selezionabili (self/under per le cartelle, cwd per i file)
  // creFn: dove è permesso CREARE una cartella (default: ovunque — creare dentro
  // la cartella di partenza dei FILE è legittimo: la nuova è comunque una mossa)
  if (!creFn) creFn = function(){ return true; };
  return new Promise(function(res){
    var kids = new Map();   // path → sottocartelle (caricate)
    var openP = new Set();
    var selDest = null;     // { path, name } della MADRE di destinazione
    var d = dlgOpen(title, '<div id="dbxTree"></div>', "Sposta qui");
    d.addEventListener("click", function(e){ if (e.target === d) res(null); });
    $("dbxDlgYes").disabled = true;
    $("dbxDlgNo").onclick = function(){ closeDlg(); res(null); };
    var treeEl = $("dbxTree");
    var newIn = null;       // path del nodo con input "nuova cartella" aperto
    function load(p){
      if (kids.has(p)) return Promise.resolve(kids.get(p));
      return dbx(API, "/2/files/list_folder", { path: p, limit: 200 }).then(function(r){
        var list = (r.entries || []).filter(function(e){ return e[".tag"] === "folder"; });
        kids.set(p, list);
        return list;
      });
    }
    // crea una cartella DENTRO il livello p, inline nell'albero: la nuova
    // cartella viene selezionata come destinazione (flusso: crea → sposta lì)
    var mkBusy = null;    // {p, v} mentre la creazione è in volo: riga «in creazione…»
    function mkFolder(p, v){
      v = (v || "").trim();
      if (!v || mkBusy) return;
      mkBusy = { p: p, v: v };
      newIn = null;                 // l'input SPARISCE subito: resta solo
      renderTree();                 // l'etichetta «in creazione…» (niente doppio invio)
      var np = (p === "" ? "" : p) + "/" + v;
      dbx(API, "/2/files/create_folder_v2", { path: np })
        .then(function(){
          mkBusy = null;            // esito arrivato: l'etichetta muore QUI
          newIn = null;                 // input CHIUSO subito: il doppio invio
          kids.delete(p);               // non può più ripartire la creazione
          openP.add(p);
          selDest = { path: np, name: v };
          $("dbxDlgYes").disabled = false;
          renderTree();                 // render senza input (selezione visibile)
          // ramo aggiornato (con la nuova cartella): un tentativo in più se il
          // content API fa i capricci — la selezione intanto è già visibile
          load(p).then(renderTree).catch(function(){
            setTimeout(function(){ load(p).then(renderTree).catch(function(){}); }, 1200);
          });
          note("cartella «" + v + "» creata ✓");
          $("dbxDlgYes").focus();       // invio adesso = «Sposta qui»
        })
        .catch(function(e){
          mkBusy = null;                // errore: si può riprovare (conflitto → input aperto)
          // conflitto (nome già esistente): l'input resta APERTO col nome
          // digitato, pronto per correggerlo — gli altri errori lo chiudono
          if (/conflict/i.test(String((e && e.message) || e))){
            newIn = p;
            renderTree();
            var tin2 = treeEl.querySelector(".tnin");
            if (tin2){ tin2.value = v; tin2.focus(); tin2.select(); }
          } else {
            newIn = null;
            renderTree();
          }
          note(humanDbxErr(e), true);
        });
    }
    function rowInner(pp, nm, dis){
      if (mkBusy && mkBusy.p === pp){
        return '<span class="mks">«' + esc(mkBusy.v) + '» in creazione…</span>';
      }
      if (newIn === pp){
        return '<input class="tnin" data-in="' + esc(pp) + '" placeholder="nome cartella"> ' +
          '<span class="tnok" data-ok="' + esc(pp) + '" title="Crea">✓</span>' +
          '<span class="tnok" data-no="1" title="Annulla">✕</span>';
      }
      return esc(nm) + (creFn(pp) ? '<span class="tnew" data-tn2="' + esc(pp) + '" title="Nuova cartella qui">＋</span>' : "");
    }
    function nodeHtml(pp, nm){
      var dis = disFn(pp);
      return '<div class="tnode"><div class="tn' + (dis ? " dis" : "") + (selDest && selDest.path === pp ? " sel" : "") +
        '" data-p="' + esc(pp) + '" data-n="' + esc(nm) + '" data-dis="' + (dis ? 1 : 0) + '">' +
        '<span class="tw" data-tw="' + esc(pp) + '">' + (openP.has(pp) ? "▾" : "▸") + '</span>📁 ' + rowInner(pp, nm, dis) + '</div>' +
        (openP.has(pp) && kids.get(pp) ? '<div class="kids">' + kids.get(pp).map(function(k){
          return nodeHtml(k.path_lower, k.name);
        }).join("") + '</div>' : '') + '</div>';
    }
    function renderTree(){
      var disRoot = disFn("");
      treeEl.innerHTML =
        '<div class="tnode"><div class="tn' + (selDest && selDest.path === "" ? " sel" : "") + '" data-p="" data-n="Dropbox" data-dis="' + (disRoot ? 1 : 0) + '">' +
        '<span class="tw" data-tw="">▾</span>📁 ' + rowInner("", "Dropbox", disRoot) + '</div><div class="kids">' +
        (kids.get("") || []).map(function(k){ return nodeHtml(k.path_lower, k.name); }).join("") +
        '</div></div>' +
        '<div class="tdest">Destinazione: ' + (selDest ? "<b>" + esc(destLabel(selDest.path)) + "</b>" : "—") + "</div>";
      treeEl.querySelectorAll(".tw").forEach(function(w){
        w.onclick = function(e){
          e.stopPropagation();
          var p = w.dataset.tw;
          if (openP.has(p)) openP.delete(p); else openP.add(p);
          load(p).then(renderTree).catch(function(){});
        };
      });
      treeEl.querySelectorAll(".tn").forEach(function(tn){
        tn.onclick = function(){
          if (tn.dataset.dis === "1" || newIn !== null) return;
          selDest = { path: tn.dataset.p, name: tn.dataset.n };
          $("dbxDlgYes").disabled = false;
          renderTree();
        };
      });
      // "nuova cartella" inline a OGNI livello (radice compresa)
      treeEl.querySelectorAll(".tnew").forEach(function(b){
        b.onclick = function(e){ e.stopPropagation(); newIn = b.dataset.tn2; renderTree(); };
      });
      var tin = treeEl.querySelector(".tnin");
      if (tin){
        tin.focus(); tin.select();
        tin.onkeydown = function(e){
          if (e.key === "Enter"){ e.preventDefault(); mkFolder(tin.dataset.in, tin.value); }
          else if (e.key === "Escape"){ newIn = null; renderTree(); }
        };
        var okB = treeEl.querySelector(".tnok[data-ok]");
        if (okB) okB.onclick = function(){ mkFolder(okB.dataset.ok, tin.value); };
        var noB = treeEl.querySelector('.tnok[data-no="1"]');
        if (noB) noB.onclick = function(){ newIn = null; renderTree(); };
      }
    }
    openP.add("");
    treeEl.innerHTML = '<div class="tnode"><div class="tn" style="opacity:.6;padding:.45rem .55rem">carico le cartelle…</div></div>';
    load("").then(renderTree).catch(function(e){ note(humanDbxErr(e), true); closeDlg(); res(null); });
    $("dbxDlgYes").onclick = function(){
      if (!selDest) return;
      closeDlg();
      res(selDest);
    };
  });
}

// conferma generica: true/false (niente azioni finché non si conferma)
function confirmDlg(title, html, yesLabel){
  return new Promise(function(res){
    var d = dlgOpen(title, html, yesLabel || "Conferma");
    d.addEventListener("click", function(e){ if (e.target === d) res(false); });
    $("dbxDlgYes").onclick = function(){ closeDlg(); res(true); };
    $("dbxDlgNo").onclick = function(){ closeDlg(); res(false); };
  });
}

function destLabel(p){ return p === "" ? "Dropbox (radice)" : p; }

// sposta una CARTELLA (riga o breadcrumb): albero → CONFERMA → move_v2
function askMove(path, name){
  treeDest("Sposta «" + name + "»",
    function(p){ return p === path || p.indexOf(path + "/") === 0; },
    // creare DENTRO la cartella spostata (o sotto) non ha senso: verrebbe mossa con lei
    function(p){ return !(p === path || p.indexOf(path + "/") === 0); })
    .then(function(dest){
      if (!dest) return;
      var to = (dest.path === "" ? "" : dest.path) + "/" + name;
      confirmDlg("Confermi lo spostamento?",
        '<p>Cartella <b>«' + esc(name) + '»</b> → <b>' + esc(destLabel(dest.path)) + '</b></p>', "Sposta")
        .then(function(ok){
          if (!ok) return;
          note("sposto «" + name + "»…");
          dbx(API, "/2/files/move_v2", { from_path: path, to_path: to, autorename: false }).then(function(){
            note("«" + name + "» spostata ✓");
            // se ho spostato la cartella corrente (o un suo antenato), torno alla radice
            if (cwd === path || cwd.indexOf(path + "/") === 0){ cwd = ""; cwdName = "Dropbox"; cwdId = ""; }
            folderRefresh();
          }).catch(function(e){ note(humanDbxErr(e), true); });
        });
    });
}

// sposta i FILE selezionati in Gestisci: albero → CONFERMA → move_v2 sequenziali
// con conteggio (autorename false: un nome già esistente in destinazione
// blocca solo quel file, nessuna sovrascrittura silenziosa)
function askMoveFiles(){
  if (!mngSel.size) return;
  var items = Array.from(mngSel).map(function(p){
    var e = entries.find(function(x){ return x.path_lower === p; });
    return e ? { path: p, name: e.name } : null;
  }).filter(Boolean);
  var n = items.length;
  if (!n) return;
  var from = cwd; // la cartella di partenza non è una destinazione valida (no-op)
  treeDest("Sposta " + n + " file", function(p){ return p === from; }).then(function(dest){
    if (!dest) return;
    var dst = dest.path === "" ? "" : dest.path;
    confirmDlg("Confermi lo spostamento?",
      '<p><b>' + n + ' file</b> → <b>' + esc(destLabel(dst)) + '</b></p>' +
      '<p class="muted" style="margin-top:.4rem">Un file con lo stesso nome già presente in destinazione non verrà spostato (nessuna sovrascrittura).</p>', "Sposta")
      .then(function(ok){
        if (!ok) return;
        var st = $("dbxMStatus");   // riga di stato SOTTO i contenuti
        var done = 0, fail = 0, i = 0;
        function step(){
          if (i >= items.length){
            mngSel.clear();
            if (st) st.textContent = "";
            note(done + " file spostat" + (done === 1 ? "o" : "i") + " ✓" + (fail ? " — " + fail + " non spostat" + (fail === 1 ? "o" : "i") + " (nome già esistente?)" : ""), !!fail);
            folderRefresh();
            return;
          }
          var it = items[i++];
          if (st) st.textContent = "sposto " + i + "/" + n + "…";
          dbx(API, "/2/files/move_v2", { from_path: it.path, to_path: dst + "/" + it.name, autorename: false })
            .then(function(){ done++; step(); })
            .catch(function(){ fail++; step(); });
        }
        step();
      });
  });
}

// --- galleria da cartella: apre l'editor NUOVO con la cartella già aperta e TUTTO selezionato ---
function galleryFromFolder(path, name, id){
  try { sessionStorage.setItem("simona:dbx:fromFolder", JSON.stringify({ path: path, name: name, id: id || "" })); } catch (e){ /* ok */ }
  if (A.showTab) A.showTab("galleries");
  if (A.openSlot) A.openSlot(null);
}

// --- tab Dropbox dell'admin: gestione libera, SENZA creare galleria ---
A.mountTab = async function(){
  hostId = "dbxTabBody";
  standalone = true;
  uiMode = "manage";
  targetSlot = null;
  if (tok && !acct) { try { await loadAccount(); } catch (e){ /* best-effort */ } }
  render();
  if (tok && CID()) await openFolder(cwd, cwdName, cwdId);
};

A.ensureOriginalsLink = ensureOriginalsLink;
A.dbxAccount = function(){ return acct; };

// navigazione a #/dropbox DOPO il load: routeFromHash di admin.js può girare
// prima che dropbox.js esista (mount saltato) — qui il mount è garantito
window.addEventListener("hashchange", function(){
  if (location.hash === "#/dropbox" && hostId !== "dbxTabBody" && document.getElementById("dbxTabBody")) A.mountTab();
});

// --- bootstrap ---
// 1) rientro dall'OAuth (?code=…): lo scambio del codice È la connessione —
//    PRIMA di tutto, senza passare dal refresh (lento/pendente) e senza
//    aprire la root: la vista la decide il contesto (resumeFromRedirect).
// 2) avvio normale: refresh silenzioso col token a 30gg, poi picker.
(async function(){
  var q = new URLSearchParams(location.search);
  var backFromOAuth = !!(q.get("code") || q.get("error"));
  if (backFromOAuth){
    // rientro dal consenso: lo scambio del codice È la connessione — PRIMA di
    // tutto, senza passare dal refresh (lento/pendente) e senza aprire la
    // root: il contesto lo decide il mount qui sotto
    try { await resumeFromRedirect(); } catch (e){ note(String(e.message || e), true); }
    // NB: niente return — dopo il rientro la vista va montata uguale
  } else if (!tok){
    await refreshToken(); // sessione nuova/tab nuovo → access token fresco senza login
  }
  render();
  loadAccount(); // identità (cache immediata + refresh best-effort)
  // mount del CONTESTO: tab Dropbox (admin.js può non averla montata al suo
  // boot perché dropbox.js carica dopo con defer), editor, o pre-warm root
  var routeIsDropbox = location.hash === "#/dropbox" ||
    (!location.hash && sessionStorage.getItem("simona:ui:route") === "#/dropbox");
  if (routeIsDropbox && document.getElementById("dbxTabBody")){
    A.mountTab();
  } else if (tok && !document.getElementById("dbxBodyIn")){
    openFolder("", "Dropbox", "").catch(function(e){ note(String(e.message || e), true); });
  }
})();
})();
