// shell galleria cifrata — WebCrypto, zero dipendenze
const IV_LEN = 12;
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const te = new TextEncoder();
const td = new TextDecoder();

async function importAes(key) {
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function aesDec(key, data) {
  const k = await importAes(key);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: data.slice(0, IV_LEN) }, k, data.slice(IV_LEN));
  return new Uint8Array(pt);
}
async function deriveKek(password, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

const $ = (id) => document.getElementById(id);
let DEK = null, PAYLOAD = null, blobs = [], pageIdx = -1;

async function open(password) {
  const hdrRes = await fetch("manifest.enc");
  const hdrBytes = new Uint8Array(await hdrRes.arrayBuffer());
  const hdr = JSON.parse(td.decode(hdrBytes));
  if (hdr.nopw) password = ""; // galleria libera: il segreto è l'URL
  const kek = await deriveKek(password, b64d(hdr.kdf.salt), hdr.kdf.iterations);
  let dek;
  try {
    dek = await aesDec(kek, b64d(hdr.wraps.password));
    // prova: il payload si decifra? (garantisce che la password è giusta)
    PAYLOAD = JSON.parse(td.decode(await aesDec(dek, b64d(hdr.payload))));
  } catch {
    return false;
  }
  DEK = dek;
  return true;
}

async function loadPage(i) {
  if (i < 0 || i >= PAYLOAD.pages.length) return; // oltre l'ultima pagina: niente crash
  const p = PAYLOAD.pages[i];
  const res = await fetch(p.file);
  const dec = await aesDec(DEK, new Uint8Array(await res.arrayBuffer()));
  // parse [len][thumb]...
  let off = 0;
  const grid = $("grid");
  for (const name of p.items) {
    const len = new DataView(dec.buffer, dec.byteOffset + off, 4).getUint32(0);
    off += 4;
    const blob = new Blob([dec.slice(off, off + len)], { type: "image/webp" });
    off += len;
    blobs.push({ name, url: URL.createObjectURL(blob), full: PAYLOAD.items[name].full,
      caption: PAYLOAD.items[name].caption, desc: PAYLOAD.items[name].desc });
    const idx = blobs.length - 1; // cattura ORA: il click deve aprire QUESTA foto
    const img = new Image();
    img.src = blobs[idx].url;
    img.alt = PAYLOAD.items[name].caption || name;
    img.loading = "lazy";
    // a11y: bottone nativo → invio/spazio aprono il lightbox
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "thumb";
    btn.setAttribute("aria-label", PAYLOAD.items[name].caption || name);
    btn.appendChild(img);
    btn.addEventListener("click", () => lightbox(idx));
    grid.appendChild(btn);
  }
  pageIdx = i;
  $("more").hidden = pageIdx >= PAYLOAD.pages.length - 1;
}

let lbOpener = null;
async function lightbox(idx) {
  const b = blobs[idx];
  const img = $("lbimg");
  const cap = $("lbcap");
  if (cap) {
    // a11y + igiene: DOM API come plain.js (mai innerHTML con testo utente)
    const meta = PAYLOAD.items[b.name] || {};
    cap.textContent = "";
    if (meta.caption || b.name) {
      const t = document.createElement("div"); t.className = "t"; t.textContent = meta.caption || b.name;
      cap.appendChild(t);
      if (meta.desc) { const d = document.createElement("div"); d.className = "d"; d.textContent = meta.desc; cap.appendChild(d); }
    }
    cap.style.display = cap.childNodes.length ? "block" : "none";
  }
  if (!img.dataset.loaded || img.dataset.idx !== String(idx)) {
    // full lazy: decifra solo quando aperta
    const res = await fetch(b.full);
    const dec = await aesDec(DEK, new Uint8Array(await res.arrayBuffer()));
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
document.addEventListener("keydown", (e) => {
  if ($("lb").hidden) return;
  const n = blobs.length;
  const cur = Number($("lb").dataset.idx);
  if (e.key === "Escape") closeLb();
  if (e.key === "ArrowRight") lightbox((cur + 1) % n);
  if (e.key === "ArrowLeft") lightbox((cur - 1 + n) % n);
});

// lingua — come il sito: localStorage "lang" vince, poi navigator
var LANG = "it";
try {
  var savedLang = localStorage.getItem("lang");
  if (savedLang === "it" || savedLang === "en") LANG = savedLang;
  else if (!(navigator.language && navigator.language.indexOf("it") === 0)) LANG = "en";
} catch (e) {}
var STR = {
  it: { load: "Apro la galleria…", gate: "Questa galleria è protetta. Inserisci la password che ti è stata comunicata.", pw: "Password", go: "Entra", err: "Password errata", more: "Carica altre foto", dl: "Scarica gli originali" },
  en: { load: "Opening the gallery…", gate: "This gallery is protected. Enter the password you were given.", pw: "Password", go: "Enter", err: "Wrong password", more: "Load more photos", dl: "Download the originals" },
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
  var dl = document.getElementById("dl"); if (dl) dl.textContent = s.dl;
  var btns = document.querySelectorAll("#blang button");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", btns[i].dataset.lang === LANG);
  try {
    if (PAYLOAD) {
      $("btitle").textContent = PAYLOAD.title[LANG] ?? PAYLOAD.title.it;
      document.title = $("btitle").textContent + " — Simona Lascialfari";
    }
  } catch (e) { /* PAYLOAD non ancora definito (pre-decifratura) */ }
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

// il brand porta alla home del sito (radice del SITO, non della radice
// utente: sui project-pages il primo segmento del path è il nome del sito)
(function () {
  var seg = (location.pathname.split("/")[1] || "").split("?")[0];
  var root = ["g", "p", "404.html", "index.html"].indexOf(seg) >= 0 ? "/" : "/" + seg + "/";
  var b = document.querySelector("a.brand");
  if (b) b.setAttribute("href", root);
})();

// barra brand: velo blurred quando si scorre (come la navbar del sito)
var barEl = document.querySelector(".bar");
window.addEventListener("scroll", function () {
  barEl.classList.toggle("veil", window.scrollY > 40);
}, { passive: true });
$("pwform").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("err").hidden = true;
  $("go").disabled = true;
  const ok = await open($("pw").value);
  $("go").disabled = false;
  if (!ok) { $("err").hidden = false; return; }
  reveal();
});
// ciò che appare DOPO l'apertura (loader via, titolo, prima pagina)
async function reveal() {
  $("loading").hidden = true;
  $("gate").hidden = true;
  $("gallery").hidden = false;
  $("btitle").textContent = PAYLOAD.title[LANG] ?? PAYLOAD.title.it;
  document.title = $("btitle").textContent + " — Simona Lascialfari"; // titolo tab = galleria
  if (PAYLOAD.dropboxOriginalsUrl) $("dl").href = PAYLOAD.dropboxOriginalsUrl;
  else document.querySelector("#gallery footer")?.remove(); // niente link → niente footer vuoto
  await loadPage(0);
}
// il gate appare SOLO se la password è davvero richiesta: prima leggiamo il
// manifest — nopw → apertura automatica; protetta (o errore rete) → gate
(async () => {
  try {
    const r = await fetch("manifest.enc");
    const hdr = JSON.parse(td.decode(new Uint8Array(await r.arrayBuffer())));
    if (hdr.nopw) {
      if (await open("")) { await reveal(); return; }
    }
  } catch { /* fallthrough: mostra il gate */ }
  $("loading").hidden = true;
  $("gate").hidden = false;
  $("pw")?.focus();
})();
$("more").addEventListener("click", () => loadPage(pageIdx + 1));
$("close").addEventListener("click", () => closeLb());
$("prev").addEventListener("click", () => {
  const cur = Number($("lb").dataset.idx);
  lightbox((cur - 1 + blobs.length) % blobs.length);
});
$("next").addEventListener("click", () => {
  const cur = Number($("lb").dataset.idx);
  lightbox((cur + 1) % blobs.length);
});
