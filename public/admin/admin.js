// ---- prologo D25: base API, config di canale, fetch cross-origin, stato offline ----
var __API = "";
(function () {
  var qApi = new URLSearchParams(location.search).get("api");
  if (qApi) { try { localStorage.setItem("simona:api", qApi); } catch (e) {} }
  var stored = "";
  try { stored = localStorage.getItem("simona:api") || ""; } catch (e) {}
  var cfg = window.__API_CONFIG || {};
  __API = qApi || stored || cfg.apiBase || "";
  while (__API.charAt(__API.length - 1) === "/") __API = __API.slice(0, -1);
  window.__API_BASE = __API;
  if (cfg.dropboxClientId && !window.__DROPBOX_CLIENT_ID) window.__DROPBOX_CLIENT_ID = cfg.dropboxClientId;
  if (cfg.siteUrl && !window.__SITE_URL) window.__SITE_URL = cfg.siteUrl;
})();

// fetch cross-origin: i path di servizio ("/api/…", "/staging/…", "/raw/…")
// diventano assoluti sulla base API; gli errori DI RETE (non HTTP) attivano lo
// stato offline. Dropbox e GitHub (URL assoluti) passano invariati.
(function () {
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === "string" && input.charAt(0) === "/") {
      var pathOnly = input.split("?")[0];
      if (pathOnly.indexOf("/api/") === 0 || pathOnly.indexOf("/staging/") === 0 || pathOnly.indexOf("/raw/") === 0) {
        input = window.__API_BASE + input;
      }
    }
    return realFetch(input, init).catch(function (e) {
      try { window.__offline.hit(e); } catch (ignored) {}
      throw e;
    });
  };
})();

// stato offline (D25/D14): server irraggiungibile → banner chiaro, login
// disabilitato CON motivo, recovery automatica a backoff + Riprova manuale.
// MAI auto-reload (l'editor potrebbe avere modifiche non salvate): il recovery
// automatico rimuove solo il banner; il Riprova manuale ri-verifica e basta.
window.__offline = (function () {
  var bar = null, msgEl = null, btn = null;
  var active = false, stopped = false, errs = 0, delay = 2000, timer = null;
  function ensureBar() {
    if (bar) return;
    bar = document.createElement("div");
    bar.id = "offlineBar";
    bar.hidden = true;
    msgEl = document.createElement("span");
    msgEl.id = "offlineMsg";
    btn = document.createElement("button");
    btn.className = "ghost";
    btn.type = "button";
    btn.textContent = "Riprova";
    btn.onclick = function () { probe(true); };
    bar.appendChild(msgEl);
    bar.appendChild(btn);
    var head = document.querySelector("header.top");
    if (head && head.parentNode) head.parentNode.insertBefore(bar, head.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  }
  function setLogin(off) {
    var b = document.getElementById("ghBtn");
    if (!b) return;
    b.disabled = off;
    b.title = off ? "Il server non è raggiungibile — il login passa dal server. Riprova fra poco." : "";
  }
  function probe(manual) {
    if (manual) { stopped = false; errs = 0; delay = 2000; }
    window.fetch("/api/health").then(function (r) {
      if (!r.ok) throw new Error("health " + r.status);
      active = false; stopped = false; errs = 0; delay = 2000;
      if (timer) { clearTimeout(timer); timer = null; }
      ensureBar(); bar.hidden = true; setLogin(false);
    }).catch(function () {
      errs++;
      ensureBar();
      if (errs >= 5 && !manual) {
        stopped = true;
        if (timer) { clearTimeout(timer); timer = null; }
        msgEl.textContent = "Aggiornamento interrotto — il server non risponde. Il sito e le gallerie pubblicate restano online.";
        bar.hidden = false; setLogin(true);
        return;
      }
      msgEl.textContent = "Il server non è raggiungibile — il sito e le gallerie pubblicate restano online. Riprovo fra poco…";
      bar.hidden = false; setLogin(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { probe(false); }, delay);
      delay = Math.min(delay * 2, 30000);
    });
  }
  return {
    hit: function () { if (active || stopped) return; active = true; probe(false); },
    boot: function () { active = true; probe(false); },
  };
})();
window.__offline.boot();


const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
// header: velo blurred quando si scorre (come navbar sito e barre gallerie)
(function () {
  const h = document.querySelector("header.top");
  window.addEventListener("scroll", function () {
    h.classList.toggle("veil", window.scrollY > 40);
  }, { passive: true });
})();
const state = { token: null, login: null, canEdit: null, jobs: [], timer: null };

// ---- routing hash: ogni stato ha un link (#/gallerie, #/nuova, #/galleria/<slug>,
// #/attivita) così refresh e riconnessione Dropbox riportano dove eri) ----
let currentRoute = "";
let slotBaseline = null; // stato iniziale dell'editor aperto (per conferma uscita con modifiche)
function setRoute(h) {
  currentRoute = h;
  if (location.hash !== h) location.hash = h;
  sessionStorage.setItem("simona:ui:route", h); // sopravvive al redirect OAuth Dropbox
}
function routeFromHash() {
  const h = location.hash || "";
  if (h === currentRoute) return;
  // hash #job-… = pubblicazione in corso dall'editor: NON tocca l'editor
  if (h.startsWith("#job-")) return;
  // uscita dall'editor con modifiche non salvate → conferma (o torna indietro)
  if (window.__slotDirty && window.__slotDirty() &&
      !h.match(/^#\/galleria\//) && !confirm("Ci sono modifiche non salvate nella galleria aperta. Uscire comunque?")) {
    location.hash = currentRoute; // annulla la navigazione
    return;
  }
  // idem per la tab Homepage sporca
  if (window.__hpDirty && window.__hpDirty() && currentRoute === "#/homepage" && h !== "#/homepage" &&
      !confirm("Ci sono modifiche non salvate nella homepage. Uscire comunque?")) {
    location.hash = currentRoute;
    return;
  }
  currentRoute = h;
  const m = h.match(/^#\/galleria\/([a-z0-9-]+)/);
  if (m) { showTab("galleries"); openSlot(m[1]); return; }
  if (h === "#/nuova") { showTab("galleries"); openSlot(null); return; }
  if (h === "#/dropbox") { showTab("dropbox"); return; }
  if (h === "#/homepage") { showTab("homepage"); return; }
  if (h === "#/attivita") { showTab("jobs"); return; }
  // lista pulita
  $("slotDetail").innerHTML = "";
  window.__slotDirty = null;
  showTab("galleries");
}
window.addEventListener("hashchange", routeFromHash);
// ritorno dal redirect Dropbox: l'hash si perde, ma lo abbiamo in sessionStorage
if (!location.hash && sessionStorage.getItem("simona:ui:route")) {
  location.hash = sessionStorage.getItem("simona:ui:route");
}

// ---- tab ----
const showTab = (name) => {
  $$(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  $$(".tabsec").forEach((s) => s.classList.toggle("hidden", s.id !== name));
  // l'editor (slotSec) NON è un tab: visibile solo nella tab Gallerie (e se non vuoto)
  $("slotSec").classList.toggle("hidden", name !== "galleries");
  setRoute(name === "jobs" ? "#/attivita" : (name === "homepage" ? "#/homepage" : (name === "dropbox" ? "#/dropbox" : "#/gallerie")));
  if (name === "galleries") loadAllGalleries();
  if (name === "homepage") loadHomepage(false);
  // tab Dropbox: il pannello è servito da dropbox.js (defer — al primo boot
  // può non esserci ancora; al click/route successivo si monta da solo)
  if (name === "dropbox" && window.__admin?.mountTab) window.__admin.mountTab();
};
$$(".tab").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
// nuova galleria: se il form NUOVO è già aperto non lo ricrea (niente sfarfallio),
// altrimenti azzera e apre; un form di MODIFICA aperto viene chiesto se sporco
$("newGalBtn").onclick = () => {
  const open = location.hash === "#/nuova" && $("slotDetail").children.length > 0;
  if (open) { document.getElementById("slotDetail")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (window.__slotDirty && window.__slotDirty() && !confirm("Ci sono modifiche non salvate. Aprire comunque una nuova galleria?")) return;
  $("slotDetail").innerHTML = "";
  window.__slotDirty = null;
  openSlot(null);
};
$("refreshBtn").onclick = () => { pending.clear(); loadAllGalleries(); };
$("bulkSave").onclick = () => applyBulk().catch((e) => { $("bulkMsg").textContent = "Errore: " + e.message; });
$("bulkClear").onclick = () => { pending.clear(); loadAllGalleries(); };

const api = async (path, opts = {}) => {
  const r = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.body && !(opts.body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...(state.token ? { Authorization: "Bearer " + state.token } : {}),
      ...(dbxAccountId() ? { "x-simona-dbx-account": dbxAccountId() } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(r.status + " " + t.slice(0, 300));
  }
  return r;
};

// ---- crypto browser (stessa semantica della shell/server) ----
const IV_LEN = 12;
const te = new TextEncoder(), td = new TextDecoder();
const b64e = (u8) => btoa(String.fromCharCode(...u8));
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// b64 per buffer GRANDI (foto): lo spread di b64e salta lo stack oltre ~100KB
const b64big = (u8) => {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(s);
};
async function importAes(k) { return crypto.subtle.importKey("raw", k, "AES-GCM", false, ["encrypt", "decrypt"]); }
async function aesEnc(key, pt) {
  const k = await importAes(key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, pt));
  const out = new Uint8Array(IV_LEN + ct.length);
  out.set(iv); out.set(ct, IV_LEN);
  return out;
}
async function deriveKek(pw, salt, it) {
  const base = await crypto.subtle.importKey("raw", te.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: it }, base, 256));
}

// ---- keyring di sessione (memoria SOLA: niente storage, muore al reload) ----
// slug → { dek: Uint8Array, pw: string }. Dopo il primo sblocco (publish o
// inserimento password) Salva non chiede più la password, e il salvataggio
// rapido riscrive il manifest senza job e senza ricifrare le foto.
const keyring = new Map();

// account Dropbox connesso (scritto dal pannello in sessionStorage + evento):
// serve per l'header x-simona-dbx-account (blocco per-account lato server)
function dbxAccountId() {
  try {
    const a = JSON.parse(sessionStorage.getItem("simona:dbx:acct") || "null");
    return a && a.id ? String(a.id) : "";
  } catch { return ""; }
}

async function aesDecRaw(key, data) {
  const k = await importAes(key);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, IV_LEN) }, k, data.slice(IV_LEN)));
}

// manifest.enc corrente della galleria: proof (bozza online, via token L2)
// oppure pubblicata (raw dal worktree content)
async function fetchEncHeader(slug, stage, l2) {
  const url = stage === "proof"
    ? "/api/p/" + slug + "/manifest.enc?t=" + encodeURIComponent(l2 || "")
    : "/raw/content/g/" + slug + "/manifest.enc";
  const r = await fetch(url, { headers: { Authorization: "Bearer " + state.token } });
  if (!r.ok) throw new Error("manifest non raggiungibile (" + r.status + ")");
  return JSON.parse(td.decode(await r.arrayBuffer()));
}

// contenitore cifrato di una pagina thumb (per il salvataggio rapido)
async function fetchContainer(slug, stage, l2, file) {
  const url = stage === "proof"
    ? "/api/p/" + slug + "/" + file + "?t=" + encodeURIComponent(l2 || "")
    : "/api/galleries/" + slug + "/container/" + file;
  const r = await fetch(url, { headers: { Authorization: "Bearer " + state.token } });
  if (!r.ok) throw new Error("contenitore " + file + " non raggiungibile (" + r.status + ")");
  return new Uint8Array(await r.arrayBuffer());
}

// PUT binaria autenticata (manifest/contenitori) — octet-stream + Bearer + account
async function putEnc(path, bytes) {
  const headers = { Authorization: "Bearer " + state.token, "Content-Type": "application/octet-stream" };
  if (dbxAccountId()) headers["x-simona-dbx-account"] = dbxAccountId();
  const r = await fetch(path, { method: "PUT", headers, body: bytes });
  if (!r.ok) throw new Error((await r.text().catch(() => "")) || ("PUT " + path + " → " + r.status));
  return r;
}

// de-wrap del DEK con la password → keyring (una volta per sessione admin)
async function unlockSlotKey(slug, pw, stage, l2) {
  const hdr = await fetchEncHeader(slug, stage, l2);
  const kek = await deriveKek(pw, b64d(hdr.kdf.salt), hdr.kdf.iterations);
  let dek;
  try { dek = await aesDecRaw(kek, b64d(hdr.wraps.password)); }
  catch { throw new Error("Password errata"); }
  keyring.set(slug, { dek, pw });
  return { hdr, dek };
}

// ---- HOMEPAGE gestita: testi + gallerie della home del sito ----
// (Salva = pubblica homepage.json su git: content + gh-pages, come le gallerie)
const HP_TEXT_FIELDS = [
  { k: "hero.tagline", label: "Presentazione (riga sotto il nome)", ta: false },
  { k: "portfolio.title", label: "Titolo — Galleria progetti", ta: false },
  { k: "about.title", label: "Titolo — Chi sono", ta: false },
  { k: "about.text", label: "Testo — Chi sono", ta: true },
  { k: "contact.title", label: "Titolo — Contatti", ta: false },
  { k: "contact.intro", label: "Introduzione — Contatti", ta: true },
];
// valori iniziali = testi statici attuali del sito (merge: pubblicato > default)
const HP_DEFAULT_TEXTS = {
  it: {
    "hero.tagline": "Fotografa — Bagno a Ripoli",
    "portfolio.title": "GALLERIA PROGETTI",
    "about.title": "CHI SONO",
    "about.text": "Mi chiamo Simona, sono una fotografa con base a Bagno a Ripoli. Mi occupo principalmente di ritratto, fotografia di danza e maternità, ambiti in cui il corpo, il gesto e l'emozione diventano il centro dell'immagine. Curo inoltre la fotografia di interni, influenzata dalla mia formazione come interior designer, che mi permette di leggere lo spazio e valorizzarlo con un occhio orientato alla progettazione. Il mio lavoro nasce dal desiderio di raccontare persone, movimento e spazi attraverso immagini capaci di restituire non solo ciò che si vede, ma anche ciò che si vive.",
    "contact.title": "CONTATTI",
    "contact.intro": "Per collaborazioni, richieste di informazioni o per prenotare una sessione, compilate il form sottostante o contattatemi direttamente.",
  },
  en: {
    "hero.tagline": "Photographer — Bagno a Ripoli",
    "portfolio.title": "PORTFOLIO",
    "about.title": "ABOUT",
    "about.text": "I am Simona, a photographer based in Bagno a Ripoli. I specialise primarily in portraits, dance photography and maternity photography, fields in which body, movement and emotion take centre stage. Alongside this, I also specialise in interior photography, influenced by my education as an interior designer, which enables me to interpret a space and showcase it through a design-oriented lens. My work stems from a desire to tell stories about people, movement and spaces through images capable of conveying not only what is seen, but also what is experienced.",
    "contact.title": "CONTACT",
    "contact.intro": "For collaborations, inquiries or to book a session, please fill in the form below or contact me directly.",
  },
};
// ordine di partenza = sezione Galleria progetti del sito; il resto in coda
const HP_SEED_ORDER = ["ritratto", "maternita", "danza", "racconti", "portfolio-giorgia", "portfolio-gabriele", "portfolio-martina", "portfolio-leonardo", "interni-real-estate-firenze", "interni-b-b-porto-ercole"];
const HP_SEED_TITLES = {
  "ritratto": { it: "Ritratto", en: "Portrait" },
  "maternita": { it: "Maternità", en: "Maternity" },
  "danza": { it: "Danza", en: "Dance" },
  "racconti": { it: "Racconti", en: "Tales" },
  "portfolio-giorgia": { it: "Portfolio - Giorgia", en: "Portfolio - Giorgia" },
  "portfolio-gabriele": { it: "Portfolio - Gabriele", en: "Portfolio - Gabriele" },
  "portfolio-martina": { it: "Portfolio - Martina", en: "Portfolio - Martina" },
  "portfolio-leonardo": { it: "Portfolio - Leonardo", en: "Portfolio - Leonardo" },
  "interni-real-estate-firenze": { it: "Interni — Real Estate Firenze", en: "Interiors — Real Estate Florence" },
  "interni-b-b-porto-ercole": { it: "Interni — B&B Porto Ercole", en: "Interiors — B&B Porto Ercole" },
};

