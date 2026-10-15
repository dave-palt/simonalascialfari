# Simona Lascialfari — sito pubblico (submodule `site` in simona-infra)

Sito portfolio statico prerenderizzato: React 19 + Vite 7 + TypeScript strict + Tailwind 4 (niente shadcn/ui, niente react-query), routing wouter, i18n IT/EN inline in `src/lib/i18n.tsx`. Form contatti → Cloudflare Worker (`worker/`) che invia email via Resend (**deploy differito**). Deploy: GitHub Pages, branch `gh-pages` via peaceiris (`.github/workflows/deploy.yml`), MAI tramite API deploy-pages.

**Remota**: `git@github.com:dave-palt/simonalascialfari.git` (pubblica). Push su `main` → CI → gh-pages. Demo live: https://dave-palt.github.io/simonalascialfari/ . Storia git ricostruita il 2026-10-08 (orphan, prototipi purgati) — non cercare commit più vecchi.

**Roadmap architetturale**: questo repo è la Fase 0 del piano complessivo (gallerie cliente cifrate, /admin, self-hosted publisher) — fonte di verità: `../../docs/PIANO-TECNICO.md` nella repo infra (rev.3, decisioni D1–D23). Prima di aggiungere feature oltre il sito portfolio, leggere quello.

## Comandi

```sh
npm install
npm run link-photos   # foto da ../../archivio-consegna (gitignorate; override: SIMONA_ARCHIVE)
npm run gen-manifest  # rigenera derivati webp + manifest — SOLO con sources locali
npm run dev           # Vite; /api proxato su wrangler dev :8787
npm run typecheck     # tsc --noEmit (usa src/generated/manifest.json COMMITTATO)
npm run build         # gen-manifest (no-op senza sources) && vite build && prerender Bun
npm run worker:dev    # Worker contatti locale
npm run worker:deploy # wrangler deploy --config worker/wrangler.toml (differito)
```

## Gestione immagini (D23 — derivati committati)

- **Originali MAI in repo**: `sources/photos/` (gitignored, 134 MB, da link-photos).
- **Derivati COMMITTATI**: `public/photos/.thumbs/<slug>/*.webp` (800px q80) + `public/photos/.full/<slug>/*.webp` (**1600px q85, cap demo** — niente alta risoluzione in repo) + `src/generated/manifest.json`. Totale ~31 MB.
- Modifica foto = link-photos → `npm run gen-manifest` → commit dei derivati (`git add public/photos src/generated/manifest.json`).
- `gen-manifest.ts` in CI (nessuna source + manifest committato) → exit 0 senza fare nulla.
- Nuova galleria = cartella foto in sources + chiave `portfolio.<slug>` in it/en in `i18n.tsx` + slug in `PROJECTS` (`portfolio.tsx`) o categorie hero → gen-manifest → commit derivati.

## Convenzioni

- Import `@/` → `src/`. Componenti con export nominato in `src/components/`, pagine con export default in `src/pages/`.
- Percorsi asset SEMPRE via `BASE` da `src/lib/base.ts`, mai `import.meta.env.BASE_URL` inline (il prerender Bun non ha gli env Vite). `BASE` legge `VITE_BASE` come fallback (la CI la setta a `/<repo>/` per la project page).
- Endpoint contatti solo via `CONTACT_ENDPOINT` da `src/lib/contact-endpoint.ts` (dev: `/api/contact` proxato; prod: `VITE_CONTACT_ENDPOINT`).
- i18n SSR-safe: niente `localStorage`/`window` al primo render (solo dentro `useEffect`).
- Form contatti: campo honeypot `company` — non rimuoverlo, il Worker lo usa per scartare i bot (risponde `{ok:true}` finto).

## Prerender (SEO)

`scripts/prerender.tsx` (Bun) renderizza `/`, `/privacy-policy`, `/cookie-policy`, `/404` con `renderToString` e `ssrLocation` (hook statico in `App.tsx`). Il client re-renderizza con `createRoot`: niente `hydrateRoot`, nessun rischio di mismatch. Ogni route che usa hook browser-only al primo render rompe il prerender.

**Base-path**: il `ssrLocation` va PREFISSATO col base (`BASE_PREFIX` da `process.env.VITE_BASE`) — wouter matcha pattern col prefisso, quindi senza prefisso ogni pagina prerenderizza la 404 (sintomo: tutti gli html da ~1,5 KB). `src/lib/base.ts` usa un `declare const process` locale (niente `@types/node`; tsconfig ha `types: ["vite/client"]`).

