# admin-ui — sorgente dell'interfaccia admin (D25)

File statici veri (nessun bundler): `index.html` + `admin.css` + `admin.js` +
`dropbox.js` (+ favicon). Estratti il 2026-10-15 dalle TS template string
`src/admin.ts`/`src/adminDropbox.ts` (ora rimosse) tramite output servito.
La pagina si chiama `index.html` (NON admin.html): Pages serve la directory
solo da index.html.

- Serviti dal publisher a `/admin/*` (dev + fallback) e pubblicati sul sito
  (gh-pages, `public/admin/`) via `scripts/publish-admin-ui.sh` (git subtree).
- `config.js` NON è in questa cartella: lo sintetizza il server (same-origin in
  dev) e lo genera lo script di pubblicazione (baked per il canale).
- Base API risolta in `admin.js`: `?api=` → `localStorage["simona:api"]` →
  `window.__API_CONFIG.apiBase` ("" = same-origin).
- Cache-bust: OGNI modifica a admin.js/dropbox.js/admin.css richiede il bump
  del `?v=N` in `admin.html` (Fastly ~10 min).
- Verifica sintattica: `node --check admin.js && node --check dropbox.js`
  (più `bun run check:ui`, che parsa questi file).