// contatti diretti (sezione «oppure» sotto il form): default = valori statici
// attuali del sito; il valore pubblicato non vuoto vince
const HP_DEFAULT_CONTATTI = {
  email: "simona.lascialfari.305@gmail.com",
  whatsapp: "+39 331 587 4486",
  instagram: "https://www.instagram.com/seemorea_photography/",
};
const HP_CONTACT_FIELDS = [
  { k: "email", label: "E-mail", ph: "nome@esempio.it" },
  { k: "whatsapp", label: "WhatsApp", ph: "+39 331 587 4486" },
  { k: "instagram", label: "Instagram", ph: "@nome oppure indirizzo completo" },
];

let hpState = null; // { texts:{it,en}, contatti:{email,whatsapp,instagram}, gals:[{slug,visibile,titolo}], seo:{robots,llms}, siteBase, pubSlugs:[], titles:{} }
let hpBaseline = null;
let hpLoaded = false;

function hpSnap() {
  if (!hpState) return null;
  const texts = { it: {}, en: {} };
  for (const f of HP_TEXT_FIELDS) {
    const a = $("hp-it-" + f.k), b = $("hp-en-" + f.k);
    texts.it[f.k] = a ? a.value : "";
    texts.en[f.k] = b ? b.value : "";
  }
  const contatti = {};
  for (const f of HP_CONTACT_FIELDS) {
    const el = $("hp-c-" + f.k);
    contatti[f.k] = el ? el.value.trim() : "";
  }
  const seo = { robots: $("hp-robots")?.value ?? "", llms: $("hp-llms")?.value ?? "" };
  return JSON.stringify({ texts, contatti, gals: hpState.gals, seo });
}
window.__hpDirty = () => hpLoaded && hpBaseline !== null && hpSnap() !== null && hpSnap() !== hpBaseline;

async function loadHomepage(force) {
  if (hpLoaded) {
    const dirty = window.__hpDirty();
    if (!force && dirty) return; // non ricaricare sopra modifiche non salvate
    if (force && dirty && !confirm("Ci sono modifiche non salvate nella homepage. Ricaricare comunque?")) return;
  }
  $("hpErr").hidden = true;
  $("hpBody").innerHTML = '<p class="muted" style="padding:1.2rem 0"><span class="mini-spin" aria-hidden="true"></span> Carico la homepage…</p>';
  try {
    const [rhp, rg, rs] = await Promise.all([
      api("/api/homepage").then((r) => r.json()),
      api("/api/galleries").then((r) => r.json()),
      api("/api/staging").then((r) => r.json()),
    ]);
    const cfg = rhp.homepage;
    const pubSlugs = (rg.slugs || []).filter((s) => s !== "assets");
    const titles = {};
    for (const s of (rs.slots || [])) if (s.title) titles[s.slug] = s.title;
    const titleOf = (slug, saved) => saved || titles[slug] || HP_SEED_TITLES[slug] || { it: slug, en: slug };
    const texts = {
      it: Object.assign({}, HP_DEFAULT_TEXTS.it, (cfg && cfg.testi && cfg.testi.it) || {}),
      en: Object.assign({}, HP_DEFAULT_TEXTS.en, (cfg && cfg.testi && cfg.testi.en) || {}),
    };
    // contatti diretti: pubblicato non vuoto vince, altrimenti default statico
    const contatti = Object.assign({}, HP_DEFAULT_CONTATTI);
    const pubC = (cfg && cfg.contatti) || {};
    for (const f of HP_CONTACT_FIELDS) {
      const v = typeof pubC[f.k] === "string" ? pubC[f.k].trim() : "";
      if (v) contatti[f.k] = v;
    }
    let siteBase = rg.siteUrl || window.__SITE_URL || "";
    while (siteBase.endsWith("/")) siteBase = siteBase.slice(0, -1);
    // SEO: default precompilati SENZA URL assoluto — {SITE_URL} è sostituito
    // dal publisher a ogni pubblicazione (regenSeo), così i testi editati
    // restano validi qualunque sia il dominio del sito.
    const SITE_URL_TOKEN = "{SITE_URL}";
    const defRobots = "User-agent: *\nDisallow: /p/\nAllow: /\n\nSitemap: " + SITE_URL_TOKEN + "/sitemap.xml\n";
    const defLlms = "# Simona Lascialfari — Fotografa\n\nFotografa con base a Bagno a Ripoli (Firenze): ritratto, danza, maternità e interni.\nSito: " + SITE_URL_TOKEN + "\nLe gallerie clienti sono private e protette; quelle in homepage sono consultabili dal pubblico.\n";
    // a display l'URL assoluto del sito torna placeholder: si modifica il
    // token, e al salvataggio resta agnostico dal dominio
    const toTok = (s) => (siteBase ? String(s).split(siteBase).join(SITE_URL_TOKEN) : s);
    const seo = {
      robots: toTok((cfg && cfg.seo && cfg.seo.robots) || defRobots),
      llms: toTok((cfg && cfg.seo && cfg.seo.llmsTxt) || defLlms),
    };
    let gals;
    if (cfg && Array.isArray(cfg.gallerie)) {
      // config pubblicata: la rispetto tale e quale (le nuove pubblicate si aggiungono a mano con ＋)
      gals = cfg.gallerie.filter((g) => g && typeof g.slug === "string")
        .map((g) => ({ slug: g.slug, visibile: g.visibile !== false, titolo: titleOf(g.slug, g.titolo) }));
    } else {
      // primo avvio: seed = ordine della sezione progetti del sito + resto delle pubblicate
      const order = HP_SEED_ORDER.concat(pubSlugs.filter((s) => HP_SEED_ORDER.indexOf(s) < 0));
      gals = order.filter((s) => pubSlugs.includes(s)).map((s) => ({ slug: s, visibile: true, titolo: titleOf(s, null) }));
    }
    hpState = { texts, contatti, gals, seo, siteBase, pubSlugs, titles };
    hpLoaded = true;
    renderHomepage();
    hpBaseline = hpSnap();
  } catch (e) {
    $("hpBody").innerHTML = '<p class="err">' + hpEsc(e.message) + "</p>";
  }
}

function hpEsc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function renderHomepage() {
  // conserva le modifiche non salvate ai testi/contatti/seo: i click sui bottoni
  // gallerie ri-renderizzano tutto il pannello e senza questo li cancellerebbero
  // (solo se i campi esistono già nel DOM — al primo render c'è lo spinner)
  const snap = $("hp-it-" + HP_TEXT_FIELDS[0].k) ? hpSnap() : null;
  if (hpState && snap) {
    const s = JSON.parse(snap);
    hpState.texts = s.texts;
    hpState.contatti = s.contatti;
    hpState.seo = s.seo;
  }
  const st = hpState;
  const pubSet = new Set(st.pubSlugs);
  let html = "";
  for (const lang of ["it", "en"]) {
    html += '<h3 class="sec-h">' + (lang === "it" ? "Testi — Italiano" : "Testi — Inglese") + "</h3>";
    for (const f of HP_TEXT_FIELDS) {
      const id = "hp-" + lang + "-" + f.k;
      const v = hpEsc(st.texts[lang][f.k] || "");
      html += '<div style="margin-bottom:.9rem"><label for="' + id + '">' + f.label + "</label>" +
        (f.ta ? '<textarea id="' + id + '" rows="6">' + v + "</textarea>" : '<input id="' + id + '" value="' + v + '">') +
        "</div>";
    }
  }
  html += '<h3 class="sec-h">Contatti diretti</h3>' +
    '<p class="muted" style="margin:.2rem 0 .8rem">E-mail, WhatsApp e Instagram mostrati nella sezione contatti del sito, sotto il form. Campo vuoto = resta il valore predefinito.</p>';
  for (const f of HP_CONTACT_FIELDS) {
    const id = "hp-c-" + f.k;
    const v = hpEsc(st.contatti[f.k] || "");
    html += '<div style="margin-bottom:.9rem"><label for="' + id + '">' + f.label + "</label>" +
      '<input id="' + id + '" value="' + v + '" placeholder="' + hpEsc(f.ph) + '"></div>';
  }
  html += '<h3 class="sec-h">Gallerie nella home</h3>' +
    '<p class="muted" style="margin:.2rem 0 .8rem">Sposta con le frecce ↑ ↓ e decidi quali mostrare, e in quale ordine, nella galleria progetti del sito.</p>' +
    '<p class="muted" style="margin:-.4rem 0 .8rem;font-size:.75rem">Visibile «no» = nascosta ma ricorda la posizione (rimetti «sì» e torna dov\'era). ✕ = tolta dalla lista: per riaverla usa ＋ e riordinala.</p>';
  if (!st.gals.length) {
    html += '<p class="muted">Nessuna galleria in home — aggiungine una tra quelle pubblicate qui sotto.</p>';
  } else {
    html += '<table><thead><tr><th>Ordine</th><th>Galleria</th><th>Visibile</th><th></th></tr></thead><tbody id="hprows">';
    st.gals.forEach((g, i) => {
      const dead = !pubSet.has(g.slug);
      html += "<tr" + (dead ? ' style="opacity:.55"' : "") + ">" +
        '<td style="white-space:nowrap">' +
        '<button class="ibtn" data-hpi="' + i + '" data-hpm="' + (i - 1) + '" title="Sposta su" aria-label="Sposta su"' + (i === 0 ? " disabled" : "") + ">↑</button> " +
        '<button class="ibtn" data-hpi="' + i + '" data-hpm="' + (i + 1) + '" title="Sposta giù" aria-label="Sposta giù"' + (i === st.gals.length - 1 ? " disabled" : "") + ">↓</button></td>" +
        "<td>" + hpEsc(g.slug) + '<div class="muted" style="font-size:.75rem">' + hpEsc((g.titolo && g.titolo.it) || "") +
        (dead ? ' <span class="tag warn">non più pubblicata — verrà tolta al salvataggio</span>' : "") + "</div></td>" +
        '<td><span class="seg">' +
        [1, 0].map((v) => '<button data-hpv="' + i + '" data-v="' + v + '" class="' + ((g.visibile ? 1 : 0) === v ? "on" : "") + '">' + (v ? "sì" : "no") + "</button>").join("") +
        "</span></td>" +
        '<td><button class="ibtn danger" data-hpx="' + i + '" title="Togli dalla home" aria-label="Togli dalla home">✕</button></td></tr>';
    });
    html += "</tbody></table>";
  }
  const addable = st.pubSlugs.filter((s) => !st.gals.some((g) => g.slug === s));
  html += '<h3 class="sec-h">Aggiungi gallerie</h3>';
  if (addable.length) {
    html += '<p class="muted" style="margin:.2rem 0 .6rem">Altre gallerie pubblicate (＋ = aggiungi alla home):</p><div>';
    for (const s of addable) {
      const t = st.titles[s] || HP_SEED_TITLES[s];
      html += '<button class="ghost" data-hpa="' + hpEsc(s) + '" style="flex:0;min-width:0;font-size:.75rem;padding:.35rem .7rem;margin:0 .5rem .5rem 0">＋ ' + hpEsc(s) + (t && t.it ? ' <span class="muted" style="font-size:.68rem">· ' + hpEsc(t.it) + "</span>" : "") + "</button>";
    }
    html += "</div>";
  } else {
    html += '<p class="muted" style="margin:.2rem 0 .6rem">Tutte le gallerie pubblicate sono già nella home. Quando ne pubblichi una nuova dalla tab <strong>Gallerie</strong>, compare qui e la aggiungi con ＋.</p>';
  }
  // --- file per motori di ricerca e assistenti AI ---
  const sitemapUrl = (st.siteBase || "") + "/sitemap.xml";
  html += '<h3 class="sec-h">Motori di ricerca e assistenti AI</h3>' +
    '<p class="muted" style="margin:.2rem 0 .8rem"><strong>robots.txt</strong> regola i crawler; <strong>llms.txt</strong> descrive il sito agli assistenti AI (ChatGPT, Perplexity, …). La ' +
    (st.siteBase ? '<a class="link" href="' + hpEsc(sitemapUrl) + '" target="_blank" rel="noopener">sitemap</a>' : "sitemap") +
    ' è generata da sola — pagina iniziale, pagine informative e gallerie visibili in home — e si aggiorna a ogni pubblicazione. Le bozze private non compaiono mai.</p>' +
    '<p class="muted" style="margin:-.4rem 0 .8rem;font-size:.8rem">Negli altri due testi puoi usare <code>{SITE_URL}</code> come indirizzo del sito: viene sostituito automaticamente a ogni pubblicazione, quindi resta valido anche se il dominio cambia.</p>' +
    '<label for="hp-robots">robots.txt</label><textarea id="hp-robots" rows="6" style="font-family:ui-monospace,monospace;font-size:.8rem"></textarea>' +
    '<label for="hp-llms" style="margin-top:.7rem">llms.txt — descrizione del sito per gli assistenti AI</label><textarea id="hp-llms" rows="9" style="font-size:.85rem"></textarea>';
  $("hpBody").innerHTML = html;
  const rEl = $("hp-robots"), lEl = $("hp-llms");
  if (rEl) rEl.value = st.seo.robots;
  if (lEl) lEl.value = st.seo.llms;
  wireHomepage();
}

