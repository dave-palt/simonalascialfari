# Simona Lascialfari — sito portfolio (v4)

Sito statico prerenderizzato (React 19 + Vite 7 + Tailwind 4) + Cloudflare Worker per il form contatti (Resend). Deploy su GitHub Pages dal branch `gh-pages` (peaceiris).

## Comandi

```sh
npm install
npm run link-photos   # copia le foto dalle cartelle d'archivio in public/photos (gitignorate)
npm run dev           # dev server (proxy /api -> wrangler dev :8787)
npm run typecheck
npm run build         # gen-manifest (Bun) + vite build + prerender (Bun)
npm run worker:dev    # Worker contatti in locale
npm run worker:deploy # deploy Worker su Cloudflare
```

## Struttura

- `src/` — app React (wouter, i18n IT/EN, Tailwind). `src/generated/manifest.json` è generato a build: non committare modifiche a mano.
- `public/photos/` — gallerie foto, NON nel repo: arrivano dalla release GH `photos` (CI: `scripts/fetch-photos.sh`) o da `scripts/link-photos.sh` in locale.
- `worker/` — Cloudflare Worker `POST /api/contact` → Resend. Secret: `RESEND_API_KEY` (`wrangler secret put`, da `worker/`). Var: `SITE_ORIGIN`, `CONTACT_FROM`, `CONTACT_TO` (`worker/wrangler.toml`).
- `scripts/` — gen-manifest.ts, prerender.tsx (Bun), fetch/pack/link-photos.sh.

## Deploy

1. Push su `main` → workflow `.github/workflows/deploy.yml`: fetch foto dalla release `photos`, typecheck, build+prerender, publish `dist/` su `gh-pages` (peaceiris).
2. Variabile repo `VITE_CONTACT_ENDPOINT` = URL pubblico del Worker (es. `https://simona-contact.<account>.workers.dev/api/contact`).
3. Worker: `wrangler secret put RESEND_API_KEY` poi `npm run worker:deploy`.

## Prerender

`npm run build` genera HTML statico per `/`, `/privacy-policy`, `/cookie-policy`, `/404` iniettando `renderToString(<App ssrLocation=…>)` nella shell Vite. Il client poi re-renderizza con `createRoot` (niente idratazione). Nuove route: aggiungere a `ROUTES` in `scripts/prerender.tsx`.

## Immagini (Bun 1.4)

`Bun.Image` genera a build thumbnail WebP (800px, qualità 80) in `public/photos/.thumbs/` — idempotente (salta i thumb più recenti della sorgente). Griglia e hero caricano i WebP (~40–100KB l'uno vs ~1MB degli originali), il lightbox gli JPG originali. Nota: AVIF non è encodabile su Linux (CI) — per questo WebP. I thumb sono rigenerati dalla CI a ogni build, non committati.

## Foto

`scripts/pack-photos.sh` crea `/tmp/photos.zip` dall'unione degli archivi originali per la release GH `photos`. Per aggiornare le foto: rigenerare lo zip, aggiornare la release, pushare (la CI ricostruisce il manifest automaticamente).
