// shell galleria plain — derivati in chiaro, zero crypto
var $ = (id) => document.getElementById(id);
var M = null, pageIdx = -1;

function fail() { var h = $("loadhint"); if (h) h.textContent = STR[LANG].err; }

async function boot() {
  var r;
  try { r = await fetch("manifest.json"); } catch (e) { fail(); return; }
  if (!r.ok) { fail(); return; }
  try { M = await r.json(); } catch (e) { fail(); return; }
  applyLang();
  if (M.dropboxOriginalsUrl) $("dl").href = M.dropboxOriginalsUrl;
  else { var f = document.querySelector("#gallery footer"); if (f) f.remove(); }
  $("loading").hidden = true;
  $("gallery").hidden = false;
  await loadPage(0);
}

async function loadPage(i) {
  var ps = M.pageSize || 24;
  var start = i * ps;
  if (start < 0 || start >= M.items.length) return;
  var slice = M.items.slice(start, start + ps);
  var grid = $("grid");
  for (var k = 0; k < slice.length; k++) {
    (function (it, idx) {
      var img = new Image();
      img.src = it.thumb;
      // SEO/a11y immagini: alt dalla didascalia (o dal nome file)
      img.alt = it.caption || it.name;
      img.loading = "lazy";
      // a11y: bottone nativo → invio/spazio aprono il lightbox
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb";
      btn.setAttribute("aria-label", it.caption || it.name);
      btn.appendChild(img);
      btn.addEventListener("click", function () { lightbox(idx); });
      grid.appendChild(btn);
    })(slice[k], start + k);
  }
  pageIdx = i;
  $("more").hidden = start + ps >= M.items.length;
}

var lbOpener = null;
function lightbox(idx) {
  var it = M.items[idx];
  var img = $("lbimg"), cap = $("lbcap");
  if (cap) {
    // testo utente via textContent (niente innerHTML)
    cap.textContent = "";
    if (it.caption) { var t = document.createElement("div"); t.className = "t"; t.textContent = it.caption; cap.appendChild(t); }
    if (it.desc) { var d = document.createElement("div"); d.className = "d"; d.textContent = it.desc; cap.appendChild(d); }
    cap.style.display = cap.childNodes.length ? "block" : "none";
  }
  if (img.dataset.idx !== String(idx)) {
    img.src = it.full; // full in chiaro: lazy, lo cachea il browser
    img.alt = it.caption || it.name;
    img.dataset.idx = String(idx);
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
  var n = M.items.length, cur = Number($("lb").dataset.idx);
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
  it: { load: "Apro la galleria…", more: "Carica altre foto", dl: "Scarica gli originali", err: "Galleria non disponibile al momento. Riprova più tardi." },
  en: { load: "Opening the gallery…", more: "Load more photos", dl: "Download the originals", err: "Gallery temporarily unavailable. Please try again later." },
};
function applyLang() {
  var s = STR[LANG];
  document.documentElement.lang = LANG;
  var lh = document.getElementById("loadhint"); if (lh) lh.textContent = s.load;
  $("more").textContent = s.more;
  var dl = document.getElementById("dl"); if (dl) dl.textContent = s.dl;
  var btns = document.querySelectorAll("#blang button");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", btns[i].dataset.lang === LANG);
  try {
    if (M) {
      $("btitle").textContent = M.title[LANG] || M.title.it;
      document.title = $("btitle").textContent + " — Simona Lascialfari";
    }
  } catch (e) { /* M non ancora caricato */ }
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

// il brand porta alla home del sito (radice del SITO, non della radice utente)
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

$("more").addEventListener("click", function () { loadPage(pageIdx + 1); });
$("close").addEventListener("click", function () { closeLb(); });
$("prev").addEventListener("click", function () {
  var cur = Number($("lb").dataset.idx);
  lightbox((cur - 1 + M.items.length) % M.items.length);
});
$("next").addEventListener("click", function () {
  var cur = Number($("lb").dataset.idx);
  lightbox((cur + 1) % M.items.length);
});
boot();