function wireHomepage() {
  $$("#hpBody [data-hpm]").forEach((b) => (b.onclick = () => {
    const i = Number(b.dataset.hpi), m = Number(b.dataset.hpm);
    if (m < 0 || m >= hpState.gals.length) return;
    const g = hpState.gals, tmp = g[i]; g[i] = g[m]; g[m] = tmp;
    renderHomepage();
  }));
  $$("#hpBody [data-hpv]").forEach((b) => (b.onclick = () => {
    hpState.gals[Number(b.dataset.hpv)].visibile = b.dataset.v === "1";
    renderHomepage();
  }));
  $$("#hpBody [data-hpx]").forEach((b) => (b.onclick = () => {
    hpState.gals.splice(Number(b.dataset.hpx), 1);
    renderHomepage();
  }));
  $$("#hpBody [data-hpa]").forEach((b) => (b.onclick = () => {
    const s = b.dataset.hpa;
    hpState.gals.push({ slug: s, visibile: true, titolo: hpState.titles[s] || HP_SEED_TITLES[s] || { it: s, en: s } });
    renderHomepage();
  }));
}

async function saveHomepage() {
  const btn = $("hpSave"), ok = $("hpOk"), er = $("hpErr");
  ok.hidden = true; er.hidden = true;
  btn.disabled = true; btn.textContent = "Pubblico…";
  try {
    const snap = JSON.parse(hpSnap());
    const pubSet = new Set(hpState.pubSlugs);
    const gallerie = snap.gals
      .filter((g) => pubSet.has(g.slug))
      .map((g, i) => ({ slug: g.slug, visibile: !!g.visibile, ordine: i, titolo: g.titolo || undefined }));
    const dropped = snap.gals.length - gallerie.length;
    // contatti: solo i campi non vuoti (vuoto = il sito resta sul valore statico)
    const contatti = {};
    for (const f of HP_CONTACT_FIELDS) {
      const v = (snap.contatti[f.k] || "").trim();
      if (v) contatti[f.k] = v;
    }
    await api("/api/homepage", { method: "PUT", body: JSON.stringify({ testi: snap.texts, contatti: Object.keys(contatti).length ? contatti : undefined, gallerie, seo: { robots: snap.seo.robots, llmsTxt: snap.seo.llms } }) });
    hpState.gals = gallerie;
    hpBaseline = hpSnap();
    ok.hidden = false;
    ok.textContent = "Salvato ✓ — homepage pubblicata" + (dropped ? " (" + dropped + " galleria/e non più pubblicate escluse)" : "") + ". Il sito mostra le novità quando il deploy completa, di solito entro un paio di minuti.";
    trackDeploy();
  } catch (e) {
    er.hidden = false; er.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = "Salva e pubblica";
  }
}
$("hpSave").onclick = () => saveHomepage();
$("hpReload").onclick = () => loadHomepage(true);

// ---- login: messaggi umani, mai JSON grezzo ----
function humanLoginError(e) {
  const m = String((e && e.message) || e);
  console.warn("[login]", m); // dettaglio tecnico solo in console
  if (/^401/.test(m) || /unauthorized/i.test(m)) return "Sessione scaduta o non valida — accedi di nuovo con GitHub.";
  if (/^403/.test(m) || /forbidden/i.test(m)) {
    const lm = m.match(/"login":"([^"]+)"/); // il 403 porta il login negato
    const chi = lm ? "l'account " + lm[1] : "questo account GitHub";
    return "Accesso negato: " + chi + " non è tra i collaboratori autorizzati del sito. Se non è l'account giusto, usa «Cambia account GitHub» qui sotto; altrimenti chiedi l'accesso come collaboratore, poi riprova con «Accedi con GitHub».";
  }
  if (/^503/.test(m) || /unreachable/i.test(m)) return "GitHub al momento non risponde — aspetta un attimo e riprova con «Accedi con GitHub».";
  if (/network|Failed to fetch/i.test(m)) return "Server non raggiungibile — controlla la connessione e riprova.";
  return "Accesso non riuscito — riprova con «Accedi con GitHub».";
}

async function doLogin(auto) {
  $("loginErr").hidden = true;
  $("loginBtn").disabled = true;
  // login manuale: il bottone stesso dice cosa sta succedendo
  if (!auto) $("loginBtn").textContent = "Controllo…";
  // auto-login (refresh con token in sessionStorage): NESSUN controllo d'accesso
  // visibile — nemmeno «Accedi con GitHub» — finché non si sa se il token è
  // ancora buono; tutto torna solo se il check fallisce
  if (auto) {
    $("loginBtn").hidden = true;
    const g = $("ghBtn"); if (g) g.hidden = true;
    const w = $("loginWait"); if (w) w.hidden = false;
  }
  try {
    state.token = $("token").value.trim();
    const me = await (await api("/api/auth/check")).json();
    state.login = me.login; state.canEdit = me.canEdit;
    $("who").textContent = me.login + (me.canEdit ? " · edit" : " · read-only");
    sessionStorage.setItem("simona:gh:tok", state.token);
    // fallback persistente: alcuni profili buttano il sessionStorage tra un
    // caricamento e l'altro (stessa storia del token Dropbox) → senza questo
    // il login "non durava" e tornava il bottone a ogni riapertura
    try { localStorage.setItem("simona:gh:tokl", state.token); } catch (e) { /* ok */ }
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("ghLogout").hidden = false;
    $("ghSwitch").hidden = true;
    routeFromHash(); // ripristina la vista dall'hash (refresh/OAuth Dropbox inclusi)
    loadAllGalleries(); // i dati erano falliti senza token: ricarica sempre post-login
    refreshJobs(); state.timer = setInterval(refreshJobs, 2500);
    loadJobsOnce(); // il polling dei job parte DOPO il login (prima il token manca)
  } catch (e) {
    state.token = null;
    sessionStorage.removeItem("simona:gh:tok"); // mai riprovare all'infinito con un token morto
    if (auto) { try { localStorage.removeItem("simona:gh:tokl"); } catch (e) { /* ok */ } } // nemmeno col fallback
    $("ghLogout").hidden = true;
    if (auto) {
      $("loginBtn").hidden = false;
      const g = $("ghBtn"); if (g) g.hidden = false;
      const w = $("loginWait"); if (w) w.hidden = true;
    }
    // «Cambia account» ha senso solo davanti a un 403 VISO all'utente
    $("ghSwitch").hidden = !(auto === false && /^403/.test(String((e && e.message) || e)));
    if (!auto) { // l'auto-login fallito non spaventa: resta la pulita schermata d'accesso
      $("loginErr").textContent = humanLoginError(e);
      $("loginErr").hidden = false;
    }
  } finally { $("loginBtn").disabled = false; $("loginBtn").textContent = "Entra"; }
}
$("loginBtn").onclick = () => doLogin(false);

// esci dall'admin: butta via token e segreti di sessione, torna all'accesso.
// L'identità SU github.com non si tocca — per entrare con un altro account
// c'è «Cambia account GitHub» nella schermata d'accesso.
function doLogout() {
  if (window.__slotDirty && window.__slotDirty() && !confirm("Ci sono modifiche non salvate. Uscire comunque?")) return;
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  state.token = null; state.login = null; state.canEdit = null; state.jobs = [];
  sessionStorage.removeItem("simona:gh:tok");
  try { localStorage.removeItem("simona:gh:tokl"); } catch (e) { /* ok */ }
  keyring.clear(); // password/DEK in memoria: non sopravvivono all'uscita
  $("token").value = "";
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("loginBtn").hidden = false;
  const g2 = $("ghBtn"); if (g2) g2.hidden = false;
  const lw = $("loginWait"); if (lw) lw.hidden = true;
  $("ghLogout").hidden = true;
  $("ghSwitch").hidden = true;
  $("loginErr").hidden = true;
}
$("ghLogout").onclick = doLogout;

// cambio account GitHub: con una sessione github.com attiva l'authorize
// reindirizza in silenzio SULLO STESSO account (auto-consenso) — per entrare
// con un altro si passa da github.com/logout, che riconduce all'authorize
// dove stavolta GitHub chiede con chi entrare.

// PKCE GitHub (RFC 7636, 2026-10-17): il redirect ?code= è una navigation
// pubblica — chi gestisce il dominio (Worker) o legge i log del CDN vede il
// code. Senza PKCE la VM scambiava QUALSIASI code presentato (confused
// deputy col client_secret) e restituiva il token admin al chiamante. Con
// PKCE il verifier esiste solo qui: il code rubato non è scambiabile.
function ghB64url(u8){ let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function ghVerifier(){ const u = new Uint8Array(32); crypto.getRandomValues(u); return ghB64url(u); }
async function ghS256(v){ const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)); return ghB64url(new Uint8Array(d)); }

async function ghAuthorizeUrl(){
  const v = ghVerifier();
  const r = await (await fetch("/api/auth/github/url?code_challenge=" + encodeURIComponent(await ghS256(v)))).json();
  if (!r.url) throw new Error(r.error || "OAuth GitHub non disponibile");
  sessionStorage.setItem("simona:gh:state", r.state);
  sessionStorage.setItem("simona:gh:v", v);
  // fallback PKCE in localStorage: profili browser che svuotano il
  // sessionStorage durante il giro OAuth (stessa ragione di dropbox.js) —
  // chiave effimera, rimossa al consumo, scadenza 15 minuti
  try { localStorage.setItem("simona:gh:pkce", JSON.stringify({ v: v, st: r.state, at: Date.now() })); } catch (e){ /* ok */ }
  return r.url;
}

$("ghSwitch").onclick = async () => {
  $("loginErr").hidden = true;
  $("ghSwitch").disabled = true;
  try {
    location.href = "https://github.com/logout?return_to=" + encodeURIComponent(await ghAuthorizeUrl());
  } catch (e) {
    $("ghSwitch").disabled = false;
    $("loginErr").textContent = "Cambio account non riuscito — " + ((e && e.message) || e);
    $("loginErr").hidden = false;
  }
};

// ---- login OAuth GitHub (web flow: redirect → callback → exchange PKCE) ----
$("ghBtn").onclick = async () => {
  $("loginErr").hidden = true;
  try {
    location.href = await ghAuthorizeUrl();
  } catch (e) {
    $("loginErr").textContent = "GitHub OAuth: " + e.message;
    $("loginErr").hidden = false;
  }
};

// ritorno OAuth GitHub (D25): ?code=&state= nell'URL (redirect_uri = origine
// del sito) oppure, dal fallback tunnel, #access_token=… nel fragment.
(async () => {
  const q = new URLSearchParams(location.search);
  const code = q.get("code");
  const stO = q.get("state");
  // ?code= può essere il rientro del consenso DROPBOX (PKCE: stesso URL di
  // ritorno da D25). Se lo state combacia con quello Dropbox pendente NON è
  // nostro: lo processa dropbox.js (defer) — qui non si scambia e NON si
  // pulisce l'URL, altrimenti il codice muore prima che dropbox.js lo veda
  const dbxSt = sessionStorage.getItem("simona:dbx:st");
  const isDbxReturn = !!(code && stO && dbxSt && stO === dbxSt);
  // rientro GitHub: SOLO se lo state combacia con quello generato uscendo
  // (anti-CSRF). Un code con state estraneo non si scambia MAI: sarebbe un
  // redirect iniettato, non il nostro flusso.
  let ghSt = sessionStorage.getItem("simona:gh:state");
  let ghV = sessionStorage.getItem("simona:gh:v") || "";
  if (!ghV || !ghSt){
    try {
      const pk = JSON.parse(localStorage.getItem("simona:gh:pkce") || "null");
      if (pk && Date.now() - (pk.at || 0) < 15 * 60 * 1000){
        if (!ghV) ghV = pk.v;
        if (!ghSt) ghSt = pk.st;
      }
    } catch (e){ /* ok */ }
  }
  const isGhReturn = !!(code && stO && ghSt && stO === ghSt);
  const frag = new URLSearchParams(location.hash.replace(/^#/, ""));
  const tokFrag = frag.get("access_token");
  const gherr = q.get("error_description") || q.get("error") || frag.get("gherr");
  const clean = () => history.replaceState({}, "", location.pathname);
  const ghConsume = () => {
    sessionStorage.removeItem("simona:gh:state");
    sessionStorage.removeItem("simona:gh:v");
    try { localStorage.removeItem("simona:gh:pkce"); } catch (e){ /* ok */ }
  };
  if (code && !isDbxReturn) {
    clean();
    if (!isGhReturn) {
      console.warn("[gh-oauth] state non riconosciuto — scambio rifiutato");
      $("loginErr").textContent = "Rientro GitHub non riconosciuto — ripremi «Accedi con GitHub».";
      $("loginErr").hidden = false;
    } else if (!ghV) {
      ghConsume();
      $("loginErr").textContent = "Sessione OAuth scaduta (verifier perso) — ripremi «Accedi con GitHub».";
      $("loginErr").hidden = false;
    } else {
      ghConsume();
      try {
        const r = await fetch("/api/auth/github/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirectUri: location.origin + location.pathname, codeVerifier: ghV }),
        });
        const j = await r.json();
        if (!j.token) throw new Error(j.error || "scambio del codice non riuscito");
        $("token").value = j.token;
        doLogin(false);
      } catch (e) {
        console.warn("[gh-oauth]", e);
        $("loginErr").textContent = "Accesso GitHub non riuscito — " + ((e && e.message) || e);
        $("loginErr").hidden = false;
      }
    }
  } else if (tokFrag) {
    clean();
    $("token").value = tokFrag;
    doLogin(false); // login esplicito appena fatto: se fallisce, messaggio umano
  } else if (gherr) {
    clean();
    console.warn("[gh-oauth]", gherr);
    $("loginErr").textContent = "Accesso GitHub non riuscito — riprova con «Accedi con GitHub».";
    $("loginErr").hidden = false;
  }
})();

// auto-login: il token sopravvive ai round-trip OAuth (es. consenso Dropbox)
// in sessionStorage — stessa semantica del token Dropbox, per-tab. Fallback
// localStorage per i profili che svuotano il sessionStorage a ogni load.
(() => {
  let t = sessionStorage.getItem("simona:gh:tok");
  if (!t) { try { t = localStorage.getItem("simona:gh:tokl") || null; } catch (e) { /* ok */ } }
  if (t && !state.token) {
    $("token").value = t;
    sessionStorage.setItem("simona:gh:tok", t);
    doLogin(true); // silenzioso: token scaduto → schermata d'accesso, nessun errore
  } else {
    // nessun token da provare: il bottone si mostra QUI, non nell'HTML — così
    // tra paint ed esecuzione dello script non c'è MAI un frame col bottone
    $("ghBtn").hidden = false;
  }
})();

// tab aperta mentre il server è stato aggiornato → banner discreto "aggiorna"
(() => {
  let prima = null;
  const check = async () => {
    try {
      const h = await (await fetch("/api/health")).json();
      if (!h.adminV) return;
      if (prima === null) { prima = h.adminV; return; }
      if (h.adminV !== prima && !document.getElementById("staleBar")) {
        const bar = document.createElement("div");
        bar.id = "staleBar";
        bar.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99;background:var(--terra);color:#fff;text-align:center;padding:.55rem 1rem;font-size:.85rem;cursor:pointer";
        bar.textContent = "↻ Interfaccia aggiornata — clicca qui per ricaricare (le modifiche non salvate andrebbero perse)";
        bar.onclick = () => location.reload();
        document.body.appendChild(bar);
      }
    } catch { /* server giù: il polling jobs lo segnalerà */ }
  };
  check();
  setInterval(check, 30000);
})();

// ---- slug: sanitifica mentre si digita + anteprima URL + unicità live ----
// (spazi e caratteri speciali → '-', il trattino basso _ è ammesso)
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/[-_]+$/, "");
let knownSlugs = new Set(); // slugs esistenti (staging + pubblicate) per il check live
async function loadKnownSlugs(exclude) {
  try {
    const [rs, rg] = await Promise.all([(await api("/api/staging")).json(), (await api("/api/galleries")).json()]);
    knownSlugs = new Set([...(rs.slots || []).map((s) => s.slug), ...(rg.slugs || [])].filter((s) => s !== exclude));
  } catch { knownSlugs = new Set(); }
}
function wireSlugField(currentSlug, isNew) {
  const el = $("eslug");
  if (!el) return;
  const pv = $("slugPreview");
  let autoSlug = !!isNew; // in nuova galleria il titolo genera lo slug finché non lo editi a mano
  el.addEventListener("input", () => { autoSlug = false; }); // edit manuale → disinnesc O auto
  const update = () => {
    const raw = el.value;
    const s = slugify(raw);
    if (s !== raw) el.value = s; // spazi → '-', accentate → base, ecc.
    if (pv) {
      const taken = s && knownSlugs.has(s);
      pv.textContent = s ? "/g/" + s + "/" : "";
      pv.style.color = taken ? "var(--terra)" : "";
      if (taken) pv.textContent += "  ⚠ slug già in uso (bozza o galleria pubblica)";
    }
  };
  const tit = $("etit");
  if (tit && isNew) tit.addEventListener("input", () => {
    if (autoSlug) { el.value = slugify(tit.value); update(); }
  });
  el.addEventListener("input", update);
  update();
}

