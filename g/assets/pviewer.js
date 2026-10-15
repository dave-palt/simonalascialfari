// viewer proof /p/ — contenitori dal publisher via API, decifrazione locale
var IV_LEN = 12;
var b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
var te = new TextEncoder(), td = new TextDecoder();
var PUBLISHER = "https://simona-vm.dav3.cc";
var q = new URLSearchParams(location.search);
var SLUG = q.get("slug") || "", TOKEN = q.get("t") || "";
function api(file) { return fetch(PUBLISHER + "/api/p/" + SLUG + "/" + file + "?t=" + encodeURIComponent(TOKEN)); }
async function importAes(key) { return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]); }
async function aesDec(key, data) {
  var k = await importAes(key);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, IV_LEN) }, k, data.slice(IV_LEN)));
}
async function deriveKek(password, salt, iterations) {
  var base = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iterations }, base, 256));
}
var $ = (id) => document.getElementById(id);
var DEK = null, PAYLOAD = null, blobs = [], pageIdx = -1;
function offline() { killLoader(); $("gate").hidden = true; $("offline").hidden = false; }
// link morto: 401/403/404 dal publisher — NON chiedere password (sarebbe fuorviante)
function deadLink() { killLoader(); $("gate").hidden = true; $("invalid").hidden = false; }
async function open(password) {
  var hdrRes;
  try { hdrRes = await api("manifest.enc"); } catch (e) { offline(); throw e; }
  if (!hdrRes.ok) { if (hdrRes.status >= 500) offline(); else deadLink(); return false; }
  var hdr = JSON.parse(td.decode(new Uint8Array(await hdrRes.arrayBuffer())));
  if (hdr.nopw) password = ""; // bozza libera: il segreto è il token nell'URL
  var kek = await deriveKek(password, b64d(hdr.kdf.salt), hdr.kdf.iterations);
  var dek;
  try {
    dek = await aesDec(kek, b64d(hdr.wraps.password));
    PAYLOAD = JSON.parse(td.decode(await aesDec(dek, b64d(hdr.payload))));
  } catch { return false; }
  DEK = dek;
  return true;
}
async function loadPage(i) {
  var p = PAYLOAD.pages[i];
  var res = await api(p.file);
  if (!res.ok) { offline(); return; }
  var dec = await aesDec(DEK, new Uint8Array(await res.arrayBuffer()));
  var off = 0;
  var grid = $("grid");
  for (var n = 0; n < p.items.length; n++) {
    var name = p.items[n];
    var len = new DataView(dec.buffer, dec.byteOffset + off, 4).getUint32(0);
    off += 4;
    var blob = new Blob([dec.slice(off, off + len)], { type: "image/webp" });
    off += len;
    blobs.push({ name: name, url: URL.createObjectURL(blob), full: PAYLOAD.items[name].full });
    var img = new Image();
    img.src = blobs[blobs.length - 1].url;
    img.alt = name;
    img.loading = "lazy";
    // a11y: bottone nativo → invio/spazio aprono il lightbox
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "thumb";
    btn.setAttribute("aria-label", name);
    btn.appendChild(img);
    btn.addEventListener("click", (function (idx) { return function () { lightbox(idx); }; })(blobs.length - 1));
    grid.appendChild(btn);
  }
  pageIdx = i;
  $("more").hidden = pageIdx >= PAYLOAD.pages.length - 1;
}
var lbOpener = null;
async function lightbox(idx) {
  var b = blobs[idx];
  var img = $("lbimg");
  var cap = $("lbcap");
  if (cap) {
    // a11y + igiene: DOM API (mai innerHTML con testo utente)
    var meta = PAYLOAD.items[b.name] || {};
    cap.textContent = "";
    if (meta.caption || b.name) {
      var t = document.createElement("div"); t.className = "t"; t.textContent = meta.caption || b.name;
      cap.appendChild(t);
      if (meta.desc) { var d = document.createElement("div"); d.className = "d"; d.textContent = meta.desc; cap.appendChild(d); }
    }
    cap.style.display = cap.childNodes.length ? "block" : "none";
  }
  if (!img.dataset.loaded || img.dataset.idx !== String(idx)) {
    var res = await api(b.full);
    if (!res.ok) { offline(); return; }
    var dec = await aesDec(DEK, new Uint8Array(await res.arrayBuffer()));
    img.src = URL.createObjectURL(new Blob([dec], { type: "image/webp" }));
    img.alt = (PAYLOAD.items[b.name] && PAYLOAD.items[b.name].caption) || b.name;
    img.dataset.idx = String(idx);
    img.dataset.loaded = "1";
  }
  // a11y: focus dentro il dialog all'apertura; alla chiusura torna alla foto
  if ($("lb").hidden) { lbOpener = document.activeElement; $("close").focus(); }
  $("lb").hidden = false;
  $("lb").dataset.idx = idx;
}
function closeLb() {
  $("lb").hidden = true;
  if (lbOpener && lbOpener.focus) lbOpener.focus();
  lbOpener = null;
}
document.addEventListener("keydown", function (e) {
  if ($("lb").hidden) return;
  var n = blobs.length, cur = Number($("lb").dataset.idx);
  if (e.key === "Escape") closeLb();
  if (e.key === "ArrowRight") lightbox((cur + 1) % n);
  if (e.key === "ArrowLeft") lightbox((cur - 1 + n) % n);
});
// il brand porta alla home del sito (radice del SITO, non della radice utente)
(function () {
  var seg = (location.pathname.split("/")[1] || "").split("?")[0];
  var root = ["g", "p", "404.html", "index.html", "viewer.html"].indexOf(seg) >= 0 ? "/" : "/" + seg + "/";
  var b = document.querySelector("a.brand");
  if (b) b.setAttribute("href", root);
})();
// lingua — come il sito: localStorage "lang" vince, poi navigator
var LANG = "it";
try {
  var savedLang = localStorage.getItem("lang");
  if (savedLang === "it" || savedLang === "en") LANG = savedLang;
  else if (!(navigator.language && navigator.language.indexOf("it") === 0)) LANG = "en";
} catch (e) {}
var STR = {
  it: { load: "Caricamento…", gate: "Questa galleria è protetta. Inserisci la password che ti è stata comunicata.", pw: "Password", go: "Entra", err: "Password errata", off: "Servizio temporaneamente non disponibile.<br>Riprova più tardi.", inv: "Questo link non è più valido.<br>La bozza potrebbe essere stata pubblicata, sostituita o revocata.", more: "Carica altre foto" },
  en: { load: "Loading…", gate: "This gallery is protected. Enter the password you were given.", pw: "Password", go: "Enter", err: "Wrong password", off: "Service temporarily unavailable.<br>Please try again later.", inv: "This link is no longer valid.<br>The draft may have been published, replaced or revoked.", more: "Load more photos" },
};
function applyLang() {
  var s = STR[LANG];
  document.documentElement.lang = LANG;
  var lh = document.getElementById("loadhint"); if (lh) lh.textContent = s.load;
  $("gatehint").textContent = s.gate;
  $("pw").placeholder = s.pw;
  $("go").textContent = s.go;
  $("err").textContent = s.err;
  $("more").textContent = s.more;
  var oh = document.getElementById("offhint"); if (oh) oh.innerHTML = s.off;
  var ih = document.getElementById("invhint"); if (ih) ih.innerHTML = s.inv;
  var btns = document.querySelectorAll("#blang button");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", btns[i].dataset.lang === LANG);
  try {
    if (PAYLOAD) {
      $("btitle").textContent = PAYLOAD.title[LANG] || PAYLOAD.title.it;
      document.title = $("btitle").textContent + " — Simona Lascialfari";
    }
  } catch (e) { /* PAYLOAD non ancora definito */ }
}
document.querySelectorAll("#blang button").forEach(function (b) {
  b.addEventListener("click", function () {
    if (LANG === b.dataset.lang) return;
    LANG = b.dataset.lang;
    try { localStorage.setItem("lang", LANG); } catch (e) {}
    applyLang();
  });
});
applyLang();
var barEl = document.querySelector(".bar");
window.addEventListener("scroll", function () {
  barEl.classList.toggle("veil", window.scrollY > 40);
}, { passive: true });
$("pwform").addEventListener("submit", async function (e) {
  e.preventDefault();
  $("err").hidden = true;
  $("go").disabled = true;
  var ok = await open($("pw").value);
  $("go").disabled = false;
  if (!ok) { if (!$("offline").hidden) return; $("err").hidden = false; return; }
  $("gate").hidden = true;
  killLoader();
  $("gallery").hidden = false;
  $("btitle").textContent = PAYLOAD.title[LANG] || PAYLOAD.title.it;
  document.title = $("btitle").textContent + " — Simona Lascialfari"; // titolo tab = galleria
  await loadPage(0);
});
// bozza libera (nopw): apre automaticamente; altrimenti mostra SOLO ORA il gate
// (niente flash del campo password durante il caricamento)
function showGate(){ var l = $("loading"); if (l) l.remove(); $("gate").hidden = false; $("pw").focus(); }
function killLoader(){ var l = $("loading"); if (l) l.remove(); }
(async function boot(){
  try {
    var r = await api("manifest.enc");
    if (!r.ok) { if (r.status >= 500) offline(); else deadLink(); return; }
    var h = JSON.parse(td.decode(new Uint8Array(await r.arrayBuffer())));
    if (h.nopw) $("pwform").requestSubmit();
    else showGate();
  } catch (e) { offline(); }
})();
$("more").addEventListener("click", function () { loadPage(pageIdx + 1); });
$("close").addEventListener("click", function () { closeLb(); });
$("prev").addEventListener("click", function () { var cur = Number($("lb").dataset.idx); lightbox((cur - 1 + blobs.length) % blobs.length); });
$("next").addEventListener("click", function () { var cur = Number($("lb").dataset.idx); lightbox((cur + 1) % blobs.length); });
