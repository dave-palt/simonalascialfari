import { createContext, useContext, useEffect, useState } from "react";
import { BASE } from "@/lib/base";
import type { HomepageData, HomepageState } from "@/lib/homepage";

/**
 * Fetch runtime di homepage.json (client-only: il prerender SSR non fetcha,
 * usa i testi statici — il client re-renderizza appena la config arriva).
 * 404/rete ko → data resta null → il sito resta sui contenuti statici.
 */
export function useHomepage(): HomepageState {
  const [data, setData] = useState<HomepageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    // Nessuna cache option qui: "no-cache" fa IGNORARE la entry della
    // <link rel="preload"> e scarica due volte il JSON. Col default la fetch
    // consuma il preload; la freschezza resta garantita da max-age=600 di
    // GH Pages (lo stesso ritardo che il CDN Fastly applica comunque).
    fetch(`${BASE}homepage.json`, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (dead) return;
        setData(j && typeof j === "object" ? (j as HomepageData) : null);
        setLoading(false);
      })
      .catch(() => {
        if (!dead) setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, []);

  return { data, loading };
}

const HomepageContext = createContext<HomepageState>({ data: null, loading: true });

export const HomepageProvider = HomepageContext.Provider;

/** La config homepage dal contesto dell'app (data null = contenuti statici). */
export function useHomepageData(): HomepageState {
  return useContext(HomepageContext);
}