// ---- password: campi legacy rimossi dalla UI (la password vive nell'editor bozza) ----

// (createBtn rimosso: l'unico percorso di creazione è «Crea bozza dalla selezione» nel pannello Dropbox)

function showErr(el, msg) { el.textContent = msg; el.hidden = false; return false; }

// ---- jobs ----
// NOTA: non esiste GET /api/jobs (collezione) in API v1 — niente polling cieco.
// Il dettaglio arriva solo per job noto (hash #job-<id>) con back-off.
const pollBackoff = { errors: 0, delay: 2000, max: 30000 };

async function refreshJobs() {
  const m = location.hash.match(/^#job-(.+)$/);
  if (m) await pollJob(m[1]);
}

async function pollJob(id, delay) {
  try {
    const j = await (await api("/api/jobs/" + id)).json();
    pollBackoff.errors = 0;
    pollBackoff.delay = 2000;
    renderJobDetail(j);
    if (j.state === "awaiting_manifest") { await wizardPassword(j); return; }
    if (j.state === "running" || j.state === "pending") {
      setTimeout(() => pollJob(id), delay ?? pollBackoff.delay);
    }
  } catch (e) {
    pollBackoff.errors++;
    if (pollBackoff.errors >= 5) {
      const btn = document.createElement("button");
      btn.className = "ghost";
      btn.textContent = "Riprova";
      btn.onclick = () => pollJob(id);
      $("jobdetail").innerHTML = "";
      const p = document.createElement("p");
      p.className = "err";
      p.textContent = "Aggiornamento interrotto: server non raggiungibile. ";
      p.appendChild(btn);
      $("jobdetail").appendChild(p);
      return;
    }
    pollBackoff.delay = Math.min(pollBackoff.delay * 2, pollBackoff.max);
    setTimeout(() => pollJob(id), pollBackoff.delay);
  }
}

function renderJobDetail(j) {
  const res = j.result || {};
  // hpEsc ovunque: j.error può contenere NOMI FILE Dropbox (import falliti) e
  // l'admin tiene i token OAuth in localStorage — un nome ostile non deve
  // mai finire raw in innerHTML
  const rows = (j.log || []).map((l) => "<div>" + hpEsc(l) + "</div>").join("");
  $("jobdetail").innerHTML =
    '<h2 style="margin-bottom:.5rem">Job ' + hpEsc(j.id) + "</h2>" +
    '<p><span class="tag ' + tagClass(j.state) + '">' + hpEsc(j.state) + "</span> " +
    (res.ok != null ? '<span class="muted">' + res.ok + "/" + res.total + " foto · " + res.cacheHits + " cache hit</span>" : "") + "</p>" +
    (j.error ? '<p class="err">' + hpEsc(j.error) + "</p>" : "") +
    "<pre>" + rows + "</pre>";
}

// alias storico: il polling riparte dai punti che lo invocano dopo un'azione
async function loadJobsOnce() {
  pollBackoff.errors = 0;
  pollBackoff.delay = 2000;
  await refreshJobs();
}

function tagClass(s) {
  if (s === "done") return "ok";
  if (s === "failed" || s === "cancelled") return "warn";
  if (s === "running" || s === "awaiting_manifest") return "run";
  return "";
}

// ---- wizard password: fase 2 ----
async function wizardPassword(job) {
  let pw = sessionStorage.getItem("simona:pw:" + job.id) ?? "";
  if (pw === "__NOPW__") pw = ""; // bozza libera: cifra con password vuota
  if (!sessionStorage.getItem("simona:pw:" + job.id)) {
    $("jobdetail").insertAdjacentHTML("beforeend",
      '<div><label>Password cliente per completare la pubblicazione</label>' +
      '<div class="row"><input type="password" id="wizpw"><button id="wizgo">Pubblica</button></div></div>');
    $("wizgo").onclick = () => finishManifest(job, $("wizpw").value);
    return;
  }
  await finishManifest(job, pw);
}

async function finishManifest(job, pw) {
  const res = job.result;
  if (!res || !res.dek) {
    // D15: il DEK vive in RAM sul server — dopo un riavvio (o a fine handoff)
    // non c'è più: senza rigenerare i contenitori la fase 2 è impossibile
    renderJobDetail(job);
    $("jobdetail").insertAdjacentHTML("beforeend", '<p class="err">chiave della galleria non più disponibile (server riavviato o handoff scaduto) — riesegui l&#39;importazione dalla tab Gallerie: le foto sono in cache, sarà rapido.</p>');
    return;
  }
  const dek = Buffer_like_fromHex(res.dek);
  const skeleton = res.skeleton;
  const iterations = pw ? 600000 : 1000; // senza password: KDF simbolico (il segreto è il token URL)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(pw, salt, iterations);
  const wrapped = await aesEnc(kek, dek);
  const payloadEnc = await aesEnc(dek, te.encode(JSON.stringify(skeleton)));
  const header = {
    v: 1,
    kdf: { algo: "PBKDF2-SHA256", iterations, salt: b64e(salt) },
    wraps: { password: b64e(wrapped), admin: null },
    payload: b64e(payloadEnc),
    nopw: pw ? undefined : 1,
  };
  const blob = te.encode(JSON.stringify(header));
  const r = await fetch("/api/jobs/" + job.id + "/manifest", {
    method: "POST",
    headers: { Authorization: "Bearer " + state.token, "Content-Type": "application/octet-stream" },
    body: blob,
  });
  if (!r.ok) { renderJobDetail(job); $("jobdetail").insertAdjacentHTML("beforeend", '<p class="err">fase 2 fallita: ' + hpEsc(await r.text()) + "</p>"); return; }
  sessionStorage.removeItem("simona:pw:" + job.id);
  // keyring di sessione: DEK + password restano in memoria — i salvataggi
  // successivi della stessa galleria non chiedono più la password
  if (res.slug) keyring.set(res.slug, { dek, pw });
  $("jobdetail").insertAdjacentHTML("beforeend", '<p class="okmsg">Pubblicata ✓ — /g/' + hpEsc(res.slug) + "/</p>");
  loadGalleries();
}

function Buffer_like_fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// ---- salvataggio rapido (senza job): cambia SOLO ciò che vive nel manifest
// cifrato — titoli, didascalie, ordine, esclusioni di foto già pubblicate.
// Il browser ha il DEK in memoria: decripta il payload, lo ricostruisce dallo
// staging, ricifra le pagine thumb toccate (nomi file NUOVI: il vecchio
// manifest continua a trovare i vecchi contenitori) e infine il manifest.
// Zero job, zero download dagli originali, zero re-derive. False = non
// applicabile → il chiamante ripiega sul job completo. ----
async function fastManifestSave(slug, stage, l2, titleIt, titleEn, newPw, plain) {
  // PLAIN (piano nopw): nessuna crypto nel browser — il server riscrive
  // manifest.json dallo slot staging (titoli/didascalie/ordine/esclusioni,
  // rigenerando dalla cache le foto tornate visibili). Lancio via API.
  if (plain) {
    await api("/api/galleries/" + slug + "/manifest-plain", { method: "PUT" });
    return true;
  }
  const m2 = await (await api("/staging/" + slug + "/manifest.json")).json();
  let kr = keyring.get(slug);
  let hdr;
  if (kr) hdr = await fetchEncHeader(slug, stage, l2);
  else {
    const u = await unlockSlotKey(slug, "", stage, l2); // galleria libera: pw ""
    kr = keyring.get(slug);
    hdr = u.hdr;
  }
  let payload;
  try { payload = JSON.parse(td.decode(await aesDecRaw(kr.dek, b64d(hdr.payload)))); }
  catch { keyring.delete(slug); return false; } // DEK stantio (manifest cambiato altrove): job
  // insieme desiderato dallo staging (già salvato via PATCH): ogni foto
  // selezionata deve già esistere nel manifest, altrimenti servono contenitori nuovi
  const sel = m2.items.filter((i) => i.selected);
  if (!sel.length) return false;
  const oldItems = payload.items || {};
  const kept = {};
  for (const it of sel) {
    if (!oldItems[it.name]) return false;
    const o = { ...oldItems[it.name] };
    if (it.caption) o.caption = it.caption; else delete o.caption;
    if (it.desc) o.desc = it.desc; else delete o.desc;
    kept[it.name] = o;
  }
  const pageSize = payload.pageSize || 24;
  const names = sel.map((i) => i.name);
  const oldPages = payload.pages || [];
  const oldSeq = [];
  for (const p of oldPages) for (const n of p.items || []) oldSeq.push(n);
  const seqChanged = JSON.stringify(oldSeq) !== JSON.stringify(names);
  // thumb bytes per item: scaricati e decrittati SOLO se la sequenza cambia
  let thumbs = null;
  if (seqChanged) {
    thumbs = new Map();
    for (const p of oldPages) {
      const dec = await aesDecRaw(kr.dek, await fetchContainer(slug, stage, l2, p.file));
      let off = 0;
      for (const n of p.items || []) {
        const len = new DataView(dec.buffer, dec.byteOffset + off, 4).getUint32(0);
        off += 4;
        thumbs.set(n, dec.slice(off, off + len));
        off += len;
      }
    }
  }
  const hex16 = () => Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const pages = [];
  const items = {};
  const rewrite = [];
  for (let i = 0; i < names.length; i += pageSize) {
    const chunk = names.slice(i, i + pageSize);
    const pIdx = pages.length;
    const oldPage = oldPages[pIdx];
    const changed = thumbs && (!oldPage || JSON.stringify(oldPage.items || []) !== JSON.stringify(chunk));
    // pagina invariata → stesso file (zero upload); cambiata → nome NUOVO
    const file = changed ? "thumbs-" + hex16() + ".enc" : (oldPage ? oldPage.file : "thumbs-" + hex16() + ".enc");
    pages.push({ file, items: chunk });
    chunk.forEach((n, idx) => { items[n] = { ...kept[n], page: pIdx, order: idx }; });
    if (changed) {
      const parts = [];
      for (const n of chunk) {
        const t = thumbs.get(n);
        if (!t) return false; // thumb mancante: non ricostruibile lato browser
        const len = new Uint8Array(4);
        new DataView(len.buffer).setUint32(0, t.length);
        parts.push(len, t);
      }
      const total = parts.reduce((n, p) => n + p.length, 0);
      const joined = new Uint8Array(total);
      let off = 0;
      for (const p of parts) { joined.set(p, off); off += p.length; }
      rewrite.push({ file, bytes: await aesEnc(kr.dek, joined) });
    }
  }
  // contenitori PRIMA del manifest (nessuno li referenzia ancora), poi il
  // manifest nuovo: chiude l'operazione in un colpo solo
  for (const rw of rewrite) {
    await putEnc(stage === "proof"
      ? "/api/staging/" + slug + "/container/" + rw.file
      : "/api/galleries/" + slug + "/container/" + rw.file, rw.bytes);
  }
  payload.title = { it: titleIt, en: titleEn };
  payload.items = items;
  payload.pages = pages;
  let hdr2 = { ...hdr, payload: b64e(await aesEnc(kr.dek, te.encode(JSON.stringify(payload)))) };
  // cambio/aggiunta password SENZA job: stesso DEK, nuova busta (ri-wrap da KB)
  if (newPw) {
    const iterations = 600000;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kekNew = await deriveKek(newPw, salt, iterations);
    const wrapped = await aesEnc(kekNew, kr.dek);
    hdr2 = { ...hdr2, kdf: { ...hdr2.kdf, iterations, salt: b64e(salt) }, wraps: { ...hdr2.wraps, password: b64e(wrapped) } };
    delete hdr2.nopw;
    keyring.set(slug, { dek: kr.dek, pw: newPw });
  }
  await putEnc(stage === "proof"
    ? "/api/staging/" + slug + "/manifest-enc"
    : "/api/galleries/" + slug + "/manifest", te.encode(JSON.stringify(hdr2)));
  return true;
}

// ---- tabella unica: bozze + pubblicate; combo di configurazione per riga con
// modifiche pending (diff visivo) e salvataggio di massa ----
const pending = new Map(); // slug → { page?, images?, originals? }

let editingSlug = null; // galleria aperta nell'editor: le sue combo in tabella si bloccano

function segHtml(slug, label, key, opts, cur, dis, disTitle) {
  const ch = pending.get(slug) || {};
  const val = ch[key] !== undefined ? ch[key] : cur;
  const mod = ch[key] !== undefined && ch[key] !== cur;
  return '<span class="seg"><span class="lb">' + label + "</span>" +
    opts.map((o) => {
      const on = o === val;
      const off = dis && dis.includes(o);
      return '<button data-seg="' + slug + '" data-k="' + key + '" data-v="' + o + '" class="' + (on ? "on" : "") + " " + (mod && on ? "mod" : "") + '"' +
        (off ? ' disabled title="' + (disTitle || "non disponibile") + '" aria-label="non disponibile"' : "") + ">" + o + "</button>";
    }).join("") + "</span>";
}

function refreshBulkBar() {
  const bar = $("bulkBar"), msg = $("bulkMsg");
  if (!bar) return;
  const n = pending.size;
  bar.classList.toggle("show", n > 0);
  if (msg) msg.textContent = n > 0 ? n + " galleria/e con modifiche non salvate" : "";
}

// ---- monitor deploy GitHub Pages: chip nell'header + polling post-publish ----
// L'API pages/builds/latest è letta DIRETTAMENTE dal browser col token di
// sessione (CORS ok, niente credenziali nuove sul server).
let pagesRepo = null; // {owner, name} — da /api/galleries
async function pagesLatest() {
  if (!pagesRepo || !state.token) return null;
  try {
    const r = await fetch("https://api.github.com/repos/" + pagesRepo.owner + "/" + pagesRepo.name + "/pages/builds/latest", {
      headers: { Authorization: "Bearer " + state.token, Accept: "application/vnd.github+json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
function deployChipSet(txt, cls) {
  const chip = $("deployChip");
  if (!chip) return;
  chip.style.display = "inline-block";
  chip.className = "tag " + (cls || "");
  chip.textContent = txt;
}
async function deployChipRefresh() {
  if (!pagesRepo) { $("deployChip").style.display = "none"; return; }
  const b = await pagesLatest();
  if (!b) { deployChipSet("deploy: ?", ""); return; }
  if (b.status === "building") deployChipSet("⏳ deploy in corso", "run");
  else if (b.status === "errored") deployChipSet("⚠ deploy fallito", "warn");
  else deployChipSet("✓ sito online", "ok");
}
// dopo una pubblicazione: poll fino a built (max 3 min), poi ricarica la lista
async function trackDeploy() {
  if (!pagesRepo) return;
  const t0 = Date.now();
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const b = await pagesLatest();
    if (!b) continue;
    if (b.status === "building") { deployChipSet("⏳ deploy in corso", "run"); continue; }
    if (b.status === "errored") { deployChipSet("⚠ deploy fallito", "warn"); return; }
    // built: conta solo se il build è NOSTRO (successivo all'inizio del track)
    if (new Date(b.updated_at || b.created_at || 0).getTime() > t0 - 120000) {
      deployChipSet("✓ sito online", "ok");
      loadAllGalleries();
      return;
    }
    deployChipSet("⏳ in coda…", "run");
  }
}
setInterval(() => { if (state.token) deployChipRefresh(); }, 15000);

// ---- chip account Dropbox connesso (il pannello scrive sessionStorage e
// spara l'evento; il poll copre il caricamento del pannello e i casi persi) ----
function dbxAcctCached() {
  try { return JSON.parse(sessionStorage.getItem("simona:dbx:acct") || "null"); } catch { return null; }
}
function refreshDbxChip() {
  const chip = $("dbxChip");
  if (!chip) return;
  const a = dbxAcctCached();
  if (a && a.email) {
    chip.style.display = "inline-block";
    chip.className = "tag ok";
    chip.textContent = "Dropbox: " + a.email;
    chip.title = "Account Dropbox connesso — per cambiare usa «Esci / cambia account» nel pannello Dropbox di una galleria";
  } else if (a && a.id) {
    chip.style.display = "inline-block";
    chip.className = "tag";
    chip.textContent = "Dropbox collegato";
  } else {
    chip.style.display = "none";
  }
}
window.addEventListener("simona:dbx-acct", refreshDbxChip);
refreshDbxChip();
setInterval(refreshDbxChip, 5000);

// ---- tabella unica: dati + filtro + ordinamento (render separato dal fetch) ----
let galRows = [];
let galMeta = { siteBase: "", iso: false, singleFolder: new Set() };
let galSort = { key: null, dir: 1 };

function renderGalRows() {
  const q = ($("galFilter")?.value || "").trim().toLowerCase();
  let list = galRows.filter((r) => {
    if (!q) return true;
    const hay = (r.slug + " " + (r.title?.it || "") + " " + (r.title?.en || "") + " " + r.pageEff + " " + r.imagesEff + " " + r.origEff).toLowerCase();
    return hay.includes(q);
  });
  if (galSort.key === "slug") list.sort((a, b) => a.slug.localeCompare(b.slug, "it") * galSort.dir);
  else if (galSort.key === "conf") list.sort((a, b) => ((a.pageEff + a.imagesEff + a.origEff).localeCompare(b.pageEff + b.imagesEff + b.origEff, "it")) * galSort.dir);
  else if (galSort.key === "foto") list.sort((a, b) => ((a.tot ?? -1) - (b.tot ?? -1)) * galSort.dir);
  $$("#galleries thead th.sortable").forEach((th) => {
    th.classList.toggle("asc", galSort.key === th.dataset.sort && galSort.dir === 1);
    th.classList.toggle("desc", galSort.key === th.dataset.sort && galSort.dir === -1);
  });
  const siteBase = galMeta.siteBase, iso = galMeta.iso, singleFolder = galMeta.singleFolder;
  const meDbx = dbxAccountId();
  const html = list.map((r) => {
    // configurazione corrente (ciò che la riga mostra; per le pubblicate: web/nolink)
    const page = r.pageCur, images = r.imagesCur, orig = r.origCur;
    // riga in modifica nell'editor → combo disattivate (fonte di verità = form)
    const locked = r.slug === editingSlug;
    // galleria di un ALTRO account Dropbox connesso → blocco duro
    const accLock = r.acct && r.acct.id && meDbx && r.acct.id !== meDbx ? r.acct : null;
    const accTitle = accLock
      ? "galleria dell'account Dropbox " + hpEsc(accLock.email || accLock.id) + " — connettiti con quell'account per modificarla"
      : "";
    const lockAll = accLock
      ? ["bozza", "pubblicata", "proof", "web", "no", "sì"]
      : (locked ? ["bozza", "pubblicata", "proof", "web", "no", "sì"] : null);
    const lockTitle = accLock ? accTitle : "in modifica nell'editor: usa il form";
    const conf =
      segHtml(r.slug, "pagina", "page", ["bozza", "pubblicata"], page, lockAll, lockTitle) +
      segHtml(r.slug, "immagini", "images", ["proof", "web"], images,
        lockAll ?? (r.pageEff === "bozza" ? ["web"] : null),
        accLock ? accTitle : "la dimensione web richiede la pubblicazione") +
      segHtml(r.slug, "link dropbox", "originals", ["no", "sì"], orig,
        lockAll ?? ((singleFolder.has(r.slug) && r.imagesEff === "web") ? null : ["sì"]),
        accLock ? accTitle : (singleFolder.has(r.slug)
          ? "Il link agli originali richiede la dimensione web (le proof con watermark non consegnano gli originali)"
          : "Disponibile solo se le foto provengono da un\'unica cartella Dropbox — questa galleria mescola più cartelle (o la provenienza non è registrata)"));
    const link = r.stage === "published"
      ? '<a class="link" href="' + siteBase + "/g/" + r.slug + '/" target="_blank" rel="noopener">apri ↗</a>' + (iso ? ' <span class="tag warn">collaudo</span>' : "") + (r.plain ? ' <span class="tag ok" title="Galleria pubblica senza password: le foto sono nel sito in chiaro e indicizzabili. Per proteggerla apri l&#39;editor e imposta una password.">libera</span>' : "")
      : (r.stage === "proof" && r.l2 ? '<a class="link" href="' + siteBase + "/p/" + r.slug + "/?t=" + r.l2 + '" target="_blank" rel="noopener">apri ↗</a>' : '<span class="muted">—</span>');
    const copyBtn = (r.stage === "proof" && r.l2)
      ? ' <button class="ibtn" data-plink="' + r.slug + '" title="Copia link" aria-label="Copia link">⧉</button>'
      : (r.stage === "published"
        ? ' <button class="ibtn" data-glink="' + r.slug + '" title="Copia link" aria-label="Copia link">⧉</button>' : "");
    const acts = [];
    if (accLock) {
      acts.push('<button class="ibtn" disabled title="' + accTitle + '" aria-label="Galleria di un altro account Dropbox">🔒</button>');
    } else if (r.editable) acts.push(r.rebuildPw
      ? '<button class="ibtn" data-rebuild="' + r.slug + '" title="Modifica — serve la password" aria-label="Modifica">✎</button>'
      : '<button class="ibtn" data-open="' + r.slug + '" title="Modifica" aria-label="Modifica">✎</button>');
    if (r.stage === "published") {
      // 🔑 cambia password: solo per le gallerie cifrate (le plain non hanno
      // manifest.enc — aggiungere una password = pubblicazione dall'editor)
      if (!r.plain) acts.push('<button class="ibtn" data-pw="' + r.slug + '" title="Cambia password" aria-label="Cambia password">🔑</button>');
      acts.push('<button class="ibtn danger' + (accLock ? '" disabled title="' + accTitle : "") + '" data-del="' + r.slug + '" title="Rimuovi dal sito" aria-label="Rimuovi dal sito">✕</button>');
    } else acts.push('<button class="ibtn danger' + (accLock ? '" disabled title="' + accTitle : "") + '" data-drop="' + r.slug + '" title="Elimina bozza" aria-label="Elimina bozza">🗑</button>');
    const accBadge = accLock ? ' <span class="tag warn" title="' + accTitle + '">🔒 ' + hpEsc(accLock.email || "altro account") + "</span>" : "";
    return "<tr><td>" + hpEsc(r.slug) + accBadge + '<div class="muted" style="font-size:.75rem">' + hpEsc(r.title?.it || "") + (r.created ? " · " + new Date(r.created).toLocaleDateString("it-IT") : "") + "</div></td>" +
      "<td>" + conf + "</td>" +
      "<td>" + (r.tot != null ? (r.sel ?? "?") + "/" + r.tot : "—") + "</td>" +
      "<td>" + link + copyBtn + "</td>" +
      "<td>" + acts.join(" ") + "</td></tr>";
  }).join("");
  $("galrows").innerHTML = !galRows.length
    ? '<tr><td colspan="5" class="muted">nessuna galleria — creane una con «＋ Nuova galleria»</td></tr>'
    : (list.length ? html : '<tr><td colspan="5" class="muted">nessuna galleria corrisponde al filtro</td></tr>');
  if ($("galCount")) $("galCount").textContent = q ? list.length + " di " + galRows.length + " gallerie" : "";
  $$("#galrows [data-open]").forEach((b) => (b.onclick = () => openSlot(b.dataset.open)));
  $$("#galrows [data-rebuild]").forEach((b) => (b.onclick = () => rebuildForm(b.dataset.rebuild)));
  $$("#galrows [data-plink]").forEach((b) => (b.onclick = () => makeProofLink(b.dataset.plink)));
  $$("#galrows [data-glink]").forEach((b) => (b.onclick = async () => {
    const url = galMeta.siteBase + "/g/" + b.dataset.glink + "/";
    try { await navigator.clipboard.writeText(url); alert("Link copiato:\n" + url); }
    catch { alert("Link:\n" + url); }
  }));
  $$("#galrows [data-drop]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Eliminare la bozza " + b.dataset.drop + "? (resta privata, il sito non viene toccato)")) return;
    await api("/api/staging/" + b.dataset.drop, { method: "DELETE" });
    pending.delete(b.dataset.drop);
    loadAllGalleries();
  }));
  $$("#galrows [data-pw]").forEach((b) => (b.onclick = () => rewrapForm(b.dataset.pw)));
  $$("#galrows [data-del]").forEach((b) => (b.onclick = () => removeGallery(b.dataset.del)));
  // combo: click → modifica pending (render di nuovo per il diff)
  $$("#galrows [data-seg]").forEach((b) => (b.onclick = () => {
    const slug = b.dataset.seg, k = b.dataset.k, v = b.dataset.v;
    const ch = pending.get(slug) || {};
    // click sul valore già attivo (originale o pending) → annulla la modifica di quel campo
    if (ch[k] === v || (!ch[k] && b.classList.contains("on") && !b.classList.contains("mod"))) { delete ch[k]; }
    else ch[k] = v;
    if (Object.keys(ch).length) pending.set(slug, ch); else pending.delete(slug);
    loadAllGalleries();
  }));
}
// filtro e ordinamento (wiring una volta, al boot)
$("galFilter").oninput = () => renderGalRows();
$$("#galleries thead th.sortable").forEach((th) => (th.onclick = () => {
  const k = th.dataset.sort;
  if (galSort.key === k) galSort.dir *= -1;
  else galSort = { key: k, dir: 1 };
  renderGalRows();
}));

async function loadAllGalleries() {
  // primo caricamento (o dopo errore): mostra il caricamento in tabella;
  // i refresh successivi tengono i dati già visibili (no sfarfallio)
  if (!galRows.length) {
    $("galrows").innerHTML = '<tr><td colspan="5" class="muted" style="padding:1.2rem .4rem"><span class="mini-spin" aria-hidden="true"></span> Carico le gallerie…</td></tr>';
  }
  try {
    const [rs, rg, rmap] = await Promise.all([
      api("/api/staging").then((r) => r.json()),
      api("/api/galleries").then((r) => r.json()),
      api("/api/gallery-map").then((r) => r.json()).catch(() => ({ entries: [] })),
    ]);
    const siteBase = (rg.siteUrl || "").replace(/\/$/, "");
    const iso = !!rg.isolated;
    if (rg.repo) { pagesRepo = rg.repo; deployChipRefresh(); }
    const pubSlugs = rg.slugs || [];
    // «link dropbox: sì» SOLO per gallerie mono-cartella (condividerebbe una
    // sola cartella: le foto delle altre resterebbero fuori)
    const singleFolder = new Set((rmap.entries || []).filter((e) => {
      if (e.state === "retired") return false;
      if (Array.isArray(e.folders)) return e.folders.length === 1 && !!e.folders[0].dropboxPath;
      return !!e.dropboxPath; // legacy: provenienza pre-multi-cartella
    }).map((e) => e.slug));
    // le BOZZE mai pubblicate non stanno nel registry: la provenienza arriva
    // dagli slot staging (folders esposte da /api/staging) — stessa regola
    (rs.slots || []).forEach((s) => {
      if (Array.isArray(s.folders) && s.folders.length === 1 && !!s.folders[0].dropboxPath) singleFolder.add(s.slug);
    });
    const drafts = new Map((rs.slots || []).map((s) => [s.slug, s]));
    // D28: pubblicate CIFRATE senza slot — modificabili ricostruendo con la password
    const rbSet = new Set(rs.rebuildable || []);
    // account Dropbox per galleria: slot (bozze) ∨ registro gallery-map (pubblicate)
    const accBySlug = {};
    (rmap.entries || []).forEach((e) => {
      if (e.state !== "retired" && e.accountId) accBySlug[e.slug] = { id: e.accountId, email: e.accountEmail };
    });
    (rs.slots || []).forEach((s) => { if (s.account?.id) accBySlug[s.slug] = s.account; });
    const rows = [];
    const confOf = (stage, slug, lastImages, hasOrig) => {
      const ch = pending.get(slug) || {};
      const pageCur = stage === "published" ? "pubblicata" : "bozza";
      const imagesCur = lastImages ?? (stage === "published" ? "web" : "proof");
      const origCur = hasOrig ? "sì" : "no"; // stato REALE (ultimo publish web)
      return {
        pageCur, imagesCur, origCur,
        // configurazione EFFETTIVA (con modifiche pending): è quella che filtra
        pageEff: ch.page ?? pageCur, imagesEff: ch.images ?? imagesCur, origEff: ch.originals ?? origCur,
      };
    };
    for (const s of pubSlugs) {
      const d = drafts.get(s);
      rows.push({ slug: s, title: d?.title, created: d?.createdAt ?? 0, stage: "published",
        sel: d?.selectedCount, tot: d?.itemCount, l2: d?.l2Token,
        editable: !!d || rbSet.has(s), rebuildPw: !d && rbSet.has(s),
        plain: !!d?.plain, acct: accBySlug[s] || null, ...confOf("published", s, d?.lastImages, !!d?.hasOriginals) });
    }
    for (const s of (rs.slots || [])) {
      if (pubSlugs.includes(s.slug)) continue;
      rows.push({ slug: s.slug, title: s.title, created: s.createdAt, stage: s.stage,
        sel: s.selectedCount, tot: s.itemCount, l2: s.l2Token, editable: true, plain: !!s.plain, acct: accBySlug[s.slug] || null, ...confOf(s.stage, s.slug, s.lastImages, !!s.hasOriginals) });
    }
    rows.sort((a, b) => (b.created || 0) - (a.created || 0));
    galRows = rows;
    galMeta = { siteBase, iso, singleFolder };
    renderGalRows();
    refreshBulkBar();
  } catch (e) {
    $("galrows").innerHTML = '<tr><td colspan="5" class="err">' + hpEsc(e.message) + "</td></tr>";
  }
}

// applica le modifiche pending in sequenza (republish o rimozione dal sito)
async function applyBulk() {
  const btn = $("bulkSave");
  if (!pending.size) return;
  if (!confirm("Applicare le modifiche a " + pending.size + " galleria/e?\nOgni modifica ripubblica la galleria (le password restano quelle impostate nell'editor).")) return;
  btn.disabled = true;
  const errors = [];
  for (const [slug, ch] of Array.from(pending.entries())) {
    $("bulkMsg").textContent = "Aggiorno «" + slug + "»…";
    try {
      if (ch.page === "bozza") {
        await api("/api/galleries/" + slug, { method: "DELETE" }).then((r) => r.json());
        // la proof vive solo in staging: dopo l'unpublish rigenerala SUBITO se
        // la galleria è libera (hasPw=false) — così il link /p/ resta vivo.
        // Con password: possibile solo se la password è nel keyring di sessione
        // (editor sbloccato in questa sessione), altrimenti serve l'editor.
        let slot = null;
        try { slot = await (await api("/staging/" + slug + "/manifest.json")).json(); } catch { /* slot scaduto */ }
        const krPw = keyring.get(slug)?.pw || "";
        if (slot && slot.items?.length && (!slot.hasPw || krPw)) {
          $("bulkMsg").textContent = "Rigenero la bozza online di «" + slug + "»…";
          await publishSlot(slug, "proof", { pw: krPw });
        } else if (slot && slot.items?.length) {
          $("bulkMsg").textContent = "«" + slug + "» tornata privata: apri l'editor, inserisci la password una volta e premi Salva per rigenerare il link";
          await new Promise((res) => setTimeout(res, 4000));
        }
      } else {
        // pagina→pubblicata: ripubblica con le immagini scelte (default: ultime usate).
        // Con password: solo se nel keyring di sessione (editor sbloccato).
        let slot = null;
        try { slot = await (await api("/staging/" + slug + "/manifest.json")).json(); } catch { /* slot scaduto */ }
        const krPw2 = keyring.get(slug)?.pw || "";
        if (slot?.hasPw && !krPw2) {
          errors.push(slug + ": galleria con password — apri l'editor e sbloccala una volta, poi riprova");
        } else {
          const images = ch.images === "web" ? "web" : (ch.images === "proof" ? "proof" : (slot?.lastImages === "proof" ? "proof" : "web"));
          // originals ESPPLICITO dal bulk: senza, publishSlot leggerebbe la
          // checkbox dell'editor (chiuso → false) e il "sì" verrebbe scartato
          await publishSlot(slug, images, { publish: true, pw: krPw2, originals: ch.originals === "sì" });
          trackDeploy(); // publish: chip deploy + refresh a build finita
        }
      }
    } catch (e) { errors.push(slug + ": " + e.message); }
    pending.delete(slug);
  }
  btn.disabled = false;
  $("bulkMsg").textContent = errors.length ? "Errori: " + errors.join(" · ") : "Fatto ✓";
  if (errors.length) setTimeout(() => refreshBulkBar(), 6000);
  await loadAllGalleries();
  if (!errors.length) refreshBulkBar();
}

// ---- EDITOR UNIFICATO: stessa UI per nuova galleria e modifica ----
// slug = null → nuova galleria (metadati sopra, Dropbox sotto); slug → modifica
async function openSlot(slug, opts = {}) {
  try {
    const isNew = !slug;
    editingSlug = slug || null;
    pending.delete(editingSlug || ""); // niente modifiche pending in tabella per la riga in editing
    let m = { items: [], title: { it: "", en: "" } };
    let st = { stage: "new" };
    if (!isNew) {
      // slot mancante: la rotta rigenera le PLAIN da sola (D28); una CIFRATA
      // senza slot risponde 409 needs-password → form della password
      const mr = await fetch("/staging/" + slug + "/manifest.json", { headers: { Authorization: "Bearer " + state.token } });
      if (mr.status === 409) {
        const ej = await mr.json().catch(() => ({}));
        if (ej.error === "needs-password") return rebuildForm(slug);
      }
      if (!mr.ok) throw new Error("Galleria non raggiungibile (" + mr.status + ")");
      m = await mr.json();
      st = await (await api("/api/staging/" + slug + "/state")).json();
      // blocco per-account: galleria di un altro Dropbox connesso → non modificabile
      const meDbx = dbxAccountId();
      if (m.account?.id && meDbx && m.account.id !== meDbx) {
        const who = hpEsc(m.account.email || m.account.id);
        editingSlug = null;
        setRoute("#/galleria/" + slug); // dopo il cambio account il redirect OAuth riapre QUI
        $("slotDetail").innerHTML =
          '<h2 style="margin:0 0 .6rem">Galleria «' + hpEsc(slug) + '» 🔒</h2>' +
          '<p class="muted" style="margin:.2rem 0">Questa galleria contiene foto dell\'account Dropbox <strong>' + who + "</strong> e non è modificabile dall'account attualmente connesso.</p>" +
          '<p class="muted" style="margin:.2rem 0 .8rem">Qui sotto trovi l\'account connesso: usa <strong>«Esci / cambia account»</strong> e collega <strong>' + who + "</strong> — la galleria si riapre da sola dopo il collegamento.</p>" +
          '<button class="ghost" id="slotCloseLock" style="margin-bottom:1rem">✕ Chiudi</button>' +
          '<h3 class="sec-h">Dropbox</h3>' +
          '<div id="dbxStatusIn" class="muted"></div>' +
          '<div id="dbxBodyIn"></div>';
        $("slotCloseLock").onclick = () => { $("slotDetail").innerHTML = ""; window.__slotDirty = null; setRoute("#/gallerie"); loadAllGalleries(); };
        // il pannello qui sotto è funzionante: identità + Esci/cambia account
        if (window.__admin?.mountPicker) window.__admin.mountPicker(slug);
        return;
      }
    }
    const stTag = st.stage === "published" ? ' <span class="tag ok">pubblicata</span>'
      : st.stage === "proof" ? ' <span class="tag run">bozza online</span>'
      : st.stage === "new" ? "" : ' <span class="tag">in lavorazione</span>';
    let html = '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:1rem">' +
      '<h2 style="margin:0">' + (isNew ? "Nuova galleria" : "Galleria «" + slug + "»" + stTag) + "</h2>" +
      '<button class="ghost" id="slotClose" style="flex:0">✕ Chiudi</button></div>';

    // --- 1. dettagli: campi allineati (label + input + riga d'aiuto uniformi) ---
    html += '<div class="frow">' +
      '<div><label>Slug (indirizzo)</label><input id="eslug" value="' + (isNew ? "" : slug) + '" placeholder="rossi-matrimonio"><div class="hint-line link" id="slugPreview"></div></div>' +
      '<div><label>Titolo IT</label><input id="etit" value="' + (m.title?.it || "") + '" placeholder="Matrimonio Rossi"><div class="hint-line"></div></div>' +
      '<div><label>Titolo EN</label><input id="etien" value="' + (m.title?.en || "") + '" placeholder="Rossi Wedding"><div class="hint-line"></div></div>' +
    '</div>';
    html += '<div class="frow">' +
      '<div><label>Password (opzionale — per i clienti)</label><input id="epw" type="password" placeholder="lascia vuota per una galleria libera" autocomplete="off">' +
      '<div class="hint-line" id="epwStatus">Senza password si apre liberamente: la protegge solo il link segreto.</div></div>' +
      '<div style="flex:0;align-self:end"><button class="ghost" id="epwUnlock" hidden style="min-width:0">Sblocca</button></div>' +
    '</div>';
    // checkbox originali: riga a sé stante sotto la password, con alert se senza password
    html += '<div style="margin-bottom:1rem"><label style="display:flex;gap:.5rem;align-items:center;cursor:pointer;margin:0">' +
      '<input type="checkbox" id="eidrop" style="width:auto"> <span style="font-size:.85rem">Includi link agli originali (Dropbox)</span></label>' +
      '<p class="pw-meter" id="eidropNote" style="font-size:.75rem;margin:.25rem 0 0" hidden></p></div>';

    // --- 1b. configurazione (solo modifica): le stesse combo della tabella, qui attive ---
    const cfg = {
      page: st.stage === "published" ? "pubblicata" : "bozza",
      images: m.lastImages ?? (st.stage === "published" ? "web" : "proof"),
    };
    if (!isNew) {
      const fseg = (k, label, opts2, hint) =>
        '<div><label style="margin:0">' + label + '</label><div class="seg" style="margin-top:.3rem">' +
        opts2.map((o) => '<button data-fk="' + k + '" data-v="' + o + '" class="' + (cfg[k] === o ? "on" : "") + '">' + o + "</button>").join("") +
        '</div><div class="hint-line">' + hint + "</div></div>";
      html += '<div class="frow" style="margin-bottom:1rem">' +
        fseg("page", "Pubblicazione", ["bozza", "pubblicata"], "bozza = link privato con watermark · pubblicata = nel sito") +
        fseg("images", "Immagini", ["proof", "web"], "proof = con watermark, 600px · web = definitive, 1600px") +
      "</div>";
    }
    html += '<p class="okmsg" id="esaveOk" hidden></p>';

    // --- 2. foto della galleria (se esistono) e SUBITO sotto il picker Dropbox:
    //     scelte e disponibili vicini, stessa gerarchia visiva ---
    if (!isNew && m.items.length) {
      html += '<div id="slotgrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;margin:.4rem 0 .4rem">';
      for (const it of m.items) {
        const isCov = m.cover === it.name;
        html += '<div class="cell' + (it.selected ? " sel" : " excl") + '" draggable="true" data-name="' + it.name + '" data-cover="' + (isCov ? 1 : 0) + '" data-caption="' + (it.caption || "") + '" title="' + (it.caption || it.name) + (it.desc ? " — " + it.desc : "") + '"><img alt="' + (it.caption || it.name) + '" data-thumb="' + it.thumb + '"><span class="cellmeta" title="nome e descrizione">✎</span>' + (isCov ? '<span class="covermark">★ anteprima</span>' : "") + "</div>";
      }
      html += '</div><p class="muted" style="margin:.2rem 0 .6rem">click su una foto = includila/escludi · trascina per cambiarne l\'ordine · ✎ = nome/descrizione · ★ = foto di copertina</p>';
    }
    html += '<h3 class="sec-h">' + (isNew ? "Scegli le foto — Dropbox" : "Aggiungi foto — Dropbox") + '</h3>' +
      '<div id="dbxStatusIn" class="muted"></div>' +
      '<div id="dbxBodyIn"></div>';

    // --- 3. link bozza (se online) ---
    if (st.stage === "proof" && m.l2Token) {
      const g = await (await api("/api/galleries")).json();
      const base = (g.siteUrl || "").replace(/\/$/, "");
      html += '<div class="link" style="margin:.4rem 0 .8rem"><a class="link" href="' + base + "/p/" + slug + "/?t=" + m.l2Token + '" target="_blank" rel="noopener">' + base + "/p/" + slug + "/?t=" + m.l2Token + "</a></div>";
    }

    // --- 4. azioni (solo modifica) ---
    if (!isNew) {
      html += '<div class="row" style="margin-bottom:1rem">' +
        '<div style="flex:0"><button id="slotSave">Salva</button></div>' +
        '<div style="flex:0"><button class="ghost" id="slotFull">Pubblica</button></div>' +
        (st.stage === "proof" ? '<div style="flex:0"><button class="ghost" id="slotLink">Copia link</button></div>' : "") +
      '</div>' +
      '<p class="muted" style="font-size:.78rem;margin-top:-.4rem">Salva = impostazioni + foto nuove + configurazione, bozza online aggiornata. Pubblica = galleria definitiva nel sito (commit su git).</p>';
    } else {
      html += '<p class="muted">Scegli le foto dal Dropbox qui sotto, poi premi <strong>«Crea bozza dalla selezione»</strong>: la galleria nasce come bozza privata.</p>';
    }

    $("slotDetail").innerHTML = html;
    // checkbox originali: stato REALE dell'ultimo publish web (baseline corretta)
    if (m.hasOriginals) { const d0 = $("eidrop"); if (d0) d0.checked = true; }
    if (!opts.silent) document.getElementById("slotDetail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    wireSlugField(isNew ? null : slug, isNew);
    loadKnownSlugs(isNew ? null : slug);
    setRoute(isNew ? "#/nuova" : "#/galleria/" + slug);
    // combo configurazione del form (vincolo: web richiede pagina pubblicata)
    const refreshCfgSegs = () => {
      $$("#slotDetail [data-fk='images'] button").forEach((b) => {
        const dis = b.dataset.v === "web" && cfg.page !== "pubblicata";
        b.disabled = dis;
        b.title = dis ? "la dimensione web richiede la pubblicazione" : "";
      });
      // checkbox originali: attivo SOLO con pagina pubblicata + dimensione web
      // (una proof con watermark non consegna gli originali — D15/skill)
      const drop = $("eidrop"), dn = $("eidropNote");
      const dropOk = cfg.page === "pubblicata" && cfg.images === "web";
      if (drop) {
        drop.disabled = !dropOk;
        drop.title = dropOk ? "" : "richiede pagina pubblicata con dimensione web";
        if (!dropOk) drop.checked = false;
      }
      if (dn) {
        if (!dropOk) {
          dn.hidden = false;
          dn.style.color = "var(--muted)";
          dn.textContent = "Il link agli originali è disponibile solo con pagina pubblicata e dimensione web (le proof con watermark non consegnano gli originali).";
        } else if (!drop?.checked) {
          dn.hidden = true; // la nota password si rivaluta al change/input
        }
      }
    };
    $$("#slotDetail [data-fk]").forEach((b) => (b.onclick = () => {
      cfg[b.dataset.fk] = b.dataset.v;
      // bozza + web → ricade su proof (il vincolo non si può violare)
      if (cfg.page !== "pubblicata" && cfg.images === "web") cfg.images = "proof";
      $$("#slotDetail [data-fk='" + b.dataset.fk + "']").forEach((x) => x.classList.toggle("on", x.dataset.v === cfg[b.dataset.fk]));
      $$("#slotDetail [data-fk='images']").forEach((x) => x.classList.toggle("on", x.dataset.v === cfg.images));
      refreshCfgSegs();
    }));
    refreshCfgSegs();
    // password — tri-stato: protetta con DEK in memoria / protetta da sbloccare / libera
    const refreshPwStatus = () => {
      const hint = $("epwStatus"), btn = $("epwUnlock");
      if (!hint) return;
      if (!isNew && m.hasPw && keyring.has(slug)) {
        hint.textContent = "Password attiva ✓ (in memoria per questa sessione) — lascia il campo vuoto per mantenerla, scrivine una nuova per cambiarla.";
        hint.style.color = "var(--ok)";
        if (btn) btn.hidden = true;
      } else if (!isNew && m.hasPw) {
        hint.textContent = "Galleria protetta: inserisci la password una volta (resta in memoria per questa sessione) — serve per salvare.";
        hint.style.color = "var(--terra)";
        if (btn) btn.hidden = false;
      } else if (!isNew && st.plain && st.stage === "published") {
        hint.textContent = "Galleria pubblica senza password: le foto sono nel sito in chiaro e indicizzabili. Scrivi una password e salva per proteggerla (le foto tornano cifrate).";
        hint.style.color = "";
        if (btn) btn.hidden = true;
      } else {
        hint.textContent = "Senza password si apre liberamente: la protegge solo il link segreto.";
        hint.style.color = "";
        if (btn) btn.hidden = true;
      }
    };
    refreshPwStatus();
    const ub = $("epwUnlock");
    if (ub) ub.onclick = async () => {
      const pwEl = $("epw");
      const pw = pwEl?.value || "";
      if (!pw) { pwEl?.focus(); return; }
      ub.disabled = true; ub.textContent = "Verifico…";
      try {
        await unlockSlotKey(slug, pw, st.stage === "proof" ? "proof" : "published", m.l2Token);
        if (pwEl) pwEl.value = ""; // memorizzata: il campo torna libero
        refreshPwStatus();
      } catch (e) {
        alert(e.message);
      } finally { ub.disabled = false; ub.textContent = "Sblocca"; }
    };
    // dirty tracking: baseline + confronto live (campi + configurazione + selezione + ordine + foto nuove nel picker)
    const snap = () => JSON.stringify({
      slug: $("eslug")?.value || "", it: $("etit")?.value || "", en: $("etien")?.value || "",
      pw: $("epw")?.value || "", drop: !!($("eidrop")?.checked), cfg: { ...cfg },
      pick: window.__admin?.pickerSelCount ? window.__admin.pickerSelCount() : 0,
      items: $$("#slotgrid .cell").map((c) => c.dataset.name + (c.classList.contains("sel") ? "+" : "-")).join(","),
    });
    slotBaseline = snap();
    window.__slotDirty = () => snap() !== slotBaseline;
    // alert live sotto il checkbox originali: spuntato senza password → avviso
    {
      const drop = $("eidrop"), dropNote = $("eidropNote"), pwEl = $("epw");
      const refreshDropNote = () => {
        if (drop?.checked && !(pwEl?.value || "").trim()) {
          dropNote.hidden = false;
          dropNote.style.color = "var(--terra)";
          dropNote.textContent = "⚠ La galleria non ha password: il link Dropbox agli originali sarà pubblico (su piano free la password sul link non è disponibile).";
        } else dropNote.hidden = true;
      };
      drop?.addEventListener("change", refreshDropNote);
      pwEl?.addEventListener("input", refreshDropNote);
    }

    if (!isNew && m.items.length) {
      $$("#slotgrid img").forEach(async (img) => {
        const r = await api("/staging/" + slug + "/" + img.dataset.thumb);
        img.src = URL.createObjectURL(await r.blob());
      });
      const wireSel = () => {
        // ✎ = nome visibile / descrizione (salvataggio immediato, come la selezione)
        const openMeta = (cell) => {
          let pop = $("itemMetaPop");
          if (pop) pop.remove();
          const name = cell.dataset.name;
          pop = document.createElement("div");
          pop.id = "itemMetaPop";
          pop.style.cssText = "position:fixed;inset:0;background:rgba(10,10,10,.5);z-index:60;display:flex;align-items:center;justify-content:center;padding:1rem";
          pop.innerHTML = '<div style="background:var(--panel);border:1px solid var(--border);padding:1.2rem;max-width:420px;width:100%">' +
            '<h3 style="margin:0 0 .8rem;font-size:1rem">Nome e descrizione</h3>' +
            '<p class="muted" style="margin:0 0 .8rem;font-size:.78rem">File: ' + hpEsc(name) + '</p>' +
            '<label style="font-size:.78rem">Nome visibile</label><input id="impCap" style="width:100%" value="' + hpEsc(cell.dataset.caption || "") + '" placeholder="come lo vedrà il cliente">' +
            '<label style="font-size:.78rem;margin-top:.6rem;display:block">Descrizione</label><textarea id="impDesc" rows="3" style="width:100%" placeholder="testo mostrato sotto la foto nel viewer"></textarea>' +
            '<button id="impCover" class="ghost" style="margin-top:.9rem;width:100%">' + (cell.dataset.cover === "1" ? "★ Questa è già l'anteprima della galleria — togli" : "☆ Imposta come anteprima della galleria") + "</button>" +
            '<p class="muted" style="font-size:.72rem;margin:.4rem 0 0">L\'anteprima è la foto che rappresenta la galleria nella home del sito.</p>' +
            '<div class="row" style="margin-top:.9rem"><button id="impSave">Salva</button><button class="ghost" id="impCancel">Annulla</button></div></div>';
          document.body.appendChild(pop);
          const close = () => pop.remove();
          pop.onclick = (ev) => { if (ev.target === pop) close(); };
          $("impCancel").onclick = close;
          $("impCover").onclick = async () => {
            const togli = cell.dataset.cover === "1";
            try {
              await api("/api/staging/" + slug, { method: "PATCH", body: JSON.stringify({ cover: togli ? null : name }) });
              $$("#slotgrid .cell").forEach((c2) => {
                const on = !togli && c2.dataset.name === name;
                c2.dataset.cover = on ? "1" : "0";
                let mk = c2.querySelector(".covermark");
                if (on && !mk) { mk = document.createElement("span"); mk.className = "covermark"; mk.textContent = "★ anteprima"; c2.appendChild(mk); }
                else if (!on && mk) mk.remove();
              });
              close();
            } catch (e) { alert("Salvataggio fallito: " + e.message); }
          };
          $("impSave").onclick = async () => {
            try {
              await api("/staging/" + slug + "/itemMeta", { method: "PATCH", body: JSON.stringify({ name, caption: $("impCap").value, desc: $("impDesc").value }) });
              cell.dataset.caption = $("impCap").value.trim();
              cell.title = ($("impCap").value.trim() || name) + ($("impDesc").value.trim() ? " — " + $("impDesc").value.trim() : "");
              close();
            } catch (e) { alert("Salvataggio fallito: " + e.message); }
          };
          $("impCap").focus();
        };
        $$("#slotgrid .cell").forEach((c) => {
          const meta = c.querySelector(".cellmeta");
          if (meta) meta.onclick = (ev) => { ev.stopPropagation(); openMeta(c); };
        });
        $$("#slotgrid .cell").forEach((c) => (c.onclick = async () => {
          c.classList.toggle("sel");
          c.classList.toggle("excl", !c.classList.contains("sel"));
          const sel = $$("#slotgrid .cell.sel").map((x) => x.dataset.name);
          await api("/staging/" + slug + "/selection", { method: "PATCH", body: JSON.stringify({ selected: sel }) });
        }));
        let dragCell = null;
        $$("#slotgrid .cell").forEach((c) => {
          c.addEventListener("dragstart", () => { dragCell = c; c.classList.add("dragging"); });
          c.addEventListener("dragend", () => { c.classList.remove("dragging"); dragCell = null; });
          c.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (!dragCell || dragCell === c) return;
            const rect = c.getBoundingClientRect();
            const after = e.clientX - rect.left > rect.width / 2;
            c.parentNode.insertBefore(dragCell, after ? c.nextSibling : c);
          });
          c.addEventListener("drop", async (e) => {
            e.preventDefault();
            if (!dragCell) return;
            const names = $$("#slotgrid .cell").map((x) => x.dataset.name);
            try { await api("/staging/" + slug + "/order", { method: "PATCH", body: JSON.stringify({ names }) }); }
            catch (err) { alert("Riordino non salvato: " + err.message); }
          });
        });
      };
      wireSel();
      // SALVA (unico): foto nuove dal picker + impostazioni + configurazione
      $("slotSave").onclick = async () => {
        const btn = $("slotSave");
        btn.disabled = true; btn.textContent = "Salvo…";
        const ok = $("esaveOk");
        const hadNewPhotos = (window.__admin?.pickerSelCount?.() || 0) > 0;
        try {
          if (hadNewPhotos) {
            ok.hidden = false; ok.textContent = "Aggiungo le foto nuove…";
            await window.__admin.applyPickerSelection();
          }
          const newSlug = $("eslug").value.trim();
          const body = { slug: newSlug, title: { it: $("etit").value.trim(), en: $("etien").value.trim() } };
          const r = await api("/api/staging/" + slug, { method: "PATCH", body: JSON.stringify(body) });
          const j = await r.json();
          if (j.slug !== slug) { slug = j.slug; editingSlug = slug; loadAllGalleries(); }
          const publish = cfg.page === "pubblicata";
          let images = cfg.images === "web" ? "web" : "proof";
          if (!publish && images === "web") images = "proof"; // web richiede pubblicazione
          // --- salvataggio rapido: se è cambiato SOLO ciò che vive nel
          // manifest cifrato (titoli, didascalie, ordine, esclusioni, PASSWORD)
          // il browser riscrive manifest (+ pagine toccate) senza job e senza
          // ricifrare le foto. La copertina di una pubblicata si rigenera a
          // parte dalla cache. gallerie senza password: sempre disponibile. ---
          let fast = false;
          const pwField = $("epw") ? $("epw").value : "";
          const m3 = await (await api("/staging/" + slug + "/manifest.json")).json();
          let newPw = null;
          if (pwField) {
            if (pwField.length < 12) throw new Error("Password troppo corta (min 12 caratteri) — o svuota il campo per non cambiarla");
            if (!keyring.has(slug) && m3.hasPw) {
              throw new Error("Per cambiare la password premi prima «Sblocca» con quella attuale (qui sotto il campo), poi salva di nuovo");
            }
            newPw = pwField;
          }
          const curImages = m3.lastImages ?? (st.stage === "published" ? "web" : "proof");
          const online = st.stage === "proof" || st.stage === "published";
          const fastPossible =
            online && !hadNewPhotos && newSlug === slug &&
            (!m3.coverDirty || st.stage === "published") && // pubblicata: copertina rigenerata a parte
            (keyring.has(slug) || !m3.hasPw) && (st.stage === "published" || !!m3.l2Token) &&
            images === curImages && publish === (st.stage === "published") &&
            (!!($("eidrop")?.checked) === !!m3.hasOriginals) &&
            (!st.plain || !newPw); // plain + NUOVA password = job completo (torna cifrata)
          if (fastPossible) {
            ok.hidden = false; ok.textContent = newPw ? "Aggiorno (rapido) e cambio la password…" : "Aggiornamento rapido…";
            try { fast = await fastManifestSave(slug, st.stage, m3.l2Token, body.title.it, body.title.en, newPw, !!st.plain); }
            catch (e) {
              console.warn("salvataggio rapido non riuscito, ripiego sul job:", e);
              ok.textContent = "Aggiorno con il percorso completo (rapido saltato: " + String(e.message || e).slice(0, 140) + ")…";
              fast = false;
            }
          }
          if (fast) {
            cfg.images = images;
            if (publish) cfg.page = "pubblicata";
            ok.hidden = false;
            let coverNote = "";
            if (m3.coverDirty && st.stage === "published") {
              // copertina lampo: rigenera SOLO cover.webp dalla cache
              try { await api("/api/staging/" + slug + "/cover/refresh", { method: "POST" }); }
              catch (e) { coverNote = " — copertina non aggiornata: " + e.message.slice(0, 120); }
            }
            ok.textContent = publish
              ? "Salvato ✓ (aggiornamento rapido — foto non ricifrate)" + coverNote
              : "Salvato ✓ — bozza online aggiornata (rapida, foto non ricifrate)" + (newPw ? " · password aggiornata ✓" : "") + coverNote;
            slotBaseline = snap();
            await openSlot(slug, { silent: true });
            loadAllGalleries();
          } else {
            ok.hidden = false;
            ok.textContent = publish ? "Pubblico la galleria…" : "Aggiorno la bozza online…";
            await publishSlot(slug, images, { publish });
            cfg.images = images;
            if (publish) { cfg.page = "pubblicata"; }
            ok.textContent = publish ? "Salvato ✓ — galleria pubblicata" : "Salvato ✓ — bozza online aggiornata";
            slotBaseline = snap(); // salvato: azzera il dirty
            if (publish) trackDeploy(); // chip deploy + refresh lista a build finita
            await openSlot(slug, { silent: true }); // refresh griglia/config/picker senza salti
            loadAllGalleries();
          }
        } catch (e) {
          ok.hidden = false;
          ok.textContent = "Salvataggio fallito: " + e.message;
        } finally { btn.disabled = false; btn.textContent = "Salva"; }
      };
      // PUBBLICA: galleria definitiva, commit+push su git (dual-write D19)
      $("slotFull").onclick = async () => {
        if (!confirm("Pubblicare ora nel sito?\nViene creata la galleria definitiva (commit su git) all'indirizzo /" + slug + "/.")) return;
        try {
          if (window.__admin?.pickerSelCount?.() > 0) await window.__admin.applyPickerSelection();
          await publishSlot(slug, cfg.images === "web" ? "web" : "proof", { publish: true });
          cfg.page = "pubblicata";
          trackDeploy(); // chip deploy + refresh lista a build finita
          await openSlot(slug, { silent: true });
          loadAllGalleries();
        } catch (e) { alert(e.message); }
      };
      const lb = $("slotLink");
      if (lb) lb.onclick = () => makeProofLink(slug);
    }

    // chiudi il form (nuova o modifica) → conferma se modifiche, poi sola lista
    const closeBtn = $("slotClose");
    if (closeBtn) closeBtn.onclick = () => {
      if (window.__slotDirty && window.__slotDirty() && !confirm("Ci sono modifiche non salvate. Chiudere comunque?")) return;
      window.__slotDirty = null;
      editingSlug = null;
      $("slotDetail").innerHTML = "";
      setRoute("#/gallerie");
      loadAllGalleries();
    };

    // monta il picker Dropbox nella sezione dedicata (stesso componente per crea/modifica)
    if (window.__admin?.mountPicker) window.__admin.mountPicker(isNew ? null : slug);
    else $("dbxBodyIn").innerHTML = '<p class="err">pannello Dropbox non caricato — ricarica la pagina</p>';
  } catch (e) {
    $("slotDetail").innerHTML = '<p class="err">' + hpEsc(e.message) + "</p>";
  }
}