## Marquee hero — pointer capture

Il drag-scroll dello slider usa **capture ritardato**: niente `setPointerCapture` su pointerdown (retargeta il pointerup al track e il click sulla tessera NON scatta mai su desktop mouse — bug fisso in `hero.tsx`), capture solo dopo `moved > 5px` nel pointermove. Non reintroducture il capture immediato.

## Pitfalls

- `sources/photos/` NON è nel repo: senza link-photos il gen-manifest locale esce con errore (in CI, coi derivati committati, exit 0 — voluto).
- `vite build` + prerender sovrascrivono `dist/`: artefatto rigenerabile, non editare a mano.
- Il Worker ha rate limit 10 req/60s per IP (binding `RATE_LIMITER`) e CORS verso `SITE_ORIGIN` soltanto (`worker/wrangler.toml`, in modalità demo punta a github.io — allo swap dominio va messo `https://simonalascialfari.com`, v. «Swap dominio»).
- `wouter/memory-location` NON funziona in SSR (`useSyncExternalStore` senza `getServerSnapshot`): usare l'hook statico già presente in `App.tsx`.
- Commit: solo i file del task, mai `git add -A` (le foto in sources finirebbero nel commit); i derivati si aggiungono esplicitamente.

## Deploy

Push su `main` → CI (install → typecheck → build → peaceiris su `gh-pages` con `force_orphan`). La build legge le **variabili repo** (default demo in parentesi): `VITE_CONTACT_ENDPOINT` (—), `VITE_BASE` (`/<repo>/` derivato dal nome repo), `VITE_GOOGLE_SITE_VERIFICATION` (token Search Console demo), `CNAME_DOMAIN` (assente = nessun CNAME). Demo: https://dave-palt.github.io/simonalascialfari/ . Nota CDN: dopo un push, l'index.html servito può restare stantio ~10 min (Fastly) — per verificare subito l'artefatto usare `raw.githubusercontent.com/<repo>/gh-pages/`.

Worker contatti (differito): deploy su account Cloudflare **di Simona** (mai Dave), `wrangler secret put RESEND_API_KEY` (la chiave vive SOLO lì, mai su GitHub), poi `gh variable set VITE_CONTACT_ENDPOINT --body <url-worker>/api/contact`. Runbook: appendice del piano in `<workspace>/.hermes/plans/2026-10-08_180329-fase0-github-pages.md` (workspace = padre di `simona-infra`).

## Swap dominio (go-live su simonalascialfari.com)

Nessun URL è hardcodato nel codice: tutto passa da env/variabili repo. Checklist in ordine:

1. **DNS**: nel registrar/CF di Simona, `simonalascialfari.com` → GitHub Pages (A records `185.199.108-111.153` + CNAME `www` → `dave-palt.github.io`), poi nel repo Settings → Pages → custom domain `simonalascialfari.com` + enforce HTTPS.
2. **Variabili repo sito** (nessun commit richiesto, poi ri-lanciare il workflow `deploy` — le variabili NON triggerano `on: push`):
   ```sh
   gh variable set VITE_BASE --body /                       # base asset da /<repo>/ a /
   gh variable set CNAME_DOMAIN --body simonalascialfari.com
   gh variable set VITE_GOOGLE_SITE_VERIFICATION --body <token-nuova-verifica-Search-Console>
   gh workflow run deploy.yml
   ```
3. **Worker contatti**: in `worker/wrangler.toml` → `SITE_ORIGIN = "https://simonalascialfari.com"` (+ `CONTACT_FROM`/`CONTACT_TO` prod, già annotati nel file) → `npm run worker:deploy`.
4. **Publisher (VM)**: in `/srv/simona/secrets/env` → `PUB_SITE_URL=https://simonalascialfari.com` e `PUBLISHER_ALLOWED_ORIGINS` col nuovo dominio (CORS viewer `/p/`), riavvio servizio. Sitemap, robots.txt e llms.txt si allineano **da soli**: i testi editabili in admin usano il placeholder `{SITE_URL}`, sostituito col dominio corrente a ogni pubblicazione (i salvataggi vecchi con l'URL letterale vengono auto-guariti al placeholder).
5. Redirect 301 dal vecchio `dave-palt.github.io/simonalascialfari/`: automatico (GitHub redirige le project pages col CNAME attivo); i link `/g/<slug>/` restano validi perché il path base cambia ma gli slug no.

Dettagli env del publisher: `docs/RUNBOOK-SELFHOST.md` nella repo infra.
