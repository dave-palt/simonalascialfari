# Simona Lascialfari — sito (simona-sito-4)

Sito portfolio statico prerenderizzato: React 19 + Vite 7 + TypeScript strict + Tailwind 4 (niente shadcn/ui, niente react-query), routing wouter, i18n IT/EN inline in `src/lib/i18n.tsx`. Form contatti → Cloudflare Worker (`worker/`) che invia email via Resend. Deploy: GitHub Pages, branch `gh-pages` via peaceiris (workflow `.github/workflows/deploy.yml`), MAI tramite API deploy-pages.

**Roadmap architetturale**: questo repo è la Fase 0 del piano complessivo (gallerie cliente cifrate, /admin, self-hosted publisher) — fonte di verità: `../PIANO-TECNICO.md` (rev.2, decisioni D1–D19). Prima di aggiungere feature oltre il sito portfolio, leggere quello.

## Comandi

```sh
npm install
npm run link-photos   # foto da ../simona-sito-2 e ../simona-sito-3 -> public/photos (gitignored)
npm run dev           # Vite; /api proxato su wrangler dev :8787
npm run typecheck     # tsc --noEmit (richiede src/generated/manifest.json: esistere dopo il primo build)
npm run build         # bun scripts/gen-manifest.ts && vite build && bun scripts/prerender.tsx
npm run worker:dev    # Worker contatti locale
npm run worker:deploy # wrangler deploy --config worker/wrangler.toml
```

## Convenzioni

- Import `@/` → `src/`. Componenti con export nominato in `src/components/`, pagine con export default in `src/pages/`.
- Percorsi asset SEMPRE via `BASE` da `src/lib/base.ts`, mai `import.meta.env.BASE_URL` inline (il prerender Bun non ha gli env Vite).
- Endpoint contatti solo via `CONTACT_ENDPOINT` da `src/lib/contact-endpoint.ts` (dev: `/api/contact` proxato; prod: `VITE_CONTACT_ENDPOINT`).
- Manifest gallerie + thumbnail WebP: generati a build da `scripts/gen-manifest.ts` (Bun 1.4 `Bun.Image`, zero dipendenze npm) in `src/generated/manifest.json` e `public/photos/.thumbs/<slug>/*.webp` (800px, q80). Non editare a mano. La griglia e l'hero usano i thumb (`thumbSrc()` nei componenti); il lightbox usa gli originali. Nuova galleria = cartella foto + chiave `portfolio.<slug>` in it/en in `i18n.tsx` + slug in `PROJECTS` (`portfolio.tsx`) o nelle categorie hero.
- i18n SSR-safe: niente `localStorage`/`window` al primo render (solo dentro `useEffect`).
- Form contatti: campo honeypot `company` — non rimuoverlo, il Worker lo usa per scartare i bot (risponde `{ok:true}` finto).

## Prerender (SEO)

`scripts/prerender.tsx` (Bun) renderizza `/`, `/privacy-policy`, `/cookie-policy`, `/404` con `renderToString` e `ssrLocation` (hook statico in `App.tsx`). Il client re-renderizza con `createRoot`: niente `hydrateRoot`, quindi nessun rischio di mismatch. Ogni route che usa hook browser-only al primo render rompe il prerender.

## Pitfalls

- `public/photos/` NON è nel repo: senza `link-photos.sh` (o release GH `photos` in CI) `gen-manifest.ts` esce con errore. Non committare le foto (94 MB).
- `vite build` + prerender sovrascrivono `dist/`: l'artefatto è sempre rigenerabile, non editare a mano.
- Il Worker ha rate limit 10 req/10 min per IP (binding `RATE_LIMITER`, config `unsafe.bindings` in `wrangler.toml`) e CORS verso `SITE_ORIGIN` soltanto.
- `wouter/memory-location` NON funziona in SSR (`useSyncExternalStore` senza `getServerSnapshot`): per il prerender usare l'hook statico già presente in `App.tsx`.
- Commit: solo i file del task, mai `git add -A` (le foto collegate finirebbero nel commit).

## Deploy

Push su `main` → CI (fetch foto dalla release `photos` → typecheck → build → peaceiris su `gh-pages`). Prima del primo deploy: creare la release `photos` con `scripts/pack-photos.sh` (`gh release create photos /tmp/photos.zip`), impostare la var repo `VITE_CONTACT_ENDPOINT`, e `wrangler secret put RESEND_API_KEY` per il Worker.