// publishSlot: dimensioni immagini ("proof"|"web") e pubblicazione (git)
// DISACCOPPIATE — proof è permessa per bozza E pubblicata; web richiede
// pubblicazione (il chiamante lo garantisce).
async function publishSlot(slug, images, opts = {}) {
  const publish = !!opts.publish;
  const m = await (await api("/staging/" + slug + "/manifest.json")).json();
  // password: campo editor (cambio) > keyring di sessione (mantieni) > "" (nopw).
  // opts.pw esplicita quando NON c'è editor dietro (bulk): l'epw nel form
  // potrebbe appartenere a un'ALTRA galleria o contenere una password di prova
  const pwField = opts.pw !== undefined ? opts.pw : (($("epw") && $("epw").value) ? $("epw").value : "");
  const pw = pwField !== "" ? pwField : (keyring.get(slug)?.pw ?? "");
  if (pw && pw.length < 12) {
    throw new Error("Password troppo corta (min 12 caratteri) — o svuota il campo per una galleria libera");
  }
  // MAI downgrade silenzioso a galleria libera: protetta senza password
  // disponibile (campo vuoto e keyring vuoto) → chiedila, non ripubblicare nopw
  if (!pw && m.hasPw) {
    throw new Error("Questa galleria è protetta da password: scrivila nel campo Password dell'editor (una volta per sessione) e riprova");
  }
  // pubblicazione PLAIN (piano nopw): pubblica senza password → derivati in
  // chiaro + viewer senza crypto (SEO). Con password resta cifrata.
  const plain = publish && !pw;
  const items = m.items.filter((i) => i.selected).map((i) => ({ name: i.name, dropboxId: i.dropboxId, rev: i.rev }));
  if (!items.length) { throw new Error("Nessuna foto selezionata: clicca le foto per includerle"); }
  // link originali Dropbox: esplicito (bulk) oppure checkbox dell'editor;
  // ha senso solo per il web pubblicato (la proof è protetta dal watermark)
  let originalsUrl;
  const wantOriginals = opts.originals !== undefined ? opts.originals : !!($("eidrop")?.checked);
  if (publish && images === "web" && wantOriginals && window.__admin?.ensureOriginalsLink) {
    try { originalsUrl = await window.__admin.ensureOriginalsLink(slug, pw); }
    catch (e) { if (!confirm("Link originali Dropbox non creato: " + e.message + "\n\nContinuo senza link originali?")) return; }
  }
  const payload = {
    slug,
    title: m.title,
    cover: m.cover,
    source: { kind: "tempLinks", items },
    mode: {
      kind: "client-gallery",
      pageSize: Number($("ps")?.value) || 24,
      fullMax: images === "proof" ? 600 : (Number($("fm")?.value) || 1600),
      proof: images === "proof" ? { watermark: true } : undefined,
      publish: publish || undefined,
      plain: plain || undefined,
      dropboxOriginalsUrl: originalsUrl,
    },
  };
  const r = await (await api("/api/jobs", { method: "POST", body: JSON.stringify(payload) })).json();
  // il wizard della password serve SOLO al percorso cifrato (plain: nessuna fase 2)
  if (!plain) sessionStorage.setItem("simona:pw:" + r.jobId, pw || "__NOPW__");
  location.hash = "#job-" + r.jobId;
  loadJobsOnce();
  // attende la fine del job (il wizard auto-invia il manifest quando serve)
  await new Promise((resolve) => {
    const started = Date.now();
    const t = setInterval(async () => {
      try {
        const j = await (await api("/api/jobs/" + r.jobId)).json();
        if (j.state === "done" || j.state === "failed") { clearInterval(t); resolve(j); }
        else if (Date.now() - started > 120000) { clearInterval(t); resolve({ state: "timeout" }); }
      } catch { /* retry silenzioso */ }
    }, 1000);
  }).then((j) => {
    if (j.state === "failed") throw new Error(j.error || "job fallito");
    loadAllGalleries();
    return j;
  });
}

