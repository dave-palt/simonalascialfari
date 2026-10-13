/**
 * Homepage gestita dal publisher: il sito legge homepage.json (artefatto
 * pubblicato su gh-pages dal self-hosted) e lo usa come layer di override.
 *
 * - testi: merge "override ?? statico" sulle chiavi i18n (hero.tagline, …)
 *   — vedi I18nProvider in lib/i18n.tsx
 * - gallerie: griglia portfolio gestita; ogni galleria pubblica ha una cover
 *   in chiaro (g/<slug>/cover.webp, generata dal publisher alla pubblicazione)
 *   e si apre su /g/<slug>/ (shell cifrata, nopw o password a seconda della
 *   galleria). I titoli vivono NEL JSON perché dentro la galleria sono cifrati.
 *
 * Se homepage.json manca o non è recuperabile il sito resta sui contenuti
 * statici (PROJECTS in portfolio.tsx): fallback totale, mai errore visibile.
 */
export interface HomepageGallery {
  slug: string;
  visibile: boolean;
  ordine: number;
  titolo?: { it: string; en: string };
}

export interface HomepageData {
  testi?: { it?: Record<string, string>; en?: Record<string, string> };
  gallerie?: HomepageGallery[];
}

export interface HomepageState {
  data: HomepageData | null;
  loading: boolean;
}