async function makeL2(slug) {
  try {
    const r = await (await api("/api/staging/" + slug + "/l2", { method: "POST" })).json();
    await navigator.clipboard.writeText(location.origin + r.url).catch(() => {});
    alert("Link L2 copiato:\n" + location.origin + r.url);
  } catch (e) { alert("L2: " + e.message); }
}

async function makeProofLink(slug) {
  try {
    // assicura il token di accesso (automatico), poi componi il link del sito
    let m = await (await api("/staging/" + slug + "/manifest.json")).json();
    if (!m.l2Token) {
      await api("/api/staging/" + slug + "/l2", { method: "POST" });
      m = await (await api("/staging/" + slug + "/manifest.json")).json();
    }
    const r = await (await api("/api/galleries")).json();
    const base = (r.siteUrl || "").replace(/\/$/, "");
    const url = base + "/p/" + slug + "/?t=" + m.l2Token;
    await navigator.clipboard.writeText(url).catch(() => {});
    alert("Link della bozza copiato:\n" + url + "\n\nChi lo apre vede le foto con watermark. Il link resta valido anche se aggiorni la bozza.");
  } catch (e) { alert("Impossibile creare il link: " + e.message); }
}

// ---- gallerie pubblicate: la tabella unica è loadAllGalleries; alias per i punti storici ----
const loadGalleries = loadAllGalleries;

async function rewrapForm(slug) {
  $("galForms").innerHTML =
    '<h2>Cambia password — ' + hpEsc(slug) + "</h2>" +
    '<p class="muted">Serve la password ATTUALE (de-wrappa il DEK nel browser) e la nuova (vuota = rimuove la protezione, resta il link segreto). Il server vede solo blob opachi.</p>' +
    '<div class="row"><div><label>Password attuale</label><input type="password" id="oldpw"></div>' +
    '<div><label>Nuova password (vuota = rimuovi)</label><input type="password" id="newpw"></div>' +
    '<div style="flex:0"><button id="rewrapGo">Ri-wrappa</button></div></div><p class="okmsg" id="rwok" hidden></p>';
  $("rewrapGo").onclick = async () => {
    // scarica manifest.enc corrente, de-wrappa con vecchia pw, ri-wrappa
    const base = "/raw/content/g/" + slug + "/manifest.enc";
    const r = await fetch(base, { headers: { Authorization: "Bearer " + state.token } });
    if (!r.ok) { alert("manifest non raggiungibile: " + r.status); return; }
    const hdr = JSON.parse(td.decode(await r.arrayBuffer()));
    const kekOld = await deriveKek($("oldpw").value, b64d(hdr.kdf.salt), hdr.kdf.iterations);
    let dek;
    try { dek = await aesDec(kekOld, b64d(hdr.wraps.password)); }
    catch { alert("password attuale errata"); return; }
    const newPw = $("newpw").value;
    if (!newPw && !confirm("Rimuovere la password? La galleria resterà protetta solo dal link segreto.")) return;
    // come nel wizard: senza password il KDF è simbolico e l'header dice nopw
    const iterations = newPw ? 600000 : 1000;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kekNew = await deriveKek(newPw, salt, iterations);
    const wrapped = await aesEnc(kekNew, dek);
    const header = { ...hdr, kdf: { ...hdr.kdf, iterations, salt: b64e(salt) }, wraps: { ...hdr.wraps, password: b64e(wrapped) } };
    if (newPw) delete header.nopw; else header.nopw = 1;
    const blob = te.encode(JSON.stringify(header));
    const put = await fetch("/api/galleries/" + slug + "/manifest", {
      method: "PUT",
      headers: { Authorization: "Bearer " + state.token, "Content-Type": "application/octet-stream" },
      body: blob,
    });
    if (put.ok) {
      // il keyring segue il nuovo stato (stesso DEK, password nuova/assente)
      keyring.set(slug, { dek, pw: newPw });
      $("rwok").hidden = false;
      $("rwok").textContent = newPw ? "Fatto ✓ (KB, zero ricifratura)" : "Password rimossa ✓ (KB, zero ricifratura)";
      loadAllGalleries();
    }
    else alert("ri-wrap fallito: " + await put.text());
  };
}

// ---- D28: rigenerazione dati di lavoro di una pubblicata con password ----
// Lo slot staging manca (pulizia/macchina cambiata): il server non può leggere
// una galleria cifrata (D15) ma il browser sì, con la password. Qui si de-wrappa
// il DEK, si decifrano elenco+thumb+foto e si rispediscono: il server semina la
// cache e ricrea lo slot. Il sito non viene toccato.
function rebuildForm(slug) {
  editingSlug = null; // nessun editor aperto: questo form È la vista
  pending.delete(slug);
  setRoute("#/galleria/" + slug); // il redirect Dropbox/GitHub riapre qui
  $("slotDetail").innerHTML =
    '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:1rem">' +
    '<h2 style="margin:0">Galleria «' + hpEsc(slug) + '»</h2>' +
    '<button class="ghost" id="rbClose" style="flex:0">✕ Chiudi</button></div>' +
    '<p class="muted" style="margin:.4rem 0 .8rem">Questa galleria è pubblicata con password e il server non ha più i suoi dati di lavoro. Con la password si ricostruiscono adesso: il sito resta esattamente com\'è, la galleria torna modificabile.</p>' +
    '<div class="row"><div><label>Password della galleria</label><input type="password" id="rbPw" autocomplete="off" style="width:100%"></div>' +
    '<div style="flex:0;align-self:end"><button id="rbGo">Rigenera</button></div></div>' +
    '<p class="muted" id="rbStatus" style="margin:.6rem 0 0"></p>';
  $("rbClose").onclick = () => { $("slotDetail").innerHTML = ""; window.__slotDirty = null; setRoute("#/gallerie"); loadAllGalleries(); };
  $("rbGo").onclick = () => runRebuild(slug, $("rbPw").value);
  $("rbPw").onkeydown = (e) => { if (e.key === "Enter") runRebuild(slug, $("rbPw").value); };
  $("rbPw").focus();
}

async function runRebuild(slug, pw) {
  const st2 = $("rbStatus");
  const go = $("rbGo");
  if (!pw) { st2.textContent = "Inserisci la password della galleria."; return; }
  go.disabled = true;
  st2.textContent = "Sblocco la galleria…";
  try {
    // 1. de-wrap del DEK con la password (finisce anche nel keyring di sessione)
    const { hdr, dek } = await unlockSlotKey(slug, pw, "published");
    st2.textContent = "Leggo l'elenco delle foto…";
    const payload = JSON.parse(td.decode(await aesDecRaw(dek, b64d(hdr.payload))));
    const ordered = [];
    for (const p of payload.pages || []) for (const n of p.items || []) ordered.push(n);
    if (!ordered.length) throw new Error("nell'elenco della galleria non c'è nessuna foto");
    // 2. thumb: scarica le pagine, decifrale, separa i frame [lunghezza][bytes]
    const thumbs = new Map();
    for (const p of payload.pages || []) {
      const dec = await aesDecRaw(dek, await fetchContainer(slug, "published", null, p.file));
      let off = 0;
      for (const n of p.items || []) {
        const len = new DataView(dec.buffer, dec.byteOffset + off, 4).getUint32(0);
        off += 4;
        thumbs.set(n, dec.slice(off, off + len));
        off += len;
      }
    }
    // 3. foto originali (i full cifrati per-immagine) + 4. invio al server
    const items = [];
    let k = 0;
    for (const n of ordered) {
      k++;
      st2.textContent = "Recupero le foto… " + k + " di " + ordered.length;
      const meta = (payload.items || {})[n] || {};
      const original = await aesDecRaw(dek, await fetchContainer(slug, "published", null, meta.full));
      items.push({
        name: n,
        ...(meta.caption ? { caption: meta.caption } : {}),
        ...(meta.desc ? { desc: meta.desc } : {}),
        thumb: b64big(thumbs.get(n)),
        original: b64big(original),
      });
    }
    st2.textContent = "Salvo i dati di lavoro…";
    await api("/api/staging/" + slug + "/rebuild", { method: "POST", body: JSON.stringify({
      title: payload.title || { it: slug, en: slug },
      items,
      hasPw: true,
      ...(payload.dropboxOriginalsUrl ? { hasOriginals: true } : {}),
    }) });
    st2.textContent = "Fatto ✓ — apro la galleria…";
    await openSlot(slug, { silent: true });
    loadAllGalleries();
  } catch (e) {
    console.warn("rebuild", slug, e);
    st2.textContent = e.message === "Password errata"
      ? "Password errata — riprova."
      : "Rigenerazione non riuscita: " + (e.message || "errore inatteso") + ".";
    go.disabled = false;
  }
}

async function aesDec(key, data) {
  const k = await importAes(key);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, IV_LEN) }, k, data.slice(IV_LEN)));
}

async function removeGallery(slug) {
  if (!confirm("Rimuovere definitivamente " + slug + "? (purge deterministica su content + gh-pages)")) return;
  const r = await api("/api/galleries/" + slug, { method: "DELETE" });
  if (r.ok) loadGalleries();
}

// loadJobsOnce è invocato dopo il login (il token serve per le API)
window.__admin = { state, api, pollJob, loadGalleries, loadJobsOnce, showErr, $, showTab, openSlot };
